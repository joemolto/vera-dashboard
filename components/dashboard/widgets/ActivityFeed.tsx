"use client";

import { motion } from "framer-motion";
import {
  Activity,
  ArrowRightLeft,
  CheckCircle2,
  Eye,
  Inbox,
  MailX,
  Microscope,
  Radar,
  RefreshCw,
  Send,
  Sparkles,
  Target,
  UserMinus,
  type LucideIcon,
} from "lucide-react";
import {
  Card,
  EmptyState,
  RelativeTime,
  SectionHeader,
  Shimmer,
} from "@/components/dashboard/primitives";
import { useActivity } from "@/lib/dashboard/queries";
import { ACTIVITY_LABELS } from "@/lib/dashboard/labels";

const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  lead_sourced: Target,
  lead_enriched: Microscope,
  lead_scored: CheckCircle2,
  lead_sequenced: Send,
  threat_alert: Activity,
  watchlist_monitoring_run: Eye,
  watchlist_remove: UserMinus,
  vera_brain_proactive: Sparkles,
  vera_brain_reactive: Sparkles,
  vera_brain_tool_call: Sparkles,
  vera_data_flag: Activity,
  vera_auto_watchlist: Eye,
  reply_classified: Inbox,
  signal_detected: Radar,
  status_updated: ArrowRightLeft,
  stats_synced: RefreshCw,
  email_bounced: MailX,
  lead_unsubscribed: UserMinus,
};

function describe(activityType: string) {
  return {
    Icon: ACTIVITY_ICONS[activityType] ?? Activity,
    label:
      ACTIVITY_LABELS[activityType] ?? activityType.replace(/_/g, " "),
  };
}

function detail(entry: {
  activity_type: string;
  activity_data: Record<string, unknown> | null;
}) {
  const d = entry.activity_data ?? {};
  if (typeof d.company_name === "string") return d.company_name;
  if (typeof d.lead_name === "string") return d.lead_name;
  if (typeof d.email === "string") return d.email;
  if (typeof d.title === "string") return d.title;
  return null;
}

export function ActivityFeed({ limit = 12 }: { limit?: number }) {
  const { data, isLoading } = useActivity(limit);

  return (
    <Card delay={0.35} className="overflow-hidden">
      <div className="border-b border-border-subtle p-6 md:p-7">
        <SectionHeader
          title="Recent activity"
          subtitle="Vera's footprint over the last day"
        />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2 p-6 md:p-7">
          {[0, 1, 2, 3, 4].map((i) => (
            <Shimmer key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={<Activity size={16} strokeWidth={1.6} />}
          title="No activity yet"
          body="Once Vera starts working on your behalf, you'll see the trail here."
        />
      ) : (
        <ul className="divide-y divide-border-subtle">
          {(data ?? []).map((entry, i) => {
            const { Icon, label } = describe(entry.activity_type);
            const det = detail(entry);
            return (
              <motion.li
                key={entry.id}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.4 + i * 0.025 }}
                className="flex items-center gap-3 px-6 py-3 md:px-7"
              >
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-bg-elevated text-text-muted">
                  <Icon size={12} strokeWidth={1.7} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] tracking-tight text-text-primary">
                      {label}
                    </span>
                    {det && (
                      <span className="truncate text-[12px] text-text-muted">
                        · {det}
                      </span>
                    )}
                  </div>
                </div>
                <span className="font-mono text-[10.5px] uppercase tracking-[0.18em]">
                  <RelativeTime value={entry.created_at} />
                </span>
              </motion.li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
