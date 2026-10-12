"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, SectionHeader, Shimmer } from "@/components/dashboard/primitives";
import { useOrg } from "@/components/dashboard/OrgContext";
import {
  useIcpPersonas,
  useIcpVocabularies,
  type IcpPersona,
  type IcpVocabBracket,
  type IcpVocabTech,
} from "@/lib/dashboard/queries";
import { claraApi } from "@/lib/dashboard/claraApi";

type PersonaUpdate = Partial<Omit<IcpPersona, "id">> & { org_id: string };

interface UpgradeModalState {
  tier: string;
  limit: number;
  current: number;
}

export function BuyerProfilesCard() {
  const { orgId } = useOrg();
  const personas = useIcpPersonas();
  const vocabs = useIcpVocabularies();
  const queryClient = useQueryClient();
  const [upgradeState, setUpgradeState] = useState<UpgradeModalState | null>(null);

  const addPersona = useMutation({
    mutationFn: async () => {
      return await claraApi<{ persona: IcpPersona }>("/icp/personas", {
        method: "POST",
        body: JSON.stringify({ org_id: orgId, name: "New profile" }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["icp-personas", orgId] });
    },
    onError: (err: Error & { status?: number }) => {
      if (err.status === 402) {
        // Parse the structured detail payload from the engine
        try {
          const parsed = JSON.parse(err.message);
          const detail = parsed.detail ?? parsed;
          if (detail?.code === "persona_limit_exceeded") {
            setUpgradeState({
              tier: detail.tier,
              limit: detail.limit,
              current: detail.current,
            });
            return;
          }
        } catch {
          // Fall through — generic error
        }
      }
      console.error("Failed to add persona:", err);
    },
  });

  if (personas.isLoading || vocabs.isLoading) {
    return (
      <Card className="p-6 md:p-7">
        <SectionHeader title="Buyer profiles" />
        <Shimmer className="h-24 w-full" />
      </Card>
    );
  }

  if (personas.isError || !personas.data || !vocabs.data) {
    return (
      <Card className="p-6 md:p-7">
        <SectionHeader title="Buyer profiles" />
        <div className="text-[13px] text-text-muted">
          Couldn&apos;t load profiles. Refresh to try again.
        </div>
      </Card>
    );
  }

  const { personas: list, tier, limit, used } = personas.data;
  const atCap = used >= limit;

  return (
    <Card className="p-6 md:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <SectionHeader title="Buyer profiles" />
          <p className="mt-1 text-[12.5px] text-text-muted">
            One profile per buyer segment. Vera searches and scores
            leads against every active profile.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => {
              if (atCap) {
                setUpgradeState({ tier, limit, current: used });
                return;
              }
              addPersona.mutate();
            }}
            disabled={addPersona.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-elevated px-3 py-2 text-[12.5px] text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary disabled:opacity-50"
          >
            <Plus size={13} strokeWidth={1.7} />
            Add profile
          </button>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
            {used} / {limit} on {tier}
          </span>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3">
        {list.map((p) => (
          <PersonaRow
            key={p.id}
            persona={p}
            canDelete={list.length > 1}
            vocabs={vocabs.data}
          />
        ))}
      </div>

      {upgradeState && (
        <UpgradeModal
          state={upgradeState}
          onClose={() => setUpgradeState(null)}
        />
      )}
    </Card>
  );
}

// --------------------------------------------------------------------------
// Upgrade modal — shown when the user clicks Add profile at their tier cap
// --------------------------------------------------------------------------

// scout→Pro, growth/scale→Team (top). Pro upgrades to Team for more profiles.
const NEXT_TIER: Record<string, { name: string; limit: number } | null> = {
  scout: { name: "Team", limit: 10 },
  growth: null,
  scale: null,
};

function UpgradeModal({
  state,
  onClose,
}: {
  state: UpgradeModalState;
  onClose: () => void;
}) {
  const next = NEXT_TIER[state.tier.toLowerCase()] ?? null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border-default bg-bg-card p-7 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent/10">
            <Sparkles size={18} strokeWidth={1.7} className="text-accent" />
          </div>
          <h3 className="font-display text-[1.15rem] font-medium tracking-tight text-text-primary">
            You&apos;ve reached your profile limit
          </h3>
        </div>

        <p className="mt-4 text-[13.5px] leading-relaxed text-text-secondary">
          Your <span className="text-text-primary capitalize">{state.tier}</span>{" "}
          plan includes{" "}
          <span className="text-text-primary">{state.limit} buyer profiles</span>
          {" "}— all in use. {next
            ? `Upgrade to ${next.name} to unlock ${next.limit} profiles.`
            : "Contact us about a custom limit for your team."}
        </p>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border-default bg-bg-elevated px-4 py-2 text-[12.5px] text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
          >
            Not now
          </button>
          {next && (
            <Link
              href="/dashboard/settings#tier"
              onClick={onClose}
              className="rounded-lg bg-accent px-4 py-2 text-[12.5px] font-medium text-bg-base transition-opacity hover:opacity-90"
            >
              Upgrade to {next.name}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Row — collapsible per persona
// --------------------------------------------------------------------------

function PersonaRow({
  persona,
  canDelete,
  vocabs,
}: {
  persona: IcpPersona;
  canDelete: boolean;
  vocabs: NonNullable<ReturnType<typeof useIcpVocabularies>["data"]>;
}) {
  const { orgId } = useOrg();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [local, setLocal] = useState<IcpPersona>(persona);

  const save = useMutation({
    mutationFn: async (patch: Omit<PersonaUpdate, "org_id">) => {
      return await claraApi<{ persona: IcpPersona }>(
        `/icp/personas/${persona.id}`,
        {
          method: "PUT",
          body: JSON.stringify({ org_id: orgId, ...patch }),
        },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["icp-personas", orgId] });
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      return await claraApi(
        `/icp/personas/${persona.id}?org_id=${orgId}`,
        { method: "DELETE" },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["icp-personas", orgId] });
    },
  });

  function update<K extends keyof IcpPersona>(key: K, value: IcpPersona[K]) {
    setLocal((prev) => ({ ...prev, [key]: value }));
    save.mutate({ [key]: value } as Omit<PersonaUpdate, "org_id">);
  }

  const summary = useMemo(() => {
    const parts: string[] = [];
    if (local.target_titles.length) parts.push(`${local.target_titles.length} titles`);
    if (local.target_industries.length) parts.push(`${local.target_industries.length} industries`);
    if (local.target_locations.length) parts.push(`${local.target_locations.length} locations`);
    if (local.target_tech_uses.length) parts.push(`${local.target_tech_uses.length} tech`);
    return parts.join(" · ") || "No filters set";
  }, [local]);

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-elevated/30">
      <div className="flex items-center gap-3 p-4">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-text-muted transition-colors hover:bg-bg-card hover:text-text-primary"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>

        <input
          type="text"
          value={local.name}
          onChange={(e) => setLocal((p) => ({ ...p, name: e.target.value }))}
          onBlur={() => {
            if (local.name !== persona.name) update("name", local.name);
          }}
          className="flex-1 bg-transparent font-display text-[14.5px] font-medium tracking-tight text-text-primary outline-none placeholder:text-text-muted focus:underline focus:underline-offset-4"
          placeholder="Profile name"
        />

        <span className="hidden text-[11.5px] text-text-muted md:inline">
          {summary}
        </span>

        <label className="flex shrink-0 items-center gap-2 text-[11.5px] text-text-secondary">
          <input
            type="checkbox"
            checked={local.active}
            onChange={(e) => update("active", e.target.checked)}
            className="h-3.5 w-3.5 cursor-pointer accent-accent"
          />
          Active
        </label>

        <button
          type="button"
          onClick={() => {
            if (!canDelete) return;
            if (confirm(`Delete profile "${local.name}"? This cannot be undone.`)) {
              remove.mutate();
            }
          }}
          disabled={!canDelete}
          title={canDelete ? "Delete profile" : "Cannot delete the last profile"}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-text-muted transition-colors hover:bg-bg-card hover:text-state-danger disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Trash2 size={14} strokeWidth={1.7} />
        </button>
      </div>

      {expanded && (
        <div className="grid grid-cols-1 gap-4 border-t border-border-subtle p-4 md:grid-cols-2">
          <ChipField
            label="Job titles"
            placeholder="Add a title, press Enter"
            values={local.target_titles}
            onChange={(v) => update("target_titles", v)}
          />
          <MultiSelectField
            label="Seniorities"
            options={vocabs.seniorities}
            values={local.target_seniorities}
            onChange={(v) => update("target_seniorities", v)}
          />
          <ChipField
            label="Industries"
            placeholder="Add an industry, press Enter"
            values={local.target_industries}
            onChange={(v) => update("target_industries", v)}
          />
          <ChipField
            label="Locations"
            placeholder="Country, state, or city"
            values={local.target_locations}
            onChange={(v) => update("target_locations", v)}
          />
          <MultiSelectField
            label="Company size"
            options={vocabs.company_sizes}
            values={local.target_company_size}
            onChange={(v) => update("target_company_size", v)}
          />
          <SingleSelectField
            label="Annual revenue"
            options={vocabs.revenue_brackets}
            value={local.target_revenue_range}
            onChange={(v) => update("target_revenue_range", v)}
          />
          <MultiSelectField
            label="Funding stage"
            options={vocabs.funding_stages}
            values={local.target_funding_stages}
            onChange={(v) => update("target_funding_stages", v)}
          />
          <TechSelectField
            label="Uses tech"
            options={vocabs.technologies}
            values={local.target_tech_uses}
            onChange={(v) => update("target_tech_uses", v)}
          />
          <TechSelectField
            label="Does NOT use tech"
            options={vocabs.technologies}
            values={local.target_tech_excludes}
            onChange={(v) => update("target_tech_excludes", v)}
            hint="Applied after enrichment, not at the Apollo search step."
          />
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Field primitives
// --------------------------------------------------------------------------

function FieldShell({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
        {label}
      </div>
      <div className="mt-2">{children}</div>
      {hint && (
        <div className="mt-1.5 text-[11px] text-text-muted">{hint}</div>
      )}
    </div>
  );
}

function ChipField({
  label,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [input, setInput] = useState("");

  function commit() {
    const v = input.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setInput("");
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && !input && values.length) {
      onChange(values.slice(0, -1));
    }
  }

  return (
    <FieldShell label={label}>
      <div className="flex flex-wrap gap-1.5 rounded-lg border border-border-default bg-bg-elevated px-2 py-1.5 focus-within:border-accent/40">
        {values.map((v) => (
          <span
            key={v}
            className="flex items-center gap-1 rounded-md bg-bg-card px-2 py-1 text-[12px] text-text-primary"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="text-text-muted transition-colors hover:text-state-danger"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          onBlur={commit}
          placeholder={values.length === 0 ? placeholder : ""}
          className="min-w-[120px] flex-1 bg-transparent px-1 py-0.5 text-[12.5px] text-text-primary outline-none placeholder:text-text-muted"
        />
      </div>
    </FieldShell>
  );
}

function MultiSelectField({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: IcpVocabBracket[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.filter((o) => values.includes(o.value));

  function toggle(v: string) {
    if (values.includes(v)) onChange(values.filter((x) => x !== v));
    else onChange([...values, v]);
  }

  return (
    <FieldShell label={label}>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full flex-wrap items-center gap-1.5 rounded-lg border border-border-default bg-bg-elevated px-3 py-2 text-left text-[12.5px] text-text-secondary transition-colors hover:border-accent/40"
        >
          {selected.length === 0 && <span className="text-text-muted">Any</span>}
          {selected.map((o) => (
            <span
              key={o.value}
              className="rounded-md bg-bg-card px-2 py-0.5 text-[11.5px] text-text-primary"
            >
              {o.label}
            </span>
          ))}
          <ChevronDown size={13} className="ml-auto text-text-muted" />
        </button>
        {open && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border-default bg-bg-card shadow-lg">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-[12.5px] transition-colors hover:bg-bg-elevated ${
                  values.includes(o.value)
                    ? "text-text-primary"
                    : "text-text-secondary"
                }`}
              >
                {o.label}
                {values.includes(o.value) && (
                  <span className="text-[10px] text-accent">✓</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </FieldShell>
  );
}

function SingleSelectField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: IcpVocabBracket[];
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <FieldShell label={label}>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-lg border border-border-default bg-bg-elevated px-3 py-2 text-[12.5px] text-text-primary outline-none transition-colors hover:border-accent/40 focus:border-accent/60"
      >
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

function TechSelectField({
  label,
  options,
  values,
  onChange,
  hint,
}: {
  label: string;
  options: IcpVocabTech[];
  values: string[];
  onChange: (values: string[]) => void;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const grouped = useMemo(() => {
    const map = new Map<string, IcpVocabTech[]>();
    for (const o of options) {
      const arr = map.get(o.category) ?? [];
      arr.push(o);
      map.set(o.category, arr);
    }
    return Array.from(map.entries());
  }, [options]);

  const selected = options.filter((o) => values.includes(o.value));

  function toggle(v: string) {
    if (values.includes(v)) onChange(values.filter((x) => x !== v));
    else onChange([...values, v]);
  }

  return (
    <FieldShell label={label} hint={hint}>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full flex-wrap items-center gap-1.5 rounded-lg border border-border-default bg-bg-elevated px-3 py-2 text-left text-[12.5px] text-text-secondary transition-colors hover:border-accent/40"
        >
          {selected.length === 0 && <span className="text-text-muted">Any</span>}
          {selected.map((o) => (
            <span
              key={o.value}
              className="rounded-md bg-bg-card px-2 py-0.5 text-[11.5px] text-text-primary"
            >
              {o.label}
            </span>
          ))}
          <ChevronDown size={13} className="ml-auto text-text-muted" />
        </button>
        {open && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border border-border-default bg-bg-card shadow-lg">
            {grouped.map(([category, techs]) => (
              <div key={category}>
                <div className="sticky top-0 bg-bg-elevated px-3 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-text-muted">
                  {category}
                </div>
                {techs.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => toggle(t.value)}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-[12.5px] transition-colors hover:bg-bg-elevated ${
                      values.includes(t.value)
                        ? "text-text-primary"
                        : "text-text-secondary"
                    }`}
                  >
                    {t.label}
                    {values.includes(t.value) && (
                      <span className="text-[10px] text-accent">✓</span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </FieldShell>
  );
}
