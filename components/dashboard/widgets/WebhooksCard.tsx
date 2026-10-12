"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Webhook,
  Plus,
  X,
  Eye,
  EyeOff,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Send,
} from "lucide-react";
import {
  Card,
  EmptyState,
  Pill,
  RelativeTime,
  SectionHeader,
  Shimmer,
} from "@/components/dashboard/primitives";
import { useOrg } from "@/components/dashboard/OrgContext";
import { claraApi } from "@/lib/dashboard/claraApi";
import { SlideToConfirm } from "@/components/ui/SlideToConfirm";
import { cn } from "@/lib/utils";

const EVENT_TYPES = [
  // Lead-level
  "lead.created",
  "lead.enriched",
  "lead.scored",
  "lead.rated_hot",
  "brief.created",
  // Watchlist + signals
  "watchlist.alert_created",
  "signal.detected",
  "threat.matched_to_lead",
  // Account-led (added 2026-06-09)
  "account.went_hot",
  "account.suggestion_created",
] as const;

interface Endpoint {
  id: string;
  url: string;
  secret: string;
  events: string[];
  name: string;
  active: boolean;
  last_delivered_at: string | null;
  last_failed_at: string | null;
  consecutive_failures: number;
  created_at: string;
}

interface Delivery {
  id: string;
  event_type: string;
  status: "pending" | "delivered" | "failed" | "dead";
  attempt_count: number;
  response_status: number | null;
  duration_ms: number | null;
  created_at: string;
  last_attempt_at: string | null;
  delivered_at: string | null;
  next_attempt_at: string | null;
  response_body: string | null;
}

