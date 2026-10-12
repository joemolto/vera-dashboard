"use client";

/**
 * Send-to — adaptive push action (pilot, demo mode — see
 * lib/dashboard/integrationsDemo.ts). Live for every org since the
 * 2026-08-03 rollout — buttons appear once a destination is connected
 * (the zero-state affordance on detail pages routes to Integrations).
 * Demo connections only exist for orgs with features.hubspot_push.
 *
 * "Meet people where they work": the UI adapts to what the org has
 * connected. Nothing connected → no buttons in tables (a quiet connect
 * affordance on detail pages). One destination → one-click branded
 * button. Two or more → split button: one-click to the primary (the
 * CRM), chevron menu for the rest with per-destination state.
 *
 * Variants: "row" (detail-page headers), "pill" (prospects + accounts
 * tables — neutral until used, then last-used brand, combined marks
 * when in several apps), "drawer" (PersonDrawer footer).
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2, Plug } from "lucide-react";
import {
  usePushDestinations,
  pushKey,
  type PushProvider,
} from "@/lib/dashboard/pushDestinations";
import { RelativeTime } from "@/components/dashboard/primitives";

/** Official Slack mark (4-colour) — lucide has no brand glyphs. */
export function SlackMark({ size = 12 }: { size?: number }) {
  return (
    <svg viewBox="0 0 122.8 122.8" width={size} height={size} aria-hidden>
      <path d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9v12.9z" fill="#E01E5A" />
      <path d="M32.3 77.6c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V77.6z" fill="#E01E5A" />
      <path d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9H45.2z" fill="#36C5F0" />
      <path d="M45.2 32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9h32.3z" fill="#36C5F0" />
      <path d="M97 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H97V45.2z" fill="#2EB67D" />
      <path d="M90.5 45.2c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.7 5.8 70.5 0 77.6 0s12.9 5.8 12.9 12.9v32.3z" fill="#2EB67D" />
      <path d="M77.6 97c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V97h12.9z" fill="#ECB22E" />
      <path d="M77.6 90.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H77.6z" fill="#ECB22E" />
    </svg>
  );
}

/** HubSpot sprocket via favicon — real brand artwork, no hand-drawn path. */
function HubspotMark({ size = 12 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="https://icons.duckduckgo.com/ip3/hubspot.com.ico"
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="shrink-0 object-contain"
    />
  );
}

interface Brand {
  name: string;
  /** Solid-button classes (brand background + white text). */
  solid: string;
  /** Brand-tinted pill classes (accounts-table Push column). */
  tint: string;
  /** "Add to HubSpot" is a record; "Send to Slack" is a message. */
  verb: string;
  doneLabel: string;
  /** Messages can be re-sent; records can't be re-created. */
  repeatable: boolean;
  icon: (size: number) => React.ReactNode;
  /** Real logo mark — used on the tinted pill + menus. */
  mark: (size: number) => React.ReactNode;
}

const BRANDS: Record<PushProvider, Brand> = {
  hubspot: {
    name: "HubSpot",
    solid: "bg-[#ff7a59] text-white transition-opacity hover:opacity-90",
    tint: "bg-[#ff7a59]/10 text-[#e4552f] transition-colors hover:bg-[#ff7a59]/20",
    verb: "Add to HubSpot",
    doneLabel: "In HubSpot",
    repeatable: false,
    icon: (size) => <Plug size={size} strokeWidth={1.9} />,
    mark: (size) => <HubspotMark size={size} />,
  },
  slack: {
    name: "Slack",
    solid: "bg-[#4A154B] text-white transition-opacity hover:opacity-90",
    tint: "bg-[#4A154B]/10 text-[#4A154B] transition-colors hover:bg-[#4A154B]/20",
    verb: "Send to Slack",
    doneLabel: "Sent to Slack",
    repeatable: true,
    icon: (size) => <SlackMark size={size} />,
    mark: (size) => <SlackMark size={size} />,
  },
};

