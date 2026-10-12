"use client";

import React, { useState } from "react";
import {
  motion,
  useAnimation,
  useMotionValue,
  useTransform,
} from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface SlideToConfirmProps {
  /** Text shown before sliding */
  text?: string;
  /** Text shown after a successful confirm */
  successText?: string;
  /** Async callback fired when the slide completes. If it throws, the
   * slider resets so the user can try again. */
  onConfirm: () => Promise<void> | void;
  /** Width of the component */
  width?: number;
  /** Height of the component */
  height?: number;
  className?: string;
  /** Disable interaction (e.g. when no pack selected) */
  disabled?: boolean;
}

/**
 * Slide-to-confirm interaction for high-commitment actions (payments,
 * destructive ops). Forces a deliberate gesture rather than a single tap.
 *
 * Tokens used: bg-bg-elevated for the track, accent for the fill, white
 * for the thumb. Success state turns the thumb green to signal completion.
 */
export function SlideToConfirm({
  // text / successText are still accepted for call-site compatibility but
  // no longer rendered — the bar is kept clean (just the drag thumb).
  // Context lives in the surrounding card.
  onConfirm,
  width = 320,
  height = 56,
  className,
  disabled = false,
}: SlideToConfirmProps) {
  const [state, setState] = useState<"idle" | "loading" | "success">("idle");
  const trackWidth = width - height; // drag distance
  const thumbSize = height - 8; // visual margin

  const x = useMotionValue(0);
  const controls = useAnimation();

  // Accent fill grows with the drag
  const bgWidth = useTransform(x, [0, trackWidth], [height, width]);

  const handleDragEnd = async () => {
    if (state !== "idle") return;

    if (x.get() >= trackWidth * 0.9) {
      // User dragged past 90% — count it as a commit
      controls.start({
        x: trackWidth,
        transition: { type: "spring", stiffness: 400, damping: 30 },
      });
      setState("loading");

      try {
        await onConfirm();
        setState("success");
      } catch {
        // Failure → reset to idle so the user can retry
        setState("idle");
        controls.start({
          x: 0,
          transition: { type: "spring", stiffness: 400, damping: 30 },
        });
      }
    } else {
      // Didn't drag far enough — bounce back
      controls.start({
        x: 0,
        transition: { type: "spring", stiffness: 400, damping: 30 },
      });
    }
  };

  const isDisabled = disabled || state !== "idle";

  return (
    <div
      className={cn(
        "relative flex select-none items-center justify-center overflow-hidden rounded-full border border-border-default bg-bg-elevated",
        state === "success" && "border-emerald-500/40",
        disabled && "opacity-60",
        className,
      )}
      style={{ width, height }}
      aria-disabled={isDisabled}
    >
      {/* Accent fill behind the thumb — grows as user drags */}
      <motion.div
        className="absolute left-0 top-0 h-full rounded-full"
        style={{
          width: state === "success" ? width : bgWidth,
          backgroundColor:
            state === "success"
              ? "rgb(16 185 129 / 0.15)"
              : "var(--accent, rgb(255 255 255 / 0.08))",
          opacity: state === "success" ? 1 : 0.18,
        }}
        animate={{ width: state === "success" ? width : undefined }}
        transition={{ duration: 0.3 }}
      />

      {/* Thumb */}
      <motion.div
        drag={state === "idle" && !disabled ? "x" : false}
        dragConstraints={{ left: 0, right: trackWidth }}
        dragElastic={0.05}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        className={cn(
          "absolute left-1 z-10 flex items-center justify-center rounded-full bg-text-primary shadow-md",
          state === "idle" && !disabled
            ? "cursor-grab active:cursor-grabbing"
            : "cursor-default",
        )}
        initial={false}
        whileTap={{ scale: state === "idle" && !disabled ? 0.95 : 1 }}
        animate={
          state === "success"
            ? {
                x: trackWidth,
                backgroundColor: "#7c3aed",
                color: "#ffffff",
              }
            : controls
        }
        style={{ width: thumbSize, height: thumbSize, x }}
      >
        {/* Arrow (idle) */}
        <motion.div
          animate={{
            rotate: state === "loading" ? 360 : 0,
            scale: state === "idle" ? 1 : 0,
            opacity: state === "idle" ? 1 : 0,
          }}
          transition={{ duration: 0.2 }}
          className="absolute text-bg-base"
        >
          <ArrowRight className="h-5 w-5 opacity-80" />
        </motion.div>

        {/* Spinner (loading) */}
        <motion.div
          animate={{
            scale: state === "loading" ? 1 : 0,
            opacity: state === "loading" ? 1 : 0,
          }}
          transition={{ duration: 0.2 }}
          className="absolute flex h-full w-full items-center justify-center"
        >
          <div className="relative h-[20px] w-[20px]">
            {[...Array(12)].map((_, i) => (
              <motion.span
                key={i}
                className="absolute left-[9px] top-0 h-[5.5px] w-[1.8px] rounded-full bg-bg-base"
                style={{
                  rotate: i * 30,
                  transformOrigin: "center 10px",
                }}
                animate={{ opacity: [0.15, 1, 0.15] }}
                transition={{
                  duration: 1.1,
                  repeat: Infinity,
                  delay: i * 0.091,
                  ease: "linear",
                }}
              />
            ))}
          </div>
        </motion.div>

        {/* Check (success) */}
        <motion.div
          animate={{
            scale: state === "success" ? 1 : 0,
            opacity: state === "success" ? 1 : 0,
          }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="absolute text-white"
        >
          <Check className="h-5 w-5" />
        </motion.div>
      </motion.div>
    </div>
  );
}