export function WebhooksCard() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [createdEndpoint, setCreatedEndpoint] = useState<Endpoint | null>(null);

  const { data, isLoading } = useQuery<{
    data: Endpoint[];
    tier_allowed?: boolean;
  }>({
    queryKey: ["webhook-endpoints", orgId],
    queryFn: () =>
      claraApi<{ data: Endpoint[]; tier_allowed?: boolean }>(
        `/webhook-endpoints?org_id=${orgId}`,
      ),
    enabled: Boolean(orgId),
  });

  const createMutation = useMutation({
    mutationFn: async (input: {
      url: string;
      name: string;
      events: string[];
    }) => {
      return claraApi<Endpoint>("/webhook-endpoints", {
        method: "POST",
        body: JSON.stringify({ org_id: orgId, ...input }),
      });
    },
    onSuccess: (endpoint) => {
      setCreatedEndpoint(endpoint);
      setShowCreate(false);
      qc.invalidateQueries({ queryKey: ["webhook-endpoints", orgId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (endpointId: string) =>
      claraApi(`/webhook-endpoints/${endpointId}?org_id=${orgId}`, {
        method: "DELETE",
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["webhook-endpoints", orgId] }),
  });

  const endpoints = data?.data ?? [];
  const tierAllowed = data?.tier_allowed ?? true;

  return (
    <>
      <Card delay={0.26} className="overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-border-subtle p-6 md:p-7">
          <SectionHeader
            title="Webhooks"
            subtitle="Get notified the moment a brief is ready, a hot lead is scored, or a watchlist alert fires — pushed to any URL you control."
          />
          {tierAllowed && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-text-primary px-4 py-2 text-[12.5px] font-medium tracking-tight text-bg-base transition-opacity hover:opacity-90"
            >
              <Plus size={12} strokeWidth={2.2} />
              New endpoint
            </button>
          )}
        </div>

        {!tierAllowed ? (
          <UpgradePrompt />
        ) : isLoading ? (
          <div className="flex flex-col gap-2 p-6 md:p-7">
            {[0, 1].map((i) => (
              <Shimmer key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : endpoints.length === 0 ? (
          <EmptyState
            icon={<Webhook size={16} strokeWidth={1.6} />}
            title="No webhook endpoints yet"
            body="Add your first endpoint to start receiving real-time event notifications from Vera."
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {endpoints.map((endpoint) => (
              <EndpointRow
                key={endpoint.id}
                endpoint={endpoint}
                onDelete={() => deleteMutation.mutate(endpoint.id)}
                isBusy={
                  deleteMutation.isPending &&
                  deleteMutation.variables === endpoint.id
                }
              />
            ))}
          </ul>
        )}
      </Card>

      <AnimatePresence>
        {showCreate && (
          <CreateEndpointModal
            onClose={() => setShowCreate(false)}
            onSubmit={(input) => createMutation.mutate(input)}
            isPending={createMutation.isPending}
            error={createMutation.error}
          />
        )}
        {createdEndpoint && (
          <NewEndpointSecretModal
            endpoint={createdEndpoint}
            onClose={() => setCreatedEndpoint(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------
// Tier upsell — Scout users see this in place of the empty state
// ---------------------------------------------------------------

function UpgradePrompt() {
  return (
    <div className="px-6 py-9 text-center md:px-7">
      <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-bg-elevated text-text-secondary">
        <Webhook size={16} strokeWidth={1.6} />
      </div>
      <h3 className="mt-4 font-display text-[15px] font-medium tracking-tight text-text-primary">
        Webhooks are available on any paid plan
      </h3>
      <p className="mx-auto mt-2 max-w-md text-[12.5px] leading-relaxed text-text-secondary">
        Real-time push of every Vera event into your CRM, Slack, n8n — wherever
        your team works. Activate a plan to enable webhook endpoints alongside
        API access.
      </p>
    </div>
  );
}


// ---------------------------------------------------------------
// Endpoint row — masked secret w/ eye toggle, deliveries expander
// ---------------------------------------------------------------

function EndpointRow({
  endpoint,
  onDelete,
  isBusy,
}: {
  endpoint: Endpoint;
  onDelete: () => void;
  isBusy: boolean;
}) {
  const { orgId } = useOrg();
  const queryClient = useQueryClient();
  const [showSecret, setShowSecret] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    status: number | null;
    duration_ms: number | null;
    body: string;
  } | null>(null);

  const { data: deliveries, isLoading: dLoading } = useQuery<{
    data: Delivery[];
  }>({
    queryKey: ["webhook-deliveries", endpoint.id, orgId],
    queryFn: () =>
      claraApi<{ data: Delivery[] }>(
        `/webhook-endpoints/${endpoint.id}/deliveries?org_id=${orgId}`,
      ),
    enabled: expanded && Boolean(orgId),
  });

  // Send-test mutation — fires a synthetic webhook.test event so the
  // customer can confirm their endpoint is wired correctly before
  // waiting for a real event.
  const testMutation = useMutation({
    mutationFn: async () => {
      return await claraApi<{
        success: boolean;
        status: number | null;
        duration_ms: number | null;
        response_body: string;
      }>(`/webhook-endpoints/${endpoint.id}/test?org_id=${orgId}`, {
        method: "POST",
      });
    },
    onSuccess: (res) => {
      setTestResult({
        ok: res.success,
        status: res.status,
        duration_ms: res.duration_ms,
        body: res.response_body || "",
      });
      // Refresh the endpoint list so the health pill / last_delivered_at
      // updates if the test succeeded
      queryClient.invalidateQueries({ queryKey: ["webhook-endpoints", orgId] });
      if (expanded) {
        queryClient.invalidateQueries({
          queryKey: ["webhook-deliveries", endpoint.id, orgId],
        });
      }
    },
    onError: (err) => {
      setTestResult({
        ok: false,
        status: null,
        duration_ms: null,
        body: err instanceof Error ? err.message : "Request failed",
      });
    },
  });

  const healthBadge = (() => {
    if (endpoint.consecutive_failures >= 3) {
      return <Pill variant="danger">Failing</Pill>;
    }
    if (endpoint.consecutive_failures > 0) {
      return <Pill variant="warning">Degraded</Pill>;
    }
    if (endpoint.last_delivered_at) {
      return <Pill variant="accent">Healthy</Pill>;
    }
    return <Pill variant="muted">Untested</Pill>;
  })();

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(endpoint.secret);
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <li className="px-6 py-4 md:px-7">
      <div className="flex items-start gap-4">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-bg-elevated text-text-secondary">
          <Webhook size={14} strokeWidth={1.7} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-display text-[13.5px] font-medium tracking-tight text-text-primary">
              {endpoint.name || "Untitled endpoint"}
            </span>
            {healthBadge}
          </div>
          <div className="mt-1 truncate font-mono text-[11.5px] text-text-muted">
            {endpoint.url}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-text-muted">
            <span>
              {endpoint.events.length === 0
                ? "All events"
                : `${endpoint.events.length} event${endpoint.events.length === 1 ? "" : "s"}`}
            </span>
            <span>·</span>
            <span>
              {endpoint.last_delivered_at ? (
                <>Last delivery <RelativeTime value={endpoint.last_delivered_at} /></>
              ) : (
                <>Never delivered</>
              )}
            </span>
          </div>
        </div>

        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <SlideToConfirm
              text="Slide to delete"
              successText="Deleting…"
              onConfirm={() => {
                setConfirmDelete(false);
                onDelete();
              }}
              width={220}
              height={36}
            />
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-md px-2 py-1.5 text-[11.5px] text-text-muted hover:text-text-secondary"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending || isBusy}
              title="Send a test payload to this endpoint"
              className="grid h-8 w-8 place-items-center rounded-lg text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary disabled:opacity-40"
            >
              {testMutation.isPending ? (
                <Loader2 size={13} strokeWidth={1.8} className="animate-spin" />
              ) : (
                <Send size={13} strokeWidth={1.8} />
              )}
            </button>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              title="Show recent deliveries"
              className="grid h-8 w-8 place-items-center rounded-lg text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
            >
              {expanded ? (
                <ChevronUp size={14} strokeWidth={1.8} />
              ) : (
                <ChevronDown size={14} strokeWidth={1.8} />
              )}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={isBusy}
              title="Delete endpoint"
              className="grid h-8 w-8 place-items-center rounded-lg text-text-muted transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
            >
              <Trash2 size={13} strokeWidth={1.8} />
            </button>
          </div>
        )}
      </div>

      {/* Test result — inline feedback after pressing the Send button.
          Cleared next time the user sends another test. */}
      {testResult && (
        <div
          className={cn(
            "mt-3 rounded-lg border px-3 py-2 text-[11.5px]",
            testResult.ok
              ? "border-emerald-400/30 bg-emerald-400/[0.04] text-emerald-300"
              : "border-red-400/30 bg-red-400/[0.04] text-red-300",
          )}
        >
          <div className="flex items-center gap-2">
            {testResult.ok ? (
              <CheckCircle2 size={12} strokeWidth={2} />
            ) : (
              <AlertCircle size={12} strokeWidth={2} />
            )}
            <span className="font-medium">
              {testResult.ok ? "Test delivered" : "Test failed"}
            </span>
            {testResult.status !== null && (
              <span className="font-mono text-text-muted">
                · {testResult.status}
              </span>
            )}
            {testResult.duration_ms !== null && (
              <span className="font-mono text-text-muted">
                · {testResult.duration_ms}ms
              </span>
            )}
            <button
              type="button"
              onClick={() => setTestResult(null)}
              className="ml-auto text-text-muted hover:text-text-secondary"
              aria-label="Dismiss"
            >
              <X size={11} strokeWidth={2} />
            </button>
          </div>
          {testResult.body && (
            <div className="mt-1.5 max-h-16 overflow-y-auto font-mono text-[10.5px] text-text-secondary">
              {testResult.body}
            </div>
          )}
        </div>
      )}

      {/* Secret reveal — eye toggle.
          Webhook secrets ARE recoverable (unlike API keys) because the
          customer needs them to verify HMAC signatures forever. So eye
          toggle is the right pattern here. */}
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-elevated/40 px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
          Signing secret
        </span>
        <code className="flex-1 truncate font-mono text-[12px] text-text-primary">
          {showSecret ? endpoint.secret : "••••••••••••••••••••••••••••••••"}
        </code>
        <button
          type="button"
          onClick={() => setShowSecret((v) => !v)}
          className="grid h-7 w-7 place-items-center rounded-md text-text-muted transition-colors hover:bg-bg-base hover:text-text-primary"
          aria-label={showSecret ? "Hide secret" : "Show secret"}
        >
          {showSecret ? (
            <EyeOff size={12} strokeWidth={1.8} />
          ) : (
            <Eye size={12} strokeWidth={1.8} />
          )}
        </button>
        <button
          type="button"
          onClick={copySecret}
          className={cn(
            "grid h-7 w-7 place-items-center rounded-md transition-colors",
            secretCopied
              ? "bg-accent/10 text-accent"
              : "text-text-muted hover:bg-bg-base hover:text-text-primary",
          )}
          aria-label="Copy secret"
        >
          {secretCopied ? (
            <Check size={12} strokeWidth={2.2} />
          ) : (
            <Copy size={12} strokeWidth={1.8} />
          )}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 rounded-lg border border-border-subtle bg-bg-base/40 p-4">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
            Recent deliveries
          </div>
          {dLoading ? (
            <Shimmer className="h-12 w-full" />
          ) : (deliveries?.data ?? []).length === 0 ? (
            <div className="text-[12.5px] text-text-muted">
              No deliveries yet. Trigger an event (score a lead, run enrichment)
              to see something here.
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {deliveries!.data.slice(0, 8).map((d) => (
                <DeliveryRow key={d.id} delivery={d} />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function DeliveryRow({ delivery }: { delivery: Delivery }) {
  const { orgId } = useOrg();
  const qc = useQueryClient();

  const replayMutation = useMutation({
    mutationFn: async () =>
      claraApi(
        `/webhook-endpoints/deliveries/${delivery.id}/replay?org_id=${orgId}`,
        { method: "POST" },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhook-deliveries"] }),
  });

  const StatusIcon =
    delivery.status === "delivered"
      ? CheckCircle2
      : delivery.status === "dead"
        ? AlertCircle
        : delivery.status === "failed"
          ? AlertCircle
          : Loader2;

  const statusColor = {
    delivered: "text-accent",
    dead: "text-red-400",
    failed: "text-amber-400",
    pending: "text-text-muted",
  }[delivery.status];

  return (
    <li className="flex items-center gap-3 rounded-md px-2 py-1.5 text-[11.5px]">
      <StatusIcon
        size={12}
        strokeWidth={1.8}
        className={cn(
          statusColor,
          delivery.status === "pending" && "animate-spin",
        )}
      />
      <span className="font-mono text-text-secondary">{delivery.event_type}</span>
      <span className="text-text-muted">·</span>
      <span className="text-text-muted">
        attempt {delivery.attempt_count}/{6}
      </span>
      {delivery.response_status && (
        <>
          <span className="text-text-muted">·</span>
          <span
            className={cn(
              delivery.response_status >= 200 && delivery.response_status < 300
                ? "text-text-secondary"
                : "text-red-400",
            )}
          >
            HTTP {delivery.response_status}
          </span>
        </>
      )}
      <span className="ml-auto text-text-muted">
        <RelativeTime value={delivery.last_attempt_at ?? delivery.created_at} />
      </span>
      {(delivery.status === "failed" || delivery.status === "dead") && (
        <button
          type="button"
          onClick={() => replayMutation.mutate()}
          disabled={replayMutation.isPending}
          className="ml-2 rounded p-1 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary disabled:opacity-50"
          title="Replay this delivery"
        >
          {replayMutation.isPending ? (
            <Loader2 size={11} strokeWidth={2} className="animate-spin" />
          ) : (
            <RefreshCw size={11} strokeWidth={1.8} />
          )}
        </button>
      )}
    </li>
  );
}

// ---------------------------------------------------------------
// Create endpoint modal
// ---------------------------------------------------------------

function CreateEndpointModal({
  onClose,
  onSubmit,
  isPending,
  error,
}: {
  onClose: () => void;
  onSubmit: (input: {
    url: string;
    name: string;
    events: string[];
  }) => void;
  isPending: boolean;
  error: unknown;
}) {
  const [url, setUrl] = useState("https://");
  const [name, setName] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [allEvents, setAllEvents] = useState(true);

  function toggleEvent(event: string) {
    setSelectedEvents((current) =>
      current.includes(event)
        ? current.filter((e) => e !== event)
        : [...current, event],
    );
  }

  return (
    <Modal onClose={onClose} title="New webhook endpoint">
      <p className="text-[13px] leading-relaxed text-text-secondary">
        Vera will POST signed JSON to this URL whenever the events you choose
        happen. Your endpoint can be anywhere — n8n, Zapier, your own server,
        or a serverless function.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!url.trim() || isPending) return;
          onSubmit({
            url: url.trim(),
            name: name.trim(),
            events: allEvents ? [] : selectedEvents,
          });
        }}
        className="mt-5 flex flex-col gap-4"
      >
        <div>
          <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
            Endpoint URL
          </label>
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-app.example.com/webhooks/vera"
            className="w-full rounded-lg border border-border-default bg-bg-elevated px-3.5 py-2.5 font-mono text-[12.5px] text-text-primary placeholder:text-text-muted/70 outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent"
          />
          <p className="mt-1.5 text-[11px] text-text-muted">
            Must start with https://
          </p>
        </div>

        <div>
          <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
            Name (optional)
          </label>
          <input
            type="text"
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Production CRM bridge"
            className="w-full rounded-lg border border-border-default bg-bg-elevated px-3.5 py-2.5 text-[14px] text-text-primary placeholder:text-text-muted/70 outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>

        <div>
          <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
            Events
          </label>
          <div className="flex flex-col gap-2">
            <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border-subtle bg-bg-elevated/40 px-3 py-2.5 text-[13px] text-text-secondary">
              <input
                type="radio"
                checked={allEvents}
                onChange={() => setAllEvents(true)}
                className="accent-accent"
              />
              <span>All events</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border-subtle bg-bg-elevated/40 px-3 py-2.5 text-[13px] text-text-secondary">
              <input
                type="radio"
                checked={!allEvents}
                onChange={() => setAllEvents(false)}
                className="accent-accent"
              />
              <span>Specific events</span>
            </label>
            {!allEvents && (
              <div className="ml-3 mt-1 flex flex-col gap-1.5">
                {EVENT_TYPES.map((event) => (
                  <label
                    key={event}
                    className="flex cursor-pointer items-center gap-2 text-[12.5px] text-text-secondary"
                  >
                    <input
                      type="checkbox"
                      checked={selectedEvents.includes(event)}
                      onChange={() => toggleEvent(event)}
                      className="accent-accent"
                    />
                    <span className="font-mono">{event}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {error instanceof Error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[12.5px] text-red-400">
            {error.message}
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-[13px] text-text-secondary transition-colors hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!url.trim() || isPending || (!allEvents && selectedEvents.length === 0)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-[13px] font-medium tracking-tight transition-opacity",
              !url.trim() || isPending || (!allEvents && selectedEvents.length === 0)
                ? "cursor-not-allowed bg-bg-elevated text-text-muted"
                : "bg-text-primary text-bg-base hover:opacity-90",
            )}
          >
            {isPending ? (
              <Loader2 size={12} strokeWidth={2} className="animate-spin" />
            ) : (
              <Plus size={12} strokeWidth={2.2} />
            )}
            Create endpoint
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------
// First-look modal after creation — shows the secret + verification snippet
// ---------------------------------------------------------------

function NewEndpointSecretModal({
  endpoint,
  onClose,
}: {
  endpoint: Endpoint;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(endpoint.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <Modal onClose={onClose} title="Webhook endpoint created">
      <p className="text-[13px] leading-relaxed text-text-secondary">
        Vera will start sending events to{" "}
        <span className="font-mono text-text-primary">{endpoint.url}</span>{" "}
        immediately. Use the signing secret below to verify each request came
        from Vera (recommended for production).
      </p>

      <div className="mt-5">
        <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
          Signing secret
        </label>
        <div className="flex items-stretch gap-2">
          <code className="flex-1 select-all overflow-x-auto rounded-lg border border-border-default bg-bg-base px-3.5 py-3 font-mono text-[12.5px] text-text-primary">
            {endpoint.secret}
          </code>
          <button
            type="button"
            onClick={copy}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-medium tracking-tight transition-colors",
              copied
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-border-default bg-bg-elevated text-text-secondary hover:border-border-strong hover:text-text-primary",
            )}
          >
            {copied ? <Check size={12} strokeWidth={2.2} /> : <Copy size={12} strokeWidth={1.8} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-border-subtle bg-bg-elevated/40 p-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
          Verifying signatures
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-text-secondary">
          Each request includes <code className="font-mono">X-Vera-Signature: sha256=...</code> —
          compute HMAC-SHA256(secret, raw_body) and compare. The header
          <code className="ml-1 font-mono">X-Vera-Delivery</code> is unique per delivery so your
          handler can be idempotent.
        </p>
        <pre className="mt-2 overflow-x-auto rounded bg-bg-base px-3 py-2 font-mono text-[11px] leading-relaxed text-text-primary">
{`# Node example
const expected = "sha256=" + crypto
  .createHmac("sha256", VERA_WEBHOOK_SECRET)
  .update(rawBody)
  .digest("hex");
if (!crypto.timingSafeEqual(
  Buffer.from(expected),
  Buffer.from(req.headers["x-vera-signature"]),
)) return res.sendStatus(401);`}
        </pre>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-text-primary px-5 py-2 text-[13px] font-medium tracking-tight text-bg-base transition-opacity hover:opacity-90"
        >
          Done
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------
// Modal shell (same as ApiKeysCard)
// ---------------------------------------------------------------

function Modal({
  onClose,
  title,
  children,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-bg-base/70 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[calc(100vh-4rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-card"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-7 py-5">
          <h3 className="font-display text-[1.05rem] font-medium tracking-tight text-text-primary">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-text-muted transition-colors hover:bg-bg-elevated/50 hover:text-text-primary"
          >
            <X size={12} strokeWidth={1.8} />
          </button>
        </div>
        <div className="overflow-y-auto px-7 py-6">{children}</div>
      </motion.div>
    </motion.div>
  );
}
