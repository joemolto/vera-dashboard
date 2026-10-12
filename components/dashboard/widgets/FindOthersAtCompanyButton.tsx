"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, Check, ExternalLink, Loader2, Users, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useOrg } from "@/components/dashboard/OrgContext";
import { claraApi } from "@/lib/dashboard/claraApi";
import { SlideToConfirm } from "@/components/ui/SlideToConfirm";
import { cn } from "@/lib/utils";

interface Candidate {
  first_name: string;
  last_name: string;
  title: string;
  email?: string;
  linkedin_url?: string;
  company_name: string;
  company_domain: string;
  apollo_id?: string;
}

interface FindOthersResponse {
  company_name: string;
  company_domain: string;
  candidates: Candidate[];
  total_found: number;
}

interface AddResponse {
  revealed: number;
  lead_ids: string[];
  primary_lead_id: string | null;
  failed: number;
  cap_reached: boolean;
  requested: number;
}

interface Props {
  leadId: string;
  /** Disable the button if the lead has no domain (Apollo can't search) */
  hasCompanyDomain: boolean;
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "preview";
      data: FindOthersResponse;
      selected: Set<string>;
    }
  | { kind: "adding" }
  | { kind: "added"; stored: number; duplicates: number }
  | { kind: "empty" }
  | { kind: "error"; message: string };

export function FindOthersAtCompanyButton({ leadId, hasCompanyDomain }: Props) {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });

  const onOpen = async () => {
    setState({ kind: "loading" });
    try {
      const data = await claraApi<FindOthersResponse>(
        `/leads/${leadId}/find-others-at-company`,
        { method: "POST", body: JSON.stringify({ org_id: orgId }) },
        // 30s frontend timeout vs 12s+12s backend budget = healthy buffer
        // for Apollo slow-days without surfacing 'signal aborted' to the user
        30_000,
      );
      if (!data.candidates || data.candidates.length === 0) {
        setState({ kind: "empty" });
        return;
      }
      // Default: all candidates selected. User can deselect.
      const selected = new Set<string>();
      data.candidates.forEach((c) => selected.add(candidateKey(c)));
      setState({ kind: "preview", data, selected });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Search failed";
      setState({ kind: "error", message: msg });
    }
  };

  const onClose = () => setState({ kind: "idle" });

  const toggleSelected = (key: string) => {
    if (state.kind !== "preview") return;
    const next = new Set(state.selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setState({ ...state, selected: next });
  };

  const onAdd = async () => {
    if (state.kind !== "preview") return;
    const selectedCandidates = state.data.candidates.filter((c) =>
      state.selected.has(candidateKey(c)),
    );
    if (selectedCandidates.length === 0) return;

    setState({ kind: "adding" });
    try {
      const resp = await claraApi<AddResponse>(
        `/leads/${leadId}/multithread-add`,
        {
          method: "POST",
          body: JSON.stringify({
            org_id: orgId,
            candidates: selectedCandidates,
          }),
        },
        // Each contact is revealed + a lead created server-side, so give the
        // reveal loop room on a slow Apollo day.
        60_000,
      );
      qc.invalidateQueries({ queryKey: ["leads"] });
      // Land the rep on the first contact. `primary_lead_id` is the new engine
      // field; fall back to lead_ids[0] so a not-yet-deployed engine still
      // navigates rather than dead-ending.
      const target = resp.primary_lead_id ?? resp.lead_ids?.[0];
      if (target) {
        // The rest are now real prospects (enriching in the background).
        router.push(`/dashboard/prospects/${target}`);
        return;
      }
      // Nothing revealed — most likely the unlock cap, or Apollo couldn't match.
      setState({
        kind: "error",
        message: resp.cap_reached
          ? "You've reached your monthly contact-unlock limit."
          : "Couldn't reveal these contacts — please try again.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to research contacts";
      setState({ kind: "error", message: msg });
    }
  };

  const showModal =
    state.kind === "loading" ||
    state.kind === "preview" ||
    state.kind === "adding" ||
    state.kind === "added" ||
    state.kind === "empty" ||
    state.kind === "error";

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        disabled={!hasCompanyDomain || state.kind === "loading"}
        title={
          hasCompanyDomain
            ? "Find other ICP-fit decision-makers at this company"
            : "Lead has no company domain — can't search for colleagues"
        }
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-border-default bg-bg-base/50 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] transition-colors",
          !hasCompanyDomain
            ? "cursor-not-allowed opacity-40"
            : state.kind === "loading"
            ? "cursor-wait text-text-muted"
            : "text-text-muted hover:border-border-strong hover:text-text-primary",
        )}
        aria-label="Find others at this company"
      >
        {state.kind === "loading" ? (
          <>
            <Loader2 size={11} strokeWidth={2} className="animate-spin" />
            Searching
          </>
        ) : (
          <>
            <Users size={11} strokeWidth={1.8} />
            Find others at this company
          </>
        )}
      </button>

      <AnimatePresence>
        {showModal && (
          <Modal onClose={onClose}>
            {state.kind === "loading" && <LoadingState />}
            {state.kind === "preview" && (
              <PreviewState
                data={state.data}
                selected={state.selected}
                onToggle={toggleSelected}
                onCancel={onClose}
                onAdd={onAdd}
              />
            )}
            {state.kind === "adding" && <AddingState />}
            {state.kind === "added" && (
              <AddedState
                stored={state.stored}
                duplicates={state.duplicates}
                onClose={onClose}
              />
            )}
            {state.kind === "empty" && <EmptyState onClose={onClose} />}
            {state.kind === "error" && (
              <ErrorState message={state.message} onClose={onClose} />
            )}
          </Modal>
        )}
      </AnimatePresence>
    </>
  );
}

