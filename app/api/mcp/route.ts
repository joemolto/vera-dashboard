/**
 * Vera MCP server endpoint.
 *
 * Exposes Vera's existing tool registry to external MCP clients
 * (customers' Claude in Slack, ChatGPT, n8n agents, etc.) over HTTP.
 *
 * Authentication: Bearer token in the `Authorization` header. Tokens
 * are issued via the admin script in scripts/mcp_issue_key.ts and
 * stored hashed in `mcp_api_keys`. Each token resolves to exactly one
 * `org_id` — the customer's view is RLS-equivalent to their own
 * watchlist + ICP.
 *
 * Why the lower-level Server class (not McpServer): our existing 16
 * tools already have hand-written JSON Schemas. McpServer's
 * registerTool expects Zod schemas; rewriting 16 schemas just to
 * register them is wasteful when the lower-level Server's
 * setRequestHandler(ListToolsRequestSchema, ...) accepts the JSON
 * Schemas verbatim.
 *
 * Why stateless (no sessionIdGenerator): each tool call is
 * independent; we don't need to keep session state across calls
 * because RLS scoping is per-request via the bearer token. Stateless
 * mode means each request gets its own transport — easier to reason
 * about under load.
 */

import { createClient } from "@supabase/supabase-js";
import { createHash, createHmac } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { MCP_TOOLS, MCP_TOOLS_BY_NAME } from "@/lib/chat/tools";
import { SELF_HOSTED } from "@/lib/selfHosted";
import type { ToolContext } from "@/lib/chat/types";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Auth — bearer token → org_id
// ---------------------------------------------------------------------------

