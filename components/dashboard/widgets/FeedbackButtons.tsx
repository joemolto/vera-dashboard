"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown, Check } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useOrg } from "@/components/dashboard/OrgContext";
import { cn } from "@/lib/utils";

type TargetType = "lead" | "briefing" | "signal" | "threat_alert" | "play_recommendation";

interface FeedbackButtonsProps {
  leadId: string;
  targetType: TargetType;
  targetId?: string;
  signalThatTriggered?: string;
  messageAngle?: string;
  className?: string;
  size?: "sm" | "md";
}

export function FeedbackButtons({
  leadId,
  targetType,
  targetId,
  signalThatTriggered,
  messageAngle,
  className,
  size = "sm",
}: FeedbackButtonsProps) {
  const { orgId } = useOrg();
  const [submitted, setSubmitted] = useState<"up" | "down" | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(sentiment: "up" | "down") {
    if (pending || submitted || !orgId) return;
    setPending(true);
    try {
      const sb = createSupabaseBrowserClient();
      const { data: userRes } = await sb.auth.getUser();
      const userId = userRes?.user?.id ?? null;

      await sb.from("action_outcomes").insert({
        org_id: orgId,
        lead_id: leadId,
        action_type: "dashboard_review",
        channel: "dashboard",
        outcome: sentiment === "up" ? "positive" : "negative",
        outcome_detail: { sentiment },
        feedback_source: "dashboard_thumb",
        target_type: targetType,
        target_id: targetId ?? leadId,
        given_by_user_id: userId,
        signal_that_triggered: signalThatTriggered ?? null,
        message_angle: messageAngle ?? null,
      });
      setSubmitted(sentiment);
    } catch (err) {
      console.error("Feedback submit failed", err);
    } finally {
      setPending(false);
    }
  }

  const px = size === "sm" ? "px-2 py-1" : "px-3 py-1.5";
  const iconSize = size === "sm" ? 14 : 16;

  if (submitted) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 text-xs text-emerald-300/80",
          className,
        )}
      >
        <Check size={iconSize} aria-hidden />
        <span>Thanks — Vera will use this.</span>
      </div>
    );
  }

  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="text-[11px] uppercase tracking-wider text-white/40">
        Was this helpful?
      </span>
      <button
        type="button"
        onClick={() => submit("up")}
        disabled={pending}
        aria-label="Mark helpful"
        className={cn(
          px,
          "rounded-md border border-white/10 bg-white/5 text-white/60",
          "hover:bg-emerald-500/10 hover:text-emerald-300 hover:border-emerald-500/30",
          "transition disabled:opacity-50",
        )}
      >
        <ThumbsUp size={iconSize} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => submit("down")}
        disabled={pending}
        aria-label="Mark unhelpful"
        className={cn(
          px,
          "rounded-md border border-white/10 bg-white/5 text-white/60",
          "hover:bg-rose-500/10 hover:text-rose-300 hover:border-rose-500/30",
          "transition disabled:opacity-50",
        )}
      >
        <ThumbsDown size={iconSize} aria-hidden />
      </button>
    </div>
  );
}
