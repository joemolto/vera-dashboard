"use client";

/**
 * Connected apps — the push destinations an org has live. Shown to
 * EVERY org (rollout 2026-08-03): the card is where connections are
 * made, and push buttons elsewhere only appear once something is
 * connected. Demo mode stays behind features.hubspot_push (pilot).
 *
 * Each app row resolves in priority order:
 *   1. REAL connection (org_integrations row from the OAuth callback) —
 *      shows the account/portal label, disconnect deletes the row.
 *   2. reconnect_required — token/webhook was revoked; amber + Reconnect.
 *   3. DEMO connection (localStorage) — evaluation without credentials.
 *   4. Not connected — "Connect" starts the real OAuth flow
 *      (/api/integrations/<provider>/connect); a quiet "try demo mode"
 *      link keeps the demo walkthrough working before credentials exist.
 *
 * The OAuth callback redirects back here with ?connected= or ?error= —
 * surfaced as a one-line banner.
 */

import { useState, useSyncExternalStore } from "react";
import { Plug } from "lucide-react";
import { Card, SectionHeader } from "@/components/dashboard/primitives";
import { useOrg } from "@/components/dashboard/OrgContext";
import {
  useIntegrations,
  useDisconnectIntegration,
  useSetDailyBrief,
} from "@/lib/dashboard/integrations";
import {
  useIntegrationsDemo,
  type PushProvider,
} from "@/lib/dashboard/integrationsDemo";
import { SlackMark } from "@/components/dashboard/widgets/SendToButton";

function HubspotLogo() {
  const [failed, setFailed] = useState(false);
  if (failed)
    return <Plug size={18} strokeWidth={1.7} className="text-text-muted" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="https://icons.duckduckgo.com/ip3/hubspot.com.ico"
      alt=""
      width={22}
      height={22}
      onError={() => setFailed(true)}
      className="h-[22px] w-[22px] shrink-0 object-contain"
    />
  );
}

const APPS: {
  provider: PushProvider;
  name: string;
  description: string;
  connectClass: string;
}[] = [
  {
    provider: "hubspot",
    name: "HubSpot",
    description:
      "One-click push from any contact or account. Lands as a CRM record with the company and a note carrying Vera's signal context, matched by email/domain so nothing duplicates.",
    connectClass: "bg-[#ff7a59] text-white transition-opacity hover:opacity-90",
  },
  {
    provider: "slack",
    name: "Slack",
    description:
      "Send any contact or account to a channel as a card — the who, the company and the why-now signals, where the team can see it.",
    connectClass: "bg-[#4A154B] text-white transition-opacity hover:opacity-90",
  },
];

const ERROR_COPY: Record<string, string> = {
  not_configured: "App credentials aren't configured yet — connect is disabled until they are.",
  bad_state: "The connect flow expired — try again.",
  exchange_failed: "The app rejected the connection — try again.",
  store_failed: "Connected, but saving failed — try again.",
  cancelled: "Connection cancelled.",
  unauthorized: "You need to be signed in to connect.",
  no_org: "Your user isn't attached to a workspace.",
};

const _noSubscribe = () => () => {};

function useCallbackBanner(): { kind: "ok" | "error"; text: string } | null {
  // Read once on the client; server snapshot is empty so hydration is
  // stable (string snapshots compare by value).
  const search = useSyncExternalStore(
    _noSubscribe,
    () => window.location.search,
    () => "",
  );
  const params = new URLSearchParams(search);
  const connected = params.get("connected");
  const error = params.get("error");
  if (connected) {
    return {
      kind: "ok",
      text: `${connected === "hubspot" ? "HubSpot" : "Slack"} connected.`,
    };
  }
  if (error) {
    return { kind: "error", text: ERROR_COPY[error] ?? "Connection failed — try again." };
  }
  return null;
}

