"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Key,
  KeyRound,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  Plus,
  X,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import {
  Card,
  EmptyState,
  Pill,
  RelativeTime,
  SectionHeader,
  Shimmer,
} from "@/components/dashboard/primitives";
import { useOrg } from "@/components/dashboard/OrgContext";
import { claraApi } from "@/lib/dashboard/claraApi";
import { SlideToConfirm } from "@/components/ui/SlideToConfirm";
import { cn } from "@/lib/utils";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  last_used_at: string | null;
  request_count: number;
  created_at: string;
  revoked_at: string | null;
}

interface KeyListResponse {
  data: ApiKey[];
  tier_allowed: boolean;
}

interface CreatedKey extends ApiKey {
  /** Plaintext key — only present at creation/rotation, never on list. */
  full_key: string;
}

export function ApiKeysCard() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [revealedKey, setRevealedKey] = useState<CreatedKey | null>(null);

  const { data, isLoading } = useQuery<KeyListResponse>({
    queryKey: ["api-keys", orgId],
    queryFn: () => claraApi<KeyListResponse>(`/api-keys?org_id=${orgId}`),
    enabled: Boolean(orgId),
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      return claraApi<CreatedKey>("/api-keys", {
        method: "POST",
        body: JSON.stringify({ org_id: orgId, name }),
      });
    },
    onSuccess: (key) => {
      setRevealedKey(key);
      setShowCreate(false);
      qc.invalidateQueries({ queryKey: ["api-keys", orgId] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (keyId: string) =>
      claraApi(`/api-keys/${keyId}?org_id=${orgId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys", orgId] }),
  });

  const rotateMutation = useMutation({
    mutationFn: async (keyId: string) =>
      claraApi<CreatedKey>(`/api-keys/${keyId}/rotate`, {
        method: "POST",
        body: JSON.stringify({ org_id: orgId }),
      }),
    onSuccess: (key) => {
      setRevealedKey(key);
      qc.invalidateQueries({ queryKey: ["api-keys", orgId] });
    },
  });

  const tierAllowed = data?.tier_allowed ?? true;
  const keys = data?.data ?? [];

  return (
    <>
      <Card delay={0.22} className="overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-border-subtle p-6 md:p-7">
          <SectionHeader
            title="API keys"
            subtitle="Push Vera's briefs and signals into your CRM, n8n, Slack — anywhere your team works."
          />
          {tierAllowed && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-text-primary px-4 py-2 text-[12.5px] font-medium tracking-tight text-bg-base transition-opacity hover:opacity-90"
              >
                <Plus size={12} strokeWidth={2.2} />
                New key
              </button>
            </div>
          )}
        </div>

        {!tierAllowed ? (
          <UpgradePrompt />
        ) : isLoading ? (
          <div className="flex flex-col gap-2 p-6 md:p-7">
            {[0, 1].map((i) => (
              <Shimmer key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : keys.length === 0 ? (
          <EmptyState
            icon={<KeyRound size={16} strokeWidth={1.6} />}
            title="No API keys yet"
            body="Create your first key to start using the Vera API."
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {keys.map((key) => (
              <KeyRow
                key={key.id}
                apiKey={key}
                onRevoke={() => revokeMutation.mutate(key.id)}
                onRotate={() => rotateMutation.mutate(key.id)}
                isBusy={
                  (revokeMutation.isPending && revokeMutation.variables === key.id) ||
                  (rotateMutation.isPending && rotateMutation.variables === key.id)
                }
              />
            ))}
          </ul>
        )}
      </Card>

      <AnimatePresence>
        {showCreate && (
          <CreateKeyModal
            onClose={() => setShowCreate(false)}
            onSubmit={(name) => createMutation.mutate(name)}
            isPending={createMutation.isPending}
            error={createMutation.error}
          />
        )}
        {revealedKey && (
          <RevealedKeyModal
            apiKey={revealedKey}
            onClose={() => setRevealedKey(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------
// Row in the keys list
// ---------------------------------------------------------------

function KeyRow({
  apiKey,
  onRevoke,
  onRotate,
  isBusy,
}: {
  apiKey: ApiKey;
  onRevoke: () => void;
  onRotate: () => void;
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
        <Key size={14} strokeWidth={1.7} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-display text-[13.5px] font-medium tracking-tight text-text-primary">
            {apiKey.name}
          </span>
          <Pill variant="muted">
            <span className="font-mono">vera_live_{apiKey.prefix}…****</span>
          </Pill>
        </div>
        <div className="mt-1 flex items-center gap-3 text-[11.5px] text-text-muted">
          <span>
            {apiKey.last_used_at ? (
              <>
                Last used <RelativeTime value={apiKey.last_used_at} />
              </>
            ) : (
              <>Never used</>
            )}
          </span>
          <span>·</span>
          <span>{apiKey.request_count.toLocaleString()} requests</span>
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
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRotate}
            disabled={isBusy}
            title="Rotate this key — old key dies, new one issued"
            className="grid h-8 w-8 place-items-center rounded-lg text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary disabled:opacity-40"
          >
            {isBusy ? (
              <Loader2 size={13} strokeWidth={2} className="animate-spin" />
            ) : (
              <RefreshCw size={13} strokeWidth={1.8} />
            )}
          </button>
          <button
            type="button"
            onClick={() => setConfirmRevoke(true)}
            disabled={isBusy}
            title="Revoke this key"
            className="grid h-8 w-8 place-items-center rounded-lg text-text-muted transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
          >
            <Trash2 size={13} strokeWidth={1.8} />
          </button>
        </div>
      )}
    </motion.li>
  );
}

// ---------------------------------------------------------------
// Tier upsell — shown when org is on Scout
// ---------------------------------------------------------------

function UpgradePrompt() {
  return (
    <div className="px-6 py-9 text-center md:px-7">
      <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-bg-elevated text-text-secondary">
        <KeyRound size={16} strokeWidth={1.6} />
      </div>
      <h3 className="mt-4 font-display text-[15px] font-medium tracking-tight text-text-primary">
        API access is available on any paid plan
      </h3>
      <p className="mx-auto mt-2 max-w-md text-[12.5px] leading-relaxed text-text-secondary">
        Push Vera&apos;s briefs and signals into your CRM, Slack, n8n, or any
        tool that speaks HTTP. Activate a plan to unlock per-team API keys.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------
// Create-key modal
// ---------------------------------------------------------------

function CreateKeyModal({
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
    <Modal onClose={onClose} title="Create new API key">
      <p className="text-[13px] leading-relaxed text-text-secondary">
        Give this key a memorable name — typically the system or environment
        you&apos;ll use it from (e.g. &ldquo;Production CRM&rdquo;,
        &ldquo;n8n-staging&rdquo;).
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
          placeholder="e.g. Production CRM"
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
            Create key
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------
// One-time-reveal modal (shown after create + rotate)
// ---------------------------------------------------------------

function RevealedKeyModal({
  apiKey,
  onClose,
}: {
  apiKey: CreatedKey;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(apiKey.full_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — user can manually select */
    }
  }

  return (
    <Modal onClose={onClose} title={`API key created: ${apiKey.name}`}>
      <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-3">
        <AlertTriangle size={14} strokeWidth={1.8} className="mt-0.5 shrink-0 text-amber-400" />
        <p className="text-[12.5px] leading-relaxed text-amber-200/90">
          This is the <span className="font-medium">only time</span> you&apos;ll
          see this key. Copy it now and store it somewhere secure. If you lose
          it, rotate the key to issue a new one.
        </p>
      </div>

      <div className="mt-5">
        <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
          Your new API key
        </label>
        <div className="flex items-stretch gap-2">
          <code className="flex-1 select-all overflow-x-auto rounded-lg border border-border-default bg-bg-base px-3.5 py-3 font-mono text-[12.5px] text-text-primary">
            {apiKey.full_key}
          </code>
          <button
            type="button"
            onClick={copy}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-medium tracking-tight transition-colors",
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
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-border-subtle bg-bg-elevated/40 p-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
          Quick start
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-text-secondary">
          Send this key on every request as a Bearer token:
        </p>
        <pre className="mt-2 overflow-x-auto rounded bg-bg-base px-3 py-2 font-mono text-[11px] leading-relaxed text-text-primary">
{`curl ${process.env.NEXT_PUBLIC_API_BASE_URL || "https://your-engine-host"}/api/v1/public/leads \\
  -H "Authorization: Bearer ${apiKey.full_key}"`}
        </pre>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-text-primary px-5 py-2 text-[13px] font-medium tracking-tight text-bg-base transition-opacity hover:opacity-90"
        >
          I&apos;ve copied my key
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------
// Modal shell
// ---------------------------------------------------------------

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
