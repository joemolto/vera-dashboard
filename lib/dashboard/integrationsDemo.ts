"use client";

/**
 * Multi-destination push — demo-mode state (pilot, 2026-08-02).
 *
 * "Meet people where they work": Vera pushes contacts/companies into the
 * apps an org has connected (HubSpot record, Slack card, more later).
 * This is the UX-first demo build — connections + pushes live in
 * localStorage per org/browser, nothing leaves Vera. The real build
 * swaps these internals for engine OAuth + push endpoints behind the
 * same hook; the consuming components shouldn't change.
 *
 * Supersedes hubspotDemo.ts (single-destination); old HubSpot demo
 * state is migrated on first read so an existing demo doesn't reset.
 *
 * Gated on `features.hubspot_push` — this module is
 * org-agnostic, the flag flips the switch.
 */

import { useCallback, useSyncExternalStore } from "react";

export type PushProvider = "hubspot" | "slack";

/** Ordered: the CRM is always the primary (one-click) destination. */
export const PROVIDER_ORDER: PushProvider[] = ["hubspot", "slack"];

interface Connection {
  connectedAt: string;
  /** Slack only — the channel cards get posted to. */
  channel?: string;
}

interface DemoState {
  connections: Partial<Record<PushProvider, Connection>>;
  /** `${provider}|${entityKey}` → ISO timestamp of the last push. */
  pushes: Record<string, string>;
  /** `${provider}|${entityKey}` → deep link to the pushed record
   * (real HubSpot pushes return one; demo pushes have none). */
  recordUrls?: Record<string, string>;
}

const EMPTY: DemoState = { connections: {}, pushes: {}, recordUrls: {} };

const storageKey = (orgId: string) => `vera_push_demo_${orgId}`;
const legacyKey = (orgId: string) => `vera_hubspot_demo_${orgId}`;

const cache = new Map<string, DemoState>();
const listeners = new Set<() => void>();

function read(orgId: string): DemoState {
  const hit = cache.get(orgId);
  if (hit) return hit;
  let state = EMPTY;
  try {
    const raw = window.localStorage.getItem(storageKey(orgId));
    if (raw) {
      state = { ...EMPTY, ...(JSON.parse(raw) as DemoState) };
    } else {
      // Migrate the single-destination HubSpot demo state, if present.
      const legacy = window.localStorage.getItem(legacyKey(orgId));
      if (legacy) {
        const old = JSON.parse(legacy) as {
          connected?: boolean;
          pushed?: Record<string, string>;
        };
        state = {
          connections: old.connected
            ? { hubspot: { connectedAt: new Date().toISOString() } }
            : {},
          pushes: Object.fromEntries(
            Object.entries(old.pushed ?? {}).map(([k, v]) => [`hubspot|${k}`, v]),
          ),
        };
      }
    }
  } catch {
    // Unreadable state — start clean.
  }
  cache.set(orgId, state);
  return state;
}

function write(orgId: string, next: DemoState) {
  cache.set(orgId, next);
  try {
    window.localStorage.setItem(storageKey(orgId), JSON.stringify(next));
  } catch {
    // Storage full/blocked — in-memory state still works for the session.
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useIntegrationsDemo(orgId: string) {
  const state = useSyncExternalStore(
    subscribe,
    () => read(orgId),
    () => EMPTY, // server snapshot — hydrates to real state on the client
  );

  const connect = useCallback(
    (provider: PushProvider, opts?: { channel?: string }) => {
      const s = read(orgId);
      write(orgId, {
        ...s,
        connections: {
          ...s.connections,
          [provider]: {
            connectedAt: new Date().toISOString(),
            ...(provider === "slack"
              ? { channel: opts?.channel || "#sales-signals" }
              : {}),
          },
        },
      });
    },
    [orgId],
  );

  const disconnect = useCallback(
    (provider: PushProvider) => {
      const s = read(orgId);
      const connections = { ...s.connections };
      delete connections[provider];
      write(orgId, { ...s, connections });
    },
    [orgId],
  );

  const setChannel = useCallback(
    (channel: string) => {
      const s = read(orgId);
      if (!s.connections.slack) return;
      write(orgId, {
        ...s,
        connections: {
          ...s.connections,
          slack: { ...s.connections.slack, channel },
        },
      });
    },
    [orgId],
  );

  /** Record a REAL push locally (instant, no simulated latency) so the
   * pushed-state UI works the same in demo and real mode. */
  const recordPush = useCallback(
    (provider: PushProvider, entityKey: string, recordUrl?: string | null) => {
      const s = read(orgId);
      write(orgId, {
        ...s,
        pushes: {
          ...s.pushes,
          [`${provider}|${entityKey}`]: new Date().toISOString(),
        },
        recordUrls: recordUrl
          ? { ...(s.recordUrls ?? {}), [`${provider}|${entityKey}`]: recordUrl }
          : s.recordUrls,
      });
    },
    [orgId],
  );

  const push = useCallback(
    async (provider: PushProvider, entityKey: string) => {
      // Simulated round-trip so the pending state is visible.
      await new Promise((r) => setTimeout(r, 900));
      const s = read(orgId);
      write(orgId, {
        ...s,
        pushes: {
          ...s.pushes,
          [`${provider}|${entityKey}`]: new Date().toISOString(),
        },
      });
    },
    [orgId],
  );

  const connectedProviders = PROVIDER_ORDER.filter(
    (p) => !!state.connections[p],
  );

  return {
    connections: state.connections,
    /** Connected destinations in push-priority order (CRM first). */
    connectedProviders,
    connect,
    disconnect,
    setChannel,
    push,
    recordPush,
    pushedAt: (provider: PushProvider, entityKey: string): string | null =>
      state.pushes[`${provider}|${entityKey}`] ?? null,
    recordUrl: (provider: PushProvider, entityKey: string): string | null =>
      (state.recordUrls ?? {})[`${provider}|${entityKey}`] ?? null,
  };
}
