"use client";

/**
 * SoloWizard — first-login onboarding for the caps plans.
 *
 * Flow:
 *   wizard (4 steps) → building (lens) → pick (user adds their own target
 *   accounts; each enriches on click) → hold (short live-feed catch-up,
 *   releases at 5-enriched-or-3-min) → celebrate (reveal real findings)
 *
 * User-driven accounts (2026-07-23): the user picks their real targets
 * via typeahead + ICP suggestion cards (AccountPicker) instead of us
 * guessing a seed — 100% relevant, and the reveal lands on companies they
 * actually care about. Each pick fires /accounts/solo/onboarding-seed
 * (create active+monitored + parallel enrich); the hold screen polls
 * /accounts/solo/onboarding-status.
 *
 * Trimmed from 6 steps 2026-07-15 (it felt clunky): the angle question and
 * the signals-to-lead-with checklist are gone — the engine defaults the
 * angle to defend (never lead with a prospect's own breach) and the base
 * signal weights (onboarding_intel.signal_priorities_from_answers), both
 * adjustable later. The review step folded into the last step's Finish.
 *
 * Fully self-serve (2026-07-08): the answers ARE the config. The
 * engine expands them into a working ICP + personas + signal weights and
 * builds the org's client-context lens, so the dashboard is personalised
 * with no manual setup step.
 *
 * The premium bits:
 *   - Step 1 scans their website (Tavily + Claude, via
 *     /accounts/solo/scan-website) and PREFILLS what they sell,
 *     sub-sectors AND a draft value proposition.
 *   - Step 2 plays the value proposition back as an EDITABLE "how Vera
 *     sees you" step — their confirmed wording anchors the whole lens.
 *   - On finish, a building screen runs while /accounts/solo/onboarding
 *     constructs the lens, then /accounts/solo/match-accounts surfaces
 *     ICP-matched accounts. Accepting one reuses
 *     /accounts/suggestions/{id}/accept (cap enforcement + research).
 */

import { EV, track } from "@/lib/analytics";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { claraApi } from "@/lib/dashboard/claraApi";
import { defaultCurrency } from "@/lib/dashboard/revenue";
import { logoUrl } from "@/lib/logoUrl";
import { AccountPicker, type PickedAccount } from "@/components/onboarding/AccountPicker";
import { cn } from "@/lib/utils";

// "https://www.acme-client.com/about" → "acme-client.com"; null if not a domain.
function parseDomain(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  const host = t
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    .replace(/^www\./i, "")
    .toLowerCase();
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(host) ? host : null;
}

// ---- Option data (from the plan's field schema) ------------------------

const SUB_SECTORS = [
  "Pentesting", "Threat intelligence", "MDR / SOC", "XDR / EDR",
  "vCISO / consulting", "GRC / compliance", "DFIR", "Vulnerability management",
  "Identity / IAM", "Cloud security", "Application security", "OT / ICS security",
  "Email / phishing security", "Data security / DLP", "Network / SASE",
  "Attack surface management", "SIEM / SOAR", "Security awareness training",
  "MSSP (managed)", "Other",
];

// What Vera will focus each account's lens on, per sub-sector. Surfaced back to
// the user after the site scan so they see Vera "got" their business.
const ARCHETYPE_FOCUS: Record<string, string> = {
  "Pentesting": "attack surface, exposure, and offensive-security demand",
  "Threat intelligence": "active threats, leaked data, and exposure intel",
  "MDR / SOC": "detection-and-response demand, breach exposure, and security-ops signals",
  "XDR / EDR": "endpoint risk and detection-and-response demand",
  "vCISO / consulting": "security-leadership gaps and program-maturity signals",
  "GRC / compliance": "regulatory posture, audit pressure, and compliance signals",
  "DFIR": "breach activity and incident-response demand",
  "Vulnerability management": "exposure, patching pressure, and vulnerability signals",
  "Identity / IAM": "identity risk and access-management signals",
  "Cloud security": "cloud exposure and posture signals",
  "Application security": "software risk and secure-development signals",
  "OT / ICS security": "operational-technology risk and critical-infrastructure signals",
  "Email / phishing security": "phishing exposure and human-risk signals",
  "Data security / DLP": "data-exposure and leak signals",
  "Network / SASE": "network exposure and access signals",
  "Attack surface management": "external exposure and attack-surface signals",
  "SIEM / SOAR": "security-operations and detection-tooling demand",
  "Security awareness training": "human-risk and phishing-exposure signals",
  "MSSP (managed)": "outsourced-security demand across the stack",
};

const TITLES = [
  "CISO", "Head of Security", "SOC Manager", "CIO", "CTO", "IT Director",
  "DPO / Data Protection Officer", "Head of Risk / Compliance",
  "VP Engineering", "Founder / CEO",
];

const INDUSTRIES = [
  "Financial services", "Healthcare", "Retail / e-commerce", "Energy / utilities",
  "Public sector / government", "Software / SaaS", "Manufacturing",
  "Insurance", "Legal", "Education",
];

const GEOS = ["UK", "United States", "Europe (EU)", "Canada", "APAC", "Middle East", "Global"];

// Target company size — value strings normalise to Apollo employee ranges
// on the engine (min-max → "min,max"), so account matching can filter on size.
const COMPANY_SIZES: { label: string; value: string }[] = [
  { label: "1–50", value: "1-50" },
  { label: "51–200", value: "51-200" },
  { label: "201–1,000", value: "201-1000" },
  { label: "1,001–5,000", value: "1001-5000" },
  { label: "5,001–10,000", value: "5001-10000" },
  { label: "10,000+", value: "10000-100000" },
];

const DEAL_BANDS = ["Under $10k", "$10k–50k", "$50k–250k", "$250k+", "It varies"];

// ---- Small building blocks --------------------------------------------

function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
        selected
          ? "border-accent bg-accent/12 text-accent"
          : "border-border-default text-text-secondary hover:border-accent/40 hover:text-text-primary",
      )}
    >
      {label}
    </button>
  );
}

// Grows with its content (the site scan prefills paragraph-length text
// that a fixed 3-row box forced the user to scroll).
// Caps at ~13 lines then scrolls.
function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full resize-none overflow-y-auto rounded-lg border border-border-default bg-bg-card px-3.5 py-2.5 text-[14px] text-text-primary outline-none focus:border-accent/50"
    />
  );
}

