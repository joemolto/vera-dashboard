"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, Upload } from "lucide-react";
import { Card, SectionHeader } from "@/components/dashboard/primitives";
import { useOrg } from "@/components/dashboard/OrgContext";
import { WorkspaceLogo } from "@/components/dashboard/WorkspaceLogo";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

async function authToken(): Promise<string | undefined> {
  const sb = createSupabaseBrowserClient();
  const { data } = await sb.auth.getSession();
  return data.session?.access_token;
}

export function WorkspaceLogoCard() {
  const { orgName, domain, logoUrl } = useOrg();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Local override so the preview updates instantly, before router.refresh lands.
  const [preview, setPreview] = useState<string | null | undefined>(undefined);
  const effectiveLogo = preview !== undefined ? preview : logoUrl;

  async function upload(file: File) {
    setErr(null);
    setBusy(true);
    try {
      const token = await authToken();
      const fd = new FormData();
      fd.append("file", file);
      const resp = await fetch("/api/settings/logo", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Upload failed");
      setPreview(data.logo_url);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeCustom() {
    setErr(null);
    setBusy(true);
    try {
      const token = await authToken();
      const resp = await fetch("/api/settings/logo", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Failed");
      setPreview(null);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6 md:p-7">
      <SectionHeader title="Workspace logo" />
      <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">
        Shown in the top-left of your dashboard. Vera pulls it from your website
        automatically — upload your own if you&apos;d prefer a different one.
      </p>
      <div className="mt-5 flex items-center gap-4">
        <WorkspaceLogo
          name={orgName || "Vera"}
          domain={domain}
          logoUrl={effectiveLogo}
          size={56}
        />
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-brand px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} strokeWidth={1.9} />}
            {effectiveLogo ? "Replace logo" : "Upload logo"}
          </button>
          {effectiveLogo && (
            <button
              type="button"
              disabled={busy}
              onClick={removeCustom}
              className="inline-flex items-center gap-2 rounded-lg border border-border-default px-4 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-bg-elevated disabled:opacity-50"
            >
              <Trash2 size={14} strokeWidth={1.9} /> Use auto logo
            </button>
          )}
        </div>
      </div>
      {err && <p className="mt-3 text-[12.5px] text-rose-500">{err}</p>}
      <p className="mt-3 text-[12px] text-text-muted">PNG, JPG, SVG or WEBP, up to 2 MB.</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
    </Card>
  );
}
