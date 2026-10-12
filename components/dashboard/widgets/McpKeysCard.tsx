"use client";

/**
 * MCP bearer-token management for the Settings page.
 *
 * Customers paste these tokens into their OWN agent setup (their Claude
 * in Slack, n8n flow, ChatGPT custom-GPT, etc.) to call Vera's MCP
 * server. Each token authenticates as the issuing org — read access is
 * RLS-equivalent to the customer's own watchlist + ICP.
 *
 * Same UX pattern as ApiKeysCard: list, create-with-reveal-once,
 * revoke via slide-to-confirm. Different endpoint family
 * (/api/mcp/keys) and different cURL example (the MCP HTTP transport
 * uses JSON-RPC, not REST).
 */

import { useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  Loader2,
  Plug,
  Plus,
  Trash2,
  X,
  AlertTriangle,
} from "lucide-react";
import {
  Card,
  EmptyState,
  Pill,
  RelativeTime,
  SectionHeader,
  Shimmer,
} from "@/components/dashboard/primitives";
import { SlideToConfirm } from "@/components/ui/SlideToConfirm";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const _noSubscribe = () => () => {};

// This app's own /api/mcp route. The server snapshot is empty so hydration
// is stable; the browser then fills in its origin.
function useMcpEndpointUrl(): string {
  const origin = useSyncExternalStore(
    _noSubscribe,
    () => window.location.origin,
    () => "",
  );
  return `${origin}/api/mcp`;
}

interface McpKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface CreatedKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  full_key: string;
}

async function authedFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const sb = createSupabaseBrowserClient();
  const { data: { session } } = await sb.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not signed in");
  const resp = await fetch(path, {
    ...(init ?? {}),
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(body?.error ?? `Request failed (${resp.status})`);
  }
  return body as T;
}

