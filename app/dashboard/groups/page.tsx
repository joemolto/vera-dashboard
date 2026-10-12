"use client";

import { useOrg } from "@/components/dashboard/OrgContext";
import { GroupsView } from "@/components/dashboard/widgets/GroupsView";
import { StarterUpgradeGate } from "@/components/dashboard/widgets/StarterUpgrade";
import { SELF_HOSTED } from "@/lib/selfHosted";

export default function GroupsPage() {
  const { features } = useOrg();
  if (!SELF_HOSTED && features.starter_plan && !features.groups) {
    return (
      <StarterUpgradeGate
        eyebrow="Groups"
        title="Groups"
        blurb="Smart groups are on the Individual and Team plans."
      />
    );
  }
  if (!features.groups) {
    return (
      <div className="grid min-h-[60vh] place-items-center px-6 text-center">
        <p className="text-[14px] text-text-muted">
          Groups isn&apos;t enabled for your workspace yet.
        </p>
      </div>
    );
  }
  return <GroupsView />;
}
