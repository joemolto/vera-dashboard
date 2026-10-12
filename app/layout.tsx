import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import Script from "next/script";
import "./globals.css";

// Geist — crisp geometric sans, used for both display and body so the
// app reads consistently (replaces the old Inter/DM Sans split).
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
});

// Public URL of this deployment, used for absolute URLs in metadata.
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Vera: sales intelligence for cybersecurity teams",
    template: "%s · Vera",
  },
  description:
    "Sales intelligence for cybersecurity teams. Vera watches your accounts and the people in them, and tells you when something changes that's worth a conversation.",
  openGraph: {
    title: "Vera: sales intelligence for cybersecurity teams",
    description:
      "Vera researches your prospects so your team can focus on conversations, not spreadsheets.",
    url: appUrl,
    siteName: "Vera",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vera: sales intelligence for cybersecurity teams",
    description: "Sales intelligence for cybersecurity teams.",
  },
};

// Inline boot script — sets `dark` class before paint, no FOUC.
// Light is the default since the 2026-07 rebrand (this app is the
// dashboard + auth chrome). Dark applies only where a user explicitly chose it via
// the Settings toggle.
const themeBootScript = `
try {
  if (localStorage.getItem('theme') === 'dark') {
    document.documentElement.classList.add('dark');
  }
} catch (_) {}
`;

// Sentry browser error tracking (Phase 0, 2026-07-07). Deliberately the
// CDN bundle rather than @sentry/nextjs: Next 16 + Turbopack build wrapping
// is risky and client runtime errors are what the audit flagged as
// invisible. Inert until NEXT_PUBLIC_SENTRY_DSN is set in the environment.
const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

// PostHog product analytics (Phase 0, 2026-07-07). Official JS snippet,
// env-gated: inert until NEXT_PUBLIC_POSTHOG_KEY is set in the environment.
// EU cloud host (GDPR). V1 = pageviews + autocapture; custom events can
// call window.posthog.capture() from any component with no new imports.
const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: themeBootScript }}
        />
      </head>
      <body className="min-h-screen bg-bg-base text-text-primary antialiased">
        {children}
        <Analytics />
        {sentryDsn && (
          <>
            <Script
              src="https://browser.sentry-cdn.com/8.55.0/bundle.min.js"
              strategy="afterInteractive"
              crossOrigin="anonymous"
            />
            <Script
              id="sentry-init"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                // Layout is a Server Component so no onLoad handlers —
                // poll for the CDN global instead (bounded to ~10s).
                __html: `(function(){var n=0;(function w(){if(window.Sentry){window.Sentry.init({dsn:${JSON.stringify(
                  sentryDsn,
                )},environment:"production",sampleRate:1});}else if(n++<50){setTimeout(w,200);}})();})();`,
              }}
            />
          </>
        )}
        {posthogKey && (
          <Script
            id="posthog-init"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              // Official PostHog loader snippet (loads the SDK from the
              // EU host, then inits). window.posthog becomes available
              // for custom capture() calls anywhere in the app.
              __html: `!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);posthog.init(${JSON.stringify(
                posthogKey,
              )},{api_host:${JSON.stringify(posthogHost)},person_profiles:"identified_only"});`,
            }}
          />
        )}
      </body>
    </html>
  );
}
