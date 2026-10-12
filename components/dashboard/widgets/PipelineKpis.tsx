"use client";

import { Users, Flame, Radar, ShieldAlert } from "lucide-react";
import { KpiCard } from "@/components/dashboard/primitives";
import {
  useLeads,
  useSignals,
  useThreatAlerts,
} from "@/lib/dashboard/queries";

export function PipelineKpis() {
  const { data: leads, isLoading: lLoad } = useLeads();
  const { data: signals, isLoading: sLoad } = useSignals();
  const { data: alerts, isLoading: tLoad } = useThreatAlerts();

  const activeLeads = (leads ?? []).length;
  const hotLeads = (leads ?? []).filter((l) => l.lead_rating === "hot").length;
  const sevenDayMs = 7 * 24 * 60 * 60 * 1000;
  const since = Date.now() - sevenDayMs;
  const recentSignals = (signals ?? []).filter(
    (s) => s.detected_at && new Date(s.detected_at).getTime() >= since,
  ).length;
  const openAlerts = (alerts ?? []).filter((a) => a.status === "new").length;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Active leads"
        value={activeLeads}
        hint="Across the pipeline"
        icon={<Users size={14} strokeWidth={1.6} />}
        loading={lLoad}
        delay={0}
      />
      <KpiCard
        label="Hot leads"
        value={hotLeads}
        hint="Rated for outreach now"
        icon={<Flame size={14} strokeWidth={1.6} />}
        loading={lLoad}
        delay={0.05}
      />
      <KpiCard
        label="Signals · 7d"
        value={recentSignals}
        hint="Hiring · funding · stack"
        icon={<Radar size={14} strokeWidth={1.6} />}
        loading={sLoad}
        delay={0.1}
      />
      <KpiCard
        label="Open threat alerts"
        value={openAlerts}
        hint="Unactioned · org-relevant"
        icon={<ShieldAlert size={14} strokeWidth={1.6} />}
        loading={tLoad}
        delay={0.15}
      />
    </div>
  );
}
