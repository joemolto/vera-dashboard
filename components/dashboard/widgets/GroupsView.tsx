"use client";

/**
 * Groups page — named sets of accounts or people, manual or smart. Self-contained
 * for v1: create a group, add members via a picker, smart groups show live
 * matches. Contacts render as photo + full name + title via the
 * shared PersonCell. Fast-follows: add-to-group from the Accounts/Prospects
 * tables, the cross-group roll-up, the notify job, a global settings page.
 */

import { useMemo, useState } from "react";
import { ArrowLeft, Building2, Plus, Search, Sparkles, Trash2, Users, X } from "lucide-react";
import { Shimmer } from "@/components/dashboard/primitives";
import { PersonCell, CompanyCell } from "@/components/dashboard/PersonCell";
import { useLeads, useWatchlist, useAccountScores } from "@/lib/dashboard/queries";
import {
  useGroups,
  useGroupMemberCounts,
  useGroupMembers,
  useCreateGroup,
  useDeleteGroup,
  useAddMembers,
  useRemoveMember,
  smartMatchRefs,
  useWatchedCompanyFacts,
  type Group,
  type GroupEntityType,
  type GroupMode,
} from "@/lib/dashboard/groups";
import type { Lead } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

const leadName = (l: Lead) =>
  [l.first_name, l.last_name].filter(Boolean).join(" ").trim() || l.email || "Unknown";

const describeTitles = (titles?: string[]) => {
  const t = titles ?? [];
  if (t.length === 0) return "no titles set";
  if (t.length <= 3) return t.join(", ");
  return `${t.slice(0, 3).join(", ")} +${t.length - 3} more`;
};

export function GroupsView() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { data: groups, isLoading } = useGroups();

  const open = groups?.find((g) => g.id === openId) ?? null;

  if (open) {
    return <GroupDetail group={open} onBack={() => setOpenId(null)} />;
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-7 md:px-7">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[clamp(1.4rem,2.4vw,1.9rem)] font-medium tracking-tight text-text-primary">
            Groups
          </h1>
          <p className="mt-1 text-[13.5px] text-text-secondary">
            Organise accounts and people. Vera watches each group and tells you what moves.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-bg-base transition-opacity hover:opacity-90"
        >
          <Plus size={15} strokeWidth={2} />
          New group
        </button>
      </div>

      {isLoading ? (
        <div className="mt-6 overflow-hidden rounded-2xl border border-border-subtle bg-bg-card">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="border-b border-border-subtle px-5 py-4 last:border-0">
              <Shimmer className="h-5 w-1/3" />
            </div>
          ))}
        </div>
      ) : !groups || groups.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border-default p-12 text-center">
          <p className="text-[14px] text-text-secondary">No groups yet.</p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-3 text-[13px] font-medium text-accent hover:underline"
          >
            Create your first group
          </button>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-border-subtle bg-bg-card">
          <div className="flex items-center gap-4 border-b border-border-subtle px-5 py-2.5 text-[11.5px] text-text-muted">
            <span className="flex-1">Group</span>
            <span className="w-24 text-right">Members</span>
            <span className="hidden w-28 text-right sm:block">Created</span>
            <span className="w-8" />
          </div>
          <ul className="divide-y divide-border-subtle">
            {groups.map((g) => (
              <GroupRow key={g.id} group={g} onOpen={() => setOpenId(g.id)} />
            ))}
          </ul>
        </div>
      )}

      {creating && <CreateGroupModal onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpenId(id); }} />}
    </div>
  );
}

