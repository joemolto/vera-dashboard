"use client";

/**
 * AccountPicker — the "add your target accounts" step of onboarding.
 *
 * The user adds their OWN accounts rather than us guessing an ICP seed
 * (2026-07-23: guessing returned a university for a fintech ICP and
 * weak accounts scoring 12). Two ways in, both user-driven:
 *   1. Type-to-search (debounced → /solo/company-search). As they type,
 *      Apollo fuzzy-matches and we show real companies with logo + domain,
 *      so misspellings and name/domain mismatches are handled by the user
 *      PICKING from real results, not us resolving a typed string.
 *   2. A few ICP-matched suggestion cards (/solo/suggested-accounts) for
 *      anyone who blanks — the matcher is a helper here, never a decider.
 *
 * Emits the chosen accounts up; the wizard fires the seed + enrichment.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Plus, X, Check } from "lucide-react";
import { claraApi } from "@/lib/dashboard/claraApi";
import { logoUrl } from "@/lib/logoUrl";
import { cn } from "@/lib/utils";

export interface PickedAccount {
  name: string;
  domain: string;
}

interface SearchResult {
  name: string;
  domain: string;
  logo_url?: string | null;
  source?: string;
}

function Favicon({ domain, name }: { domain: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !domain) {
    return (
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border-subtle bg-bg-elevated text-[12px] font-medium uppercase text-text-secondary">
        {(name || domain || "?").charAt(0)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl(domain, 128)}
      alt=""
      width={28}
      height={28}
      onError={() => setFailed(true)}
      className="h-7 w-7 shrink-0 rounded-md border border-border-subtle bg-white object-contain p-0.5"
    />
  );
}

export function AccountPicker({
  orgId,
  selected,
  onChange,
  target = 5,
}: {
  orgId: string;
  selected: PickedAccount[];
  onChange: (next: PickedAccount[]) => void;
  /** Encouraged number; the picker never hard-blocks, the wizard gates. */
  target?: number;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<PickedAccount[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  const has = useCallback(
    (domain: string) => selected.some((s) => s.domain === domain),
    [selected],
  );

  const add = (acc: PickedAccount) => {
    if (has(acc.domain)) return;
    onChange([...selected, { name: acc.name, domain: acc.domain }]);
    setQuery("");
    setResults([]);
    setOpen(false);
  };
  const remove = (domain: string) =>
    onChange(selected.filter((s) => s.domain !== domain));

  // ICP suggestion cards — loaded once, filtered against what's chosen.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = (await claraApi("/accounts/solo/suggested-accounts", {
          method: "POST",
          body: JSON.stringify({ org_id: orgId, limit: 6 }),
        })) as { accounts?: PickedAccount[] };
        if (alive) setSuggestions((res.accounts || []).filter((x) => x.domain && x.name));
      } catch {
        if (alive) setSuggestions([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [orgId]);

  // Debounced typeahead. Fires per keystroke (partial input surfaces the
  // intended company first), so a typo never has to be completed.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setSearching(true);
    const id = setTimeout(async () => {
      try {
        const res = (await claraApi("/accounts/solo/company-search", {
          method: "POST",
          body: JSON.stringify({ org_id: orgId, query: q, limit: 8 }),
        })) as { results?: SearchResult[] };
        setResults(res.results || []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => clearTimeout(id);
  }, [query, orgId]);

  // Close the dropdown on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const openSuggestions = suggestions.filter((s) => !has(s.domain));

  return (
    <div className="flex flex-col gap-4">
      {/* Search box + dropdown */}
      <div ref={boxRef} className="relative">
        <div className="flex items-center gap-2.5 rounded-xl border border-border-default bg-bg-card px-3.5 focus-within:border-accent/50">
          <Search size={16} strokeWidth={1.8} className="shrink-0 text-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length && setOpen(true)}
            placeholder="Search by name or website, e.g. Monzo or example.com"
            className="min-w-0 flex-1 bg-transparent py-3 text-[14px] text-text-primary outline-none placeholder:text-text-muted"
          />
        </div>

        {open && (
          <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-border-default bg-bg-floating shadow-lg">
            {results.length === 0 ? (
              <div className="px-3.5 py-3 text-[12.5px] text-text-muted">
                {searching ? "Searching…" : "No companies found — try the company's website (e.g. example.com)."}
              </div>
            ) : (
              <ul className="max-h-[280px] overflow-y-auto">
                {results.map((r) => (
                  <li key={r.domain}>
                    <button
                      type="button"
                      onClick={() => add(r)}
                      disabled={has(r.domain)}
                      className={cn(
                        "flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors",
                        has(r.domain)
                          ? "cursor-default opacity-60"
                          : "hover:bg-bg-elevated",
                      )}
                    >
                      <Favicon domain={r.domain} name={r.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-text-primary">
                          {r.name}
                        </span>
                        <span className="block truncate text-[11.5px] text-text-muted">
                          {r.domain}
                        </span>
                      </span>
                      {has(r.domain) ? (
                        <Check size={15} strokeWidth={2} className="shrink-0 text-accent" />
                      ) : (
                        <Plus size={15} strokeWidth={2} className="shrink-0 text-text-muted" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Chosen accounts */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((s) => (
            <span
              key={s.domain}
              className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/[0.07] py-1 pl-2 pr-1 text-[12.5px] text-text-primary"
            >
              <Favicon domain={s.domain} name={s.name} />
              <span className="max-w-[160px] truncate font-medium">{s.name}</span>
              <button
                type="button"
                onClick={() => remove(s.domain)}
                aria-label={`Remove ${s.name}`}
                className="grid h-5 w-5 place-items-center rounded-full text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
              >
                <X size={12} strokeWidth={2} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Suggestion cards — the nudge for anyone who blanks */}
      {openSuggestions.length > 0 && (
        <div>
          <div className="mb-2 text-[12px] text-text-muted">
            {selected.length === 0 ? "Or start with one of these" : "More you might want"}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {openSuggestions.slice(0, 6).map((s) => (
              <button
                key={s.domain}
                type="button"
                onClick={() => add(s)}
                className="flex items-center gap-3 rounded-xl border border-border-default bg-bg-card px-3 py-2.5 text-left transition-colors hover:border-border-strong"
              >
                <Favicon domain={s.domain} name={s.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-text-primary">
                    {s.name}
                  </span>
                  <span className="block truncate text-[11px] text-text-muted">{s.domain}</span>
                </span>
                <Plus size={15} strokeWidth={2} className="shrink-0 text-text-muted" />
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-[12px] text-text-muted">
        {selected.length === 0
          ? `Add ${target} or so of your target accounts and Vera will research them now.`
          : selected.length < target
            ? `${selected.length} added — a few more makes the best start.`
            : `${selected.length} added. Vera will research them all.`}
      </p>
    </div>
  );
}