export function SendToButton({
  id,
  entity = "contact",
  variant = "row",
}: {
  /** Lead id for contacts; company domain for companies. */
  id: string;
  entity?: "contact" | "company";
  variant?: "row" | "pill" | "drawer";
}) {
  const router = useRouter();
  const dest = usePushDestinations();
  const [pending, setPending] = useState<PushProvider | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuPos({
        top: rect.bottom + 6,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    }
  }, [menuOpen]);

  const provs = dest.connectedProviders;
  const key = pushKey(entity, id);

  const doPush = (p: PushProvider) => {
    setPending(p);
    setPushError(null);
    dest
      .push(p, entity, id)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "";
        setPushError(
          msg.includes("email_required")
            ? "Needs an unlocked email first."
            : msg.includes("reconnect_required")
              ? "Connection expired — reconnect in Integrations."
              : "Push failed — try again.",
        );
      })
      .finally(() => {
        setPending(null);
        setMenuOpen(false);
      });
  };

  // Nothing connected: tables stay clean; detail pages + drawer keep a
  // quiet affordance so the capability is discoverable.
  if (provs.length === 0) {
    if (variant === "pill") return null;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          router.push("/dashboard/integrations");
        }}
        className={
          variant === "drawer"
            ? "inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border-default px-4 py-2.5 text-[13px] font-medium text-text-secondary transition-colors hover:bg-bg-elevated"
            : "inline-flex items-center gap-1.5 rounded-lg border border-border-default px-3 py-1.5 text-[12.5px] font-medium text-text-secondary transition-colors hover:bg-bg-elevated"
        }
      >
        <Plug size={13} strokeWidth={1.9} />
        Push to your tools
      </button>
    );
  }

  // Real pushes store the exact record deep link (portal-scoped) —
  // the generic contacts URL opens the user's DEFAULT portal, which is
  // which sends users hunting for records in the wrong account.
  const recordHref = (p: PushProvider) =>
    dest.recordUrl(p, key) ?? "https://app.hubspot.com/contacts";

  const primary = provs[0];
  const brand = BRANDS[primary];
  const primaryPushedAt = dest.pushedAt(primary, key);
  const hasMenu = provs.length > 1;

  // ----- shared menu (portal — survives the tables' overflow clipping)
  const menu =
    menuOpen && menuPos
      ? createPortal(
          <>
            <div
              className="fixed inset-0 z-[80]"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
              }}
              aria-hidden
            />
            <div
              style={{ position: "fixed", top: menuPos.top, right: menuPos.right }}
              className="z-[90] w-64 rounded-xl border border-border-default bg-bg-card p-1.5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              {provs.map((p) => {
                const b = BRANDS[p];
                const t = dest.pushedAt(p, key);
                const label =
                  p === "slack"
                    ? `Send to ${dest.slackChannel ?? "Slack"}`
                    : b.verb;
                const isPending = pending === p;
                const done = !!t && !b.repeatable;
                return (
                  <button
                    key={p}
                    type="button"
                    disabled={done || isPending}
                    onClick={() => doPush(p)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12.5px] text-text-primary transition-colors hover:bg-bg-elevated disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white ring-1 ring-border-subtle">
                      {p === "slack" ? <SlackMark size={13} /> : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src="https://icons.duckduckgo.com/ip3/hubspot.com.ico" alt="" width={13} height={13} className="h-[13px] w-[13px] object-contain" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {t ? b.doneLabel : label}
                      </span>
                      {t ? (
                        <span className="block text-[11px] text-text-muted">
                          <RelativeTime value={t} />
                          {b.repeatable ? " · click to send again" : null}
                        </span>
                      ) : null}
                    </span>
                    {isPending ? (
                      <Loader2 size={13} strokeWidth={1.9} className="shrink-0 animate-spin text-text-muted" />
                    ) : t ? (
                      <Check size={13} strokeWidth={2.2} className="shrink-0 text-emerald-500" />
                    ) : null}
                  </button>
                );
              })}
              <div className="mt-1 border-t border-border-subtle pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    router.push("/dashboard/integrations");
                  }}
                  className="w-full rounded-lg px-3 py-1.5 text-left text-[11.5px] text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-secondary"
                >
                  Connect more apps…
                </button>
              </div>
            </div>
          </>,
          document.body,
        )
      : null;

  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const openMenu = (e: React.MouseEvent) => {
    stop(e);
    setMenuOpen((v) => !v);
  };

  const onMainClick = (e: React.MouseEvent) => {
    stop(e);
    doPush(primary);
  };

  const mainPending = pending === primary;

  if (variant === "pill") {
    // Accounts-table Push column. With one connected app the pill is
    // branded and one-click. With several, the dropdown is the chooser,
    // so the pill stays NEUTRAL until a destination has been used for
    // this entity, then adopts that destination's brand (last-used
    // wins) — don't show HubSpot's colours on a row
    // that was just sent to Slack.
    const last =
      provs
        .map((p) => ({ p, t: dest.pushedAt(p, key) }))
        .filter((x): x is { p: PushProvider; t: string } => !!x.t)
        .sort((a, b) => (a.t < b.t ? 1 : -1))[0] ?? null;
    const active = hasMenu ? (last?.p ?? null) : primary;

    // Pushed to more than one app → combined state: both marks + check
    // on neutral chrome, whole pill opens the menu.
    const pushedProvs = provs.filter((p) => dest.pushedAt(p, key));
    if (hasMenu && pushedProvs.length > 1) {
      return (
        <div ref={anchorRef} className="inline-flex align-middle">
          <button
            type="button"
            onClick={openMenu}
            title={pushedProvs.map((p) => BRANDS[p].doneLabel).join(" · ")}
            className="inline-flex items-center gap-1 rounded-full border border-border-subtle bg-bg-elevated/40 px-2 py-[3px] text-[10.5px] font-medium text-text-secondary transition-colors hover:bg-bg-elevated"
          >
            {pushedProvs.map((p) => (
              <span key={p} className="inline-flex">{BRANDS[p].mark(11)}</span>
            ))}
            <Check size={10} strokeWidth={2.5} className="text-emerald-500" />
            <ChevronDown size={10} strokeWidth={2} />
          </button>
          {menu}
        </div>
      );
    }

    if (!active) {
      return (
        <div ref={anchorRef} className="inline-flex align-middle">
          <button
            type="button"
            onClick={openMenu}
            className="inline-flex items-center gap-1 rounded-full border border-border-default px-2 py-[3px] text-[10.5px] font-medium text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
          >
            Push
            <ChevronDown size={10} strokeWidth={2} />
          </button>
          {menu}
        </div>
      );
    }

    const b = BRANDS[active];
    const t = dest.pushedAt(active, key);
    const isPending = pending === active;
    return (
      <div ref={anchorRef} className="inline-flex items-center align-middle">
        <button
          type="button"
          disabled={isPending || (!!t && !b.repeatable)}
          onClick={(e) => {
            stop(e);
            if (!t || b.repeatable) doPush(active);
          }}
          title={
            t
              ? `${b.doneLabel}${b.repeatable ? " — click to send again" : ""}`
              : b.verb
          }
          className={`inline-flex items-center gap-1 ${hasMenu ? "rounded-l-full" : "rounded-full"} px-2 py-[3px] text-[10.5px] font-medium disabled:cursor-default ${b.tint}`}
        >
          {isPending ? (
            <Loader2 size={11} strokeWidth={2} className="animate-spin" />
          ) : (
            b.mark(11)
          )}
          {b.name}
          {t && !isPending ? (
            <Check size={10} strokeWidth={2.5} className="text-emerald-500" />
          ) : null}
        </button>
        {hasMenu ? (
          <button
            type="button"
            onClick={openMenu}
            aria-label="More destinations"
            className={`inline-flex items-center self-stretch rounded-r-full border-l border-black/10 px-1 ${b.tint}`}
          >
            <ChevronDown size={10} strokeWidth={2} />
          </button>
        ) : null}
        {menu}
      </div>
    );
  }

  // ----- per-variant sizing
  const size =
    variant === "drawer"
      ? { text: "text-[13px]", pad: "px-4 py-2.5", icon: 14, radius: "rounded-lg", chev: "px-2" }
      : { text: "text-[12.5px]", pad: "px-3 py-1.5", icon: 13, radius: "rounded-lg", chev: "px-1.5" };

  const mainLabel = mainPending ? "Adding…" : brand.verb;

  const pushedChip = (
    <span
      onClick={stop}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap ${size.radius} border border-border-subtle bg-bg-base/50 ${size.pad} ${size.text} text-text-secondary`}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
      {brand.doneLabel}
      {variant === "row" || variant === "drawer" ? (
        <a
          href={recordHref(primary)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="font-medium text-accent transition-colors hover:underline"
        >
          View ↗
        </a>
      ) : null}
    </span>
  );

  const mainButton = (
    <button
      type="button"
      disabled={mainPending}
      onClick={onMainClick}
      title={primary === "slack" ? `Post to ${dest.slackChannel ?? "Slack"}` : `Push this ${entity} to HubSpot`}
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap ${hasMenu ? `${size.radius.replace("rounded", "rounded-l")}` : size.radius} ${size.pad} ${size.text} font-medium disabled:opacity-60 ${brand.solid} ${variant === "drawer" ? "w-full" : ""}`}
    >
      {mainPending ? (
        <Loader2 size={size.icon} strokeWidth={1.9} className="animate-spin" />
      ) : (
        brand.icon(size.icon)
      )}
      {mainLabel}
    </button>
  );

  const chevron = hasMenu ? (
    <button
      type="button"
      onClick={openMenu}
      aria-label="More destinations"
      className={
        primaryPushedAt
          ? `inline-flex items-center ${size.radius} border border-border-default ${size.chev} py-0.5 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary`
          : `inline-flex items-center ${size.radius.replace("rounded", "rounded-r")} border-l border-white/25 ${size.chev} ${brand.solid}`
      }
    >
      <ChevronDown size={12} strokeWidth={2} />
    </button>
  ) : null;

  if (variant === "drawer") {
    return (
      <div ref={anchorRef} className="flex flex-col gap-1.5">
        <div className="flex items-stretch gap-0.5">
          <div className="min-w-0 flex-1">
            {primaryPushedAt ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-bg-elevated/30 px-4 py-2.5">
                <span className="inline-flex items-center gap-2 text-[12.5px] text-text-secondary">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                  {brand.doneLabel} · <RelativeTime value={primaryPushedAt} />
                </span>
                <a
                  href={recordHref(primary)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-[12px] font-medium text-accent transition-colors hover:underline"
                >
                  View record ↗
                </a>
              </div>
            ) : (
              mainButton
            )}
          </div>
          {chevron}
        </div>
        {pushError ? (
          <p className="text-[11px] text-amber-500">{pushError}</p>
        ) : !primaryPushedAt ? (
          <p className="text-[11px] text-text-muted">
            {entity === "company"
              ? "Pushes the company and its signal context."
              : "Pushes the contact, company and signal context."}
          </p>
        ) : null}
        {menu}
      </div>
    );
  }

  return (
    <div ref={anchorRef} className="inline-flex items-center gap-1.5 align-middle">
      {primaryPushedAt ? pushedChip : mainButton}
      {chevron}
      {pushError ? (
        <span className="text-[11px] text-amber-500">{pushError}</span>
      ) : null}
      {menu}
    </div>
  );
}
