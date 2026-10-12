"use client";

import { PageHeader, PageShell } from "@/components/dashboard/primitives";
import { ApiKeysCard } from "@/components/dashboard/widgets/ApiKeysCard";
import { ConnectedAppsCard } from "@/components/dashboard/widgets/ConnectedAppsCard";
import { McpKeysCard } from "@/components/dashboard/widgets/McpKeysCard";
import { WebhooksCard } from "@/components/dashboard/widgets/WebhooksCard";

// Integrations = the three developer surfaces (webhooks, API keys, MCP),
// moved here from Settings (2026-07-14). Shown to EVERY org, Starter
// included — API/webhooks/MCP ship on every paid plan (a Starter test
// signup used to hit an upgrade wall here). No
// client-side plan gate: the cards defer to the engine's tier_allowed
// flag, which is the single source of truth. Don't reintroduce one.
export default function IntegrationsPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Integrations"
        title="Plug Vera into your stack"
        subtitle="Signed webhooks push signals out as they land. The REST API and MCP server let your tools and agents pull live intelligence."
      />
      {/* HubSpot one-click push — renders only when features.hubspot_push
          is on (pilot, demo mode). First in the stack: it's the only
          card here a non-developer rep will ever use. Carries its own
          margin so the layout is unchanged for orgs without the flag. */}
      <ConnectedAppsCard />
      <div className="mt-6">
        <WebhooksCard />
      </div>
      <div className="mt-5">
        <ApiKeysCard />
      </div>
      <div className="mt-5">
        <McpKeysCard />
      </div>
    </PageShell>
  );
}
