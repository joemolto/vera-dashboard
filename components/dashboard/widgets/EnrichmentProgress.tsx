"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Condensed to 5 generic stages (works for a person OR a company) so the card
// stays compact instead of a long 11-row list (2026-06-30).
const STAGES = [
  { delay: 0, text: "Scanning data sources…" },
  { delay: 12, text: "Reading website & recent news…" },
  { delay: 26, text: "Checking hiring & tech stack…" },
  { delay: 42, text: "Running deep research…" },
  { delay: 56, text: "Scoring & writing the briefing…" },
];

const STALL_TIMEOUT = 75;
const FAIL_TIMEOUT = 180;

type StageState = "pending" | "active" | "complete";

interface EnrichedLead {
  id: string;
  enrichment_status?: string | null;
  scored_at?: string | null;
}

export function EnrichmentProgress({
  leadId,
  isActive,
  onComplete,
  onRetry,
}: {
  leadId: string | null;
  isActive: boolean;
  onComplete: (lead: EnrichedLead) => void;
  onRetry: () => void;
}) {
  const [stageStates, setStageStates] = useState<StageState[]>(
    STAGES.map((_, i) => (i === 0 ? "active" : "pending")),
  );
  const [stalling, setStalling] = useState(false);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const completedRef = useRef(false);

  const finishAll = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    timersRef.current.forEach(clearTimeout);
    setStageStates(STAGES.map(() => "complete"));
    setDone(true);
  }, []);

  useEffect(() => {
    if (!isActive) return;
    completedRef.current = false;
    setStalling(false);
    setFailed(false);
    setDone(false);
    setStageStates(STAGES.map((_, i) => (i === 0 ? "active" : "pending")));

    const timers: ReturnType<typeof setTimeout>[] = [];
    STAGES.forEach((stage, idx) => {
      if (idx === 0) return;
      const t = setTimeout(() => {
        if (completedRef.current) return;
        setStageStates((prev) => {
          const next = [...prev];
          for (let j = 0; j < idx; j++) next[j] = "complete";
          next[idx] = "active";
          return next;
        });
      }, stage.delay * 1000);
      timers.push(t);
    });
    const stallT = setTimeout(() => {
      if (!completedRef.current) setStalling(true);
    }, STALL_TIMEOUT * 1000);
    timers.push(stallT);
    const failT = setTimeout(() => {
      if (!completedRef.current) {
        completedRef.current = true;
        timers.forEach(clearTimeout);
        setFailed(true);
      }
    }, FAIL_TIMEOUT * 1000);
    timers.push(failT);
    timersRef.current = timers;
    return () => timers.forEach(clearTimeout);
  }, [isActive]);

  useEffect(() => {
    if (!leadId || !isActive) return;
    const supabase = createSupabaseBrowserClient();

    const poll = async () => {
      if (completedRef.current) return;
      try {
        const { data } = await supabase
          .from("leads")
          .select("id, enrichment_status, scored_at, first_name, last_name")
          .eq("id", leadId)
          .single();
        if (!data) return;
        if (data.enrichment_status === "enriched" && data.scored_at) {
          finishAll();
          setTimeout(() => onComplete(data as EnrichedLead), 1200);
        } else if (
          data.enrichment_status === "failed" ||
          data.enrichment_status === "error"
        ) {
          completedRef.current = true;
          timersRef.current.forEach(clearTimeout);
          setFailed(true);
        }
      } catch {
        /* swallow */
      }
    };

    const startDelay = setTimeout(() => {
      poll();
      const iv = setInterval(poll, 5000);
      timersRef.current.push(
        iv as unknown as ReturnType<typeof setTimeout>,
      );
    }, 10_000);

    const channel = supabase
      .channel(`enrich-${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "leads",
          filter: `id=eq.${leadId}`,
        },
        (payload: { new: EnrichedLead }) => {
          const status = payload.new?.enrichment_status;
          if (status === "enriched") {
            finishAll();
            setTimeout(() => onComplete(payload.new), 1200);
          } else if (status === "failed" || status === "error") {
            completedRef.current = true;
            timersRef.current.forEach(clearTimeout);
            setFailed(true);
          }
        },
      )
      .subscribe();

    return () => {
      clearTimeout(startDelay);
      supabase.removeChannel(channel);
    };
  }, [leadId, isActive, finishAll, onComplete]);

  if (!isActive) return null;

  if (failed) {
    return (
      <div className="mx-auto w-full max-w-md rounded-2xl border border-border-default bg-bg-card p-6">
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-red-500/15">
            <AlertCircle size={20} className="text-red-400" strokeWidth={1.7} />
          </div>
          <div>
            <div className="font-display text-[15px] font-medium tracking-tight text-text-primary">
              Research couldn&apos;t complete
            </div>
            <p className="mt-1 text-[13px] text-text-secondary">
              Try again in a moment.
            </p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-text-primary px-5 py-2.5 text-[13px] font-medium tracking-tight text-bg-base transition-opacity hover:opacity-90"
          >
            <RefreshCw size={13} strokeWidth={1.7} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-border-default bg-bg-card p-6 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.4)]">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-display text-[15px] font-medium tracking-tight text-text-primary">
          {done ? "Research complete" : "Researching…"}
        </h2>
        {!done && (
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted">
            ~60s
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <AnimatePresence initial={false}>
          {STAGES.map((stage, idx) => {
            const state = stageStates[idx];
            if (state === "pending") return null;
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 transition-colors",
                  state === "active" && "bg-accent/5",
                )}
              >
                <span className="grid h-4 w-4 shrink-0 place-items-center">
                  {state === "complete" ? (
                    <Check size={13} className="text-accent" strokeWidth={2} />
                  ) : (
                    <Loader2
                      size={13}
                      className="animate-spin text-accent"
                      strokeWidth={2}
                    />
                  )}
                </span>
                <span
                  className={cn(
                    "font-mono text-[12.5px] transition-colors",
                    state === "active"
                      ? "text-text-primary"
                      : "text-text-muted",
                  )}
                >
                  {stage.text}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {stalling && !done && (
        <p className="mt-5 animate-pulse font-mono text-[11px] uppercase tracking-[0.22em] text-text-muted">
          Still working — this lead has a lot of data…
        </p>
      )}

      {done && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3"
        >
          <Check size={15} className="text-accent" strokeWidth={2} />
          <span className="text-[13.5px] font-medium text-accent">
            Research complete · loading results
          </span>
        </motion.div>
      )}
    </div>
  );
}
