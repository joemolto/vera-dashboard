"use client";

import { motion } from "framer-motion";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { GridPattern } from "@/components/ui/magicui/GridPattern";
import { QuickEnrichBar } from "@/components/dashboard/widgets/QuickEnrichBar";
import { EnrichmentProgress } from "@/components/dashboard/widgets/EnrichmentProgress";
import { UsageMeter } from "@/components/dashboard/widgets/UsageMeter";
import { CreditTopUp } from "@/components/dashboard/widgets/CreditTopUp";
import { AccountCapBlock } from "@/components/dashboard/widgets/AccountCapBlock";
import { useOrg, isBillingLapsed } from "@/components/dashboard/OrgContext";
import { useSoloLimits } from "@/lib/dashboard/queries";
import { SELF_HOSTED } from "@/lib/selfHosted";
import { cn } from "@/lib/utils";

interface ResearchedLead {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
}

export default function ResearchPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [enriching, setEnriching] = useState(false);
  const [enrichLeadId, setEnrichLeadId] = useState<string | null>(null);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  // Vera Solo: once you're at your account cap, the research page is blocked —
  // a centered card over a blurred page tells you to free one up or upgrade.
  const { features, subscriptionStatus } = useOrg();
  const isSolo = !!features.solo_plan;
  const lapsed = !SELF_HOSTED && isBillingLapsed(subscriptionStatus);
  const { data: soloLimits } = useSoloLimits(isSolo && !SELF_HOSTED);
  const atAccountCap =
    lapsed ||
    (isSolo && !SELF_HOSTED && soloLimits
      ? soloLimits.usage.accounts >= soloLimits.limits.accounts
      : false);

  const handleEnrichStarted = useCallback((leadId: string | null) => {
    setEnrichError(null);
    setEnrichLeadId(leadId);
    setEnriching(true);
  }, []);

  // Domain research shows the square with no leadId; if its fetch fails we
  // dismiss the square and surface the error back on the bar.
  const handleEnrichError = useCallback((message: string) => {
    setEnriching(false);
    setEnrichLeadId(null);
    setEnrichError(message);
  }, []);

  const handleProgressComplete = useCallback(
    (lead: ResearchedLead) => {
      setEnriching(false);
      setEnrichLeadId(null);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      if (lead?.id) router.push(`/dashboard/prospects/${lead.id}`);
    },
    [queryClient, router],
  );

  const handleEnrichComplete = useCallback(
    (lead: ResearchedLead) => {
      if (enriching) {
        handleProgressComplete(lead);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      if (lead?.id) router.push(`/dashboard/prospects/${lead.id}`);
    },
    [enriching, queryClient, router, handleProgressComplete],
  );

  const handleRetry = useCallback(() => {
    setEnriching(false);
    setEnrichLeadId(null);
  }, []);

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[640px] overflow-hidden">
        <GridPattern
          width={48}
          height={48}
          x={-1}
          y={-1}
          squares={[
            [3, 1],
            [10, 2],
            [15, 4],
            [6, 5],
            [12, 7],
          ]}
          className="[mask-image:radial-gradient(640px_circle_at_50%_15%,white,transparent)] opacity-55"
        />
      </div>

      <div className="relative grid min-h-[calc(100vh-3.5rem)] place-items-center px-6 py-14 md:px-10">
        <div
          className={cn(
            "w-full max-w-2xl",
            atAccountCap && "pointer-events-none select-none",
          )}
          aria-hidden={atAccountCap}
        >
          {!enriching ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="text-center">
                <h1 className="font-display text-[clamp(1.7rem,3vw,2.4rem)] font-medium tracking-tight text-text-primary">
                  Research
                </h1>
                <p className="mt-3 text-[14.5px] leading-relaxed text-text-secondary">
                  Paste a LinkedIn URL or company website — Vera does the rest.
                </p>
              </div>

              {/* Credit meter + top-up are credit-tier only. Solo is
                  caps-based, so it shows no credit UI at all. */}
              {!isSolo && !SELF_HOSTED && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.12 }}
                  className="mt-7 flex flex-wrap items-center justify-center gap-2"
                >
                  <UsageMeter />
                  <CreditTopUp variant="button" />
                </motion.div>
              )}

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15 }}
                className="mt-5"
              >
                {enrichError && (
                  <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-400">
                    {enrichError}
                  </div>
                )}
                <QuickEnrichBar
                  onEnrichStarted={handleEnrichStarted}
                  onEnrichComplete={handleEnrichComplete}
                  onEnrichError={handleEnrichError}
                />
              </motion.div>
            </motion.div>
          ) : (
            <EnrichmentProgress
              leadId={enrichLeadId}
              isActive={enriching}
              onComplete={handleProgressComplete}
              onRetry={handleRetry}
            />
          )}
        </div>

        {atAccountCap && (soloLimits || lapsed) && (
          <AccountCapBlock
            used={soloLimits?.usage.accounts ?? 0}
            limit={soloLimits?.limits.accounts ?? 0}
            lapsed={lapsed}
          />
        )}
      </div>
    </div>
  );
}
