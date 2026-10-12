"use client";

import { motion } from "framer-motion";
import {
  Sparkles,
  Microscope,
  UserPlus,
  Search,
  Eye,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { useMemo } from "react";
import {
  Card,
  EmptyState,
  RelativeTime,
  SectionHeader,
  Shimmer,
} from "@/components/dashboard/primitives";
import { useActivity } from "@/lib/dashboard/queries";

interface ActionLine {
  id: string;
  Icon: typeof Sparkles;
  text: string;
  detail?: string;
  created_at: string | null;
}

function isToday(iso: string | null) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

// Distil a raw activity_log row into a human line. Returns null if the row
// shouldn't appear in this view (e.g. low-signal entries we don't surface).
function distil(entry: {
  id: string;
  activity_type: string;
  activity_data: Record<string, unknown> | null;
  created_at: string | null;
}): ActionLine | null {
  const d = entry.activity_data ?? {};
  const t = entry.activity_type;
  const at = entry.created_at;

  if (t === "vera_brain_proactive") {
    const actions = (d.actions_taken as number | undefined) ?? 0;
    const cost = d.estimated_cost as number | string | undefined;
    return {
      id: entry.id,
      Icon: CheckCircle2,
      text: `Brain run completed — ${actions} action${actions === 1 ? "" : "s"} taken`,
      detail: cost ? `$${Number(cost).toFixed(2)}` : undefined,
      created_at: at,
    };
  }
  if (t === "vera_brain_failed") {
    return {
      id: entry.id,
      Icon: AlertCircle,
      text: "Brain run failed",
      detail: (d.error_type as string | undefined) ?? "see logs",
      created_at: at,
    };
  }
  if (t === "vera_brain_tool_call") {
    const tool = d.tool as string | undefined;
    const result = (d.result as string | undefined) ?? "";
    if (tool === "enrich_lead") {
      return {
        id: entry.id,
        Icon: Microscope,
        text: "Enriched a hot lead with fresh signals",
        created_at: at,
      };
    }
    if (tool === "find_contacts_at_company") {
      const m = result.match(/Found (\d+) new ICP-matching contacts? at ([^:\n]+)/);
      if (m) {
        return {
          id: entry.id,
          Icon: UserPlus,
          text: `Found ${m[1]} new contact${m[1] === "1" ? "" : "s"} at ${m[2]}`,
          created_at: at,
        };
      }
      return null; // skip "no contacts found" / errors in this view
    }
    if (tool === "search_apollo") {
      const m = result.match(/Found (\d+) people/);
      if (m) {
        return {
          id: entry.id,
          Icon: Search,
          text: `Discovered ${m[1]} new prospects matching your ICP`,
          created_at: at,
        };
      }
      return null;
    }
    if (tool === "store_suggestions") {
      const m = result.match(/Stored (\d+) new suggestions/);
      if (m) {
        return {
          id: entry.id,
          Icon: UserPlus,
          text: `Added ${m[1]} new suggestion${m[1] === "1" ? "" : "s"} to the pool`,
          created_at: at,
        };
      }
      return null;
    }
    if (tool === "add_to_watchlist") {
      return {
        id: entry.id,
        Icon: Eye,
        text: "Added a company to your watchlist",
        created_at: at,
      };
    }
    return null; // get_pipeline_state, get_lead_details — internal, hide
  }

  if (t === "vera_auto_watchlist") {
    return {
      id: entry.id,
      Icon: Eye,
      text: "Auto-added a hot lead's company to the watchlist",
      created_at: at,
    };
  }

  return null;
}

export function VeraActionsToday() {
  const { data, isLoading } = useActivity(80);

  const lines = useMemo(() => {
    return (data ?? [])
      .filter((e) => isToday(e.created_at))
      .map(distil)
      .filter((l): l is ActionLine => l !== null)
      .slice(0, 12);
  }, [data]);

  return (
    <Card delay={0.3} className="overflow-hidden">
      <div className="border-b border-border-subtle p-6 md:p-7">
        <SectionHeader
          title="What Vera did today"
          subtitle="Today's autonomous actions, distilled"
        />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2 p-6 md:p-7">
          {[0, 1, 2, 3].map((i) => (
            <Shimmer key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : lines.length === 0 ? (
        <EmptyState
          icon={<Sparkles size={16} strokeWidth={1.6} />}
          title="Vera hasn't run today yet"
          body="The daily brain runs at 8am UTC. Trigger a manual run or check back tomorrow."
        />
      ) : (
        <ul className="divide-y divide-border-subtle">
          {lines.map((line, i) => {
            const Icon = line.Icon;
            return (
              <motion.li
                key={line.id}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.3 + i * 0.025 }}
                className="flex items-center gap-3 px-6 py-3 md:px-7"
              >
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
                  <Icon size={12} strokeWidth={1.7} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-[13px] tracking-tight text-text-primary">
                      {line.text}
                    </span>
                    {line.detail && (
                      <span className="truncate font-mono text-[11px] text-text-muted">
                        · {line.detail}
                      </span>
                    )}
                  </div>
                </div>
                <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-muted">
                  <RelativeTime value={line.created_at} />
                </span>
              </motion.li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
