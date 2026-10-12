"use client";

/**
 * InfoTooltip — small hover popover for validation / context messages
 * across the dashboard.
 *
 * Used wherever the user benefits from a one-line "what does this
 * mean?" without taking them somewhere else. Reusable primitive:
 *
 *   <InfoTooltip
 *     trigger={<span className="...">+3</span>}
 *     eyebrow="Also detected"
 *     title="Hiring · CVE exposure · Security posture"
 *   />
 *
 * Implementation notes:
 * - The popover is rendered in a PORTAL to document.body with fixed
 *   positioning computed from the trigger's bounding rect. This is the
 *   key detail: the dashboard tables live inside horizontal-scroll
 *   containers (`overflow-x: auto`, which forces `overflow-y` to clip
 *   too), so an absolutely-positioned popover gets cut off / pushed
 *   below the table. A portal escapes every overflow ancestor.
 * - After the panel mounts we measure it and clamp within the viewport
 *   (8px margin), with a vertical flip when the preferred side has no
 *   room — so it never falls behind the screen edge.
 * - Pointer-events-none on the popover so it never interferes with
 *   adjacent hover targets or the row's own click. Trigger keeps its
 *   own interaction. Opens on hover AND focus for keyboard a11y.
 *
 * Design language: muted dark popover (bg-bg-card), border on the
 * default token. Optional eyebrow in mono caps; title is the headline
 * line. Keep it short — this is a glance, not a paragraph.
 */

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface TooltipSection {
  title: string;
  body: string;
}

interface InfoTooltipProps {
  /** What the user hovers — typically a small badge / icon / chip. */
  trigger: ReactNode;
  /** Short uppercase label above the content. Optional. */
  eyebrow?: string;
  /** Single-message mode — one headline + optional description. Use
   *  this OR `sections`, not both. */
  title?: string;
  description?: string;
  /** Multi-message mode — list of dynamic reasons, each its own
   *  title + body block. Stacks vertically inside the popover. */
  sections?: TooltipSection[];
  /** Preferred side of the trigger the popover appears on. Flips to
   *  fit the viewport when the preferred side has no room. */
  placement?: "top" | "bottom" | "right" | "left";
  /** Cross-axis alignment relative to the trigger (top/bottom only). */
  align?: "start" | "center" | "end";
  /** Visual variant.
   *  - default: muted dark card, for neutral info / "Also detected"
   *  - highlight: violet-tinted card with a soft glow */
  tone?: "default" | "highlight";
  /** Extra classes for the trigger wrapper. */
  className?: string;
}

const GAP = 8;
const MARGIN = 8;

function computePosition(
  t: DOMRect,
  p: { width: number; height: number },
  placement: NonNullable<InfoTooltipProps["placement"]>,
  align: NonNullable<InfoTooltipProps["align"]>,
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const alignLeft = () => {
    if (align === "start") return t.left;
    if (align === "end") return t.right - p.width;
    return t.left + t.width / 2 - p.width / 2;
  };

  let top: number;
  let left: number;

  switch (placement) {
    case "right":
      left = t.right + GAP;
      top = t.top;
      // Flip to the left if it would overflow the right edge.
      if (left + p.width > vw - MARGIN) left = t.left - GAP - p.width;
      break;
    case "left":
      left = t.left - GAP - p.width;
      top = t.top;
      if (left < MARGIN) left = t.right + GAP;
      break;
    case "bottom":
      top = t.bottom + GAP;
      left = alignLeft();
      if (top + p.height > vh - MARGIN) top = t.top - GAP - p.height;
      break;
    case "top":
    default:
      top = t.top - GAP - p.height;
      left = alignLeft();
      if (top < MARGIN) top = t.bottom + GAP;
      break;
  }

  // Final viewport clamp on both axes so it can never sit off-screen.
  left = Math.max(MARGIN, Math.min(left, vw - p.width - MARGIN));
  top = Math.max(MARGIN, Math.min(top, vh - p.height - MARGIN));
  return { top, left };
}

export function InfoTooltip({
  trigger,
  eyebrow,
  title,
  description,
  sections,
  placement = "top",
  align = "center",
  tone = "default",
  className,
}: InfoTooltipProps) {
  const isMulti = !!sections && sections.length > 0;
  const triggerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Measure the panel + trigger once the panel is in the DOM, then
  // position. Runs before paint so the popover never flashes at 0,0.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const t = triggerRef.current?.getBoundingClientRect();
    const panel = panelRef.current;
    if (!t || !panel) return;
    setPos(
      computePosition(
        t,
        { width: panel.offsetWidth, height: panel.offsetHeight },
        placement,
        align,
      ),
    );
  }, [open, placement, align, title, description, sections, eyebrow]);

  const panel = open ? (
    <div
      ref={panelRef}
      role="tooltip"
      style={{
        position: "fixed",
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        // Hidden until measured so it doesn't paint at the corner first.
        visibility: pos ? "visible" : "hidden",
      }}
      className={cn(
        "pointer-events-none z-[100] w-max max-w-[320px] rounded-xl border px-4 py-3 text-left",
        tone === "default" &&
          "border-border-default bg-bg-card shadow-[0_12px_32px_-12px_rgba(0,0,0,0.6)]",
        tone === "highlight" &&
          "border-violet-400/40 bg-bg-card shadow-[0_0_28px_-4px_rgba(167,139,250,0.45),0_12px_32px_-12px_rgba(0,0,0,0.6)]",
      )}
    >
      {eyebrow && (
        <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
          {eyebrow}
        </span>
      )}

      {isMulti ? (
        <span
          className={cn(
            "flex flex-col divide-y divide-border-subtle",
            eyebrow ? "mt-2" : "",
          )}
        >
          {sections!.map((s, i) => (
            <span
              key={i}
              className={cn(
                "block",
                i > 0 && "pt-2.5",
                i < sections!.length - 1 && "pb-2.5",
              )}
            >
              <span className="block text-[12.5px] font-medium leading-snug text-text-primary">
                {s.title}
              </span>
              <span className="mt-1 block text-[11.5px] leading-relaxed text-text-secondary">
                {s.body}
              </span>
            </span>
          ))}
        </span>
      ) : title ? (
        <>
          <span
            className={cn(
              "block text-[12.5px] font-medium leading-snug text-text-primary",
              eyebrow ? "mt-1" : "",
            )}
          >
            {title}
          </span>
          {description && (
            <span className="mt-1 block text-[11.5px] leading-relaxed text-text-secondary">
              {description}
            </span>
          )}
        </>
      ) : null}
    </div>
  ) : null;

  return (
    <span
      ref={triggerRef}
      className={cn("inline-flex min-w-0", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {trigger}
      {typeof document !== "undefined" && panel
        ? createPortal(panel, document.body)
        : null}
    </span>
  );
}
