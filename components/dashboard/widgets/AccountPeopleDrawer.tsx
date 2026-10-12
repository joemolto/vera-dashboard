"use client";

/**
 * AccountPeopleDrawer — slide-in panel showing the ICP-matched people
 * at a given account. Opened from the accounts list "View people"
 * button so the rep doesn't have to navigate into the account page just to
 * see who's there.
 *
 * Same Apollo path as the account page's People tab (apollo-people edge
 * function). Search is free — only unlocking contact details burns a
 * credit, and that's already a separate slide-to-confirm action handled
 * in the account page (we link out for unlock here, no in-drawer unlock).
 */

import { useEffect } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Lock, Loader2, Mail, Phone, X } from "lucide-react";
import { useOrg } from "@/components/dashboard/OrgContext";
import { useTargetTitles } from "@/lib/dashboard/queries";
import { useDismissedContacts, useDismissContact } from "@/lib/dashboard/relevanceFeedback";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface PersonRow {
  apollo_id: string | null;
  first_name: string;
  last_name: string;
  last_name_obfuscated: string;
  title: string;
  seniority: string;
  linkedin_url: string;
  city: string;
  country: string;
  has_email: boolean;
  has_phone: boolean;
  email: string | null;
  unlocked: boolean;
}

function usePeopleAtAccount(
  domain: string | null,
  titles: string[],
  enabled: boolean,
) {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: [
      "apollo_people_drawer",
      orgId,
      domain,
      [...titles].sort().join("|"),
    ],
    enabled: enabled && !!orgId && !!domain,
    queryFn: async () => {
      const sb = createSupabaseBrowserClient();
      const body: Record<string, unknown> = {
        org_id: orgId,
        domain,
      };
      if (titles.length > 0) body.titles = titles;
      const { data, error } = await sb.functions.invoke<{
        people: PersonRow[];
        total: number;
      }>("apollo-people", { body });
      if (error) throw error;
      return data ?? { people: [], total: 0 };
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function AccountPeopleDrawer({
  domain,
  name,
  open,
  onClose,
}: {
  domain: string | null;
  name: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data: targetTitles } = useTargetTitles();
  const titles = targetTitles ?? [];
  const { data, isLoading, isError, error } = usePeopleAtAccount(
    domain,
    titles,
    open,
  );
  const { data: dismissedContacts } = useDismissedContacts();

  // Esc closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !domain) return null;

  const people = data?.people ?? [];

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="flex-1 bg-bg-base/70 backdrop-blur-sm"
      />
      {/* Sheet */}
      <aside
        className="flex w-full max-w-2xl shrink-0 flex-col border-l border-border-default bg-bg-base shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border-subtle px-6 py-4">
          <div className="min-w-0">
            <div className="text-[11px] text-text-muted">People at</div>
            <h2 className="mt-0.5 truncate text-[16px] font-medium text-text-primary">
              {name ?? domain}
            </h2>
            <div className="mt-1 text-[12px] text-text-muted">
              {titles.length > 0
                ? `Matched to your ICP · ${titles.length} target titles`
                : "All roles · ICP titles not configured"}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={`/dashboard/accounts/${encodeURIComponent(domain)}`}
              className="rounded-lg border border-border-default px-2.5 py-1 text-[11px] text-text-secondary hover:border-accent/40 hover:text-text-primary"
              onClick={onClose}
            >
              View account
            </Link>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close drawer"
              className="grid h-8 w-8 place-items-center rounded-md text-text-muted hover:bg-bg-elevated hover:text-text-primary"
            >
              <X size={15} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading && (
            <div className="flex items-center gap-2 text-[13px] text-text-muted">
              <Loader2 size={14} className="animate-spin" />
              Finding people at this account…
            </div>
          )}
          {isError && (
            <div className="text-[13px] text-rose-300/80" role="alert">
              Couldn&apos;t load people.{" "}
              {error instanceof Error ? error.message : ""}
            </div>
          )}
          {!isLoading && !isError && people.length === 0 && (
            <div className="text-[13px] text-text-muted">
              No people found at this domain
              {titles.length > 0 ? " matching your target titles." : "."}
            </div>
          )}
          {people.length > 0 && (
            <>
              <div className="mb-3 text-[11px] text-text-muted">
                {data?.total ?? people.length} surfaced · click to unlock contact details on the account page
              </div>
              <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                {people
                  .filter(
                    (p) => !(p.apollo_id && dismissedContacts?.has(p.apollo_id)),
                  )
                  .map((p) => (
                    <PersonCard
                      key={p.apollo_id ?? `${p.first_name}-${p.last_name_obfuscated}`}
                      p={p}
                      domain={domain}
                    />
                  ))}
              </ul>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function PersonCard({ p, domain }: { p: PersonRow; domain: string }) {
  const dismiss = useDismissContact();
  const lastName = p.unlocked ? p.last_name : p.last_name_obfuscated || "•••";
  const fullName = [p.first_name, lastName].filter(Boolean).join(" ");
  const location = [p.city, p.country].filter(Boolean).join(", ");

  return (
    <li className="rounded-xl border border-border-subtle bg-bg-elevated/40 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="truncate text-[13.5px] font-medium text-text-primary">
              {fullName || "(unknown)"}
            </div>
            {!p.unlocked && (
              <Lock
                size={11}
                className="shrink-0 text-text-muted"
                aria-label="Obfuscated"
              />
            )}
          </div>
          {p.title && (
            <div className="mt-0.5 truncate text-[12px] text-text-secondary">
              {p.title}
            </div>
          )}
          {location && (
            <div className="mt-1 text-[11px] text-text-muted">{location}</div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {p.linkedin_url && (
            <a
              href={p.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "rounded-md p-1 text-text-muted transition",
                "hover:bg-bg-elevated hover:text-text-primary",
              )}
              aria-label={`Open ${fullName}'s LinkedIn`}
            >
              <ExternalLink size={13} />
            </a>
          )}
          {p.apollo_id && (
            <button
              type="button"
              onClick={() =>
                dismiss.mutate({
                  apolloId: p.apollo_id!,
                  name: fullName,
                  title: p.title,
                  domain,
                  surface: "people_drawer",
                })
              }
              className="text-[10px] leading-none text-text-muted transition-colors hover:text-red-400"
              title="Mark not relevant. Vera learns from this."
            >
              Not relevant
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3 text-[11px] text-text-muted">
        {p.has_email && (
          <span className="flex items-center gap-1">
            <Mail size={10} />
            {p.unlocked && p.email ? p.email : "email available"}
          </span>
        )}
        {p.has_phone && !p.unlocked && (
          <span className="flex items-center gap-1">
            <Phone size={10} />
            phone available
          </span>
        )}
      </div>
    </li>
  );
}
