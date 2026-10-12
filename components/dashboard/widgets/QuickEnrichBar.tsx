"use client";

import { EV, track } from "@/lib/analytics";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, AlertCircle } from "lucide-react";
import { useOrg } from "@/components/dashboard/OrgContext";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { pollLeadStatus, PollTimeoutError } from "@/lib/dashboard/pollLeadStatus";
import { useUsage } from "@/lib/dashboard/queries";
import { CapLimitModal } from "@/components/dashboard/widgets/CapLimitModal";
import { SELF_HOSTED } from "@/lib/selfHosted";

const QUICK_ENRICH_URL =
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/quick-enrich`;

// Classify what the user pasted. LinkedIn profile → person enrichment via
// quick-enrich. Anything else with a recognisable domain → company-only
// enrichment via the same edge function (engine dispatches on payload).
type ResearchInput =
  | { kind: "linkedin"; url: string }
  | { kind: "domain"; domain: string }
  | { kind: "invalid" };

function classifyInput(raw: string): ResearchInput {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "invalid" };

  // LinkedIn — require a /in/ slug so we don't try to enrich a company
  // page or a search URL as if it were a person.
  if (/linkedin\.com\/in\//i.test(trimmed)) {
    return { kind: "linkedin", url: trimmed };
  }

  // Strip protocol, leading www, trailing path/query so "https://www.
  // acme.com/about?x=1" → "acme.com". Accept bare domains too.
  const withoutProto = trimmed.replace(/^https?:\/\//i, "");
  const host = withoutProto.split("/")[0].replace(/^www\./i, "").toLowerCase();

  // Domain shape: at least one dot, TLD ≥ 2 chars, valid characters.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(host)) {
    return { kind: "domain", domain: host };
  }
  return { kind: "invalid" };
}

interface ResearchedLead {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
}

export function QuickEnrichBar({
  onEnrichStarted,
  onEnrichComplete,
  onEnrichError,
}: {
  onEnrichStarted?: (leadId: string | null) => void;
  onEnrichComplete?: (lead: ResearchedLead) => void;
  onEnrichError?: (message: string) => void;
}) {
  const router = useRouter();
  const { orgId, features } = useOrg();
  const isSolo = !!features.solo_plan;
  const { data: usage } = useUsage();
  // Solo orgs are capped by their Solo allowance (enforced on the research page
  // + server-side), NOT the credit-tier enrichment limit. Don't apply that
  // 100/mo gate to them — it was blocking Solo users below their real cap.
  const atLimit = !SELF_HOSTED && !isSolo && usage ? usage.remaining <= 0 : false;
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capMessage, setCapMessage] = useState<string | null>(null);

  async function handleResearch() {
    setError(null);
    if (!url.trim()) return;
    if (atLimit && usage) {
      const reset = new Date(usage.resets_on).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
      });
      setError(
        `Monthly enrichment limit reached (${usage.enrichments_limit}). Resets on ${reset}.`,
      );
      return;
    }

    const parsed = classifyInput(url);
    if (parsed.kind === "invalid") {
      setError("Paste a LinkedIn profile URL or a company website.");
      return;
    }
    track(EV.researchRun, { kind: parsed.kind });

    // quick-enrich requires the caller's session and verifies org
    // membership edge-side (it spends real credits).
    const {
      data: { session },
    } = await createSupabaseBrowserClient().auth.getSession();
    const authHeaders: Record<string, string> = session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {};

    // Company website → company-only enrichment via quick-enrich.
    // Engine dispatches on payload shape: { domain } triggers PL +
    // Apollo + Perplexity + tech_stack, upserts companies and adds to
    // watchlist. On success, route the rep into the populated account page.
    if (parsed.kind === "domain") {
      setLoading(true);
      // Show the same progress square as the LinkedIn path (no leadId — the
      // stages run on a timer; we navigate to the account page when done).
      onEnrichStarted?.(null);
      try {
        const response = await fetch(QUICK_ENRICH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ org_id: orgId, domain: parsed.domain }),
          signal: AbortSignal.timeout(180_000),
        });
        if (!response.ok) {
          const body = await response.text();
          throw new Error(body || `Request failed (${response.status})`);
        }
        setUrl("");
        router.push(`/dashboard/accounts/${encodeURIComponent(parsed.domain)}`);
      } catch (err) {
        const e = err as { message?: string };
        const msg = e?.message ?? "Couldn't research that company.";
        setError(msg);
        onEnrichError?.(msg);
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    setStatusMsg(
      "Researching this prospect — this usually takes about 60 seconds.",
    );
    onEnrichStarted?.(null);

    let leadId: string | null = null;

    try {
      const response = await fetch(QUICK_ENRICH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ org_id: orgId, linkedin_url: parsed.url }),
        signal: AbortSignal.timeout(120_000),
      });

      if (!response.ok) {
        const body = await response.text();
        // Self-hosted has no plan caps; a 429 there takes the normal error path.
        if (!SELF_HOSTED && response.status === 429) {
          // FastAPI nests structured errors under `detail`. Solo cap hits
          // come back as {error: "solo_limit_reached", message} → show the
          // centered cap card; other 429s (credit limit) stay inline.
          let detail: { error?: string; message?: string } = {};
          try {
            const parsed = JSON.parse(body);
            detail = parsed?.detail ?? parsed ?? {};
          } catch {
            // ignore
          }
          const msg = detail.message ?? "You've reached a plan limit.";
          if (detail.error === "solo_limit_reached") {
            setCapMessage(msg);
          } else {
            setError(msg);
          }
          return;
        }
        throw new Error(body || `Request failed (${response.status})`);
      }

      const data = await response.json();
      const lead = data?.lead ?? data;
      leadId = data?.lead_id ?? lead?.id ?? null;
      if (leadId) onEnrichStarted?.(leadId);
      setUrl("");
      onEnrichComplete?.({ ...lead, id: leadId ?? lead?.id });
      return;
    } catch (err) {
      const e = err as { name?: string; message?: string };
      const isTimeout =
        e?.name === "AbortError" ||
        e?.name === "TimeoutError" ||
        e?.message?.includes("timed out");
      if (!isTimeout) {
        setError(e?.message ?? "Something went wrong.");
        return;
      }
      setStatusMsg("Still researching in the background…");

      try {
        const supabase = createSupabaseBrowserClient();
        const slug = url.trim().replace(/\/$/, "").split("/").pop();
        const { data: leads } = await supabase
          .from("leads")
          .select("id")
          .eq("org_id", orgId)
          .ilike("linkedin_url", `%${slug ?? ""}%`)
          .order("created_at", { ascending: false })
          .limit(1);
        leadId = leads?.[0]?.id ?? null;
        if (leadId) onEnrichStarted?.(leadId);
      } catch {
        // ignore
      }

      if (!leadId) {
        setStatusMsg("Research is taking longer than usual. Check back shortly.");
        return;
      }
    } finally {
      if (!leadId) setLoading(false);
    }

    try {
      setStatusMsg("Finishing up research… almost there");
      const lead = (await pollLeadStatus(leadId)) as unknown as ResearchedLead;
      setUrl("");
      onEnrichComplete?.(lead);
    } catch (pollErr) {
      if (pollErr instanceof PollTimeoutError) {
        setStatusMsg("Research is taking longer than usual. Check back shortly.");
      } else {
        setError("Research failed. Try again.");
      }
    } finally {
      setLoading(false);
      setStatusMsg(null);
    }
  }

  return (
    <div className="rounded-2xl border border-border-default bg-bg-card p-3 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.4)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search
            size={15}
            strokeWidth={1.7}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) handleResearch();
            }}
            placeholder="LinkedIn profile URL or company website (e.g. acme.com)"
            disabled={loading}
            className="w-full rounded-xl border border-border-subtle bg-bg-elevated/60 py-3 pl-10 pr-4 text-[14px] text-text-primary placeholder:text-text-muted/70 outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-60"
          />
        </div>
        <button
          type="button"
          onClick={handleResearch}
          disabled={loading || !url.trim() || atLimit}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-text-primary px-6 py-3 text-[13.5px] font-medium tracking-tight text-bg-base transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading && <Loader2 size={14} className="animate-spin" />}
          {loading ? "Researching" : "Research"}
        </button>
      </div>
      {statusMsg && (
        <p className="mt-3 px-2 font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
          {statusMsg}
        </p>
      )}
      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-400">
          <AlertCircle size={13} strokeWidth={1.7} />
          {error}
        </div>
      )}
      {capMessage && (
        <CapLimitModal message={capMessage} onClose={() => setCapMessage(null)} />
      )}
    </div>
  );
}
