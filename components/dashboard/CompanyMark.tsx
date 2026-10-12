"use client";

/**
 * CompanyMark — a small company logo (crisp logo.dev) shown beside a company
 * name in tables/headers, with the company initial as a fallback so it's never
 * a broken image.
 */

import { useState } from "react";
import { logoUrl } from "@/lib/logoUrl";

export function CompanyMark({
  domain,
  name,
  size = 20,
}: {
  domain?: string | null;
  name?: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const initial = (name || domain || "?").trim().charAt(0).toUpperCase();
  const radius = size <= 22 ? "rounded" : "rounded-md";

  if (failed || !domain) {
    return (
      <span
        className={`grid shrink-0 place-items-center ${radius} bg-bg-elevated font-semibold text-text-secondary`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
        aria-hidden
      >
        {initial}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl(domain, 64)}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={`shrink-0 ${radius} border border-border-subtle bg-white object-contain`}
      style={{ width: size, height: size }}
    />
  );
}
