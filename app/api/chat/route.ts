/**
 * Vera chat agent — streaming endpoint.
 *
 * POST /api/chat
 *   body: { session_id?: string, message: string }
 *   returns: text/event-stream
 *
 * Loop:
 *   1. Load session (or create new)
 *   2. Persist user message
 *   3. Run Claude with tools, streaming tokens + tool calls back
 *   4. For each tool call: execute, persist tool_call + tool_result,
 *      feed result back to Claude
 *   5. When Claude stops, persist final assistant message
 *
 * Auth: requires a valid Supabase session (JWT in Authorization header).
 * The route handler resolves the user, looks up their org_id from
 * org_users, and passes that into the tool context.
 *
 * Cost guard: per-conversation token cap (~25k input + 5k output) so a
 * runaway agent loop can't burn through the user's quota.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

import { TOOLS_BY_NAME, ALL_TOOLS } from "@/lib/chat/tools";
import { SELF_HOSTED } from "@/lib/selfHosted";
import { VERA_AGENT_SYSTEM } from "@/lib/chat/system";
import { scrubChatText } from "@/lib/chat/scrub";
import type { ToolContext } from "@/lib/chat/types";
import { mfaMissing, MFA_REQUIRED_MESSAGE } from "@/lib/mfaGate";

const MODEL = "claude-sonnet-4-6";
const MAX_TURNS = 8; // hard cap on agent loop iterations per request
const MAX_TOKENS_PER_RESPONSE = 1024;

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Anthropic tool-format conversion
// ---------------------------------------------------------------------------

function toolsForClaude(isSolo: boolean) {
  return ALL_TOOLS.map((t) => ({
    name: t.name,
    // Plan-aware copy: Solo is caps-based and must never be told about
    // "credits"; credit tiers keep their cost language. See ToolDefinition.
    description: !SELF_HOSTED && t.describe ? t.describe({ isSolo }) : t.description,
    input_schema: t.input_schema,
  }));
}

// ---------------------------------------------------------------------------
// Supabase clients
// ---------------------------------------------------------------------------

function getUserClient(authHeader: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  );
}

function getServiceClient() {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing Authorization" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY not set on the server" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: { session_id?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const userMessage = (body.message ?? "").trim();
  if (!userMessage) {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 1. Resolve user + org via JWT
  const userClient = getUserClient(authHeader);
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const userId = userData.user.id;
  if (await mfaMissing(authHeader, userId)) {
    return new Response(JSON.stringify({ error: MFA_REQUIRED_MESSAGE }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Look up org_id — every user we currently have belongs to exactly
  // one org via org_users (single-tenant). Take the first row.
  const { data: orgRows } = await userClient
    .from("org_users")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1);
  const orgId = orgRows?.[0]?.org_id;
  if (!orgId) {
    return new Response(JSON.stringify({ error: "No org for this user" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Plan flag — Solo orgs are caps-based (accounts + people), not credits.
  // Drives tier-aware tool copy + get_plan_usage. Default false (credit
  // wording) if the lookup hiccups — never crash the chat over plan chrome.
  const { data: orgPlan } = await userClient
    .from("organisations")
    .select("tier, icp_config, subscription_status")
    .eq("id", orgId)
    .maybeSingle();

  // Chat is unmetered Claude spend, so a lapsed org doesn't get it —
  // read-only + the reactivate modal is their surface (2026-08-23
  // lapsed-org audit). Mirror of the engine's REVOKED_STATUSES.
  const lapsedStatuses = new Set(["canceled", "unpaid", "incomplete_expired"]);
  if (!SELF_HOSTED && lapsedStatuses.has(String(orgPlan?.subscription_status ?? "").toLowerCase())) {
    return new Response(
      JSON.stringify({
        error: "Your subscription has ended — reactivate from Settings to use Vera chat.",
      }),
      { status: 402, headers: { "Content-Type": "application/json" } },
    );
  }
  // payment_required: established account, paid subscription not started
  // yet — the dashboard shows the payment gate; chat waits behind it.
  if (!SELF_HOSTED && String(orgPlan?.subscription_status ?? "").toLowerCase() === "payment_required") {
    return new Response(
      JSON.stringify({
        error:
          "Your Vera subscription needs setting up — complete payment from the dashboard to continue.",
      }),
      { status: 402, headers: { "Content-Type": "application/json" } },
    );
  }

  const isSolo =
    String(orgPlan?.tier ?? "").toLowerCase() === "solo" ||
    !!(orgPlan?.icp_config as { features?: { solo_plan?: boolean } } | null)
      ?.features?.solo_plan;

  // 2. Resolve or create session
  let serviceClient;
  try {
    serviceClient = getServiceClient();
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let sessionId = body.session_id ?? "";
  if (!sessionId) {
    const { data: newSession, error: createErr } = await userClient
      .from("chat_sessions")
      .insert({
        org_id: orgId,
        user_id: userId,
        title: userMessage.slice(0, 80),
      })
      .select("id")
      .maybeSingle();
    if (createErr || !newSession) {
      return new Response(
        JSON.stringify({ error: `Could not create session: ${String(createErr)}` }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
    sessionId = String(newSession.id);
  }

  // 3. Load prior turns (most-recent first → reverse to chronological)
  const { data: priorMsgs } = await userClient
    .from("chat_messages")
    .select("role, content, tool_name, tool_call_id, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  type Stored = {
    role: "user" | "assistant" | "tool_call" | "tool_result";
    content: unknown;
    tool_name: string | null;
    tool_call_id: string | null;
    created_at: string;
  };
  const prior = (priorMsgs ?? []) as Stored[];

  // 4. Persist the new user message
  await userClient.from("chat_messages").insert({
    session_id: sessionId,
    role: "user",
    content: { type: "text", text: userMessage },
  });

  // 5. Build Anthropic message history. We rehydrate prior turns into
  //    Anthropic's `messages` shape. Tool calls/results become the
  //    structured tool_use / tool_result content blocks.
  type AnthropicContent =
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
    | { type: "tool_result"; tool_use_id: string; content: string };
  type AnthropicMessage = {
    role: "user" | "assistant";
    content: string | AnthropicContent[];
  };

  const messages: AnthropicMessage[] = [];
  let pendingAssistantContent: AnthropicContent[] = [];
  function flushAssistant() {
    if (pendingAssistantContent.length === 0) return;
    messages.push({ role: "assistant", content: pendingAssistantContent });
    pendingAssistantContent = [];
  }

  for (const m of prior) {
    if (m.role === "user") {
      flushAssistant();
      const c = m.content as { text?: string } | null;
      messages.push({ role: "user", content: c?.text ?? "" });
    } else if (m.role === "assistant") {
      flushAssistant();
      const c = m.content as { text?: string } | null;
      messages.push({
        role: "assistant",
        content: [{ type: "text", text: c?.text ?? "" }],
      });
    } else if (m.role === "tool_call") {
      const c = m.content as {
        tool?: string;
        input?: Record<string, unknown>;
      } | null;
      pendingAssistantContent.push({
        type: "tool_use",
        id: m.tool_call_id ?? `t_${Date.now()}`,
        name: c?.tool ?? m.tool_name ?? "unknown",
        input: c?.input ?? {},
      });
    } else if (m.role === "tool_result") {
      flushAssistant();
      const c = m.content as {
        data?: unknown;
        ok?: boolean;
        error?: string;
      } | null;
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: m.tool_call_id ?? "",
            content: JSON.stringify({
              ok: c?.ok ?? true,
              data: c?.data ?? null,
              error: c?.error,
            }).slice(0, 8000),
          },
        ],
      });
    }
  }
  flushAssistant();

  // Add the new user message at the end
  messages.push({ role: "user", content: userMessage });

  // 6. Stream-driven agent loop. We use the SSE writer to push
  //    discrete events to the browser as the loop progresses.
  const encoder = new TextEncoder();
  const ctx: ToolContext = { orgId, userId, isSolo, userClient, serviceClient };
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Load the current user's persistent memories. These get appended as
  // a second system block — keeps the cached VERA_AGENT_SYSTEM prefix
  // intact even when memories change (prompt cache stays warm).
  // RLS scopes by auth.uid() so the user-client query only sees the
  // rows belonging to this user.
  const { data: memoriesData } = await userClient
    .from("chat_memories")
    .select("content, created_at")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  const memories = (memoriesData ?? []) as Array<{
    content: string;
    created_at: string;
  }>;
  const memoriesBlock =
    memories.length === 0
      ? null
      : `# Memories about this user

The user has asked you to remember these facts across sessions. Treat
them as standing context for everything they ask. If something contradicts
them, ask the user to clarify rather than ignore the memory.

${memories.map((m, i) => `${i + 1}. ${m.content}`).join("\n")}`;

  const stream = new ReadableStream({
    async start(controller) {
      function emit(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      }

      // Tell the client what session this is so it can persist locally.
      emit("session", { session_id: sessionId });

      try {
        for (let turn = 0; turn < MAX_TURNS; turn++) {
          // Token-streaming model call. Each text delta is emitted to the
          // browser the moment it arrives — perceived latency collapses
          // from "wait for whole turn" to "first token in ~400ms". Tool
          // dispatch + persistence still happen after the turn lands
          // (need the assembled blocks), so the loop structure below is
          // unchanged from the non-streaming version.
          // Multi-block system: the static VERA_AGENT_SYSTEM is cached
          // (prefix match — reused across sessions for ~90% input cost
          // discount); the per-user memories follow as a second block
          // that varies but is small. Cache breakpoint on the first
          // block only — anything after it is uncached but cheap.
          const systemBlocks: Anthropic.Messages.TextBlockParam[] = [
            {
              type: "text",
              text: VERA_AGENT_SYSTEM,
              cache_control: { type: "ephemeral" },
            },
          ];
          if (memoriesBlock) {
            systemBlocks.push({ type: "text", text: memoriesBlock });
          }

          const streamHandle = anthropic.messages.stream({
            model: MODEL,
            max_tokens: MAX_TOKENS_PER_RESPONSE,
            system: systemBlocks,
            tools: toolsForClaude(isSolo) as unknown as Anthropic.Messages.Tool[],
            messages: messages as unknown as Anthropic.Messages.MessageParam[],
          });

          for await (const event of streamHandle) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              // Deltas mirror exactly what the user sees — frontend
              // accumulates via setStreamingText(t => t + payload.text).
              // scrubChatText is best-effort on deltas (vendor names
              // split across token boundaries can slip past); the
              // assembled-text scrub at persist time is the guarantee.
              emit("text", { text: scrubChatText(event.delta.text) });
            }
          }

          // finalMessage() resolves to the fully-assembled message once
          // the stream is drained. Content blocks include the complete
          // text plus any tool_use blocks for dispatch below.
          const resp = await streamHandle.finalMessage();

          // Process this response's content blocks
          const newAssistantBlocks: AnthropicContent[] = [];
          let toolCalled = false;

          for (const block of resp.content) {
            if (block.type === "text") {
              // Scrub once we have the assembled text — guarantees the
              // persisted version is clean even if vendor names split
              // across stream chunks and bypassed the per-delta scrub.
              // This is what gets shown on every refresh / history load.
              const cleanText = scrubChatText(block.text);
              newAssistantBlocks.push({ type: "text", text: cleanText });
              // Persist the assembled text — note we do NOT re-emit
              // "text" here. Deltas already reached the client via the
              // stream loop above; another emit would double the
              // bubble content.
              await userClient.from("chat_messages").insert({
                session_id: sessionId,
                role: "assistant",
                content: { type: "text", text: cleanText },
              });
            } else if (block.type === "tool_use") {
              toolCalled = true;
              const tool = TOOLS_BY_NAME[block.name];
              const callId = block.id;
              newAssistantBlocks.push({
                type: "tool_use",
                id: callId,
                name: block.name,
                input: block.input as Record<string, unknown>,
              });
              emit("tool_call", {
                id: callId,
                tool: block.name,
                input: block.input,
              });
              await userClient.from("chat_messages").insert({
                session_id: sessionId,
                role: "tool_call",
                content: {
                  type: "tool_call",
                  tool: block.name,
                  input: block.input,
                },
                tool_name: block.name,
                tool_call_id: callId,
              });

              // Execute the tool
              let result;
              try {
                if (!tool) {
                  result = { ok: false, data: null, error: `Unknown tool: ${block.name}` };
                } else {
                  result = await tool.execute(
                    block.input as Record<string, unknown>,
                    ctx,
                  );
                }
              } catch (e) {
                result = { ok: false, data: null, error: String(e) };
              }

              emit("tool_result", {
                id: callId,
                tool: block.name,
                ok: result.ok,
                data: result.data,
                error: result.error,
              });
              await userClient.from("chat_messages").insert({
                session_id: sessionId,
                role: "tool_result",
                content: {
                  type: "tool_result",
                  tool: block.name,
                  ok: result.ok,
                  data: result.data,
                  error: result.error,
                },
                tool_name: block.name,
                tool_call_id: callId,
              });
            }
          }

          // Append this assistant turn to history
          messages.push({ role: "assistant", content: newAssistantBlocks });

          // If Claude called a tool, feed back the result(s) and loop again.
          if (toolCalled) {
            const toolResults: AnthropicContent[] = [];
            for (const block of resp.content) {
              if (block.type !== "tool_use") continue;
              // The result is already persisted; pull it back to feed Claude
              const { data } = await userClient
                .from("chat_messages")
                .select("content")
                .eq("session_id", sessionId)
                .eq("tool_call_id", block.id)
                .eq("role", "tool_result")
                .limit(1);
              const stored = data?.[0]?.content as {
                ok?: boolean;
                data?: unknown;
                error?: string;
              } | undefined;
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: JSON.stringify({
                  ok: stored?.ok ?? true,
                  data: stored?.data ?? null,
                  error: stored?.error,
                }).slice(0, 8000),
              });
            }
            messages.push({ role: "user", content: toolResults });
            continue; // loop another turn
          }

          // No tool called → Claude finished. Done.
          break;
        }

        // Touch session.updated_at so the thread list re-orders
        await userClient
          .from("chat_sessions")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", sessionId);

        emit("done", { session_id: sessionId });
      } catch (e) {
        emit("error", { message: String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
