"use client";

/**
 * SoloOnboardingModal — shows the Solo onboarding wizard as a centered
 * modal over the (blurred) dashboard rather than a separate page, so it
 * feels like part of the app. Mounted in the dashboard layout; renders
 * only for Solo orgs that haven't finished onboarding.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useOrg } from "@/components/dashboard/OrgContext";
import { SoloWizard } from "@/components/onboarding/SoloWizard";

export function SoloOnboardingModal() {
  const { orgId, orgName, features, onboardingPending } = useOrg();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [done, setDone] = useState(false);

  if (!features.solo_plan || !onboardingPending || done) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-8 backdrop-blur-sm sm:items-center">
      <div className="my-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-border-default bg-bg-base shadow-2xl">
        <SoloWizard
          orgId={orgId}
          orgName={orgName}
          onComplete={() => {
            // The dashboard mounted BEHIND this modal before onboarding
            // created any accounts, so React Query cached an empty list
            // (2min staleTime). router.refresh() only re-runs server
            // components — it won't refetch client queries — so clear the
            // cache here or the dashboard lands blank until a hard reload.
            queryClient.invalidateQueries();
            // Flag flips server-side; refresh so the gate clears, and
            // hide locally straight away for a clean exit.
            setDone(true);
            router.refresh();
          }}
        />
      </div>
    </div>
  );
}
