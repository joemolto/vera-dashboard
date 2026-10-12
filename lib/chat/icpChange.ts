/**
 * ICP field changes proposed by the chat agent / MCP callers.
 *
 * Two callers share this: the dashboard slide-to-confirm endpoint
 * (/api/chat/confirm) and the MCP direct-apply tool (update_icp_config).
 * Both used to (or would have) shallow-merged `icp_config[field]`, which
 * is wrong for the fields that matter:
 *
 *   - Persona fields (target_titles etc.) live on
 *     icp_config.personas[]; the flat top-level copy is a dual-written
 *     union the engine keeps for legacy readers. Key-contact discovery
 *     reads personas[0] FIRST, so a flat-only write never reached it.
 *     The engine's PUT /icp/personas/{id} writes both — use it.
 *   - high_value_segments / low_value_segments live on the
 *     organisations.client_context column, not icp_config.
 *
 * Everything else is refused: icp_config also carries `features`
 * (plan flags) and this path is reachable without a human gesture on
 * MCP, so it must not be an open write into the org row.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { engineBase } from "@/lib/engineBase";

/** Persona list fields, mirroring PERSONA_FIELDS in the engine's
 *  app/services/personas.py. */
export const PERSONA_LIST_FIELDS = [
  "target_titles",
  "target_seniorities",
  "target_industries",
  "target_locations",
  "target_company_size",
  "target_funding_stages",
  "target_tech_uses",
  "target_tech_excludes",
] as const;

const PERSONA_FIELDS = new Set<string>([...PERSONA_LIST_FIELDS, "target_revenue_range"]);
const ICP_TEXT_FIELDS = new Set<string>(["target_description"]);
const CLIENT_CONTEXT_LIST_FIELDS = new Set<string>([
  "high_value_segments",
  "low_value_segments",
]);
const LIST_FIELDS = new Set<string>([...PERSONA_LIST_FIELDS, ...CLIENT_CONTEXT_LIST_FIELDS]);

export const EDITABLE_ICP_FIELDS: readonly string[] = [
  ...PERSONA_LIST_FIELDS,
  "target_revenue_range",
  ...ICP_TEXT_FIELDS,
  ...CLIENT_CONTEXT_LIST_FIELDS,
];

export type CoerceResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

/** Normalise a proposed value before it's shown on a card or written.
 *
 *  MCP clients have been observed sending array values as a JSON string
 *  (the schema had no `type`, so "[\"CISO\", ...]" arrived as text).
 *  Parse that back; then, for list fields, insist on an array of
 *  non-empty strings so a raw string can never be stored into a list. */
export function coerceIcpValue(field: string, raw: unknown): CoerceResult {
  if (!EDITABLE_ICP_FIELDS.includes(field)) {
    return {
      ok: false,
      error: `"${field}" isn't an editable ICP field. Editable fields: ${EDITABLE_ICP_FIELDS.join(", ")}.`,
    };
  }

  let value = raw;
  if (typeof value === "string") {
    const s = value.trim();
    if (s.startsWith("[") || s.startsWith("{")) {
      try {
        value = JSON.parse(s);
      } catch {
        /* not JSON after all — keep the string, validated below */
      }
    }
  }

  if (LIST_FIELDS.has(field)) {
    if (!Array.isArray(value)) {
      return {
        ok: false,
        error: `${field} is a list. Send new_value as a JSON array of strings, e.g. ["CISO", "IT Director"].`,
      };
    }
    const cleaned: string[] = [];
    for (const v of value) {
      if (typeof v !== "string") continue;
      const t = v.trim();
      if (t && !cleaned.includes(t)) cleaned.push(t);
    }
    return { ok: true, value: cleaned };
  }

  if (value !== null && typeof value !== "string") {
    return { ok: false, error: `${field} takes a single string value.` };
  }
  return { ok: true, value };
}

async function engine<T>(
  method: "GET" | "PUT",
  path: string,
  body?: unknown,
): Promise<T> {
  const base = engineBase();
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": process.env.ENGINE_API_KEY ?? "",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`engine ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** Write one already-coerced field for the org. Throws on failure with a
 *  message safe to show the caller. `orgId` must come from auth (the
 *  engine key is a superadmin context), never from user input. */
export async function applyIcpChange(
  orgId: string,
  field: string,
  value: unknown,
  service: SupabaseClient,
): Promise<void> {
  if (PERSONA_FIELDS.has(field)) {
    // Primary profile = personas[0], the one key-contact discovery reads.
    // The GET also auto-migrates any legacy flat-only org into a persona.
    const { personas } = await engine<{ personas: { id?: string }[] }>(
      "GET",
      `/icp/personas?org_id=${encodeURIComponent(orgId)}`,
    );
    const primaryId = personas?.[0]?.id;
    if (!primaryId) throw new Error("No buyer profile found for this workspace.");
    await engine("PUT", `/icp/personas/${encodeURIComponent(primaryId)}`, {
      org_id: orgId,
      [field]: value,
    });
    return;
  }

  const column = CLIENT_CONTEXT_LIST_FIELDS.has(field) ? "client_context" : "icp_config";
  const { data: rows, error: readErr } = await service
    .from("organisations")
    .select(column)
    .eq("id", orgId)
    .limit(1);
  if (readErr || !rows?.[0]) throw new Error("Org lookup failed.");
  const current = ((rows[0] as Record<string, unknown>)[column] ?? {}) as Record<string, unknown>;
  const { error: writeErr } = await service
    .from("organisations")
    .update({ [column]: { ...current, [field]: value } })
    .eq("id", orgId);
  if (writeErr) throw new Error(`ICP update failed: ${writeErr.message}`);
}
