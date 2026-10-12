"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import {
  LayoutDashboard,
  Search,
  Users,
  BarChart3,
  Eye,
  Settings,
  ArrowLeft,
  LogOut,
  Sparkles,
  Network,
  Building2,
  ChevronLeft,
  ChevronRight,
  Layers,
  Plug,
  Radar,
  type LucideIcon,
} from "lucide-react";
import { WorkspaceLogo, logoDevUrl } from "@/components/dashboard/WorkspaceLogo";
import { cn } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useOrg, isBillingLapsed, type OrgFeatures } from "@/components/dashboard/OrgContext";
import { CreditsMeter } from "@/components/dashboard/widgets/CreditsMeter";
import { SELF_HOSTED } from "@/lib/selfHosted";

interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
  /** Only render if the org's feature flag is on. Absent = always show. */
  featureFlag?: keyof OrgFeatures;
  /** Hide this item if the named feature flag is on. Used for the
   * accounts-dashboard trial where the people-level "Prospects" surface
   * is replaced by the account-first model. */
  hideWhenFlag?: keyof OrgFeatures;
}

// Order (account-first orgs): Home, Accounts, Prospects, Research, Analytics,
// Ask Vera, Settings. Watchlist takes the Accounts slot for legacy orgs;
// Intelligence Map only shows for orgs with that flag.
const NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Home",
    Icon: LayoutDashboard,
    // Home is now the canonical surface for the Social Pulse panel
    // (sector-level social listening feed), so every org sees it.
    // Flag-hiding removed 2026-05-31.
  },
  {
    href: "/dashboard/accounts",
    label: "Accounts",
    Icon: Building2,
    featureFlag: "accounts_dashboard",
  },
  {
    // Your market — TAM + market radar (pilot). Coverage framing
    // ("watching 33 of ~1,700") needs the market to be a first-class
    // surface, so it sits right under Accounts rather than inside it.
    href: "/dashboard/market",
    label: "Your market",
    Icon: Radar,
    featureFlag: "market_v1",
  },
  {
    // Legacy: in the account-first paradigm Accounts IS the watchlist.
    // The standalone Watchlist surface is the leads-first view of the
    // same underlying table — hiding it for orgs on the new model. Sits in
    // the Accounts slot so legacy orgs keep it right under Home.
    href: "/dashboard/watchlist",
    label: "Watchlist",
    Icon: Eye,
    hideWhenFlag: "accounts_dashboard",
  },
  {
    // Prospects = the full people/leads book (every contact, with hot/warm/cold).
    // Kept visible even on the account-first model so existing clients can always
    // see the data they already have — the Accounts tab only surfaces the monitored
    // watchlist, which hid clients' full books (2026-06-24). Caps/monitoring
    // are unaffected; this is a read-only view of their own leads.
    href: "/dashboard/prospects",
    label: "Prospects",
    Icon: Users,
  },
  {
    href: "/dashboard/groups",
    label: "Groups",
    Icon: Layers,
    featureFlag: "groups",
  },
  { href: "/dashboard/research", label: "Research", Icon: Search },
  // Analytics pulled from the nav on the redesign branch (2026-07-19).
  // The route still exists, it's just not linked.
  // { href: "/dashboard/analytics", label: "Analytics", Icon: BarChart3 },
  {
    href: "/dashboard/intelligence-map",
    label: "Intelligence Map",
    Icon: Network,
    featureFlag: "intelligence_map",
    // Hidden on the stripped-back tabs layout too, where it reads as
    // decoration (2026-05-27).
    hideWhenFlag: "accounts_dashboard_tabs",
  },
  {
    // Shown to all orgs as a "Coming soon" teaser (cards are all soon).
    // Re-add featureFlag: "integrations" to scope it once connectors go live.
    href: "/dashboard/integrations",
    label: "Integrations",
    Icon: Plug,
  },
  { href: "/dashboard/settings", label: "Settings", Icon: Settings },
];

const SIDEBAR_COLLAPSED_KEY = "vera_sidebar_collapsed";

