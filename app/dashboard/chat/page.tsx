"use client";

/**
 * Vera chat — natural-language interface over the dashboard data.
 *
 * Layout: thread list on the left, message view on the right with a
 * composer at the bottom. Streams from POST /api/chat as SSE.
 *
 * Mutations come through as `propose_mutation` tool results — we render
 * those as slide-to-confirm cards. Confirmation hits POST
 * /api/chat/confirm which actually applies the change.
 */

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, MessageSquare, Plus, Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useOrg } from "@/components/dashboard/OrgContext";
import { Card, PageShell, Shimmer } from "@/components/dashboard/primitives";
import { SlideToConfirm } from "@/components/ui/SlideToConfirm";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool_call" | "tool_result";
  content: Record<string, unknown>;
  tool_name: string | null;
  tool_call_id: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

// Latest active session for this user. The chat UI surfaces ONE thread
// at a time — no switching UI — so we just hydrate from the most recent
// non-expired session and append to it. New session auto-creates on
// first send when the user has none.
function useLatestSession() {
  const sb = createSupabaseBrowserClient();
  return useQuery<string | null>({
    queryKey: ["chat_latest_session"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("chat_sessions")
        .select("id")
        .order("updated_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0]?.id ?? null;
    },
    staleTime: 60_000,
  });
}

function useMessages(sessionId: string | null) {
  const sb = createSupabaseBrowserClient();
  return useQuery<ChatMessage[]>({
    queryKey: ["chat_messages", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("chat_messages")
        .select("id, role, content, tool_name, tool_call_id, created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChatMessage[];
    },
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ChatPage() {
  const { orgId } = useOrg();
  const queryClient = useQueryClient();
  const { data: latestSessionId } = useLatestSession();
  const [currentSession, setCurrentSession] = useState<string | null>(null);
  // True when the user explicitly hit "New chat". Suppresses the
  // latestSessionId auto-adoption below until they send their first
  // message (which creates a fresh session server-side). Cleared
  // when send() runs.
  const [freshSession, setFreshSession] = useState(false);
  // Adopt the latest persisted session once it loads. The route handler
  // creates a new one on the next send if this is still null at send time.
  useEffect(() => {
    if (latestSessionId && !currentSession && !freshSession) {
      setCurrentSession(latestSessionId);
    }
  }, [latestSessionId, currentSession, freshSession]);

  const { data: messages, isLoading: messagesLoading } = useMessages(currentSession);

  // Streaming state — live tokens not yet persisted. Tool calls are no
  // longer surfaced to the UI; the rotating wait-message is the only
  // signal during tool execution.
  const [streamingText, setStreamingText] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  // Optimistic user-message echo. Render the rep's typed text the
  // instant they hit send — don't wait for the server roundtrip + query
  // refetch. Cleared once the persisted version appears in `messages`.
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Drop the optimistic bubble once the same text appears in the
  // persisted list. Search the WHOLE list — by the time we refetch, the
  // assistant's reply is usually the last message, so the user message
  // is several rows back (the original check only looked at the last
  // row and let a duplicate through).
  useEffect(() => {
    if (!pendingUserText) return;
    const found = (messages ?? []).some(
      (m) =>
        m.role === "user" &&
        String((m.content as { text?: string })?.text ?? "") === pendingUserText,
    );
    if (found) setPendingUserText(null);
  }, [messages, pendingUserText]);

  // Auto-scroll on new content
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages?.length, streamingText, isStreaming, pendingUserText]);

  // Clear the active session — the next send creates a fresh one
  // server-side and the UI adopts the new session_id from the SSE
  // event. Used by the "New chat" button. Disabled mid-stream so a
  // half-completed turn doesn't get orphaned in the DB.
  function handleNewChat() {
    if (isStreaming) return;
    setFreshSession(true);
    setCurrentSession(null);
    setPendingUserText(null);
    setStreamingText("");
    setComposer("");
    queryClient.removeQueries({ queryKey: ["chat_messages"] });
    composerRef.current?.focus();
  }

  async function send() {
    const text = composer.trim();
    if (!text || isStreaming) return;
    // Once the user actually sends, drop the "freshSession" flag so
    // the new session_id gets adopted normally via the SSE event.
    setFreshSession(false);
    setComposer("");
    setPendingUserText(text);
    setIsStreaming(true);
    setStreamingText("");

    try {
      const sb = createSupabaseBrowserClient();
      const { data: { session: authSession } } = await sb.auth.getSession();
      const token = authSession?.access_token;
      if (!token) throw new Error("Not signed in");

      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ session_id: currentSession, message: text }),
      });

      if (!resp.ok || !resp.body) {
        const errBody = await resp.text().catch(() => "");
        throw new Error(`Chat error: ${resp.status} ${errBody.slice(0, 200)}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Parse SSE — events separated by \n\n
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const lines = part.split("\n");
          let eventName = "";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventName = line.slice(7).trim();
            else if (line.startsWith("data: ")) dataStr += line.slice(6);
          }
          if (!eventName) continue;
          let payload: Record<string, unknown> = {};
          try {
            payload = JSON.parse(dataStr);
          } catch {
            continue;
          }
          handleEvent(eventName, payload);
        }
      }
    } catch (e) {
      console.error(e);
      setStreamingText((t) => t + `\n\n[error: ${String(e)}]`);
    } finally {
      setIsStreaming(false);
      // Refresh persisted messages, then clear the streaming bubble.
      // Awaiting the refetch means the persisted assistant message is
      // in the list before we drop streamingText — no flicker, no
      // duplicate response.
      //
      // Prefix-match the queryKey instead of using currentSession from
      // closure — the closure captures the value at send-start, but
      // for fresh sessions the actual sessionId only lands mid-stream
      // via the SSE "session" event. Invalidating ["chat_messages",
      // <stale_null>] hits nothing and the bubble flashes empty
      // (the first message in a new chat reply would appear, disappear,
      // then come back on the next send).
      await queryClient.invalidateQueries({ queryKey: ["chat_messages"] });
      queryClient.invalidateQueries({ queryKey: ["chat_latest_session"] });
      setStreamingText("");
      // Belt-and-braces: the useEffect above usually clears this when
      // the persisted message lands, but if the search is slow or the
      // text doesn't match (whitespace edge cases), force-clear here.
      setPendingUserText(null);
    }
  }

  function handleEvent(name: string, payload: Record<string, unknown>) {
    if (name === "session") {
      const sid = String(payload.session_id ?? "");
      if (sid && sid !== currentSession) {
        setCurrentSession(sid);
        // No URL update — single-thread UI, no switcher to deep-link to.
      }
    } else if (name === "text") {
      setStreamingText((t) => t + String(payload.text ?? ""));
    } else if (name === "tool_call" || name === "tool_result") {
      // Intentionally no-op in the UI — tool mechanics are hidden from
      // the rep. The server still emits these events
      // because the agent loop + persistence layer need them. Mutation
      // proposals reappear in the message list once persisted (handled
      // in MessageView as ConfirmCard).
    } else if (name === "done") {
      // Final refresh comes from the finally{} block
    } else if (name === "error") {
      setStreamingText((t) => t + `\n\n[server error: ${String(payload.message ?? "")}]`);
    }
  }

  if (!orgId) {
    return (
      <PageShell>
        <Shimmer className="h-96 w-full rounded-2xl" />
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* Centered chat column — no thread sidebar. Persistence still
          happens server-side (30-day TTL) so refreshing keeps the thread
          context; we just don't surface thread-switching UI, which keeps the
          chat box central. */}
      {/* Height math: 100dvh (mobile-safe) minus PageShell's vertical
          padding (py-14 = 7rem on md, py-10 = 5rem on mobile) minus the
          mobile sticky header on small screens. `min-h-0` on every flex
          child is load-bearing — without it the scroll region stretches
          to fit content and the composer slides off the bottom. */}
      <div className="mx-auto flex h-[calc(100dvh-9rem)] w-full max-w-3xl flex-col md:h-[calc(100dvh-8rem)]">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* New chat button — clears the current session so stale
              answers from the persisted thread don't bleed into a
              fresh question. ("Same answer" bug
              on Monzo where the agent quoted its prior wrong reply
              instead of re-running the lookup). Disabled while a
              stream is in flight so we don't orphan a half-finished
              turn in the DB. */}
          <div className="mb-3 flex items-center justify-end">
            <button
              type="button"
              onClick={handleNewChat}
              disabled={isStreaming}
              className="inline-flex items-center gap-1.5 rounded-full border border-border-default bg-bg-card px-3 py-1.5 text-[12px] text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary disabled:opacity-40"
              aria-label="Start a new chat"
            >
              <Plus size={12} strokeWidth={1.8} aria-hidden />
              New chat
            </button>
          </div>
          <div
            ref={scrollerRef}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1"
          >
            {!currentSession && (messages ?? []).length === 0 && (
              <EmptyChat />
            )}
            {messagesLoading && currentSession && (
              <Shimmer className="h-20 w-full rounded-xl" />
            )}
            {(messages ?? []).map((m) => (
              <MessageView key={m.id} m={m} />
            ))}

            {/* Optimistic user bubble — appears instantly on send so the
                conversation feels responsive instead of waiting for the
                roundtrip + query refetch. Disappears once the persisted
                user message lands in `messages`. */}
            {pendingUserText && <UserBubble text={pendingUserText} />}

            {/* While tools are running we don't show JSON cards — the
                rep doesn't want to read engine mechanics. Just a single
                rotating one-liner so they know we're alive. The agent's
                final text streams in (via streamingText) the moment it
                starts being generated. */}
            {streamingText && (
              <AssistantBubble text={streamingText} streaming />
            )}
            {isStreaming && !streamingText && <RotatingWaitMessage />}
          </div>

          {/* Composer */}
          <div className="mt-4 flex gap-2 rounded-2xl border border-border-default bg-bg-elevated/40 p-3">
            <textarea
              ref={composerRef}
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask anything — 'top 5 accounts with CVEs in last 10 days', 'how many CISOs do we know'..."
              rows={2}
              className="flex-1 resize-none bg-transparent text-[14px] text-text-primary outline-none placeholder:text-text-muted"
              disabled={isStreaming}
            />
            <button
              onClick={send}
              disabled={isStreaming || !composer.trim()}
              className="self-end rounded-lg bg-accent px-3 py-2 text-[13px] font-medium text-bg-base disabled:opacity-40"
            >
              {isStreaming ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
        </main>
      </div>
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Message rendering
// ---------------------------------------------------------------------------

function MessageView({ m }: { m: ChatMessage }) {
  if (m.role === "user") {
    const text = String((m.content as { text?: unknown })?.text ?? "");
    return <UserBubble text={text} />;
  }
  if (m.role === "assistant") {
    const text = String((m.content as { text?: unknown })?.text ?? "");
    return <AssistantBubble text={text} />;
  }
  // Tool calls + raw tool results are HIDDEN from the conversation —
  // this is a natural-language chat, the rep doesn't want to read JSON
  // Exception: tool_result with a ProposedMutation
  // payload renders a slide-to-confirm card; the user MUST see those
  // to act on them. Everything else stays internal mechanics.
  if (m.role === "tool_result") {
    const c = m.content as {
      ok?: boolean;
      data?: unknown;
    };
    const isMutationProposal =
      c.ok &&
      c.data &&
      typeof c.data === "object" &&
      "kind" in (c.data as Record<string, unknown>);
    if (isMutationProposal) {
      return (
        <ConfirmCard
          mutation={c.data as { kind: string; summary: string; payload: Record<string, unknown> }}
        />
      );
    }
  }
  return null;
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl bg-accent/15 px-4 py-2.5 text-[14px] text-text-primary">
        {text}
      </div>
    </div>
  );
}

function AssistantBubble({ text, streaming }: { text: string; streaming?: boolean }) {
  return (
    <div className="flex">
      <div className="vera-md max-w-[80%] text-[14px] leading-relaxed text-text-primary">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Breathing room between blocks — looks like a thoughtful
            // reply, not a wall of text. Previous
            // tight spacing made the bullets feel fused to the intro
            // and to the closing prose. Bumped paragraph + list margins
            // and list-item vertical padding.
            p: ({ children }) => (
              <p className="mb-3 leading-relaxed last:mb-0">{children}</p>
            ),
            ul: ({ children }) => (
              <ul className="mb-3 ml-4 list-disc space-y-1.5 last:mb-0">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="mb-3 ml-4 list-decimal space-y-1.5 last:mb-0">
                {children}
              </ol>
            ),
            li: ({ children }) => (
              <li className="leading-relaxed">{children}</li>
            ),
            // Tier / section headers — used when the agent groups
            // results (e.g. "Strongest matches", "Solid fits",
            // "Weaker fits"). Same look as inline strong but as a
            // standalone block with breathing room above and below
            // so the section structure reads clearly.
            h2: ({ children }) => (
              <div className="mb-2 mt-4 text-[13px] font-semibold text-text-primary first:mt-0">
                {children}
              </div>
            ),
            h3: ({ children }) => (
              <div className="mb-2 mt-4 text-[13px] font-semibold text-text-primary first:mt-0">
                {children}
              </div>
            ),
            strong: ({ children }) => <strong className="font-semibold text-text-primary">{children}</strong>,
            em: ({ children }) => <em className="italic">{children}</em>,
            a: ({ children, href }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline underline-offset-2 hover:opacity-80"
              >
                {children}
              </a>
            ),
            code: ({ children }) => (
              <code className="rounded bg-bg-elevated/60 px-1 py-0.5 font-mono text-[12px]">
                {children}
              </code>
            ),
            // Tables shouldn't appear (system prompt bans them) but if
            // GFM parses a well-formed one, render it with bordered
            // cells instead of the default unstyled HTML.
            table: ({ children }) => (
              <div className="my-2 overflow-x-auto">
                <table className="w-full border-collapse text-[12.5px]">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="border-b border-border-default">{children}</thead>
            ),
            th: ({ children }) => (
              <th className="px-2 py-1.5 text-left font-medium text-text-secondary">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="border-t border-border-subtle px-2 py-1.5">
                {children}
              </td>
            ),
          }}
        >
          {text}
        </ReactMarkdown>
        {streaming && <span className="ml-1 inline-block h-3 w-[2px] animate-pulse bg-accent" />}
      </div>
    </div>
  );
}

// Rotating wait-message — shown while tools are running and before the
// first assistant token arrives. Cycles through casual one-liners so it
// feels like a person thinking, not a spinner with no information.
// The user should never see JSON or tool cards, just words that say
// 'Hold up a second…'.
const WAIT_MESSAGES = [
  "Hold up a second…",
  "Won't be long…",
  "Nearly there…",
  "Just looking…",
  "One moment…",
];

function RotatingWaitMessage() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % WAIT_MESSAGES.length);
    }, 2500);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-2 px-2 text-[13px] text-text-muted">
      <Loader2 size={13} className="animate-spin" />
      <span className="transition-opacity">{WAIT_MESSAGES[idx]}</span>
    </div>
  );
}

function ConfirmCard({
  mutation,
}: {
  mutation: { kind: string; summary: string; payload: Record<string, unknown> };
}) {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "applied"; message: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  // Vera Solo is caps-based — never show credit cost language.
  const isSolo = !!useOrg().features.solo_plan;

  // Friendly labels per mutation kind — keep the rep informed about what
  // the action does + the credit cost (rule:
  // every credit spend needs an explicit slide gesture).
  const meta =
    mutation.kind === "add_to_watchlist"
      ? {
          title: "Add to watchlist",
          cost: isSolo ? "Triggers research" : "1 credit · triggers enrichment",
          slideText: "Slide to add + enrich",
          successText: "Added — enrichment running",
        }
      : mutation.kind === "icp_change"
        ? {
            title: "Update ICP",
            cost: isSolo ? "" : "No credit cost",
            slideText: "Slide to update ICP",
            successText: "ICP updated",
          }
        : {
            title: mutation.kind,
            cost: "",
            slideText: "Slide to confirm",
            successText: "Confirmed",
          };

  async function apply() {
    const sb = createSupabaseBrowserClient();
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Not signed in");
    const resp = await fetch("/api/chat/confirm", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ kind: mutation.kind, payload: mutation.payload }),
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok || !body.ok) {
      throw new Error(body?.error ?? `Request failed (${resp.status})`);
    }
    if (mutation.kind === "add_to_watchlist") {
      const enriched = body.data?.enrichment_triggered;
      const enrichError = body.data?.enrichment_error;
      let message: string;
      if (enriched) {
        message = "Added and enrichment completed.";
      } else if (enrichError) {
        // Be truthful — don't claim it's running if the engine actually
        // rejected the call (e.g. an engine build without the domain path).
        message = `Added to watchlist, but enrichment failed: ${
          String(enrichError).slice(0, 200)
        }`;
      } else {
        message = "Added — enrichment is running in the background.";
      }
      setState({ kind: "applied", message });
    } else {
      setState({ kind: "applied", message: "Change applied." });
    }
  }

  return (
    <div className="rounded-xl border border-accent/20 bg-accent/[0.03] px-4 py-3.5">
      <div className="text-[11px] uppercase tracking-wide text-text-muted">
        {meta.title}
      </div>
      <div className="mt-1 text-[13.5px] text-text-primary">{mutation.summary}</div>
      {meta.cost && (
        <div className="mt-1 text-[11.5px] text-text-muted">{meta.cost}</div>
      )}

      {state.kind === "idle" && (
        <div className="mt-3">
          <SlideToConfirm
            text={meta.slideText}
            successText={meta.successText}
            width={280}
            height={44}
            onConfirm={async () => {
              try {
                await apply();
              } catch (e) {
                setState({ kind: "error", message: (e as Error).message });
                throw e; // bounce the slider back
              }
            }}
          />
        </div>
      )}

      {state.kind === "applied" && (
        <div className="mt-3 flex items-center gap-2 text-[12.5px] text-emerald-300">
          <Check size={13} />
          {state.message}
        </div>
      )}

      {state.kind === "error" && (
        <div className="mt-3 text-[12.5px] text-rose-300/90">
          Couldn&apos;t apply: {state.message}
        </div>
      )}
    </div>
  );
}

function EmptyChat() {
  return (
    <Card className="p-8 text-center">
      <MessageSquare size={20} className="mx-auto text-text-muted" />
      <p className="mt-3 text-[14px] text-text-primary">Ask Vera anything about your pipeline.</p>
      <p className="mt-2 text-[12.5px] text-text-muted">
        Try: <em>top 5 accounts with CVEs in the last 10 days</em> · <em>any new
        funding signals this week?</em> · <em>change my ICP to focus on healthcare</em>
      </p>
    </Card>
  );
}
