/**
 * Shared types for the Vera chat agent.
 *
 * The chat is a tool-use loop over Vera's existing data surfaces.
 * Every tool returns a `ToolResult` that's both renderable in the UI
 * (the agent's "evidence cards") and passable back to Claude as a
 * stringified tool_result block.
 */

export type ChatRole = "user" | "assistant" | "tool_call" | "tool_result";

export interface ChatMessage {
  id: string;
  session_id: string;
  role: ChatRole;
  /** JSON content — shape varies by role. See `MessageContent` for the
   *  recognised shapes; future tool types just add new variants. */
  content: MessageContent;
  tool_name?: string | null;
  tool_call_id?: string | null;
  created_at: string;
}

export type MessageContent =
  | { type: "text"; text: string } // user OR assistant prose
  | { type: "tool_call"; tool: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool: string; ok: boolean; data: unknown; error?: string }
  | { type: "propose_mutation"; mutation: ProposedMutation };

/** Mutations require explicit slide-to-confirm. The agent NEVER applies
 *  these directly — it returns one of these as a tool_result and the UI
 *  surfaces a confirm card. See the chat page's ConfirmCard component. */
export interface ProposedMutation {
  kind: "icp_change" | "add_to_watchlist";
  /** Short human-readable summary the user sees before confirming. */
  summary: string;
  /** Structured payload the confirm endpoint replays. Opaque to the LLM
   *  beyond what's in `summary` — the user is the final authority. */
  payload: Record<string, unknown>;
}

/** Standard envelope every tool returns. */
export interface ToolResult<T = unknown> {
  ok: boolean;
  data: T;
  error?: string;
  /** Optional one-line summary the agent can quote in its reply. */
  summary?: string;
}

/** What a tool exports for the registry. */
export interface ToolDefinition<TInput = Record<string, unknown>, TData = unknown> {
  name: string;
  description: string;
  /** Optional plan-aware description. When present, the tool-list builder
   *  (chat route + MCP route) calls it with the caller's plan to choose
   *  caps-vs-credit wording; `description` stays the static fallback for
   *  any caller that doesn't pass plan context. Solo is caps-based, so it
   *  must never be told about "credits". */
  describe?: (plan: { isSolo: boolean }) => string;
  /** JSON Schema for Claude tool-use input_schema. */
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  /** Execute the tool against the user's org. `orgId` + `userId` are
   *  resolved server-side from the request's JWT and passed in. */
  execute: (
    input: TInput,
    ctx: ToolContext,
  ) => Promise<ToolResult<TData>>;
}

/** Server-side context every tool receives. Carries auth + DB client +
 *  org. Tools must NEVER use the userClient for actions that should
 *  bypass RLS — those go via the service client. */
export interface ToolContext {
  orgId: string;
  userId: string;
  /** True when the caller's org is on the Vera Solo (caps-based) plan.
   *  Solo bills on standing caps — accounts watched, people monitored —
   *  plus a monthly contact-reveal cap, NOT credits. Tools read this to
   *  pick caps-vs-credit wording and the right usage shape. Resolved once
   *  per request by the chat / MCP route handler. */
  isSolo: boolean;
  /** Supabase client scoped to the caller's JWT. RLS applies. */
  userClient: import("@supabase/supabase-js").SupabaseClient;
  /** Supabase service-role client. RLS bypassed. Use only for writes
   *  the user is authorised for (audit-logged at the action layer). */
  serviceClient: import("@supabase/supabase-js").SupabaseClient;
}