export function DashboardShell({
  email,
  orgName,
  domain,
  logoUrl,
  children,
}: {
  email: string;
  orgName: string;
  domain?: string | null;
  logoUrl?: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { features } = useOrg();
  const visibleNav = NAV.filter((n) => {
    if (n.featureFlag && !features[n.featureFlag]) {
      // Starter keeps fenced surfaces visible — the page itself shows the
      // upgrade prompt instead of the feature (2026-07-15).
      const fencedUpsell =
        !SELF_HOSTED && n.featureFlag === "groups" && features.starter_plan;
      if (!fencedUpsell) return false;
    }
    if (n.hideWhenFlag && features[n.hideWhenFlag]) return false;
    return true;
  });

  // Page title for the header — longest matching nav href wins so
  // /dashboard/accounts doesn't resolve to Home.
  const pageTitle =
    pathname.startsWith("/dashboard/chat")
      ? "Ask Vera"
      : [...NAV]
          .sort((a, b) => b.href.length - a.href.length)
          .find((n) =>
            n.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(n.href),
          )?.label ?? "Dashboard";

  // Collapsible sidebar: full labels by default, icon-only when collapsed.
  // Persisted in localStorage so the choice sticks across navigations. Starts
  // expanded on the server, syncs to the stored choice after mount (one-frame
  // settle, no hydration mismatch). Collapsed shows icons + hover tooltips.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
  }, []);

  // Premium browser-tab touch: per-page title + the workspace logo as the
  // favicon, so their own brand sits in the tab.
  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} · ${orgName || "Vera"}` : orgName || "Vera";
  }, [pageTitle, orgName]);
  useEffect(() => {
    const href = logoUrl || (domain ? logoDevUrl(domain) : null);
    if (!href) return;
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = href;
  }, [logoUrl, domain]);
  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* private mode / storage disabled — state still works in-session */
      }
      return next;
    });
  }

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div
      className="flex min-h-screen bg-bg-base"
      // Dashboard accent is purple. Scoped here so every `accent` utility inside
      // the dashboard resolves to purple, without touching the global token (the
      // marketing site keeps its green accent).
      style={
        {
          "--accent": "#574FD6",
          "--accent-soft": "#6B63E8",
          "--accent-hover": "#6B63E8",
          "--accent-deep": "#4F46BA",
          "--accent-tint": "rgba(87, 79, 214, 0.07)",
          "--accent-glow": "rgba(87, 79, 214, 0.25)",
          "--color-accent": "#574FD6",
          "--color-accent-soft": "#6B63E8",
          "--color-accent-deep": "#4F46BA",
        } as CSSProperties
      }
    >
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border-default bg-bg-card transition-[width] duration-200 md:flex",
          collapsed ? "w-[72px]" : "w-60",
        )}
      >
        {/* Logo */}
        <div
          className={cn(
            "flex items-center py-5",
            collapsed ? "justify-center px-2" : "px-5",
          )}
        >
          <Link
            href="/dashboard"
            aria-label="Dashboard home"
            title={orgName || "Dashboard"}
            className="inline-flex items-center gap-2.5"
          >
            <WorkspaceLogo
              name={orgName || "Vera"}
              domain={domain}
              logoUrl={logoUrl}
              size={collapsed ? 30 : 32}
            />
            {!collapsed && (
              <span className="truncate text-[15px] font-semibold tracking-tight text-text-primary">
                {orgName || "Vera"}
              </span>
            )}
          </Link>
        </div>

        {/* Credits meter — hidden on the stripped-back trial since the
         * tier-based pricing doesn't expose credit burn to the user. */}
        {!SELF_HOSTED && !features.accounts_dashboard_tabs && (
          <CreditsMeter collapsed={collapsed} />
        )}

        <nav
          className={cn(
            "flex flex-1 flex-col gap-0.5 overflow-y-auto",
            collapsed ? "px-2.5" : "px-3",
          )}
        >
          {visibleNav.map(({ href, label, Icon }) => {
            const isActive =
              href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                title={collapsed ? label : undefined}
                className={cn(
                  "group relative flex items-center rounded-lg py-2 text-[13.5px] font-medium transition-colors",
                  collapsed ? "justify-center px-0" : "gap-2.5 px-3",
                  isActive
                    ? "bg-brand-50 text-brand-500 dark:bg-brand-500/[0.12] dark:text-brand-400"
                    : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary",
                )}
              >
                <Icon
                  size={18}
                  strokeWidth={1.7}
                  className={cn(
                    "shrink-0 transition-colors",
                    isActive
                      ? "text-brand-500 dark:text-brand-400"
                      : "text-text-muted group-hover:text-text-secondary",
                  )}
                />
                {!collapsed && <span>{label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Ask Vera — its own AI surface: a white pill with a purple glow and a
         * beam that traces around the border, sitting above the footer divider. */}
        {features.accounts_dashboard && (
          <div className={cn("pt-1 pb-3", collapsed ? "px-3" : "px-4")}>
            <Link
              href="/dashboard/chat"
              aria-label="Ask Vera"
              title={collapsed ? "Ask Vera" : undefined}
              className={cn(
                "relative flex items-center justify-center rounded-full border border-[rgba(87,79,214,0.45)] bg-white font-semibold text-accent shadow-[0_0_18px_-1px_rgba(87,79,214,0.35)] transition-shadow duration-200 hover:shadow-[0_0_22px_0_rgba(87,79,214,0.45)]",
                collapsed ? "mx-auto h-10 w-10" : "gap-2 px-4 py-2.5 text-[13.5px]",
                pathname.startsWith("/dashboard/chat") && "ring-1 ring-[rgba(87,79,214,0.5)]",
              )}
            >
              <Sparkles
                size={collapsed ? 16 : 15}
                strokeWidth={2}
                className="shrink-0 text-accent"
              />
              {!collapsed && <span>Ask Vera</span>}
            </Link>
          </div>
        )}

        {/* Footer: back-to-site + sign-out */}
        <div className={cn("border-t border-border-subtle py-4", collapsed ? "px-3" : "px-4")}>
          <Link
            href="/"
            aria-label="Back to site"
            title={collapsed ? "Back to site" : undefined}
            className={cn(
              "flex items-center rounded-lg py-2 text-[13px] text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-secondary",
              collapsed ? "justify-center px-0" : "gap-3 px-3",
            )}
          >
            <ArrowLeft size={14} strokeWidth={1.7} className="shrink-0" />
            {!collapsed && <span>Back to site</span>}
          </Link>
          <button
            onClick={handleSignOut}
            type="button"
            title={collapsed ? "Sign out" : email}
            aria-label="Sign out"
            className={cn(
              "mt-1 flex w-full items-center rounded-lg py-2 text-[13px] text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-secondary",
              collapsed ? "justify-center px-0" : "gap-3 px-3",
            )}
          >
            <LogOut size={14} strokeWidth={1.7} className="shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Desktop header — page context left, identity right */}
        <header className="sticky top-0 z-20 hidden items-center justify-between border-b border-border-default bg-bg-card px-6 py-3.5 md:flex">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="grid h-9 w-9 place-items-center rounded-lg border border-border-default text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-secondary"
            >
              {collapsed ? (
                <ChevronRight size={16} strokeWidth={1.8} />
              ) : (
                <ChevronLeft size={16} strokeWidth={1.8} />
              )}
            </button>
            <h1 className="text-[15px] font-semibold tracking-tight text-text-primary">
              {pageTitle}
            </h1>
          </div>
          {/* Workspace identity now lives in the sidebar logo (top-left). */}
        </header>

        {/* Mobile header */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border-default bg-bg-card/85 px-5 py-3.5 backdrop-blur md:hidden">
          <Link href="/dashboard" aria-label="Dashboard home" className="inline-flex items-center gap-2">
            <WorkspaceLogo name={orgName || "Vera"} domain={domain} logoUrl={logoUrl} size={30} />
            <span className="truncate text-[14px] font-semibold tracking-tight text-text-primary">
              {orgName || "Vera"}
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-lg px-2.5 py-1.5 text-[12px] text-text-secondary"
              aria-label="Back to site"
            >
              <ArrowLeft size={14} strokeWidth={1.7} />
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-lg px-2.5 py-1.5 text-[12px] text-text-secondary"
              aria-label="Sign out"
            >
              <LogOut size={14} strokeWidth={1.7} />
            </button>
          </div>
        </header>

        <main className="flex-1">
          {!SELF_HOSTED && <LapsedBanner />}
          {children}
        </main>
      </div>
    </div>
  );
}

// Persistent read-only notice when billing has lapsed. The engine already
// blocks every paid action; this is the honest signal + the way back.
function LapsedBanner() {
  const { subscriptionStatus } = useOrg();
  if (!isBillingLapsed(subscriptionStatus)) return null;
  return (
    <div className="border-b border-amber-500/30 bg-amber-500/[0.08] px-5 py-3">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-text-secondary">
          <span className="font-medium text-text-primary">Your subscription has ended.</span>{" "}
          Monitoring and research are paused — your data is still here.
        </p>
        <Link
          href="/dashboard/settings"
          className="shrink-0 rounded-md bg-gradient-brand px-3 py-1.5 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
        >
          Reactivate →
        </Link>
      </div>
    </div>
  );
}