export function ConnectedAppsCard() {
  const { orgId, features } = useOrg();
  const demo = useIntegrationsDemo(orgId);
  const { data: realRows } = useIntegrations();
  const disconnectReal = useDisconnectIntegration();
  const setDailyBrief = useSetDailyBrief();
  const banner = useCallbackBanner();

  const demoAllowed = !!features.hubspot_push;

  const realFor = (p: PushProvider) =>
    (realRows ?? []).find((r) => r.provider === p) ?? null;

  return (
    <div className="mt-6">
      <Card delay={0.22} className="overflow-hidden">
        <div className="border-b border-border-subtle p-6 md:p-7">
          <SectionHeader
            title="Connected apps"
            subtitle="Vera pushes contacts, companies and their signal context into the tools your team already works in. Connect an app and a push action appears on every prospect and account."
          />
          {banner ? (
            <p
              className={`mt-2 text-[12px] ${banner.kind === "ok" ? "text-emerald-600" : "text-amber-500"}`}
            >
              {banner.text}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col divide-y divide-border-subtle">
          {APPS.map((app) => {
            const real = realFor(app.provider);
            const demoConn = demo.connections[app.provider];
            const isRealConnected = real?.status === "connected";
            const needsReconnect = real?.status === "reconnect_required";
            const isDemoConnected = demoAllowed && !real && !!demoConn;

            return (
              <div key={app.provider} className="flex items-start gap-4 p-6 md:px-7">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white ring-1 ring-border-subtle">
                  {app.provider === "slack" ? <SlackMark size={20} /> : <HubspotLogo />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-[14.5px] font-semibold text-text-primary">
                      {app.name}
                    </h3>
                    {isRealConnected ? (
                      // Portal identity stays in the hover title — the
                      // auto-generated hub domains are too ugly to print.
                      <span
                        title={real?.account_label ?? undefined}
                        className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10.5px] font-medium text-emerald-600"
                      >
                        <span className="h-1 w-1 rounded-full bg-emerald-500" aria-hidden />
                        Connected
                      </span>
                    ) : needsReconnect ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10.5px] font-medium text-amber-600">
                        Reconnect needed
                      </span>
                    ) : isDemoConnected ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10.5px] font-medium text-emerald-600">
                        <span className="h-1 w-1 rounded-full bg-emerald-500" aria-hidden />
                        Connected · demo
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">
                    {app.description}
                  </p>
                  {isRealConnected && app.provider === "slack" && real?.channel ? (
                    <p className="mt-2 text-[12px] text-text-muted">
                      Posts to <span className="font-medium text-text-primary">{real.channel}</span>
                      {" "}· to change channel, reconnect.
                    </p>
                  ) : null}
                  {isRealConnected && app.provider === "slack" && real ? (
                    <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-[12px] text-text-secondary">
                      <input
                        type="checkbox"
                        checked={(real.meta?.daily_brief as boolean | undefined) !== false}
                        disabled={setDailyBrief.isPending}
                        onChange={(e) =>
                          setDailyBrief.mutate({ row: real, enabled: e.target.checked })
                        }
                        className="h-3.5 w-3.5 accent-[var(--accent,#7c3aed)]"
                      />
                      Daily brief in this channel
                    </label>
                  ) : null}
                  {isDemoConnected && app.provider === "slack" ? (
                    <label className="mt-2.5 flex items-center gap-2 text-[12px] text-text-muted">
                      Posts to
                      <input
                        type="text"
                        value={demo.connections.slack?.channel ?? ""}
                        onChange={(e) => demo.setChannel(e.target.value)}
                        className="w-44 rounded-md border border-border-default bg-bg-card px-2 py-1 font-medium text-text-primary outline-none transition-colors focus:border-accent"
                        aria-label="Slack channel"
                      />
                    </label>
                  ) : null}
                  {isDemoConnected ? (
                    <p className="mt-2 text-[11px] text-text-muted">
                      Demo connection — nothing leaves Vera.
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {isRealConnected ? (
                    <button
                      type="button"
                      disabled={disconnectReal.isPending}
                      onClick={() => disconnectReal.mutate(app.provider)}
                      className="rounded-lg border border-border-default px-3 py-1.5 text-[12px] font-medium text-text-secondary transition-colors hover:bg-bg-elevated disabled:opacity-50"
                    >
                      Disconnect
                    </button>
                  ) : needsReconnect ? (
                    <a
                      href={`/api/integrations/${app.provider}/connect`}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12px] font-medium ${app.connectClass}`}
                    >
                      <Plug size={12} strokeWidth={1.9} />
                      Reconnect
                    </a>
                  ) : isDemoConnected ? (
                    <button
                      type="button"
                      onClick={() => demo.disconnect(app.provider)}
                      className="rounded-lg border border-border-default px-3 py-1.5 text-[12px] font-medium text-text-secondary transition-colors hover:bg-bg-elevated"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <>
                      <a
                        href={`/api/integrations/${app.provider}/connect`}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12px] font-medium ${app.connectClass}`}
                      >
                        <Plug size={12} strokeWidth={1.9} />
                        Connect
                      </a>
                      {demoAllowed ? (
                        <button
                          type="button"
                          onClick={() => demo.connect(app.provider)}
                          className="text-[11px] text-text-muted underline-offset-4 transition-colors hover:text-text-secondary hover:underline"
                        >
                          try demo mode
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