function Spinner({ className }: { className?: string }) {
  // SVG arc spinner: faint track + sweeping accent arc. The old CSS
  // border trick read as a static grey circle at small sizes — this one
  // is unmistakably in motion.
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn("inline-block h-4 w-4 animate-spin", className)}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function toggle(list: string[], v: string, max?: number): string[] {
  if (list.includes(v)) return list.filter((x) => x !== v);
  if (max && list.length >= max) return list;
  return [...list, v];
}

// ---- Types -------------------------------------------------------------

interface Answers {
  website: string;
  sells_what: string;
  sub_sectors: string[];
  value_prop: string;
  ambulance: "defend" | "expose" | "";
  titles: string[];
  industries: string[];
  geos: string[];
  target_company_size: string[];
  deal_band: string;
  signals: string[];
}

interface AiSummary {
  company_summary: string;
  target_business_types: string[];
}

// Live-feed row from /solo/onboarding-status.
interface FeedAccount {
  name: string;
  domain: string;
  enriched: boolean;
  headline: string | null;
}

// The gate: release to the dashboard when this many accounts are fully
// enriched, OR after the ceiling — whichever first. The ceiling is the
// safety floor (a slow vendor must never trap the user on this screen).
const GATE_ENRICHED = 5;
const GATE_CEILING_MS = 180_000;
// We release as soon as accounts have basic firmographics (the fast pass, ~a
// few seconds) rather than waiting on the deep research — the signals and
// scores stream into the dashboard behind them. A short minimum hold stops
// the screen flashing past before the user has read it.
const MIN_HOLD_MS = 5_000;

const STEPS = ["Your company", "How Vera sees you", "Who you sell to", "What Vera watches", "Deal size"];

// The custom signal step (PLAN-onboarding-market Phase 2): Vera proposes
// which signal types fit what the seller sells — each with a why in their
// language — and the user corrects. Off = weight 0 = never shown anywhere.
interface ProposedSignal {
  type: string;
  label: string;
  on: boolean;
  reason: string;
}
interface SignalProposal {
  archetype: string;
  angle: string;
  signals: ProposedSignal[];
  hiring_roles: string[];
  funding_event_types: string[];
  source: string;
}

// Market finale (PLAN Phase 4): the shape we read off /market/overview.
interface MarketRowLite {
  name: string;
  domain: string;
  industry?: string | null;
  open_security_roles?: number;
  example_title?: string | null;
  example_posted_at?: string | null;
  event_type?: string;
  event_amount?: string | null;
  event_date?: string;
}
interface MarketLite {
  pending?: boolean;
  universe?: { total: number; est_clean: number | null };
  value?: { estimated_annual: number | null; currency?: string | null };
  slices?: { key: string; label: string; total: number; rows: MarketRowLite[] }[];
}

function fmtCount(n: number | null | undefined): string | null {
  return typeof n === "number" && n > 0 ? n.toLocaleString("en-GB") : null;
}
const WIZARD_CURRENCY_SYMBOL: Record<string, string> = { GBP: "£", USD: "$", EUR: "€" };

function fmtValueShort(n: number | null | undefined, sym = "$"): string | null {
  if (!n) return null;
  if (n >= 1_000_000_000) return `${sym}${(n / 1_000_000_000).toFixed(1)}b`;
  if (n >= 1_000_000) return `${sym}${Math.round(n / 1_000_000)}m`;
  return `${sym}${Math.round(n / 1_000)}k`;
}

