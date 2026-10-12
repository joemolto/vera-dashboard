"use client";

/**
 * Market editor drawer (multi_market pilot, 2026-08-23).
 *
 * Create or edit a market: name, targeting (industry / location chips +
 * size bands) with a live universe count via /accounts/market/count, and
 * optional per-market deal economics for the value tile. Editing the
 * PRIMARY market saves a definition that overrides the wizard-derived
 * targeting (so users can edit the ICP/market).
 *
 * The page owns what happens after save (switch to the market, trigger a
 * recompute); this component only persists the record.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Sparkles, X } from "lucide-react";
import { claraApi } from "@/lib/dashboard/claraApi";
import { cn } from "@/lib/utils";

export interface MarketRecord {
  id: string;
  name: string;
  is_primary: boolean;
  active: boolean;
  definition: {
    target_industries?: string[];
    target_locations?: string[];
    target_company_size?: string[];
  } | null;
  avg_deal_size: number | null;
  currency: string | null;
}

export interface MarketsListResponse {
  enabled: boolean;
  multi?: boolean;
  limit?: number;
  markets?: MarketRecord[];
}

interface MarketProposal {
  enabled: boolean;
  error?: string;
  name?: string;
  definition?: {
    target_industries?: string[];
    target_locations?: string[];
    target_company_size?: string[];
  };
  total?: number;
  additions?: { industry: string; why: string; count: number }[];
  message?: string;
}

const SIZE_BANDS = [
  { value: "11,50", label: "11–50" },
  { value: "51,200", label: "51–200" },
  { value: "201,500", label: "201–500" },
  { value: "501,1000", label: "501–1,000" },
  { value: "1001,5000", label: "1,001–5,000" },
  { value: "5001,10000", label: "5,001–10,000" },
  { value: "10001,100000", label: "10,000+" },
];

const CURRENCIES = ["GBP", "USD", "EUR"];

function ChipInput({
  label,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim().replace(/,+$/, "");
    if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase())) {
      onChange([...values, v]);
    }
    setDraft("");
  };
  return (
    <div>
      <div className="mb-1.5 text-[12.5px] font-medium text-text-secondary">{label}</div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border-default bg-bg-elevated px-2.5 py-2">
        {values.map((v) => (
          <span
            key={v}
            className="flex items-center gap-1 rounded-full border border-border-default bg-bg-card px-2.5 py-1 text-[12.5px] text-text-primary"
          >
            {v}
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="text-text-muted transition-colors hover:text-text-primary"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            } else if (e.key === "Backspace" && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          placeholder={values.length ? "" : placeholder}
          className="min-w-[140px] flex-1 bg-transparent py-0.5 text-[13px] text-text-primary outline-none placeholder:text-text-muted"
        />
      </div>
    </div>
  );
}

export function MarketEditorDrawer({
  orgId,
  open,
  market,
  fallbackCriteria,
  onClose,
  onSaved,
  onDeleted,
}: {
  orgId: string;
  open: boolean;
  /** null = create a new market */
  market: MarketRecord | null;
  /** Current effective criteria for a primary market with no saved
   * definition — prefills the editor with what the radar actually uses. */
  fallbackCriteria?: { industries?: string[]; locations?: string[]; employee_ranges?: string[] };
  onClose: () => void;
  onSaved: (marketId: string, definitionChanged: boolean) => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState("");
  const [industries, setIndustries] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [avgDeal, setAvgDeal] = useState("");
  const [currency, setCurrency] = useState("GBP");
  const [count, setCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "Tell Vera about this market" — plain-English proposal loop. Vera
  // parses the description, fills the chips below, and suggests adjacent
  // industry labels (each grounded with a live count). Refinements
  // compose: the current draft is sent along with each instruction.
  const [nlDraft, setNlDraft] = useState("");
  const [proposing, setProposing] = useState(false);
  const [proposal, setProposal] = useState<{
    message: string;
    additions: { industry: string; why: string; count: number }[];
  } | null>(null);
  const initialRef = useRef("");

  // Seed the form whenever the drawer opens for a (different) market.
  useEffect(() => {
    if (!open) return;
    const def = market?.definition || {};
    const seedIndustries = def.target_industries?.length
      ? def.target_industries
      : (market?.is_primary ?? true)
        ? fallbackCriteria?.industries || []
        : [];
    const seedLocations = def.target_locations?.length
      ? def.target_locations
      : (market?.is_primary ?? true)
        ? fallbackCriteria?.locations || []
        : [];
    const seedSizes = def.target_company_size?.length
      ? def.target_company_size
      : (market?.is_primary ?? true)
        ? fallbackCriteria?.employee_ranges || []
        : [];
    setName(market?.name ?? "");
    setIndustries(seedIndustries);
    setLocations(seedLocations);
    setSizes(seedSizes.filter((s) => SIZE_BANDS.some((b) => b.value === s)));
    setAvgDeal(market?.avg_deal_size ? String(market.avg_deal_size) : "");
    setCurrency(market?.currency || "GBP");
    setConfirmDelete(false);
    setError(null);
    setNlDraft("");
    setProposing(false);
    setProposal(null);
    initialRef.current = JSON.stringify([seedIndustries, seedLocations, seedSizes]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, market?.id]);

  // Live universe count, debounced — one free Apollo count per settle.
  useEffect(() => {
    if (!open || industries.length === 0) {
      setCount(null);
      return;
    }
    setCounting(true);
    const t = setTimeout(async () => {
      try {
        const res = await claraApi<{ total: number | null }>("/accounts/market/count", {
          method: "POST",
          body: JSON.stringify({
            org_id: orgId,
            criteria: { industries, locations, employee_ranges: sizes },
          }),
        });
        setCount(res.total);
      } catch {
        setCount(null);
      } finally {
        setCounting(false);
      }
    }, 600);
    return () => {
      clearTimeout(t);
      setCounting(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, industries, locations, sizes]);

  if (!open) return null;

  const definitionChanged =
    JSON.stringify([industries, locations, sizes]) !== initialRef.current;
  const canSave = name.trim().length > 0 && industries.length > 0 && !saving;

  const askVera = async () => {
    const instruction = nlDraft.trim();
    if (instruction.length < 3 || proposing) return;
    setProposing(true);
    setError(null);
    try {
      const res = await claraApi<MarketProposal>("/accounts/market/propose", {
        method: "POST",
        body: JSON.stringify({
          org_id: orgId,
          instruction,
          draft: {
            target_industries: industries,
            target_locations: locations,
            target_company_size: sizes,
          },
        }),
      });
      if (res.error === "too_generic") {
        setError(
          "That market is too broad for Vera to track honestly — name a specific sector (e.g. fintech, insurers, hospitals) rather than a catch-all like IT.",
        );
        return;
      }
      if (res.error || !res.definition?.target_industries?.length) {
        setError("Vera couldn't read that — try rephrasing, or set the fields below yourself.");
        return;
      }
      setIndustries(res.definition.target_industries);
      setLocations(res.definition.target_locations ?? []);
      setSizes(
        (res.definition.target_company_size ?? []).filter((s) =>
          SIZE_BANDS.some((b) => b.value === s),
        ),
      );
      if (!name.trim() && res.name) setName(res.name);
      setProposal({ message: res.message || "", additions: res.additions ?? [] });
      setNlDraft("");
    } catch {
      setError("Vera couldn't read that — set the fields below yourself instead.");
    } finally {
      setProposing(false);
    }
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const res = await claraApi<{ enabled: boolean; market?: MarketRecord }>(
        "/accounts/market/markets/save",
        {
          method: "POST",
          body: JSON.stringify({
            org_id: orgId,
            market_id: market?.id ?? "",
            name: name.trim(),
            definition: {
              target_industries: industries,
              target_locations: locations,
              target_company_size: sizes,
            },
            avg_deal_size: parseInt(avgDeal, 10) || 0,
            currency,
          }),
        },
      );
      const savedId = res.market?.id ?? market?.id;
      if (savedId) onSaved(savedId, definitionChanged || !market);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this market.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!market || market.is_primary) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    try {
      await claraApi("/accounts/market/markets/delete", {
        method: "POST",
        body: JSON.stringify({ org_id: orgId, market_id: market.id }),
      });
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete this market.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-[440px] flex-col overflow-y-auto border-l border-border-default bg-bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
          <div className="text-[15px] font-semibold text-text-primary">
            {market ? `Edit ${market.is_primary ? "your market" : market.name}` : "New market"}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="text-text-muted transition-colors hover:text-text-primary"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-5 px-6 py-5">
          <div>
            <div className="mb-1.5 text-[12.5px] font-medium text-text-secondary">
              Tell Vera about this market
            </div>
            <div className="flex items-start gap-2">
              <textarea
                value={nlDraft}
                onChange={(e) => setNlDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void askVera();
                  }
                }}
                rows={2}
                placeholder={
                  proposal
                    ? "Refine it — e.g. add supermarkets, make it 100–500 people"
                    : "e.g. UK retailers around 200 people"
                }
                className="min-h-[58px] flex-1 resize-none rounded-lg border border-border-default bg-bg-elevated px-3 py-2 text-[13.5px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent/50"
              />
              <button
                type="button"
                onClick={() => void askVera()}
                disabled={nlDraft.trim().length < 3 || proposing}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-lg border px-3.5 py-2 text-[13px] font-medium transition-colors",
                  nlDraft.trim().length >= 3 && !proposing
                    ? "border-accent/40 text-accent hover:bg-accent/10"
                    : "cursor-not-allowed border-border-default text-text-muted",
                )}
              >
                {proposing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Ask Vera
              </button>
            </div>
          </div>

          {proposal && (
            <div className="rounded-lg border border-accent/20 bg-accent/5 px-3.5 py-3">
              {proposal.message && (
                <p className="text-[13px] text-text-primary">{proposal.message}</p>
              )}
              {proposal.additions.length > 0 && (
                <>
                  <p className="mt-2 text-[12px] text-text-secondary">
                    Companies in this market often carry these labels instead — include them?
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {proposal.additions.map((a) => (
                      <button
                        key={a.industry}
                        type="button"
                        title={a.why}
                        onClick={() => {
                          setIndustries((prev) =>
                            prev.includes(a.industry) ? prev : [...prev, a.industry],
                          );
                          setProposal((p) =>
                            p
                              ? { ...p, additions: p.additions.filter((x) => x.industry !== a.industry) }
                              : p,
                          );
                        }}
                        className="flex items-center gap-1 rounded-full border border-accent/40 px-3 py-1.5 text-[12.5px] font-medium text-accent transition-colors hover:bg-accent/10"
                      >
                        <Plus className="h-3 w-3" />
                        {a.industry}
                        <span className="font-normal text-text-muted">
                          ~{a.count.toLocaleString("en-GB")}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <div>
            <div className="mb-1.5 text-[12.5px] font-medium text-text-secondary">Name</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="e.g. UK insurers, Channel partners"
              className="w-full rounded-lg border border-border-default bg-bg-elevated px-3 py-2 text-[13.5px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent/50"
            />
          </div>

          <ChipInput
            label="Industries"
            placeholder="e.g. insurance — press Enter to add"
            values={industries}
            onChange={setIndustries}
          />
          <ChipInput
            label="Locations"
            placeholder="e.g. United Kingdom"
            values={locations}
            onChange={setLocations}
          />

          <div>
            <div className="mb-1.5 text-[12.5px] font-medium text-text-secondary">
              Company size
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SIZE_BANDS.map((b) => {
                const on = sizes.includes(b.value);
                return (
                  <button
                    key={b.value}
                    type="button"
                    onClick={() =>
                      setSizes(on ? sizes.filter((s) => s !== b.value) : [...sizes, b.value])
                    }
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-[12.5px] transition-colors",
                      on
                        ? "border-accent/50 bg-accent/10 font-medium text-accent"
                        : "border-border-default text-text-secondary hover:text-text-primary",
                    )}
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-elevated px-3.5 py-2.5 text-[13px] text-text-secondary">
            {counting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Counting your market…
              </>
            ) : count !== null ? (
              <>
                Your market:{" "}
                <b className="font-semibold text-text-primary">
                  ~{count.toLocaleString("en-GB")}
                </b>{" "}
                companies match this targeting
              </>
            ) : (
              <>Add at least one industry to size this market.</>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1.5 text-[12.5px] font-medium text-text-secondary">
                Average deal size
              </div>
              <input
                value={avgDeal}
                onChange={(e) => setAvgDeal(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                placeholder="Uses your org default"
                className="w-full rounded-lg border border-border-default bg-bg-elevated px-3 py-2 text-[13.5px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent/50"
              />
            </div>
            <div>
              <div className="mb-1.5 text-[12.5px] font-medium text-text-secondary">Currency</div>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-elevated px-3 py-2 text-[13.5px] text-text-primary outline-none focus:border-accent/50"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3.5 py-2.5 text-[12.5px] text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-6 py-4">
          {market && !market.is_primary ? (
            <button
              type="button"
              onClick={remove}
              disabled={saving}
              className="text-[12.5px] text-text-muted transition-colors hover:text-red-500"
            >
              {confirmDelete ? "Really delete? Accounts move to your primary market" : "Delete market"}
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border-default px-3.5 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors",
                canSave
                  ? "bg-accent text-white hover:bg-accent/90"
                  : "cursor-not-allowed bg-border-default text-text-muted",
              )}
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {market ? "Save market" : "Create market"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
