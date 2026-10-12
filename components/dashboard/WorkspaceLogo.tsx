"use client";

/**
 * WorkspaceLogo — the customer's own logo, shown as a circular app-icon in the
 * sidebar (and anywhere else we want their brand). Source chain:
 *   1. custom uploaded logo (Settings override)
 *   2. logo.dev by domain (crisp real logos; publishable token, safe client-side)
 *   3. initials in a gradient circle (never a broken image)
 */

import { useMemo, useState } from "react";
import { logoUrl } from "@/lib/logoUrl";

function initialsOf(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function logoDevUrl(domain: string): string {
  return logoUrl(domain, 256);
}

export function WorkspaceLogo({
  name,
  domain,
  logoUrl,
  size = 36,
  className = "",
}: {
  name: string;
  domain?: string | null;
  logoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const sources = useMemo(() => {
    const s: string[] = [];
    if (logoUrl) s.push(logoUrl);
    if (domain) s.push(logoDevUrl(domain));
    return s;
  }, [logoUrl, domain]);

  const [idx, setIdx] = useState(0);
  const src = sources[idx];

  if (!src) {
    return (
      <span
        className={`grid shrink-0 place-items-center rounded-full bg-gradient-brand font-semibold text-white ${className}`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
        title={name}
        aria-label={name}
      >
        {initialsOf(name)}
      </span>
    );
  }

  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full border border-border-default bg-white ${className}`}
      style={{ width: size, height: size }}
      title={name}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={src}
        src={src}
        alt={name}
        width={size}
        height={size}
        className="h-full w-full object-cover"
        onError={() => setIdx((i) => i + 1)}
      />
    </span>
  );
}
