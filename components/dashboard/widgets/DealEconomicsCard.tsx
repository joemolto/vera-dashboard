"use client";

/**
 * DealEconomicsCard — Settings control for the org's average deal size +
 * currency. These power the "Est. deal value" column on the accounts
 * table (average deal size × account fit) and its currency symbol.
 * Lets clients self-serve instead of an admin setting it in the DB.
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { Card, SectionHeader, Shimmer } from "@/components/dashboard/primitives";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const CURRENCIES = [
  { code: "USD", label: "USD ($)" },
  { code: "GBP", label: "GBP (£)" },
  { code: "EUR", label: "EUR (€)" },
  { code: "CAD", label: "CAD ($)" },
  { code: "AUD", label: "AUD ($)" },
];

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

interface DealEconomics {
  average_deal_size: number | null;
  currency: string | null;
}

export function DealEconomicsCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<DealEconomics>({
    queryKey: ["deal-economics"],
    queryFn: () => authedFetch("/api/settings/deal-economics"),
  });

  const [size, setSize] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [dirty, setDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (data && !dirty) {
      setSize(data.average_deal_size != null ? String(data.average_deal_size) : "");
      setCurrency(data.currency || "USD");
    }
  }, [data, dirty]);

  const save = useMutation({
    mutationFn: () =>
      authedFetch("/api/settings/deal-economics", {
        method: "PUT",
        body: JSON.stringify({
          average_deal_size: size.trim() === "" ? null : Number(size),
          currency,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deal-economics"] });
      qc.invalidateQueries({ queryKey: ["deal_baseline"] }); // refresh Est. deal value
      setDirty(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    },
  });

  return (
    <Card delay={0.12} className="overflow-hidden">
      <div className="border-b border-border-subtle p-5">
        <SectionHeader
          title="Deal economics"
          subtitle="Your average deal size and currency. Powers the Est. deal value figure on each account — your deal size weighted by how well the account fits."
        />
      </div>
      <div className="p-5">
        {isLoading ? (
          <Shimmer className="h-10 w-full max-w-md" />
        ) : (
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-medium text-text-secondary">Currency</span>
              <select
                value={currency}
                onChange={(e) => { setCurrency(e.target.value); setDirty(true); }}
                className="rounded-lg border border-border-default bg-bg-card px-3 py-2 text-[14px] text-text-primary outline-none focus:border-accent/50"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-medium text-text-secondary">Average deal size</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={size}
                onChange={(e) => { setSize(e.target.value); setDirty(true); }}
                placeholder="e.g. 20000"
                className="w-44 rounded-lg border border-border-default bg-bg-card px-3 py-2 text-[14px] text-text-primary outline-none focus:border-accent/50"
              />
            </label>
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={!dirty || save.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-text-primary px-4 py-2 text-[13.5px] font-medium text-bg-card transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {save.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : savedFlash ? (
                <Check size={14} />
              ) : null}
              {savedFlash ? "Saved" : "Save"}
            </button>
          </div>
        )}
        {save.isError && (
          <p className="mt-3 text-[12.5px] text-red-400">
            {(save.error as Error)?.message ?? "Couldn't save — try again."}
          </p>
        )}
      </div>
    </Card>
  );
}
