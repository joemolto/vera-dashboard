"use client";

/**
 * SoloEmptyHome — what a Vera Solo org sees on the home dashboard before
 * they've researched any accounts (e.g. they skipped the onboarding
 * account step). Instead of a grid of empty widgets, a focused prompt to
 * research their first account — the research bar is right there, so it's
 * one paste to a populated dashboard.
 */

import Link from "next/link";
import { GridPattern } from "@/components/ui/magicui/GridPattern";
import { QuickEnrichBar } from "@/components/dashboard/widgets/QuickEnrichBar";

export function SoloEmptyHome() {
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
        <div className="w-full max-w-2xl text-center">
          <h1 className="font-display text-[clamp(1.7rem,3vw,2.4rem)] font-medium tracking-tight text-text-primary">
            Let&apos;s get your first account in
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-[14.5px] leading-relaxed text-text-secondary">
            Paste a target client&apos;s website and Vera researches them —
            security posture, leadership, live signals — in about a minute.
          </p>

          <div className="mt-7 text-left">
            <QuickEnrichBar />
          </div>

          <p className="mt-6 text-[13px] text-text-muted">
            Vera is tuned from your setup answers. Adjust your targets and
            signals any time in{" "}
            <Link href="/dashboard/settings" className="text-accent hover:underline">
              Settings
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
