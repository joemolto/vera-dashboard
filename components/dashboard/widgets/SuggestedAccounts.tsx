"use client";

/**
 * SuggestedAccounts — bottom-of-page tray of candidate companies the
 * Apollo org-search produced for the current org's ICP. Each card has
 * Add / Dismiss; accept promotes to status='active' and the engine's
 * background top-up replenishes the pool to 10. Dismiss flags the
 * row and won't re-surface for 90 days.
 *
 * Gated entirely on features.account_suggestions. The component
 * renders nothing for orgs without the flag — so this file is safe
 * to mount on the accounts page unconditionally. Pilot 2026-06-07.
 *
 * Rules respected:
 *  - No slide-to-confirm — neither action is destructive (accept just
 *    adds to dashboard; dismiss is reversible at the DB layer).
 *  - Plain copy. No "AI-discovered" / "smart match" framing.
 *  - "Why suggested" chips are factual ICP match tokens, not generated.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, Plus, X, ChevronDown, ChevronUp } from "lucide-react";
import { Card, SectionHeader } from "@/components/dashboard/primitives";
import { useOrg } from "@/components/dashboard/OrgContext";
import {
  useAccountSuggestions,
  useSuggestionAction,
  type AccountSuggestion,
} from "@/lib/dashboard/queries";
import { logoUrl } from "@/lib/logoUrl";
import { cn } from "@/lib/utils";

interface SuggestedAccountsProps {
  /** When the active account count is above this, the tray starts
   * collapsed so it doesn't dominate the page. Rep can expand. */
  collapseThreshold?: number;
  /** Active account count, used to decide initial collapse state. */
  activeAccountCount?: number;
}

export function SuggestedAccounts({
  collapseThreshold = 5,
  activeAccountCount = 0,
}: SuggestedAccountsProps) {
  const { features } = useOrg();
  const { data: suggestions, isLoading } = useAccountSuggestions();
  const mutation = useSuggestionAction();
  const [collapsed, setCollapsed] = useState<boolean>(
    activeAccountCount > collapseThreshold,
  );

  if (!features.account_suggestions) return null;
  if (!isLoading && (!suggestions || suggestions.length === 0)) return null;

  const handleAction = (id: string, action: "accept" | "dismiss") => {
    mutation.mutate({ id, action });
  };

  return (
    <Card delay={0.1} className="mt-6 overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between gap-3 p-6 text-left md:p-7"
      >
        <SectionHeader
          title="Suggested accounts"
          subtitle={
            suggestions
              ? `${suggestions.length} candidate${suggestions.length === 1 ? "" : "s"} matching your ICP. Add to start monitoring or dismiss to skip for 90 days.`
              : ""
          }
        />
        {collapsed ? (
          <ChevronDown size={18} className="shrink-0 text-text-muted" />
        ) : (
          <ChevronUp size={18} className="shrink-0 text-text-muted" />
        )}
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
          >
            <ul className="grid grid-cols-1 gap-3 border-t border-border-subtle p-6 md:grid-cols-2 md:p-7 lg:grid-cols-3">
              {(suggestions ?? []).map((s) => (
                <SuggestionCard
                  key={s.id}
                  suggestion={s}
                  onAction={handleAction}
                  pending={mutation.isPending}
                />
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function SuggestionCard({
  suggestion,
  onAction,
  pending,
}: {
  suggestion: AccountSuggestion;
  onAction: (id: string, action: "accept" | "dismiss") => void;
  pending: boolean;
}) {
  const reasons = Array.isArray(suggestion.suggested_reasons)
    ? suggestion.suggested_reasons
    : [];
  const favicon = suggestion.company_domain
    ? logoUrl(suggestion.company_domain, 128)
    : null;

  return (
    <li className="rounded-xl border border-border-subtle bg-bg-card/60 p-4 transition-colors hover:border-border-default">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border-subtle bg-bg-elevated">
          {favicon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={favicon}
              alt=""
              width={20}
              height={20}
              className="h-5 w-5"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <Globe size={14} className="text-text-muted" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium text-text-primary">
            {suggestion.company_name}
          </div>
          <div className="truncate font-mono text-[11px] text-text-muted">
            {suggestion.company_domain}
          </div>
        </div>
      </div>

      {reasons.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {reasons.slice(0, 4).map((r, i) => (
            <span
              key={`${suggestion.id}-r-${i}`}
              className="inline-flex items-center rounded-full border border-border-subtle bg-bg-elevated/40 px-2 py-0.5 text-[10.5px] text-text-secondary"
            >
              {r}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => onAction(suggestion.id, "accept")}
          className={cn(
            "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-[12px] font-medium text-text-primary transition-colors hover:bg-accent/20",
            pending && "cursor-not-allowed opacity-50",
          )}
        >
          <Plus size={13} strokeWidth={2} />
          Add
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => onAction(suggestion.id, "dismiss")}
          aria-label="Dismiss suggestion"
          className={cn(
            "inline-flex items-center justify-center rounded-lg border border-border-subtle bg-transparent px-3 py-1.5 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-secondary",
            pending && "cursor-not-allowed opacity-50",
          )}
        >
          <X size={14} strokeWidth={1.7} />
        </button>
      </div>
    </li>
  );
}