function getServiceClient() {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// --- Per-request RLS scoping ------------------------------------------------
// The MCP caller has an API key bound to one org, but no Supabase session.
// To get RLS (not just app-level filters) we mint a short-lived Supabase
// access token impersonating a real authenticated user in that org, and run
// the tool reads through a client carrying it. An HS256 JWT is just
// header.payload.HMAC — no JWT library needed.

function b64url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

function signSupabaseJwt(userId: string): string {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error("SUPABASE_JWT_SECRET not set");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      sub: userId,
      role: "authenticated",
      aud: "authenticated",
      iss: "vera-mcp",
      // MCP keys can only be created from a session that completed the
      // two-factor code (/api/mcp/keys), so key-scoped reads count as aal2
      // and pass the require_mfa RLS policies.
      aal: "aal2",
      iat: now,
      exp: now + 300, // 5 min — one request's worth
    }),
  );
  const sig = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${sig}`;
}

// Resolve a real user in the org to scope the request as. Prefer the key's
// creator (if still a member); else any current member. Returns null if the
// org has no members — caller then falls back to the service client.
async function resolveOrgUserId(
  service: ReturnType<typeof getServiceClient>,
  orgId: string,
  createdBy: string | null,
): Promise<string | null> {
  if (createdBy) {
    const { data } = await service
      .from("org_users")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("user_id", createdBy)
      .limit(1);
    if (data?.[0]?.user_id) return createdBy;
  }
  const { data } = await service
    .from("org_users")
    .select("user_id")
    .eq("org_id", orgId)
    .limit(1);
  return (data?.[0]?.user_id as string | undefined) ?? null;
}

function makeScopedClient(userId: string) {
  const jwt = signSupabaseJwt(userId);
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    },
  );
}

interface AuthResult {
  ok: true;
  orgId: string;
  keyId: string;
  createdBy: string | null;
}
interface AuthError {
  ok: false;
  status: number;
  message: string;
}

async function authenticate(req: Request): Promise<AuthResult | AuthError> {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  // Connector-dialog fallback (claude.ai / Claude Desktop custom
  // connectors have no header field): accept the token as ?key= when no
  // Authorization header is present. Same token, same hashing, same
  // revocation — slightly weaker hygiene (URLs can reach request logs),
  // which per-token revocation bounds.
  const urlKey = !match
    ? new URL(req.url).searchParams.get("key")?.trim() ?? ""
    : "";
  if (!match && !urlKey) {
    return {
      ok: false,
      status: 401,
      message:
        "Missing credentials. Send `Authorization: Bearer <token>` or append ?key=<token> to the endpoint URL.",
    };
  }
  const token = match ? match[1].trim() : urlKey;
  if (!token.startsWith("vera_")) {
    return { ok: false, status: 401, message: "Invalid token format" };
  }

  const keyHash = hashKey(token);
  const service = getServiceClient();
  const { data, error } = await service
    .from("mcp_api_keys")
    .select("id, org_id, revoked_at, created_by")
    .eq("key_hash", keyHash)
    .limit(1);
  if (error) {
    return { ok: false, status: 500, message: `Key lookup failed: ${error.message}` };
  }
  const row = data?.[0];
  if (!row) return { ok: false, status: 401, message: "Unknown API key" };
  if (row.revoked_at) return { ok: false, status: 401, message: "API key revoked" };

  // A lapsed org's MCP keys stop working. Cancellation never revokes the
  // key rows themselves, and without this check a cancelled org kept full
  // read access to its dataset over MCP indefinitely (2026-08-23
  // lapsed-org audit). The read-only reactivation surface is the
  // dashboard; the API is a live feature. Fail-open on lookup errors so a
  // hiccup never locks out a paying customer. Mirror of the engine's
  // REVOKED_STATUSES (plan_limits.py).
  const REVOKED = new Set(["canceled", "unpaid", "incomplete_expired"]);
  const { data: orgRow, error: orgErr } = await service
    .from("organisations")
    .select("subscription_status")
    .eq("id", row.org_id)
    .maybeSingle();
  if (!SELF_HOSTED && !orgErr && REVOKED.has(String(orgRow?.subscription_status ?? "").toLowerCase())) {
    return {
      ok: false,
      status: 403,
      message:
        "Subscription lapsed — reactivate from your dashboard settings to restore API access.",
    };
  }
  // payment_required: an established account whose paid subscription
  // hasn't started yet (nothing cancelled — monitoring keeps running,
  // access waits behind checkout). Distinct message so the agent tells
  // the user exactly what to do.
  if (
    !SELF_HOSTED &&
    !orgErr &&
    String(orgRow?.subscription_status ?? "").toLowerCase() === "payment_required"
  ) {
    return {
      ok: false,
      status: 402,
      message:
        "Your Vera subscription needs setting up before access continues — " +
        "log in to the Vera dashboard to complete payment. " +
        "Everything is exactly where you left it.",
    };
  }

  // Best-effort touch — don't block the request on this.
  service
    .from("mcp_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id)
    .then(() => undefined);

  return { ok: true, orgId: row.org_id, keyId: row.id, createdBy: row.created_by ?? null };
}

// ---------------------------------------------------------------------------
// MCP server factory
//
// New Server per request so the ToolContext (org-scoped) lives in the
// handler closure. Stateless transport means no cross-request state to
// worry about; the cost is one allocation per request — negligible.
// ---------------------------------------------------------------------------

function buildServer(ctx: ToolContext): Server {
  const server = new Server(
    { name: "vera-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: MCP_TOOLS.map((t) => ({
      name: t.name,
      // Plan-aware copy: Solo is caps-based and must never be told about
      // "credits"; credit tiers keep their cost language. See ToolDefinition.
      description: !SELF_HOSTED && t.describe ? t.describe({ isSolo: ctx.isSolo }) : t.description,
      inputSchema: t.input_schema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = MCP_TOOLS_BY_NAME[name];
    if (!tool) {
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
      };
    }
    try {
      const result = await tool.execute(
        (args ?? {}) as Record<string, unknown>,
        ctx,
      );
      // MCP wants the tool result as a content array. Stringifying the
      // structured data keeps it parseable by the calling agent;
      // serialising as JSON also surfaces the ok/error envelope our
      // tools use natively.
      return {
        isError: !result.ok,
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { ok: result.ok, data: result.data, error: result.error, summary: result.summary },
              null,
              2,
            ),
          },
        ],
      };
    } catch (e) {
      return {
        isError: true,
        content: [{ type: "text", text: `Tool execution failed: ${String(e)}` }],
      };
    }
  });

  return server;
}

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------

async function handle(req: Request): Promise<Response> {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.message }), {
      status: auth.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Defense-in-depth: run tool reads as a real authenticated user from the
  // org so Supabase RLS scopes EVERY query (companies → org watchlist,
  // signals/leads/watchlist → org_id) automatically — even if a tool ever
  // forgets an explicit org filter. The tools also still filter by
  // ctx.orgId, so this is belt AND braces. Falls back to the service client
  // only if SUPABASE_JWT_SECRET is unset or the org has no resolvable member
  // (the tools' explicit org_id filters remain the guard in that case).
  const service = getServiceClient();
  let userClient: typeof service | null = null;
  // The resolved org member we scope the request as. Kept in outer scope so
  // it can also be the ctx.userId below — memory tools write it into
  // chat_memories.user_id (a uuid column, RLS-checked against auth.uid()),
  // so ctx.userId MUST be this real member uuid, not the "mcp_key:<id>"
  // audit string (that string crashed remember_this/forget_memory with
  // "invalid input syntax for type uuid").
  let memberUserId: string | null = null;
  try {
    memberUserId = await resolveOrgUserId(service, auth.orgId, auth.createdBy);
    if (memberUserId && process.env.SUPABASE_JWT_SECRET) {
      userClient = makeScopedClient(memberUserId);
    }
  } catch (e) {
    console.error("MCP scoped-client setup failed:", e);
  }

  // Fail closed: never run tool reads on the unscoped service client (RLS
  // off). If we can't mint an RLS-scoped client (SUPABASE_JWT_SECRET unset
  // or no resolvable org member), refuse — so a tool that ever forgets its
  // explicit org filter can't leak cross-tenant. RLS is mandatory here, not
  // best-effort.
  if (!userClient) {
    console.error(
      `MCP: could not establish an RLS-scoped client for org ${auth.orgId}; refusing.`,
    );
    return new Response(
      JSON.stringify({
        error: "Server is temporarily unable to authorize this request.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  // Plan flags. Read via the service client on the bearer-resolved org id
  // (never user input). isSolo drives tier-aware tool copy + get_plan_usage.
  // Defaults to the non-breaking path if the lookup hiccups (treated as a
  // credit/Pro org so a transient DB error can't lock out paying clients).
  let isSolo = false;
  try {
    const { data: orgPlan } = await service
      .from("organisations")
      .select("tier, icp_config")
      .eq("id", auth.orgId)
      .maybeSingle();
    const features = (
      orgPlan?.icp_config as
        | { features?: { solo_plan?: boolean } }
        | null
    )?.features;
    isSolo =
      String(orgPlan?.tier ?? "").toLowerCase() === "solo" || !!features?.solo_plan;
  } catch (e) {
    console.error("MCP plan lookup failed:", e);
  }

  const ctx: ToolContext = {
    orgId: auth.orgId,
    // Real org-member uuid (same as the scoped client's JWT sub). Guaranteed
    // non-null here: the fail-closed guard above returns 503 unless
    // memberUserId resolved. Tools that write user-scoped rows
    // (chat_memories) need a real uuid; the key id is on auth.keyId if an
    // audit trail is ever needed.
    userId: memberUserId!,
    isSolo,
    userClient,
    serviceClient: service,
  };

  const server = buildServer(ctx);
  const transport = new WebStandardStreamableHTTPServerTransport();
  await server.connect(transport);

  return transport.handleRequest(req);
}

export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}
export async function DELETE(req: Request) {
  return handle(req);
}
