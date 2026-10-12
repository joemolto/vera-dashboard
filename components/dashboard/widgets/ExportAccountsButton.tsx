"use client";

/**
 * ExportAccountsButton — downloads the org's active accounts as an
 * ABM-ready CSV: the target-account list + intelligence + buying
 * committee, for upload to an ad platform (LinkedIn Matched Audiences,
 * 6sense, etc.) or CRM. Calls /accounts/export and builds the CSV
 * client-side so there's no server file handling.
 */

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { claraApi } from "@/lib/dashboard/claraApi";

type Row = Record<string, unknown>;

// Column order chosen for an ABM marketer reading the file: who, where,
// how hot, the committee, then the narrative.
const COLUMNS: { key: string; label: string }[] = [
  { key: "company", label: "Company" },
  { key: "domain", label: "Domain" },
  { key: "industry", label: "Industry" },
  { key: "employees", label: "Employees" },
  { key: "country", label: "Country" },
  { key: "profile_score", label: "Profile score" },
  { key: "risk", label: "Risk" },
  { key: "posture", label: "Posture" },
  { key: "maturity", label: "Maturity" },
  { key: "commercial", label: "Commercial" },
  { key: "peer_percentile", label: "Peer percentile" },
  { key: "num_contacts", label: "Contacts found" },
  { key: "buying_committee", label: "Key contacts" },
  { key: "why_this_matters", label: "Why this matters" },
];

function esc(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Row[]): string {
  const header = COLUMNS.map((c) => c.label).join(",");
  const body = rows.map((r) => COLUMNS.map((c) => esc(r[c.key])).join(","));
  return [header, ...body].join("\n");
}

export function ExportAccountsButton({ orgId }: { orgId: string }) {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = (await claraApi("/accounts/export", {
        method: "POST",
        body: JSON.stringify({ org_id: orgId }),
      })) as { accounts?: Row[] };
      const rows = res.accounts || [];
      if (rows.length === 0) return;
      const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vera-accounts-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Best-effort; a toast could be added if this proves flaky.
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      title="Export your accounts + key contacts as CSV"
      className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-card px-3 py-1.5 text-[12.5px] font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
      Export
    </button>
  );
}
