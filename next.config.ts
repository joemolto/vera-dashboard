import type { NextConfig } from "next";

// ---------------------------------------------------------------------------
// Content-Security-Policy — allow-list every domain the browser actually
// loads from. Goal: tighten security headers without
// breaking the UI. If something stops loading after deploy, check the
// browser console for "Refused to load…" — the domain needs adding to
// the relevant directive below.
//
// `unsafe-inline` / `unsafe-eval` are accepted on script-src and style-src
// because Next.js, Tailwind, and a few libraries (Framer Motion, React
// Markdown) ship inline scripts/styles. Stricter is possible via
// middleware-injected nonces but adds complexity for marginal extra
// protection on a B2B SaaS dashboard. Re-evaluate when we add public
// user-generated content surfaces (we don't have any yet).
// ---------------------------------------------------------------------------
// This install's own Supabase origin (custom domain, self-hosted Supabase or
// the local CLI); *.supabase.co below covers Supabase cloud projects.
let supabaseOrigin = "";
try {
  supabaseOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
} catch {}
const supabaseWs = supabaseOrigin.replace(/^http/, "ws");

// Optional monitoring (app/layout.tsx): allow Sentry / PostHog only when set.
const monitoringScript: string[] = [];
const monitoringConnect: string[] = [];
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  monitoringScript.push("https://browser.sentry-cdn.com");
  try {
    monitoringConnect.push(new URL(process.env.NEXT_PUBLIC_SENTRY_DSN).origin);
  } catch {}
}
if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";
  const assets = host.replace(".i.posthog.com", "-assets.i.posthog.com");
  monitoringScript.push(assets);
  monitoringConnect.push(host, assets);
}

const cspDirectives = [
  "default-src 'self'",
  // Scripts: own + Vercel Analytics + Vercel preview toolbar.
  // unsafe-inline for the theme-boot script in app/layout.tsx; unsafe-eval
  // for some Next.js framework code paths.
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com https://vercel.live ${monitoringScript.join(" ")}`,
  // Styles: own + Google Fonts CSS. unsafe-inline for styled-jsx /
  // Framer Motion / Tailwind arbitrary classes.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // Images: own + data:/blob: for inline SVG and dynamic icons + the
  // external domains we actually render images from.
  `img-src 'self' data: blob: https://img.logo.dev https://icons.duckduckgo.com https://www.google.com https://*.supabase.co ${supabaseOrigin}`,
  // Fonts: own + Google Fonts files + data: for some font fallbacks.
  "font-src 'self' data: https://fonts.gstatic.com",
  // Connect: Supabase REST + realtime (wss) + Vercel telemetry.
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co ${supabaseOrigin} ${supabaseWs} https://vitals.vercel-insights.com https://va.vercel-scripts.com https://vercel.live ${monitoringConnect.join(" ")}`,
  // Frames: only what we genuinely embed (Vercel preview toolbar). Block
  // everything else.
  "frame-src 'self' https://vercel.live",
  // Block iframing of OUR site by anyone else (clickjacking defence).
  // Modern equivalent of X-Frame-Options DENY.
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Web Workers (Next.js uses these for some background tasks).
  "worker-src 'self' blob:",
  // Block plugins like Flash entirely.
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  {
    // Force HTTPS for two years on this domain and all subdomains;
    // preload-eligible if we ever submit to hstspreload.org.
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    // Stop browsers MIME-sniffing files into a different type than
    // declared (e.g. .txt being treated as JS).
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // Block being iframed by other sites (clickjacking). CSP's
    // frame-ancestors directive is the modern equivalent but
    // X-Frame-Options is still honoured by older browsers.
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // Only send full URL as Referer when navigating within the same
    // origin; send just origin (no path) cross-site over HTTPS; send
    // nothing on HTTPS→HTTP downgrade.
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // Tighten which browser features the site can use. Nothing on Vera
    // uses these — disable them all so a future bug or third-party
    // injection can't either.
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), accelerometer=(), gyroscope=(), interest-cohort=()",
  },
  {
    key: "Content-Security-Policy",
    value: cspDirectives,
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  async redirects() {
    return [
      // No public site: the root opens the dashboard, and the auth proxy
      // sends signed-out visitors on to /login.
      { source: "/", destination: "/dashboard", permanent: false },
    ];
  },
};

export default nextConfig;