function CompanyLogo({
  name,
  domain,
  size = "md",
}: {
  name: string;
  domain: string;
  size?: "md" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  const box = size === "lg" ? "h-11 w-11 rounded-lg" : "h-8 w-8 rounded-md";
  if (failed || !domain) {
    return (
      <span className={cn("grid shrink-0 place-items-center border border-border-subtle bg-bg-elevated text-[12px] font-semibold text-text-secondary", box)}>
        {(name || domain || "?").charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    // Same logo.dev source + fallback pattern as AccountPicker.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl(domain, 64)}
      alt=""
      width={size === "lg" ? 44 : 32}
      height={size === "lg" ? 44 : 32}
      className={cn("shrink-0 border border-border-subtle bg-white object-contain", box)}
      onError={() => setFailed(true)}
    />
  );
}

// The building screen now covers one honest step: constructing the lens.
// (Account discovery moved into the user-driven picker stage.)
const BUILD_PHASES = ["Building your lens"];

// Radar blip layout for the building screen. Deterministic scatter
// (angle from 12 o'clock, radius as a fraction of the radar's) so the
// field looks organic but renders identically every run.
const BLIP_SPOTS = [
  { a: 28, r: 0.62 }, { a: 105, r: 0.44 }, { a: 152, r: 0.74 },
  { a: 197, r: 0.52 }, { a: 243, r: 0.68 }, { a: 289, r: 0.38 },
  { a: 322, r: 0.78 }, { a: 68, r: 0.82 }, { a: 176, r: 0.3 },
  { a: 260, r: 0.88 }, { a: 12, r: 0.42 }, { a: 130, r: 0.58 },
];

// ---- The wizard --------------------------------------------------------

export function SoloWizard({
  orgId,
  orgName,
  onComplete,
}: {
  orgId: string;
  orgName: string;
  onComplete: () => void;
}) {
  const [step, setStep] = useState(0);
  const [stage, setStage] = useState<"wizard" | "building" | "pick" | "hold" | "celebrate" | "welcome">("wizard");
  const [buildPhase, setBuildPhase] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [aiSummary, setAiSummary] = useState<AiSummary | null>(null);
  // Signal step state — proposal from /solo/propose-signals, plus the
  // user's corrections (toggles + qualifier chips).
  const [proposal, setProposal] = useState<SignalProposal | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [signalEnabled, setSignalEnabled] = useState<Record<string, boolean>>({});
  const [hiringRoles, setHiringRoles] = useState<string[]>([]);
  const [fundingEvents, setFundingEvents] = useState<string[]>([]);

  // Live TAM counter (targeting step): a debounced free count as they
  // steer the industry/geo/size chips — the survey becomes a dial.
  const [marketCount, setMarketCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);

  // Market finale: the background compute kicked at wizard submit; the
  // pick stage polls until the snapshot lands, then shows the movers.
  const [market, setMarket] = useState<MarketLite | null>(null);
  const [refillingMarket, setRefillingMarket] = useState(false);
  const marketRefilled = useRef(false);
  // The accounts the user picks; each fires its own enrichment on add.
  const [picked, setPicked] = useState<PickedAccount[]>([]);
  // Live enrichment state, polled from /solo/onboarding-status during "hold".
  const [feed, setFeed] = useState<FeedAccount[]>([]);
  const [enrichedCount, setEnrichedCount] = useState(0);
  const [holdStartedAt, setHoldStartedAt] = useState(0);

  const [a, setA] = useState<Answers>({
    website: "", sells_what: "", sub_sectors: [], value_prop: "",
    ambulance: "", titles: [], industries: [], geos: [], target_company_size: [],
    deal_band: "", signals: [],
  });
  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => setA((p) => ({ ...p, [k]: v }));

  // Radar theatre driver — pure presentation over the two real engine
  // calls (buildPhase is the honest state). Every tick reveals a blip
  // and advances the caption; captions restart when the phase flips.
  const [radarTick, setRadarTick] = useState(0);
  const [blips, setBlips] = useState(3);
  useEffect(() => {
    if (stage !== "building") return;
    const id = setInterval(() => {
      setRadarTick((t) => t + 1);
      setBlips((b) => Math.min(b + 1, BLIP_SPOTS.length));
    }, 2400);
    return () => clearInterval(id);
  }, [stage]);

  // Captions name what Vera is actually locking in, from their own
  // answers — never generic loading copy.
  const radarCaptions = useMemo(() => {
    const caps = ["Locking your value proposition"];
    if (a.industries.length > 0) caps.push(`Targeting ${a.industries.slice(0, 3).join(", ")}`);
    if (a.geos.length > 0) caps.push(`Focusing on ${a.geos.join(", ")}`);
    if (a.titles.length > 0) caps.push(`Expanding ${a.titles[0]} to every title variant`);
    caps.push("Weighting your signals");
    return caps;
  }, [a, buildPhase]);
  const radarCaption = radarCaptions[Math.min(radarTick, radarCaptions.length - 1)];

  // Debounced universe count while the targeting chips change. Only when
  // all three dimensions have selections — a partial ICP counts nothing.
  useEffect(() => {
    if (step !== 2) return;
    if (!a.industries.length || !a.geos.length || !a.target_company_size.length) {
      setMarketCount(null);
      return;
    }
    setCountLoading(true);
    const id = setTimeout(async () => {
      try {
        const res = (await claraApi("/accounts/market/count", {
          method: "POST",
          body: JSON.stringify({
            org_id: orgId,
            answers: {
              industries: a.industries,
              geos: a.geos,
              target_company_size: a.target_company_size,
            },
          }),
        })) as { total: number | null };
        setMarketCount(res.total ?? null);
      } catch {
        setMarketCount(null);
      } finally {
        setCountLoading(false);
      }
    }, 700);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, a.industries, a.geos, a.target_company_size, orgId]);

  // Poll the market snapshot while the user picks accounts. The compute
  // was kicked server-side at wizard submit; poll:true never triggers a
  // duplicate compute. Stops on arrival or after ~2 minutes (the picker
  // works fine without it — honest degradation).
  useEffect(() => {
    if (stage !== "pick" || market) return;
    let tries = 0;
    const id = setInterval(async () => {
      tries += 1;
      if (tries > 24) {
        clearInterval(id);
        return;
      }
      try {
        const res = (await claraApi("/accounts/market/overview", {
          method: "POST",
          body: JSON.stringify({ org_id: orgId, poll: true }),
        })) as MarketLite & { enabled?: boolean };
        if (res.enabled !== false && !res.pending && res.slices?.length) {
          setMarket(res);
          clearInterval(id);
        }
      } catch {
        /* keep polling — the picker stands alone */
      }
    }, 5000);
    return () => clearInterval(id);
  }, [stage, market, orgId]);

  // A fresh org's first compute can verify only a handful of movers (cold
  // industry caches — 2026-08-16: one row from a 940-company market). When
  // the snapshot lands thin, pull more through the slice-topup pipeline,
  // which brings its own budget and digs deeper pages. One pass, hiring
  // first; every topup also warms the shared cache for the weekly runs.
  useEffect(() => {
    if (!market?.slices || marketRefilled.current) return;
    const moverCount = market.slices.reduce((n, s) => n + s.rows.length, 0);
    if (moverCount >= 6) return;
    marketRefilled.current = true;
    (async () => {
      setRefillingMarket(true);
      try {
        for (const key of ["hiring_security", "funding", "growth"]) {
          const slice = market.slices?.find((s) => s.key === key);
          if (!slice || slice.rows.length >= 4) continue;
          const res = (await claraApi("/accounts/market/slice-topup", {
            method: "POST",
            body: JSON.stringify({
              org_id: orgId,
              slice_key: key,
              exclude: slice.rows.map((r) => r.domain),
            }),
          })) as { rows?: MarketRowLite[] };
          if (res.rows?.length) {
            setMarket((cur) => {
              if (!cur?.slices) return cur;
              return {
                ...cur,
                slices: cur.slices.map((s) => {
                  if (s.key !== key) return s;
                  const have = new Set(s.rows.map((r) => r.domain));
                  return { ...s, rows: [...s.rows, ...res.rows!.filter((r) => !have.has(r.domain))] };
                }),
              };
            });
          }
        }
      } catch {
        /* best-effort — the picker stands alone */
      } finally {
        setRefillingMarket(false);
      }
    })();
  }, [market, orgId]);

  const canAdvance = (): boolean => {
    if (step === 0) return a.website.trim().length > 3 && a.sub_sectors.length > 0;
    if (step === 1) return a.value_prop.trim().length >= 10;
    if (step === 2) return a.titles.length > 0 && a.industries.length > 0 && a.geos.length > 0 && a.target_company_size.length > 0;
    if (step === 3) return !proposalLoading; // signal step: advance once the proposal (or its fallback) is in
    if (step === 4) return a.deal_band !== "";
    return true;
  };

  // Fired when the user advances into the signal step: one engine pass
  // maps what they sell onto the signal catalogue. On any failure the
  // step simply shows everything on — the wizard never blocks on AI.
  const loadProposal = async () => {
    if (proposal || proposalLoading) return;
    setProposalLoading(true);
    try {
      const res = (await claraApi("/accounts/solo/propose-signals", {
        method: "POST",
        body: JSON.stringify({ org_id: orgId, answers: a }),
      })) as SignalProposal;
      setProposal(res);
      const enabled: Record<string, boolean> = {};
      for (const s of res.signals || []) enabled[s.type] = s.on;
      setSignalEnabled(enabled);
      setHiringRoles(res.hiring_roles || []);
      setFundingEvents(res.funding_event_types || []);
    } catch {
      setProposal({
        archetype: "", angle: "", signals: [], hiring_roles: [],
        funding_event_types: [], source: "unavailable",
      });
    } finally {
      setProposalLoading(false);
    }
  };

  // Step 1 — scan their website and prefill what they sell, sub-sectors
  // and the draft value proposition (edited on the next step).
  // The scan runs ~10-15s in production, so a progress bar under the
  // field shows it's alive: eased fake progress toward ~90% while the
  // request runs, snapped to 100% when the response lands.
  const [scanProgress, setScanProgress] = useState(0);
  useEffect(() => {
    if (!scanning) return;
    const id = setInterval(() => setScanProgress((p) => p + (92 - p) * 0.045), 180);
    return () => clearInterval(id);
  }, [scanning]);
  const scanDomain = parseDomain(a.website) ?? "your site";
  const scanCaption =
    scanProgress < 40 ? `Reading ${scanDomain}` :
    scanProgress < 78 ? "Understanding what you sell" :
    "Drafting your value proposition";

  const scanWebsite = async () => {
    if (scanning) return;
    if (!parseDomain(a.website)) {
      setError("Enter a valid website, like yourcompany.com.");
      return;
    }
    setError(null);
    setScanProgress(4);
    setScanning(true);
    try {
      const scan = (await claraApi("/accounts/solo/scan-website", {
        method: "POST",
        body: JSON.stringify({ org_id: orgId, url: a.website.trim() }),
      })) as { what_they_sell?: string; sub_sectors?: string[]; summary?: string; value_proposition?: string };
      // Let the bar visibly complete before the prefill lands.
      setScanProgress(100);
      await new Promise((r) => setTimeout(r, 350));
      setA((p) => ({
        ...p,
        sells_what: scan.what_they_sell || p.sells_what,
        sub_sectors: scan.sub_sectors && scan.sub_sectors.length ? scan.sub_sectors : p.sub_sectors,
        value_prop: scan.value_proposition || p.value_prop,
      }));
      setScanned(true);
    } catch {
      // Non-fatal — they can fill it in by hand.
      setError("Couldn't read your site automatically — fill it in below and carry on.");
    } finally {
      setScanning(false);
    }
  };

  // Finish → the building screen: the engine constructs the lens from the
  // answers, then surfaces ICP-matched accounts. A couple of minutes is
  // fine here — this is Vera being configured, and the screen says so.
  const submit = async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    setBuildPhase(0);
    setRadarTick(0);
    setBlips(3);
    setStage("building");
    try {
      // The confirmed signal step travels with the answers: off = weight 0
      // = never shown anywhere. Omitted entirely when the proposal never
      // loaded, so the engine falls back to its preset behaviour.
      const signalConfig =
        proposal && proposal.signals.length > 0
          ? {
              angle: proposal.angle,
              enabled: signalEnabled,
              hiring_roles: hiringRoles,
              funding_event_types: fundingEvents,
            }
          : undefined;
      const res = (await claraApi("/accounts/solo/onboarding", {
        method: "POST",
        body: JSON.stringify({ org_id: orgId, answers: a, signal_config: signalConfig }),
      })) as { ok: boolean; ai_summary?: AiSummary };
      if (res.ai_summary && (res.ai_summary.company_summary || res.ai_summary.target_business_types?.length)) {
        setAiSummary(res.ai_summary);
      }
      track(EV.onboardingCompleted);
    } catch (err) {
      // The lens build failed — bring them back to the review step intact.
      setError(err instanceof Error ? err.message : "Something went wrong — try again.");
      setSubmitting(false);
      setStage("wizard");
      return;
    }
    // Lens built → the user now adds their own target accounts (each enriches
    // on click), so by the time they continue the first ones are already done.
    setSubmitting(false);
    setStage("pick");
  };

  // Enrich-on-click: when the picker's selection changes, seed + enrich any
  // newly-added account immediately (fire-and-forget; the endpoint dedupes,
  // so a re-add is a no-op). The hold screen then just waits for the passes
  // that are already running.
  const handlePickChange = (next: PickedAccount[]) => {
    const known = new Set(picked.map((p) => p.domain));
    const added = next.filter((p) => !known.has(p.domain));
    setPicked(next);
    for (const acc of added) {
      claraApi("/accounts/solo/onboarding-seed", {
        method: "POST",
        body: JSON.stringify({ org_id: orgId, accounts: [{ domain: acc.domain, name: acc.name }] }),
      }).catch(() => {
        /* best-effort; the hold poll reflects whatever actually enriched */
      });
    }
  };

  const startHold = () => {
    setEnrichedCount(0);
    setFeed(picked.map((p) => ({ name: p.name, domain: p.domain, enriched: false, headline: null })));
    setHoldStartedAt(Date.now());
    setStage("hold");
  };

  // Poll enrichment state while holding; release at GATE_ENRICHED enriched
  // OR the ceiling — whichever first. The ceiling is the safety floor: a
  // slow vendor can never strand the user here.
  useEffect(() => {
    if (stage !== "hold") return;
    let alive = true;
    const release = () => {
      if (!alive) return;
      alive = false;
      setStage("celebrate");
    };
    const tick = async () => {
      if (!alive) return;
      // Ceiling first — checked BEFORE the network call so a slow or failing
      // status poll can never skip it. This is the real safety floor.
      if (Date.now() - holdStartedAt >= GATE_CEILING_MS) return release();
      try {
        const res = (await claraApi("/accounts/solo/onboarding-status", {
          method: "POST",
          body: JSON.stringify({ org_id: orgId }),
        })) as { accounts?: FeedAccount[]; enriched_count?: number; basic_ready_count?: number };
        if (!alive) return;
        if (res.accounts) setFeed(res.accounts);
        // Prefer basic-ready (fast firmographics); fall back to the deep
        // enriched count so this still works if the engine predates basic_ready.
        const basic = res.basic_ready_count ?? res.enriched_count ?? 0;
        setEnrichedCount(basic);
        const elapsed = Date.now() - holdStartedAt;
        // Release on basic firmographics (fast), not the deep research. The
        // deep signals + scores stream into the dashboard behind the reveal.
        const target = Math.min(GATE_ENRICHED, picked.length);
        const basicReady = basic >= target;
        // A single slow account shouldn't hold the reveal — all-but-one is enough.
        const basicMinusStraggler = basic >= Math.max(2, Math.min(GATE_ENRICHED, picked.length - 1));
        if (elapsed >= MIN_HOLD_MS && (basicReady || basicMinusStraggler)) release();
      } catch {
        /* transient — the ceiling above still protects the user */
      }
    };
    tick();
    const poll = setInterval(tick, 4000);
    // Hard ceiling, independent of the poll loop — fires even if every status
    // call hangs or the tab was backgrounded while the fast timers throttled.
    const ceiling = setTimeout(release, GATE_CEILING_MS + 500);
    // A backgrounded tab throttles setInterval; re-check the instant we're
    // visible again so a returning user is released immediately.
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(poll);
      clearTimeout(ceiling);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [stage, orgId, holdStartedAt, picked.length]);

  // ---------------------------------------------------------------------
  // Building screen — a live radar while Vera configures itself. Blips
  // land as the lens locks in; captions name their own targets, never
  // generic loading copy. Reduced motion: static rings, no sweep.
  // ---------------------------------------------------------------------
  if (stage === "building") {
    return (
      <div className="flex flex-col px-7 py-10 sm:px-9">
        <div className="text-xs font-medium text-text-muted">
          Set up Vera · {orgName}
        </div>
        <h2 className="mt-5 text-center font-display text-[1.3rem] font-medium tracking-tight text-text-primary">
          Vera is scanning your market
        </h2>
        <p className="mx-auto mt-2 max-w-md text-center text-[13.5px] leading-relaxed text-text-secondary">
          Your answers are being built into how Vera reads every account and
          signal. This takes a minute or two.
        </p>

        <div className="relative mx-auto mt-9 h-60 w-60 sm:h-72 sm:w-72" aria-hidden>
          {/* Rings + crosshair */}
          <div className="absolute inset-0 rounded-full border border-border-default" />
          <div className="absolute inset-[17%] rounded-full border border-border-default opacity-70" />
          <div className="absolute inset-[34%] rounded-full border border-border-default opacity-50" />
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-border-default opacity-40" />
          <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-border-default opacity-40" />

          {/* Sweep — trailing glow behind the arm */}
          <div
            className="animate-radar-sweep absolute inset-0 rounded-full"
            style={{ background: "conic-gradient(from 290deg, transparent 0deg, var(--accent-glow) 68deg, transparent 70deg)" }}
          >
            <div className="absolute left-1/2 top-0 h-1/2 w-px origin-bottom bg-accent opacity-50" />
          </div>

          {/* Centre — them */}
          <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" />

          {/* Blips — targets locking in as Vera works */}
          {BLIP_SPOTS.slice(0, blips).map((b) => {
            const rad = (b.a * Math.PI) / 180;
            const x = 50 + Math.sin(rad) * b.r * 50;
            const y = 50 - Math.cos(rad) * b.r * 50;
            return (
              <span
                key={`${b.a}-${b.r}`}
                className="animate-radar-blip absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
                style={{ left: `${x}%`, top: `${y}%`, boxShadow: "0 0 10px var(--accent-glow)" }}
              />
            );
          })}
        </div>

        {/* What just locked in — their setup, one line at a time */}
        <div className="mt-8 flex h-5 items-center justify-center" aria-live="polite">
          <span
            key={`${buildPhase}-${radarCaption}`}
            className="animate-radar-caption text-[13.5px] text-text-secondary"
          >
            {radarCaption}
          </span>
        </div>

        {/* Honest phase state */}
        <div className="mt-5 flex items-center justify-center gap-6">
          {BUILD_PHASES.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              {i < buildPhase ? (
                <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </span>
              ) : i === buildPhase ? (
                <Spinner className="h-3.5 w-3.5 shrink-0 text-accent" />
              ) : (
                <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-border-strong" />
              )}
              <span className={cn("text-[12.5px]", i <= buildPhase ? "text-text-primary" : "text-text-muted")}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // Pick screen — the user adds their own target accounts. Each fires its
  // enrichment on click, so by the time they continue the work's underway.
  // ---------------------------------------------------------------------
  if (stage === "pick") {
    const pickedSet = new Set(picked.map((p) => p.domain));
    const marketTotal = fmtCount(market?.universe?.est_clean ?? market?.universe?.total);
    const marketValue = fmtValueShort(
      market?.value?.estimated_annual,
      WIZARD_CURRENCY_SYMBOL[
        (market?.value?.currency || defaultCurrency(a.geos)).toUpperCase()
      ] ?? "$",
    );
    const addFromMarket = (r: MarketRowLite) =>
      handlePickChange([...picked, { name: r.name, domain: r.domain }]);
    return (
      <div className="flex flex-col px-7 py-8 sm:px-9">
        <div className="text-xs font-medium text-text-muted">
          Set up Vera · {orgName}
        </div>
        <h2 className="mt-4 font-display text-[1.3rem] font-medium tracking-tight text-text-primary">
          {market ? "Your market is moving. Pick your first accounts" : "Add your target accounts"}
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-text-secondary">
          {market && marketTotal
            ? `${marketTotal} companies match your targeting${marketValue ? `, roughly ${marketValue}/yr at your deal size` : ""}. These are the ones moving right now; add the ones you want Vera to work.`
            : "The companies you want to win. Vera starts researching each one the moment you add it, so your dashboard is ready in minutes."}
        </p>

        {/* Market reveal — verified movers from the snapshot computed while
            they finished the wizard. Every add fires research immediately. */}
        {!market && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-border-default bg-bg-elevated px-4 py-2.5 text-[12.5px] text-text-secondary">
            <Spinner className="h-3.5 w-3.5 text-accent" />
            Vera is mapping your market. Companies moving right now will appear here.
          </div>
        )}
        {refillingMarket && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-border-default bg-bg-elevated px-4 py-2.5 text-[12.5px] text-text-secondary">
            <Spinner className="h-3.5 w-3.5 text-accent" />
            Finding more movers in your market…
          </div>
        )}
        {market?.slices && (() => {
          // One merged section (three groups is a lot for onboarding):
          // interleave the slices' verified movers, dedupe
          // across them (a company can be hiring AND growing), drop
          // anything already picked, show a 2-col grid of up to 8.
          const seen = new Set<string>();
          const movers: (MarketRowLite & { sliceKey: string })[] = [];
          for (const s of market.slices) {
            for (const r of s.rows) {
              if (seen.has(r.domain) || pickedSet.has(r.domain)) continue;
              seen.add(r.domain);
              movers.push({ ...r, sliceKey: s.key });
            }
          }
          const visible = movers.slice(0, 8);
          if (visible.length === 0) return null;
          return (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {visible.map((r) => (
                <div
                  key={r.domain}
                  className="flex items-center gap-3 rounded-xl border border-border-default bg-bg-card px-3.5 py-2.5"
                >
                  <CompanyLogo name={r.name} domain={r.domain} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-text-primary">{r.name}</div>
                    <div className="truncate text-[12px] text-text-secondary">
                      {r.sliceKey === "hiring_security" &&
                        `${r.open_security_roles} open security ${r.open_security_roles === 1 ? "role" : "roles"}${r.example_title ? ` · ${r.example_title}` : ""}`}
                      {r.sliceKey === "funding" &&
                        `${r.event_type ?? "Funding event"}${r.event_amount ? ` · ${r.event_amount}` : ""}`}
                      {r.sliceKey === "growth" && "Headcount up 10%+ over 6 months"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => addFromMarket(r)}
                    className="shrink-0 rounded-lg border border-accent/40 px-3 py-1.5 text-[12px] font-medium text-accent transition-colors hover:bg-accent/10"
                  >
                    + Add
                  </button>
                </div>
              ))}
            </div>
          );
        })()}

        <div className="mt-5">
          <AccountPicker orgId={orgId} selected={picked} onChange={handlePickChange} target={GATE_ENRICHED} />
        </div>

        <button
          type="button"
          onClick={startHold}
          disabled={picked.length < 3}
          className="mt-7 inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-brand px-6 py-2.5 text-[14px] font-medium text-bg-base transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {picked.length < 3 ? "Add a few to continue" : `Research ${picked.length} account${picked.length === 1 ? "" : "s"} →`}
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // Hold screen — the short catch-up while enrichment finishes. Live feed
  // of what Vera's finding; releases at GATE_ENRICHED done or the ceiling.
  // ---------------------------------------------------------------------
  if (stage === "hold") {
    const target = Math.min(GATE_ENRICHED, picked.length || GATE_ENRICHED);
    return (
      <div className="flex flex-col px-7 py-10 sm:px-9">
        <div className="text-xs font-medium text-text-muted">Set up Vera · {orgName}</div>
        <h2 className="mt-5 text-center font-display text-[1.3rem] font-medium tracking-tight text-text-primary">
          Vera&apos;s agents are researching your accounts
        </h2>
        <p className="mx-auto mt-2 max-w-md text-center text-[13.5px] leading-relaxed text-text-secondary">
          Reading job boards, breach data, tech stacks and signals on each one.
          Your dashboard opens the moment the first are ready.
        </p>

        <div className="mx-auto mt-4 flex items-center gap-2 text-[12.5px] text-text-muted">
          <Spinner className="h-3.5 w-3.5 text-accent" />
          {enrichedCount} of {target} ready
        </div>

        <ul className="mx-auto mt-6 w-full max-w-md divide-y divide-border-subtle rounded-xl border border-border-default">
          {feed.map((f) => (
            <li key={f.domain} className="flex items-center gap-3 px-4 py-3">
              {f.enriched ? (
                <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                </span>
              ) : (
                <Spinner className="h-3.5 w-3.5 shrink-0 text-accent" />
              )}
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text-primary">
                {f.name}
              </span>
              <span
                className={cn(
                  "shrink-0 text-[11.5px]",
                  f.enriched ? "text-text-secondary" : "text-accent animate-pulse",
                )}
              >
                {f.enriched ? (f.headline ?? "Researched") : "Researching…"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // Completion — dashboard is live.
  // ---------------------------------------------------------------------
  if (stage === "celebrate") {
    // Reveal the enriched accounts, strongest finding first; anything still
    // researching drops to the back with a neutral line (never a weak score
    // as a headline). Honest by construction — only what actually enriched.
    const revealed = [...feed].sort(
      (a, b) => Number(!!b.headline) - Number(!!a.headline) || Number(b.enriched) - Number(a.enriched),
    );
    const stillGoing = feed.filter((f) => !f.enriched).length;
    return (
      <div className="flex flex-col px-7 py-9 sm:px-9">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent/15 text-accent">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h2 className="mt-5 text-center font-display text-[1.3rem] font-medium tracking-tight text-text-primary">
          Your dashboard is ready
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-center text-[13.5px] leading-relaxed text-text-secondary">
          Here&apos;s what Vera found on your accounts.
          {stillGoing > 0 ? ` ${stillGoing} more still researching — they'll appear shortly.` : ""}
        </p>

        {revealed.length > 0 && (
          <ul className="mx-auto mt-6 w-full max-w-md divide-y divide-border-subtle rounded-xl border border-border-default">
            {revealed.map((f) => (
              <li key={f.domain} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-text-primary">
                  {f.name}
                </span>
                {f.headline ? (
                  <span className="shrink-0 rounded-full border border-accent/30 bg-accent/[0.07] px-2.5 py-0.5 text-[11.5px] text-accent">
                    {f.headline}
                  </span>
                ) : (
                  <span className="shrink-0 text-[11.5px] text-text-muted">
                    {f.enriched ? "Monitoring live" : "Researching…"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={() => setStage("welcome")}
          className="mx-auto mt-7 w-full max-w-xs rounded-xl bg-gradient-brand px-5 py-3 text-[14px] font-medium text-bg-base transition-opacity hover:opacity-90"
        >
          Continue →
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // Welcome — a short intro before the dashboard.
  // ---------------------------------------------------------------------
  if (stage === "welcome") {
    return (
      <div className="flex flex-col px-7 py-10 sm:px-9">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent/15 text-accent">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.3 6.3 4.9 4.9M19.1 19.1l-1.4-1.4M17.7 6.3l1.4-1.4M4.9 19.1l1.4-1.4" />
            <circle cx="12" cy="12" r="4" />
          </svg>
        </div>
        <h2 className="mt-5 text-center font-display text-[1.4rem] font-medium tracking-tight text-text-primary">
          Welcome to Vera!
        </h2>
        <div className="mx-auto mt-4 max-w-md space-y-3.5 text-[13.5px] leading-relaxed text-text-secondary">
          <p>
            Cyber security is such a nuanced industry. Vera is here to help you find new
            accounts and stay close to the clients you already have. It&apos;s the sales
            intelligence platform that helps you make more informed decisions and bring
            more value to your clients.
          </p>
        </div>
        <button
          type="button"
          onClick={onComplete}
          className="mx-auto mt-7 w-full max-w-xs rounded-xl bg-gradient-brand px-5 py-3 text-[14px] font-medium text-bg-base transition-opacity hover:opacity-90"
        >
          Open Vera →
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // The wizard steps
  // ---------------------------------------------------------------------
  return (
    <div className="flex flex-col px-7 py-7 sm:px-9 sm:py-8">
      {/* Progress */}
      <div className="mb-8">
        <div className="text-xs font-medium text-text-muted">
          Set up Vera · {orgName}
        </div>
        <div className="mt-3 flex gap-1.5">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                i <= step ? "bg-accent" : "bg-bg-elevated",
              )}
            />
          ))}
        </div>
        <div className="mt-2 text-[12px] text-text-muted">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </div>
      </div>

      <div className="flex-1">
        {/* Step 1 — company + website scan */}
        {step === 0 && (
          <Section title="Tell us about your company" sub="Drop in your website and we'll read it to get a head start.">
            <Field label="Your website">
              <div className="flex gap-2">
                {/* Their own logo appears the moment the domain parses —
                    the first "Vera knows who you are" beat of the wizard. */}
                {parseDomain(a.website) && (
                  <CompanyLogo
                    key={parseDomain(a.website)}
                    name={orgName}
                    domain={parseDomain(a.website) || ""}
                    size="lg"
                  />
                )}
                <input
                  type="url"
                  value={a.website}
                  onChange={(e) => { set("website", e.target.value); setScanned(false); }}
                  placeholder="https://yourcompany.com"
                  className="w-full rounded-lg border border-border-default bg-bg-card px-3.5 py-2.5 text-[14px] text-text-primary outline-none focus:border-accent/50"
                />
                <button
                  type="button"
                  onClick={scanWebsite}
                  disabled={scanning || !parseDomain(a.website)}
                  className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-text-primary px-4 py-2.5 text-[13px] font-medium text-bg-base transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {scanning ? <><Spinner /> Reading…</> : scanned ? "Re-scan" : "Scan site"}
                </button>
              </div>
              {scanning && (
                <div className="mt-3">
                  <div className="h-1 overflow-hidden rounded-full bg-bg-elevated">
                    <div
                      className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
                      style={{ width: `${scanProgress}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[12px] text-text-muted" aria-live="polite">
                    {scanCaption}
                  </p>
                </div>
              )}
              {scanned && !scanning && (
                <p className="mt-2 text-[12px] text-accent">✓ We read your site and filled in what we found — edit anything below.</p>
              )}
            </Field>
            <Field label="What do you sell?" hint="One or two lines, plain English.">
              <AutoGrowTextarea
                value={a.sells_what}
                onChange={(v) => set("sells_what", v)}
                rows={3}
                placeholder="e.g. We run a 24/7 SOC and MDR service for mid-market financial firms."
              />
            </Field>
            {scanned && !scanning && a.sub_sectors.length > 0 && (
              <div className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
                <p className="text-[13px] leading-relaxed text-text-primary">
                  Got it — you&apos;re in <span className="font-medium">{a.sub_sectors[0]}</span>. Vera will
                  tune every account around{" "}
                  <span className="font-medium text-accent">
                    {ARCHETYPE_FOCUS[a.sub_sectors[0]] ?? "the security signals that matter to you"}
                  </span>.
                </p>
                <p className="mt-1 text-[12px] text-text-muted">Not quite right? Adjust the chips below.</p>
              </div>
            )}
            <Field label="Your sub-sector(s)" hint="Pick up to 3.">
              <div className="flex flex-wrap gap-2">
                {SUB_SECTORS.map((s) => (
                  <Chip key={s} label={s} selected={a.sub_sectors.includes(s)}
                    onClick={() => set("sub_sectors", toggle(a.sub_sectors, s, 3))} />
                ))}
              </div>
            </Field>
          </Section>
        )}

        {/* Step 2 — the lens: confirm the value proposition */}
        {step === 1 && (
          <Section
            title="How Vera will see you"
            sub="Every account and signal on your dashboard is judged through this lens. Edit it until it sounds like you."
          >
            <Field
              label="Your value proposition"
              hint={scanned ? "Drafted from your website — make it yours." : "Who you help, the pain you remove, and why you."}
            >
              <AutoGrowTextarea
                value={a.value_prop}
                onChange={(v) => set("value_prop", v)}
                rows={4}
                placeholder="e.g. We give lean security teams enterprise-grade detection and response without the headcount — 24/7 coverage, tuned for regulated mid-market firms."
              />
            </Field>
          </Section>
        )}

        {/* Step 3 — who they sell to */}
        {step === 2 && (
          <Section title="Who do you sell to?" sub="The people and companies Vera should focus on.">
            <Field label="Job titles you target">
              <div className="flex flex-wrap gap-2">
                {TITLES.map((t) => (
                  <Chip key={t} label={t} selected={a.titles.includes(t)}
                    onClick={() => set("titles", toggle(a.titles, t))} />
                ))}
              </div>
            </Field>
            <Field label="Target industries">
              <div className="flex flex-wrap gap-2">
                {INDUSTRIES.map((t) => (
                  <Chip key={t} label={t} selected={a.industries.includes(t)}
                    onClick={() => set("industries", toggle(a.industries, t))} />
                ))}
              </div>
            </Field>
            <Field label="Target company size" hint="How big are the companies you sell to?">
              <div className="flex flex-wrap gap-2">
                {COMPANY_SIZES.map((c) => (
                  <Chip key={c.value} label={c.label} selected={a.target_company_size.includes(c.value)}
                    onClick={() => set("target_company_size", toggle(a.target_company_size, c.value))} />
                ))}
              </div>
            </Field>
            <Field label="Target geography">
              <div className="flex flex-wrap gap-2">
                {GEOS.map((t) => (
                  <Chip key={t} label={t} selected={a.geos.includes(t)}
                    onClick={() => set("geos", toggle(a.geos, t))} />
                ))}
              </div>
            </Field>
            {/* The live TAM counter — the survey becomes a dial. Only shows
                once all three dimensions are set; updates as chips toggle. */}
            {(marketCount !== null || countLoading) && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-border-default bg-bg-elevated px-4 py-2.5 text-[13px]">
                {countLoading ? (
                  <>
                    <Spinner className="h-3.5 w-3.5 text-accent" />
                    <span className="text-text-secondary">Estimating your TAM…</span>
                  </>
                ) : (
                  <span className="text-text-secondary">
                    Your estimated TAM:{" "}
                    <b className="font-semibold text-text-primary">
                      ~{fmtCount(marketCount)} companies
                    </b>
                  </span>
                )}
              </div>
            )}
          </Section>
        )}

        {/* Step 4 — what Vera watches. Vera proposes the signal set from
            what they sell; the user corrects. Off = never shown, anywhere. */}
        {step === 3 && (
          <Section
            title={proposal?.archetype ? `How Vera reads the market for a ${proposal.archetype.toLowerCase()}` : "What Vera watches for you"}
            sub="Based on what you sell. Turn off anything you'd never open a conversation with — Vera won't show it anywhere."
          >
            {proposalLoading ? (
              <div className="overflow-hidden rounded-xl border border-border-default">
                <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3 text-[13px] text-text-secondary">
                  <Spinner className="h-3.5 w-3.5 text-accent" />
                  Researching your market…
                </div>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0">
                    <span className="h-5 w-9 shrink-0 animate-pulse rounded-full bg-border-default" />
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="h-3 w-40 animate-pulse rounded bg-border-default" style={{ animationDelay: `${i * 150}ms` }} />
                      <span className="h-2.5 w-4/5 animate-pulse rounded bg-border-subtle" style={{ animationDelay: `${i * 150}ms` }} />
                    </span>
                  </div>
                ))}
              </div>
            ) : proposal && proposal.signals.length > 0 ? (
              <div className="flex flex-col gap-4">
                <div className="max-h-[320px] overflow-y-auto rounded-xl border border-border-default">
                  {proposal.signals.map((s, i) => {
                    const on = signalEnabled[s.type] ?? s.on;
                    return (
                      <motion.button
                        key={s.type}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: Math.min(i * 0.06, 0.6), ease: "easeOut" }}
                        type="button"
                        onClick={() => setSignalEnabled((p) => ({ ...p, [s.type]: !on }))}
                        className="flex w-full items-center gap-3 border-b border-border-subtle px-4 py-2.5 text-left last:border-b-0 hover:bg-bg-elevated/60"
                      >
                        <span
                          className={cn(
                            "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                            on ? "bg-accent" : "bg-border-strong",
                          )}
                        >
                          <span
                            className={cn(
                              "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                              on ? "left-[18px]" : "left-0.5",
                            )}
                          />
                        </span>
                        <span className="min-w-0">
                          <span className={cn("block text-[13.5px] font-medium", on ? "text-text-primary" : "text-text-muted")}>
                            {s.label}
                          </span>
                          <span className="block text-[12.5px] text-text-secondary">{s.reason}</span>
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
                {proposal.hiring_roles.length > 0 && (
                  <Field label="Security roles that matter most to you">
                    <div className="flex flex-wrap gap-2">
                      {proposal.hiring_roles.map((r) => (
                        <Chip key={r} label={r} selected={hiringRoles.includes(r)}
                          onClick={() => setHiringRoles((p) => toggle(p, r))} />
                      ))}
                    </div>
                  </Field>
                )}
                {proposal.funding_event_types.length > 0 && (
                  <Field label="Funding events that count as budget">
                    <div className="flex flex-wrap gap-2">
                      {proposal.funding_event_types.map((t) => (
                        <Chip key={t} label={t.charAt(0).toUpperCase() + t.slice(1)} selected={fundingEvents.includes(t)}
                          onClick={() => setFundingEvents((p) => toggle(p, t))} />
                      ))}
                    </div>
                  </Field>
                )}
              </div>
            ) : (
              <p className="py-4 text-[13px] text-text-secondary">
                Vera will start with its standard signal set — tune it any time in Settings.
              </p>
            )}
          </Section>
        )}

        {/* Step 5 — deal size. Finishing here submits: the answers become
            the live setup, adjustable later in Settings. */}
        {step === 4 && (
          <Section title="What's your average deal size?" sub="Helps Vera qualify accounts. Finishing makes this your live setup — you can change anything later in Settings.">
            <Field label="Average deal size">
              <div className="flex flex-wrap gap-2">
                {DEAL_BANDS.map((t) => (
                  <Chip key={t} label={t} selected={a.deal_band === t}
                    onClick={() => set("deal_band", t)} />
                ))}
              </div>
            </Field>
          </Section>
        )}
      </div>

      {error && <p className="mt-4 text-[13px] text-red-500">{error}</p>}

      {/* Nav */}
      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || submitting}
          className="text-[13px] text-text-muted transition-colors hover:text-text-primary disabled:opacity-0"
        >
          ← Back
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => {
              if (!canAdvance()) return;
              if (step === 2) void loadProposal();
              setStep((s) => s + 1);
            }}
            disabled={!canAdvance()}
            className="rounded-lg bg-gradient-brand px-6 py-2.5 text-[14px] font-medium text-bg-base transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-brand px-6 py-2.5 text-[14px] font-medium text-bg-base transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? <><Spinner /> Setting up…</> : "Finish setup →"}
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-[22px] font-semibold tracking-tight text-text-primary">{title}</h1>
      <p className="mt-1.5 text-[14px] text-text-secondary">{sub}</p>
      <div className="mt-7 space-y-6">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-[13.5px] font-medium text-text-primary">{label}</span>
        {hint && <span className="text-[12px] text-text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