export function McpKeysCard() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [revealed, setRevealed] = useState<CreatedKey | null>(null);
  const mcpEndpointUrl = useMcpEndpointUrl();

  const { data, isLoading } = useQuery<{ keys: McpKey[] }>({
    queryKey: ["mcp-keys"],
    queryFn: () => authedFetch("/api/mcp/keys"),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      authedFetch<{ key: CreatedKey }>("/api/mcp/keys", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: (result) => {
      setRevealed(result.key);
      setShowCreate(false);
      qc.invalidateQueries({ queryKey: ["mcp-keys"] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) =>
      authedFetch(`/api/mcp/keys/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcp-keys"] }),
  });

  const keys = (data?.keys ?? []).filter((k) => !k.revoked_at);

  return (
    <>
      <Card delay={0.2} className="overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-border-subtle p-6 md:p-7">
          <SectionHeader
            title="MCP access"
            subtitle="Talk to Vera from your own AI surface — Claude in Slack, n8n flows, ChatGPT. One token per agent."
          />
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-text-primary px-4 py-2 text-[12.5px] font-medium tracking-tight text-bg-base transition-opacity hover:opacity-90"
          >
            <Plus size={12} strokeWidth={2.2} />
            New token
          </button>
        </div>

        {/* Endpoint config — copyable. Same value for every customer;
            differentiation is the bearer token. */}
        <div className="border-b border-border-subtle px-6 py-4 md:px-7">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
            MCP endpoint
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="flex-1 select-all overflow-x-auto rounded-md border border-border-default bg-bg-base px-3 py-2 font-mono text-[12.5px] text-text-primary">
              {mcpEndpointUrl}
            </code>
            <CopyButton value={mcpEndpointUrl} />
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-text-muted">
            Use this URL as the MCP server in your agent config. Pair with a
            token below as <span className="font-mono">Authorization: Bearer &lt;token&gt;</span>.
          </p>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2 p-6 md:p-7">
            {[0, 1].map((i) => (
              <Shimmer key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : keys.length === 0 ? (
          <EmptyState
            icon={<Plug size={16} strokeWidth={1.6} />}
            title="No MCP tokens yet"
            body="Generate a token to connect Vera into your own agent setup."
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {keys.map((k) => (
              <KeyRow
                key={k.id}
                k={k}
                onRevoke={() => revokeMutation.mutate(k.id)}
                isBusy={
                  revokeMutation.isPending && revokeMutation.variables === k.id
                }
              />
            ))}
          </ul>
        )}
      </Card>

      <AnimatePresence>
        {showCreate && (
          <CreateModal
            onClose={() => setShowCreate(false)}
            onSubmit={(name) => createMutation.mutate(name)}
            isPending={createMutation.isPending}
            error={createMutation.error}
          />
        )}
        {revealed && (
          <RevealedModal token={revealed} onClose={() => setRevealed(null)} />
        )}
      </AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------
// Row
// ---------------------------------------------------------------

function KeyRow({
  k,
  onRevoke,
  isBusy,
}: {
  k: McpKey;
  onRevoke: () => void;
  isBusy: boolean;
}) {
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  return (
    <motion.li
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      className="flex items-center gap-4 px-6 py-4 md:px-7"
    >
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-bg-elevated text-text-secondary">
        <Plug size={14} strokeWidth={1.7} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-display text-[13.5px] font-medium tracking-tight text-text-primary">
            {k.name}
          </span>
          <Pill variant="muted">
            <span className="font-mono">{k.key_prefix}…****</span>
          </Pill>
        </div>
        <div className="mt-1 flex items-center gap-3 text-[11.5px] text-text-muted">
          <span>
            Created <RelativeTime value={k.created_at} />
          </span>
          <span>·</span>
          <span>
            {k.last_used_at ? (
              <>
                Last used <RelativeTime value={k.last_used_at} />
              </>
            ) : (
              <>Never used</>
            )}
          </span>
        </div>
      </div>

      {confirmRevoke ? (
        <div className="flex items-center gap-2">
          <SlideToConfirm
            text="Slide to revoke"
            successText="Revoking…"
            onConfirm={() => {
              setConfirmRevoke(false);
              onRevoke();
            }}
            width={220}
            height={36}
          />
          <button
            type="button"
            onClick={() => setConfirmRevoke(false)}
            className="rounded-md px-2 py-1.5 text-[11.5px] text-text-muted hover:text-text-secondary"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmRevoke(true)}
          disabled={isBusy}
          title="Revoke this token"
          className="grid h-8 w-8 place-items-center rounded-lg text-text-muted transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
        >
          {isBusy ? (
            <Loader2 size={13} strokeWidth={2} className="animate-spin" />
          ) : (
            <Trash2 size={13} strokeWidth={1.8} />
          )}
        </button>
      )}
    </motion.li>
  );
}

// ---------------------------------------------------------------
// Create modal
// ---------------------------------------------------------------

function CreateModal({
  onClose,
  onSubmit,
  isPending,
  error,
}: {
  onClose: () => void;
  onSubmit: (name: string) => void;
  isPending: boolean;
  error: unknown;
}) {
  const [name, setName] = useState("");
  return (
    <Modal onClose={onClose} title="Generate new MCP token">
      <p className="text-[13px] leading-relaxed text-text-secondary">
        Name this token after where you&apos;ll use it — typically the agent
        or environment (e.g. &ldquo;Slack bot&rdquo;, &ldquo;n8n production
        flow&rdquo;, &ldquo;Claude Desktop&rdquo;). One token per surface
        makes revoking easy.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || isPending) return;
          onSubmit(name.trim());
        }}
        className="mt-5 flex flex-col gap-4"
      >
        <input
          type="text"
          autoFocus
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Slack bot"
          className="w-full rounded-lg border border-border-default bg-bg-elevated px-3.5 py-2.5 text-[14px] text-text-primary placeholder:text-text-muted/70 outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent"
        />
        {error instanceof Error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[12.5px] text-red-400">
            {error.message}
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-[13px] text-text-secondary transition-colors hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || isPending}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-[13px] font-medium tracking-tight transition-opacity",
              !name.trim() || isPending
                ? "cursor-not-allowed bg-bg-elevated text-text-muted"
                : "bg-text-primary text-bg-base hover:opacity-90",
            )}
          >
            {isPending ? (
              <Loader2 size={12} strokeWidth={2} className="animate-spin" />
            ) : (
              <Plus size={12} strokeWidth={2.2} />
            )}
            Generate
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------
// One-time reveal
// ---------------------------------------------------------------

function RevealedModal({
  token,
  onClose,
}: {
  token: CreatedKey;
  onClose: () => void;
}) {
  const mcpEndpointUrl = useMcpEndpointUrl();
  return (
    <Modal onClose={onClose} title={`MCP token created: ${token.name}`}>
      <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-3">
        <AlertTriangle
          size={14}
          strokeWidth={1.8}
          className="mt-0.5 shrink-0 text-amber-400"
        />
        <p className="text-[12.5px] leading-relaxed text-amber-200/90">
          This is the <span className="font-medium">only time</span>{" "}
          you&apos;ll see this token. Copy it now into your agent config — if
          you lose it, revoke and generate a new one.
        </p>
      </div>

      <div className="mt-5">
        <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
          Token
        </label>
        <div className="flex items-stretch gap-2">
          <code className="flex-1 select-all overflow-x-auto rounded-lg border border-border-default bg-bg-base px-3.5 py-3 font-mono text-[12.5px] text-text-primary">
            {token.full_key}
          </code>
          <CopyButton value={token.full_key} />
        </div>
      </div>

      <div className="mt-5">
        <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
          Connector URL — for Claude Desktop and claude.ai
        </label>
        <div className="flex items-stretch gap-2">
          <code className="flex-1 select-all overflow-x-auto rounded-lg border border-border-default bg-bg-base px-3.5 py-3 font-mono text-[12.5px] text-text-primary">
            {`${mcpEndpointUrl}?key=${token.full_key}`}
          </code>
          <CopyButton value={`${mcpEndpointUrl}?key=${token.full_key}`} />
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-border-subtle bg-bg-elevated/40 p-4">
        <div className="text-[12.5px] font-medium text-text-primary">
          Connect Claude in three steps
        </div>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-[12.5px] leading-relaxed text-text-secondary">
          <li>
            In Claude, open Settings, then Connectors, then Add custom
            connector.
          </li>
          <li>Name it Vera and paste the connector URL above.</li>
          <li>
            Leave the OAuth fields empty and click Add. Then ask Claude to
            search your accounts.
          </li>
        </ol>
        <p className="mt-3 text-[12px] text-text-muted">
          Using Claude Code? Run:{" "}
          <code className="font-mono text-[11px]">
            claude mcp add --transport http vera {mcpEndpointUrl} --header
            &quot;Authorization: Bearer &lt;token&gt;&quot;
          </code>
        </p>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-text-primary px-5 py-2 text-[13px] font-medium tracking-tight text-bg-base transition-opacity hover:opacity-90"
        >
          I&apos;ve copied my token
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — user can manually select */
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-2 text-[12px] font-medium tracking-tight transition-colors",
        copied
          ? "border-accent/40 bg-accent/10 text-accent"
          : "border-border-default bg-bg-elevated text-text-secondary hover:border-border-strong hover:text-text-primary",
      )}
    >
      {copied ? (
        <Check size={12} strokeWidth={2.2} />
      ) : (
        <Copy size={12} strokeWidth={1.8} />
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function Modal({
  onClose,
  title,
  children,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-bg-base/70 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[calc(100vh-4rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-card"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-7 py-5">
          <h3 className="font-display text-[1.05rem] font-medium tracking-tight text-text-primary">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-text-muted transition-colors hover:bg-bg-elevated/50 hover:text-text-primary"
          >
            <X size={12} strokeWidth={1.8} />
          </button>
        </div>
        <div className="overflow-y-auto px-7 py-6">{children}</div>
      </motion.div>
    </motion.div>
  );
}