function GroupRow({ group, onOpen }: { group: Group; onOpen: () => void }) {
  const { data: counts } = useGroupMemberCounts();
  const del = useDeleteGroup();
  const count = counts?.[group.id] ?? 0;
  const Icon = group.entity_type === "account" ? Building2 : Users;
  const created = new Date(group.created_at).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return (
    <li className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-bg-elevated/40">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-bg-elevated text-text-secondary">
          <Icon size={15} strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-medium text-text-primary">{group.name}</span>
            {group.mode === "smart" && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                <Sparkles size={9} strokeWidth={2} /> Smart
              </span>
            )}
          </div>
          <div className="truncate text-[12px] text-text-muted">
            {group.entity_type === "account" ? "Accounts" : "People"}
          </div>
        </div>
      </button>
      <span className="w-24 text-right text-[13px] text-text-secondary">
        {group.mode === "smart" ? "Live" : count}
      </span>
      <span className="hidden w-28 text-right text-[12.5px] text-text-muted sm:block">{created}</span>
      <button
        type="button"
        onClick={() => {
          if (confirm(`Delete "${group.name}"?`)) del.mutate(group.id);
        }}
        aria-label="Delete group"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-text-muted hover:bg-bg-elevated hover:text-red-400"
      >
        <Trash2 size={14} strokeWidth={1.8} />
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
function CreateGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [entityType, setEntityType] = useState<GroupEntityType>("account");
  const [mode, setMode] = useState<GroupMode>("manual");
  const [titles, setTitles] = useState<string[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [minScore, setMinScore] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newIndustry, setNewIndustry] = useState("");
  const [interpreting, setInterpreting] = useState(false);
  const [interpreted, setInterpreted] = useState(false);
  const [interpretErr, setInterpretErr] = useState<string | null>(null);
  const create = useCreateGroup();

  const interpret = async () => {
    if (!name.trim() || interpreting) return;
    setInterpreting(true);
    setInterpretErr(null);
    try {
      const res = await fetch("/api/groups/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, entity_type: entityType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInterpretErr("Couldn't read that name — add titles manually below.");
        setInterpreted(true);
        return;
      }
      setTitles(Array.isArray(data.titles) ? data.titles : []);
      setIndustries(Array.isArray(data.industries) ? data.industries : []);
      if (data.min_score != null) setMinScore(String(data.min_score));
      setInterpreted(true);
    } catch {
      setInterpretErr("Couldn't read that name — add titles manually below.");
      setInterpreted(true);
    } finally {
      setInterpreting(false);
    }
  };

  const addTitle = () => {
    const t = newTitle.trim();
    if (t && !titles.some((x) => x.toLowerCase() === t.toLowerCase())) setTitles((p) => [...p, t]);
    setNewTitle("");
  };

  const addIndustry = () => {
    const t = newIndustry.trim();
    if (t && !industries.some((x) => x.toLowerCase() === t.toLowerCase())) setIndustries((p) => [...p, t]);
    setNewIndustry("");
  };

  const submit = async () => {
    if (!name.trim() || create.isPending) return;
    let rules = {};
    if (mode === "smart") {
      rules =
        entityType === "people"
          ? { titles, industries }
          : { min_score: Number(minScore) || 0 };
    }
    const { id } = await create.mutateAsync({ name, entity_type: entityType, mode, rules });
    onCreated(id);
  };

  const chip = "inline-flex items-center gap-1 rounded-full bg-bg-elevated px-2.5 py-1 text-[12px] text-text-primary";

  return (
    <Modal onClose={onClose} title="New group">
      <div className="space-y-4 px-6 py-5">
        <Field label="Name">
          <input
            autoFocus
            value={name}
            onChange={(e) => { setName(e.target.value); setInterpreted(false); }}
            placeholder="e.g. CISOs at financial services"
            className="w-full rounded-lg border border-border-default bg-bg-elevated px-3 py-2 text-[13.5px] text-text-primary outline-none focus:border-accent/60"
          />
        </Field>
        <Field label="Type">
          <Segmented
            value={entityType}
            onChange={(v) => { setEntityType(v as GroupEntityType); setInterpreted(false); }}
            options={[
              { value: "account", label: "Accounts", icon: <Building2 size={13} /> },
              { value: "people", label: "People", icon: <Users size={13} /> },
            ]}
          />
        </Field>
        <Field label="Membership">
          <Segmented
            value={mode}
            onChange={(v) => setMode(v as GroupMode)}
            options={[
              { value: "manual", label: "Manual" },
              { value: "smart", label: "Smart", icon: <Sparkles size={12} /> },
            ]}
          />
          <p className="mt-1.5 text-[11.5px] text-text-muted">
            {mode === "smart"
              ? "Vera reads your group name and keeps membership live."
              : "You add members yourself."}
          </p>
        </Field>

        {mode === "smart" && entityType === "people" && (
          <div className="space-y-3 rounded-xl border border-border-subtle bg-bg-card/50 p-3.5">
            <button
              type="button"
              onClick={interpret}
              disabled={!name.trim() || interpreting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 px-3 py-1.5 text-[12.5px] font-medium text-accent transition-colors hover:bg-accent/5 disabled:opacity-50"
            >
              <Sparkles size={13} />
              {interpreting ? "Reading the name…" : interpreted ? "Re-interpret" : "Suggest titles from the name"}
            </button>
            {interpretErr && <p className="text-[12px] text-amber-500">{interpretErr}</p>}
            {interpreted && (
              <>
                <div>
                  <div className="mb-1.5 text-[12px] font-medium text-text-secondary">Matching job titles</div>
                  <div className="flex flex-wrap gap-1.5">
                    {titles.map((t) => (
                      <span key={t} className={chip}>
                        {t}
                        <button type="button" onClick={() => setTitles((p) => p.filter((x) => x !== t))} aria-label={`Remove ${t}`} className="text-text-muted hover:text-text-primary">
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                    {titles.length === 0 && <span className="text-[12px] text-text-muted">No titles yet — add some below.</span>}
                  </div>
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTitle(); } }}
                    placeholder="Add a title, press Enter"
                    className="mt-2 w-full rounded-lg border border-border-default bg-bg-elevated px-3 py-1.5 text-[12.5px] text-text-primary outline-none focus:border-accent/60"
                  />
                </div>
                <div>
                  <div className="mb-1.5 text-[12px] font-medium text-text-secondary">Industries</div>
                  <div className="flex flex-wrap gap-1.5">
                    {industries.map((t) => (
                      <span key={t} className={chip}>
                        {t}
                        <button type="button" onClick={() => setIndustries((p) => p.filter((x) => x !== t))} aria-label={`Remove ${t}`} className="text-text-muted hover:text-text-primary">
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                    {industries.length === 0 && <span className="text-[12px] text-text-muted">Any industry.</span>}
                  </div>
                  <input
                    value={newIndustry}
                    onChange={(e) => setNewIndustry(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addIndustry(); } }}
                    placeholder="Add an industry, press Enter"
                    className="mt-2 w-full rounded-lg border border-border-default bg-bg-elevated px-3 py-1.5 text-[12.5px] text-text-primary outline-none focus:border-accent/60"
                  />
                </div>
              </>
            )}
          </div>
        )}

        {mode === "smart" && entityType === "account" && (
          <Field label="Minimum profile score">
            <input
              type="number"
              value={minScore}
              onChange={(e) => setMinScore(e.target.value)}
              placeholder="e.g. 40"
              className="w-full rounded-lg border border-border-default bg-bg-elevated px-3 py-2 text-[13.5px] text-text-primary outline-none focus:border-accent/60"
            />
          </Field>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-6 py-4">
        <button type="button" onClick={onClose} className="rounded-lg px-3.5 py-2 text-[13px] text-text-secondary hover:text-text-primary">
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!name.trim() || create.isPending}
          className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-bg-base transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {create.isPending ? "Creating…" : "Create group"}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------
function GroupDetail({ group, onBack }: { group: Group; onBack: () => void }) {
  const [adding, setAdding] = useState(false);
  // Load stored members for every group: manual groups are all-manual, and
  // people smart groups can carry hand-pinned members on top of their rules.
  const { data: members } = useGroupMembers(group.id);
  const { data: leads } = useLeads();
  const { data: watchlist } = useWatchlist();
  const { data: accountScores } = useAccountScores({ sinceDays: 30 });
  const watchedDomains = useMemo(
    () =>
      [...new Set((watchlist ?? []).map((w) => (w.company_domain ?? "").toLowerCase()).filter(Boolean))],
    [watchlist],
  );
  const { data: companyFacts } = useWatchedCompanyFacts(watchedDomains);
  const del = useDeleteGroup();
  const removeMember = useRemoveMember();

  const leadsById = useMemo(() => new Map((leads ?? []).map((l) => [l.id, l])), [leads]);
  const watchByDomain = useMemo(
    () => new Map((watchlist ?? []).map((w) => [(w.company_domain ?? "").toLowerCase(), w])),
    [watchlist],
  );

  // Member refs: manual = stored rows; smart = live match, plus any hand-pinned
  // members for people groups (rules + exceptions). Rule matches have no
  // memberId (can't be removed by hand); pins do (removable). Account smart
  // groups stay rules-only — the engine notify matcher is rules-only there.
  const refs: { ref: string; memberId?: string }[] = useMemo(() => {
    if (group.mode === "smart") {
      const ruleRefs = smartMatchRefs(group, { leads, watchlist, accountScores, companyFacts });
      if (group.entity_type !== "people") return ruleRefs.map((ref) => ({ ref }));
      const ruleSet = new Set(ruleRefs.map((r) => r.toLowerCase()));
      const out: { ref: string; memberId?: string }[] = ruleRefs.map((ref) => ({ ref }));
      for (const m of members ?? []) {
        if (!ruleSet.has(m.entity_ref.toLowerCase())) {
          out.push({ ref: m.entity_ref, memberId: m.id });
        }
      }
      return out;
    }
    return (members ?? []).map((m) => ({ ref: m.entity_ref, memberId: m.id }));
  }, [group, members, leads, watchlist, accountScores, companyFacts]);

  const Icon = group.entity_type === "account" ? Building2 : Users;

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-7 md:px-7">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-[13px] text-text-muted hover:text-text-primary">
        <ArrowLeft size={14} /> All groups
      </button>

      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-bg-elevated text-text-secondary">
            <Icon size={18} strokeWidth={1.8} />
          </span>
          <div>
            <h1 className="font-display text-[1.3rem] font-medium tracking-tight text-text-primary">{group.name}</h1>
            <div className="mt-0.5 flex items-center gap-2 text-[12px] text-text-muted">
              <span>{group.entity_type === "account" ? "Accounts" : "People"}</span>
              {group.mode === "smart" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10.5px] font-medium text-accent">
                  <Sparkles size={10} strokeWidth={2} /> Smart
                </span>
              ) : (
                <span>{refs.length} {refs.length === 1 ? "member" : "members"}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(group.mode === "manual" || group.entity_type === "people") && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border-default px-3 py-1.5 text-[12.5px] text-text-secondary hover:text-text-primary"
            >
              <Plus size={13} /> Add members
            </button>
          )}
          <button
            type="button"
            onClick={() => { if (confirm(`Delete "${group.name}"?`)) { del.mutate(group.id); onBack(); } }}
            aria-label="Delete group"
            className="grid h-8 w-8 place-items-center rounded-lg text-text-muted hover:bg-bg-elevated hover:text-red-400"
          >
            <Trash2 size={15} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {group.mode === "smart" && (
        <p className="mt-4 rounded-lg border border-border-subtle bg-bg-card px-3.5 py-2.5 text-[12.5px] text-text-muted">
          {group.entity_type === "people"
            ? `Live: ${describeTitles(group.rules.titles)}${(group.rules.industries?.length ?? 0) > 0 ? ` · ${describeTitles(group.rules.industries)}` : ""}.`
            : `Live: every watched account scoring ${group.rules.min_score || 0}+.`}
        </p>
      )}

      <ul className="mt-4 divide-y divide-border-subtle rounded-2xl border border-border-subtle bg-bg-card">
        {refs.length === 0 ? (
          <li className="px-5 py-8 text-center text-[13px] text-text-muted">
            {group.mode === "smart" ? "Nothing matches yet." : "No members yet. Add some."}
          </li>
        ) : (
          refs.map(({ ref, memberId }) => (
            <li key={ref} className="flex items-center justify-between gap-3 px-5 py-3">
              {group.entity_type === "people"
                ? (() => {
                    const l = leadsById.get(ref);
                    return l ? (
                      <PersonCell photo={l.photo_url} name={leadName(l)} title={l.title} company={l.company_name} />
                    ) : (
                      <span className="text-[13px] text-text-muted">Contact unavailable</span>
                    );
                  })()
                : (() => {
                    const w = watchByDomain.get(ref.toLowerCase());
                    return <CompanyCell domain={ref} name={w?.company_name ?? ref} />;
                  })()}
              {memberId && (
                <button
                  type="button"
                  onClick={() => removeMember.mutate({ memberId, groupId: group.id })}
                  aria-label="Remove"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-text-muted hover:bg-bg-elevated hover:text-text-primary"
                >
                  <X size={14} />
                </button>
              )}
            </li>
          ))
        )}
      </ul>

      {adding && (
        <AddMemberModal
          group={group}
          existing={new Set(refs.map((r) => r.ref.toLowerCase()))}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add-member picker
// ---------------------------------------------------------------------------
function AddMemberModal({ group, existing, onClose }: { group: Group; existing: Set<string>; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const { data: leads } = useLeads();
  const { data: watchlist } = useWatchlist();
  const add = useAddMembers();

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (group.entity_type === "people") {
      return (leads ?? [])
        .map((l) => ({ ref: l.id, lead: l }))
        .filter(({ ref, lead }) => !existing.has(ref.toLowerCase()) &&
          (!needle || `${leadName(lead)} ${lead.title ?? ""} ${lead.company_name ?? ""}`.toLowerCase().includes(needle)))
        .slice(0, 100);
    }
    return (watchlist ?? [])
      .map((w) => ({ ref: (w.company_domain ?? "").toLowerCase(), w }))
      .filter(({ ref, w }) => ref && !existing.has(ref) &&
        (!needle || `${w.company_name ?? ""} ${ref}`.toLowerCase().includes(needle)))
      .slice(0, 100);
  }, [group.entity_type, leads, watchlist, q, existing]);

  const toggle = (ref: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(ref)) n.delete(ref); else n.add(ref);
      return n;
    });

  const submit = async () => {
    if (picked.size === 0) return;
    await add.mutateAsync({ groupId: group.id, entityType: group.entity_type, refs: [...picked] });
    onClose();
  };

  return (
    <Modal onClose={onClose} title={`Add ${group.entity_type === "people" ? "people" : "accounts"}`}>
      <div className="border-b border-border-subtle px-6 py-3">
        <div className="flex items-center gap-2 rounded-lg border border-border-default bg-bg-elevated px-3 py-2">
          <Search size={14} className="text-text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className="w-full bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-muted"
          />
        </div>
      </div>
      <ul className="max-h-[50vh] divide-y divide-border-subtle overflow-y-auto">
        {rows.length === 0 ? (
          <li className="px-6 py-8 text-center text-[13px] text-text-muted">Nothing to add.</li>
        ) : (
          rows.map((r) => {
            const isPicked = picked.has(r.ref);
            return (
              <li key={r.ref}>
                <button
                  type="button"
                  onClick={() => toggle(r.ref)}
                  className={cn("flex w-full items-center justify-between gap-3 px-6 py-2.5 text-left transition-colors hover:bg-bg-elevated/40", isPicked && "bg-accent/5")}
                >
                  {group.entity_type === "people" && "lead" in r ? (
                    <PersonCell photo={r.lead.photo_url} name={leadName(r.lead)} title={r.lead.title} company={r.lead.company_name} />
                  ) : "w" in r ? (
                    <CompanyCell domain={r.ref} name={r.w.company_name ?? r.ref} />
                  ) : null}
                  <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-md border", isPicked ? "border-accent bg-accent text-bg-base" : "border-border-default")}>
                    {isPicked && <Plus size={12} strokeWidth={3} className="rotate-45" />}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
      <div className="flex items-center justify-between border-t border-border-subtle px-6 py-4">
        <span className="text-[12.5px] text-text-muted">{picked.size} selected</span>
        <button
          type="button"
          onClick={submit}
          disabled={picked.size === 0 || add.isPending}
          className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-bg-base transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {add.isPending ? "Adding…" : `Add ${picked.size || ""}`}
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Small UI helpers
// ---------------------------------------------------------------------------
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} className="fixed inset-0 z-50 grid place-items-center bg-bg-base/70 p-4 backdrop-blur-sm">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-2xl border border-border-default bg-bg-card">
        <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
          <h2 className="font-display text-[1.05rem] font-medium tracking-tight text-text-primary">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-7 w-7 place-items-center rounded-md text-text-muted hover:bg-bg-elevated hover:text-text-primary">
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[12px] font-medium text-text-secondary">{label}</div>
      {children}
    </div>
  );
}

function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string; icon?: React.ReactNode }[] }) {
  return (
    <div className="inline-flex w-full rounded-lg border border-border-default p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors",
            value === o.value ? "bg-accent text-bg-base" : "text-text-secondary hover:text-text-primary",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}
