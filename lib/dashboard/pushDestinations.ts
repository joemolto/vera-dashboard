"use client";

/**
 * Push destinations — the ONE hook the send-to UI talks to.
 *
 * Merges two sources per provider, real winning over demo:
 * - REAL: org_integrations rows (OAuth'd HubSpot / Slack) via
 *   useIntegrations(); pushes go through the engine
 *   (POST /integrations/push via clara-api, which validates org
 *   membership; the engine validates entity ownership).
 * - DEMO: the pilot localStorage store (integrationsDemo.ts) so the
 *   demo account keeps working with no credentials configured.
 *
 * Real pushes are also recorded in the local store so the "In HubSpot /
 * Sent" chips work identically in both modes. (Per-browser state is a
 * known v1 limit — the durable record is the note in the CRM itself.)
 *
 * Still gated by the UI on features.hubspot_push (pilot). Rollout
 * plan: swap that gate to "has a connected destination" so buttons only
 * ever appear for orgs that connected an app.
 */

import { useCallback } from "react";
import { useOrg } from "@/components/dashboard/OrgContext";
import { claraApi } from "@/lib/dashboard/claraApi";
import { useIntegrations } from "@/lib/dashboard/integrations";
import {
  useIntegrationsDemo,
  PROVIDER_ORDER,
  type PushProvider,
} from "@/lib/dashboard/integrationsDemo";

export type { PushProvider };

export type PushEntity = "contact" | "company";

export function pushKey(entity: PushEntity, id: string): string {
  return entity === "company" ? `company:${id}` : id;
}

export interface PushResult {
  ok: boolean;
  record_url?: string | null;
}

export function usePushDestinations() {
  const { orgId } = useOrg();
  const demo = useIntegrationsDemo(orgId);
  const { data: realRows } = useIntegrations();

  const real = new Map(
    (realRows ?? [])
      .filter((r) => (PROVIDER_ORDER as string[]).includes(r.provider))
      .map((r) => [r.provider as PushProvider, r]),
  );

  const isReal = (p: PushProvider) => real.get(p)?.status === "connected";
  const needsReconnect = (p: PushProvider) =>
    real.get(p)?.status === "reconnect_required";

  // Connected = real connection, or demo connection where no real row
  // exists for that provider. CRM-first order preserved.
  const connectedProviders = PROVIDER_ORDER.filter(
    (p) => isReal(p) || (!real.has(p) && !!demo.connections[p]),
  );

  const slackChannel =
    real.get("slack")?.channel ?? demo.connections.slack?.channel ?? null;

  const push = useCallback(
    async (
      provider: PushProvider,
      entity: PushEntity,
      id: string,
    ): Promise<PushResult> => {
      const key = pushKey(entity, id);
      if (real.get(provider)?.status === "connected") {
        const resp = await claraApi<PushResult>("/integrations/push", {
          method: "POST",
          body: JSON.stringify({
            org_id: orgId,
            provider,
            entity_type: entity,
            entity_id: id,
          }),
        });
        demo.recordPush(provider, key, resp.record_url);
        return resp;
      }
      await demo.push(provider, key);
      return { ok: true };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orgId, realRows, demo.recordPush, demo.push],
  );

  return {
    connectedProviders,
    slackChannel,
    isReal,
    needsReconnect,
    push,
    pushedAt: demo.pushedAt,
    recordUrl: demo.recordUrl,
    /** Demo-mode controls (ConnectedAppsCard). */
    demo,
  };
}
