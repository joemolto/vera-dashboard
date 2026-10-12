"use client";

import { useMemo } from "react";
import { Brain, Hand, Pause, Sparkles } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, SectionHeader, Shimmer } from "@/components/dashboard/primitives";
import { useOrg } from "@/components/dashboard/OrgContext";
import { useBrainMode, type BrainMode } from "@/lib/dashboard/queries";
import { claraApi } from "@/lib/dashboard/claraApi";

interface Option {
  value: BrainMode;
  label: string;
  description: string;
  Icon: typeof Brain;
}

const OPTIONS: Option[] = [
  {
    value: "auto",
    label: "Autonomous",
    description:
      "Vera surfaces, enriches, and watchlists on her own. She uses your credits to enrich leads she believes are worth it.",
    Icon: Sparkles,
  },
  {
    value: "surface_only",
    label: "Surface only — you approve enrichment",
    description:
      "Vera still surfaces leads, manages your watchlist, and flags data quality, but never enriches without you. You click Enrich on the leads you want — credits only spent on your say-so.",
    Icon: Hand,
  },
  {
    value: "off",
    label: "Paused",
    description:
      "Vera doesn't run at all. No discovery, no enrichment, no watchlist monitoring. Resume any time.",
    Icon: Pause,
  },
];

export function BrainModeCard() {
  const { orgId } = useOrg();
  const { data: mode, isLoading } = useBrainMode();
  const queryClient = useQueryClient();

  const updateMode = useMutation({
    mutationFn: async (next: BrainMode) => {
      return await claraApi<{ brain_mode: BrainMode }>("/icp/brain-mode", {
        method: "PUT",
        body: JSON.stringify({ org_id: orgId, brain_mode: next }),
      });
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: ["brain-mode", orgId] });
      const previous = queryClient.getQueryData(["brain-mode", orgId]);
      queryClient.setQueryData(["brain-mode", orgId], next);
      return { previous };
    },
    onError: (_e, _next, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(["brain-mode", orgId], ctx.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["brain-mode", orgId] });
    },
  });

  const current = useMemo(() => mode ?? "auto", [mode]);

  if (isLoading) {
    return (
      <Card className="p-6 md:p-7">
        <SectionHeader title="Vera's autonomy" />
        <Shimmer className="h-32 w-full" />
      </Card>
    );
  }

  return (
    <Card className="p-6 md:p-7">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-bg-elevated">
          <Brain size={16} strokeWidth={1.7} className="text-text-secondary" />
        </div>
        <div>
          <SectionHeader title="Vera's autonomy" />
          <p className="mt-1 text-[12.5px] text-text-muted">
            Control how much Vera does on her own. Changes apply on her
            next scheduled run.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3">
        {OPTIONS.map((opt) => {
          const isActive = current === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                if (!isActive) updateMode.mutate(opt.value);
              }}
              className={[
                "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                isActive
                  ? "border-accent/40 bg-bg-card"
                  : "border-border-subtle bg-bg-elevated/30 hover:border-border-default hover:bg-bg-elevated/50",
              ].join(" ")}
            >
              <span
                className={[
                  "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md",
                  isActive
                    ? "bg-accent/15 text-accent"
                    : "bg-bg-card text-text-muted",
                ].join(" ")}
              >
                <opt.Icon size={14} strokeWidth={1.7} />
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="font-display text-[14px] font-medium tracking-tight text-text-primary">
                    {opt.label}
                  </div>
                  {isActive && (
                    <span className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-accent">
                      active
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">
                  {opt.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
