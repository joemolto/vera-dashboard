"use client";

/**
 * Settings card — pick which signal categories show on the accounts
 * dashboard. Saves to organisations.icp_config.features.visible_signal_categories.
 *
 * Defaults: when no preference is set, ALL categories show (so existing
 * customers see no change). Once the user saves, only the picked
 * categories' chips appear in the table's Signals column.
 *
 * Each category groups several engine signal_types — see
 * lib/dashboard/signalCategories.ts for the full mapping. There are
 * ~85 signal types behind 17 categories.
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, RotateCcw, SlidersHorizontal } from "lucide-react";
import {
  Card,
  SectionHeader,
  Shimmer,
} from "@/components/dashboard/primitives";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  ALL_CATEGORY_KEYS,
  SIGNAL_CATEGORIES,
  type SignalCategory,
} from "@/lib/dashboard/signalCategories";
import { cn } from "@/lib/utils";

async function authedFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const sb = createSupabaseBrowserClient();
  const { data: { session } } = await sb.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not signed in");
  const resp = await fetch(path, {
    ...(init ?? {}),
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(body?.error ?? `Request failed (${resp.status})`);
  return body as T;
}

export function SignalCategoriesCard() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ visible_categories: SignalCategory[] | null }>({
    queryKey: ["signal-categories"],
    queryFn: () => authedFetch("/api/settings/signal-categories"),
  });

  // Local edit state — defaults to "all" when no preference set so the
  // UI matches the dashboard's "show all" default behaviour.
  const [selected, setSelected] = useState<Set<SignalCategory>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (data && !dirty) {
      const initial = data.visible_categories ?? ALL_CATEGORY_KEYS;
      setSelected(new Set(initial));
    }
  }, [data, dirty]);

  const saveMutation = useMutation({
    mutationFn: (cats: SignalCategory[]) =>
      authedFetch("/api/settings/signal-categories", {
        method: "PUT",
        body: JSON.stringify({ visible_categories: cats }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["signal-categories"] });
      qc.invalidateQueries({ queryKey: ["signals_by_domain"] });
      setDirty(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    },
  });

  function toggle(cat: SignalCategory) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
    setDirty(true);
  }

  function selectAll() {
    setSelected(new Set(ALL_CATEGORY_KEYS));
    setDirty(true);
  }
  function selectNone() {
    setSelected(new Set());
    setDirty(true);
  }

  return (
    <Card delay={0.18} className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-border-subtle p-6 md:p-7">
        <SectionHeader
          title="Signal categories"
          subtitle="Pick what shows in the Accounts table's Signals column. Each category groups several underlying signal types — choose what's relevant to how you sell."
        />
        <div className="hidden shrink-0 items-center gap-2 md:flex">
          <button
            type="button"
            onClick={selectAll}
            className="rounded-full border border-border-default px-3 py-1.5 text-[11.5px] text-text-secondary hover:border-border-strong hover:text-text-primary"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={selectNone}
            className="rounded-full border border-border-default px-3 py-1.5 text-[11.5px] text-text-secondary hover:border-border-strong hover:text-text-primary"
          >
            <RotateCcw size={11} className="mr-1 inline" strokeWidth={1.8} />
            Clear
          </button>
        </div>
      </div>

      <div className="p-6 md:p-7">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Shimmer key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {SIGNAL_CATEGORIES.map((cat) => {
              const on = selected.has(cat.key);
              return (
                <li key={cat.key}>
                  <button
                    type="button"
                    onClick={() => toggle(cat.key)}
                    aria-pressed={on}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                      on
                        ? "border-accent/40 bg-accent/[0.04]"
                        : "border-border-subtle bg-bg-elevated/30 hover:border-border-default hover:bg-bg-elevated/60",
                    )}
                  >
                    <div
                      className={cn(
                        "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border",
                        on
                          ? "border-accent bg-accent text-bg-base"
                          : "border-border-default bg-transparent",
                      )}
                      aria-hidden
                    >
                      {on && <Check size={10} strokeWidth={3} />}
                    </div>
                    <div className="min-w-0">
                      <div className="font-display text-[13px] font-medium text-text-primary">
                        {cat.label}
                      </div>
                      <div className="mt-0.5 text-[11.5px] leading-relaxed text-text-muted">
                        {cat.description}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="text-[11.5px] text-text-muted">
            {selected.size} of {SIGNAL_CATEGORIES.length} categories selected.
            {savedFlash && (
              <span className="ml-2 inline-flex items-center gap-1 text-emerald-300">
                <Check size={11} strokeWidth={2} /> Saved
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => saveMutation.mutate(Array.from(selected))}
            disabled={!dirty || saveMutation.isPending}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-medium tracking-tight transition-opacity",
              dirty && !saveMutation.isPending
                ? "bg-text-primary text-bg-base hover:opacity-90"
                : "cursor-not-allowed bg-bg-elevated text-text-muted",
            )}
          >
            {saveMutation.isPending ? (
              <Loader2 size={12} strokeWidth={2} className="animate-spin" />
            ) : (
              <SlidersHorizontal size={12} strokeWidth={1.8} />
            )}
            Save preferences
          </button>
        </div>

        {saveMutation.error instanceof Error && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-[12.5px] text-red-400">
            Save failed: {saveMutation.error.message}
          </div>
        )}
      </div>
    </Card>
  );
}
