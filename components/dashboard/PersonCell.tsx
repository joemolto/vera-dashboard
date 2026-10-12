"use client";

/**
 * Shared contact rendering — every contact surface shows a photo, full name and
 * job title. Photo comes from the free Apollo people-search
 * we already store on leads.photo_url; falls back to the initial when the image
 * is missing or hotlink-blocked. Reuse this so contacts look consistent
 * everywhere (Groups, pickers, lists).
 */

import { useState } from "react";
import { proxiedAvatar } from "@/lib/dashboard/labels";
import { logoUrl } from "@/lib/logoUrl";

export function PersonAvatar({
  photo,
  name,
  size = 36,
}: {
  photo?: string | null;
  name: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  const src = proxiedAvatar(photo ?? null);
  const style = { width: `${size}px`, height: `${size}px` };
  if (!src || failed) {
    return (
      <div
        style={style}
        className="grid shrink-0 place-items-center rounded-full bg-bg-elevated text-[12px] font-medium text-text-primary"
      >
        {initial}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      onError={() => setFailed(true)}
      style={style}
      className="shrink-0 rounded-full object-cover ring-1 ring-border-subtle"
    />
  );
}

/** Photo + full name + title @ company. */
export function PersonCell({
  photo,
  name,
  title,
  company,
}: {
  photo?: string | null;
  name: string;
  title?: string | null;
  company?: string | null;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <PersonAvatar photo={photo} name={name} />
      <div className="min-w-0">
        <div className="truncate text-[14px] font-medium text-text-primary">{name}</div>
        {title && (
          <div className="truncate text-[12.5px] text-text-secondary">{title}</div>
        )}
        {company && (
          <div className="truncate text-[11.5px] text-text-muted">@ {company}</div>
        )}
      </div>
    </div>
  );
}

/** Account row: favicon (by domain) + name + domain, favicon falls back to an
 *  initial tile so rows stay aligned. */
export function CompanyCell({
  domain,
  name,
}: {
  domain: string | null;
  name: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-3">
      {failed || !domain ? (
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border-subtle bg-bg-elevated text-[12px] font-medium uppercase text-text-secondary">
          {(name || domain || "?").charAt(0)}
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl(domain, 128)}
          alt=""
          onError={() => setFailed(true)}
          className="h-9 w-9 shrink-0 rounded-lg border border-border-subtle bg-white object-contain p-1"
        />
      )}
      <div className="min-w-0">
        <div className="truncate text-[14px] font-medium text-text-primary">{name}</div>
        {domain && <div className="truncate text-[12px] text-text-muted">{domain}</div>}
      </div>
    </div>
  );
}