function candidateKey(c: Candidate): string {
  return c.linkedin_url || c.email || `${c.first_name}_${c.last_name}_${c.title}`;
}

function Modal({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 grid place-items-center bg-bg-base/70 px-4 py-8 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[calc(100vh-4rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-card"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function ModalHeader({
  icon,
  title,
  subtitle,
  onClose,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border-subtle px-7 py-5">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-bg-elevated">
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-[1.05rem] font-medium tracking-tight text-text-primary">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-text-muted transition-colors hover:bg-bg-elevated/50 hover:text-text-primary"
      >
        <X size={12} strokeWidth={1.8} />
      </button>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid place-items-center px-7 py-16">
      <Loader2
        size={20}
        strokeWidth={2}
        className="animate-spin text-text-muted"
      />
      <p className="mt-4 font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-muted">
        Vera is finding decision-makers…
      </p>
    </div>
  );
}

function PreviewState({
  data,
  selected,
  onToggle,
  onCancel,
  onAdd,
}: {
  data: FindOthersResponse;
  selected: Set<string>;
  onToggle: (key: string) => void;
  onCancel: () => void;
  onAdd: () => void;
}) {
  const selectedCount = selected.size;

  return (
    <>
      <ModalHeader
        icon={<Building2 size={16} strokeWidth={1.7} className="text-accent" />}
        title={`Other decision-makers at ${data.company_name || "this company"}`}
        subtitle={`Found ${data.total_found} ICP-fit ${
          data.total_found === 1 ? "match" : "matches"
        } · select who to research. Each uses one contact unlock and opens as a full prospect.`}
        onClose={onCancel}
      />

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-7 py-5"
        style={{ maxHeight: "calc(100vh - 16rem)" }}
      >
        <ul className="flex flex-col gap-2.5">
          {data.candidates.map((c) => {
            const key = candidateKey(c);
            const isSelected = selected.has(key);
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => onToggle(key)}
                  className={cn(
                    "flex w-full items-start gap-4 rounded-xl border p-4 text-left transition-colors",
                    isSelected
                      ? "border-accent/50 bg-accent/5"
                      : "border-border-subtle bg-bg-base/30 hover:border-border-default",
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border transition-colors",
                      isSelected
                        ? "border-accent bg-accent"
                        : "border-border-default bg-transparent",
                    )}
                  >
                    {isSelected && (
                      <Check size={12} strokeWidth={3} className="text-bg-base" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="font-display text-[14px] font-medium tracking-tight text-text-primary">
                      {c.first_name} {c.last_name}
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-text-secondary">
                      {c.title || "—"}
                    </div>
                    {c.linkedin_url && (
                      <a
                        href={c.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted hover:text-text-secondary"
                      >
                        LinkedIn <ExternalLink size={10} strokeWidth={1.7} />
                      </a>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex shrink-0 flex-col gap-3 border-t border-border-subtle bg-bg-base/30 px-7 py-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-muted">
            {selectedCount} selected
          </span>
          <span className="text-[12px] text-text-secondary">
            {selectedCount === 0
              ? "Select who to research"
              : `Uses ${selectedCount} contact unlock${selectedCount === 1 ? "" : "s"}`}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full px-4 py-2 text-[13px] text-text-secondary transition-colors hover:text-text-primary"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2.5">
            <span className="hidden text-[11.5px] text-text-muted sm:inline">
              Slide to research
            </span>
            <SlideToConfirm
              onConfirm={onAdd}
              disabled={selectedCount === 0}
              width={200}
              height={44}
            />
          </div>
        </div>
      </div>
    </>
  );
}

function AddingState() {
  return (
    <div className="grid place-items-center px-7 py-16">
      <Loader2
        size={20}
        strokeWidth={2}
        className="animate-spin text-text-muted"
      />
      <p className="mt-4 font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-muted">
        Researching contacts…
      </p>
    </div>
  );
}

function AddedState({
  stored,
  duplicates,
  onClose,
}: {
  stored: number;
  duplicates: number;
  onClose: () => void;
}) {
  const isSolo = !!useOrg().features.solo_plan; // caps-based: no credit copy
  return (
    <>
      <ModalHeader
        icon={<Check size={16} strokeWidth={2} className="text-accent" />}
        title={`${stored} ${
          stored === 1 ? "suggestion" : "suggestions"
        } added to your pool`}
        subtitle={
          duplicates > 0
            ? `${duplicates} ${
                duplicates === 1 ? "was" : "were"
              } already in your pool and skipped.`
            : isSolo
              ? "These contacts are now in your suggestions queue. Enrich any of them when you're ready."
              : "These contacts are now in your suggestions queue. Enrich any of them with one credit each."
        }
        onClose={onClose}
      />
      <div className="flex items-center justify-end border-t border-border-subtle bg-bg-base/30 px-7 py-4">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-full bg-text-primary px-5 py-2 text-[13px] font-medium tracking-tight text-bg-base transition-opacity hover:opacity-90"
        >
          Done
        </button>
      </div>
    </>
  );
}

function EmptyState({ onClose }: { onClose: () => void }) {
  return (
    <>
      <ModalHeader
        icon={<Users size={16} strokeWidth={1.7} className="text-text-muted" />}
        title="No other matches found"
        subtitle="Vera couldn't find any other ICP-fit decision-makers at this company. Either everyone matching is already in your pool, or this company has a small team."
        onClose={onClose}
      />
      <div className="flex items-center justify-end border-t border-border-subtle bg-bg-base/30 px-7 py-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-4 py-2 text-[13px] text-text-secondary transition-colors hover:text-text-primary"
        >
          Close
        </button>
      </div>
    </>
  );
}

function ErrorState({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <>
      <ModalHeader
        icon={<X size={16} strokeWidth={2} className="text-red-500" />}
        title="Search failed"
        subtitle={message}
        onClose={onClose}
      />
      <div className="flex items-center justify-end border-t border-border-subtle bg-bg-base/30 px-7 py-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-4 py-2 text-[13px] text-text-secondary transition-colors hover:text-text-primary"
        >
          Close
        </button>
      </div>
    </>
  );
}
