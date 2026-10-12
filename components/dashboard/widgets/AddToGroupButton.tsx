"use client";

/**
 * AddToGroupButton — add a single person to a manual group from anywhere the
 * person appears (prospects list row, prospect detail header). The inverse of
 * the Groups page's "add many members to this group" picker: here you start
 * from a person and pick the group.
 *
 * Only MANUAL people-groups are valid targets — smart groups compute their own
 * membership from rules, so hand-adding to them would be silently overwritten.
 * Reuses the existing useAddMembers / useCreateGroup mutations; no new backend.
 * Gated on features.groups (Individual + Team; Starter is fenced out upstream).
 */

import { useMemo, useState } from "react";
import { Check, FolderPlus, Plus, Search, Sparkles, X } from "lucide-react";
import { useAddMembers, useCreateGroup, useGroups } from "@/lib/dashboard/groups";
import { useOrg } from "@/components/dashboard/OrgContext";
import { cn } from "@/lib/utils";

export function AddToGroupButton({
  leadId,
  variant = "button",
  className,
}: {
  leadId: string;
  variant?: "button" | "icon";
  className?: string;
}) {
  const { features } = useOrg();
  const [open, setOpen] = useState(false);
  if (!features.groups) return null;

  const openModal = (e: React.MouseEvent) => {
    e.stopPropagation(); // don't trigger the row's navigate-on-click
    setOpen(true);
  };

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          aria-label="Add to group"
          title="Add to group"
          onClick={openModal}
          className={cn(
            "grid h-7 w-7 place-items-center rounded-md text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary",
            className,
          )}
        >
          <FolderPlus size={14} strokeWidth={1.7} />
        </button>
      ) : (
        <button
          type="button"
          onClick={openModal}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border border-border-default px-3 py-1.5 text-[12.5px] font-medium text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary",
            className,
          )}
        >
          <FolderPlus size={13} strokeWidth={1.7} />
          Add to group
        </button>
      )}
      {open && <AddToGroupModal leadId={leadId} onClose={() => setOpen(false)} />}
    </>
  );
}

function AddToGroupModal({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const { data: groups } = useGroups();
  const add = useAddMembers();
  const create = useCreateGroup();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  // All people groups. Both manual and smart are addable — a smart group
  // takes the pin on top of its rules (rules + exceptions).
  const allPeopleGroups = useMemo(
    () => (groups ?? []).filter((g) => g.entity_type === "people"),
    [groups],
  );
  // Lead with the groups themselves — only surface search once the list is
  // long enough that scanning it becomes the friction.
  const showSearch = allPeopleGroups.length > 7;
  const peopleGroups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle
      ? allPeopleGroups.filter((g) => g.name.toLowerCase().includes(needle))
      : allPeopleGroups;
  }, [allPeopleGroups, q]);

  const addTo = async (groupId: string) => {
    setBusy(groupId);
    try {
      await add.mutateAsync({ groupId, entityType: "people", refs: [leadId] });
      setAdded((s) => new Set(s).add(groupId));
    } finally {
      setBusy(null);
    }
  };

  const createAndAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy("__new__");
    try {
      const g = await create.mutateAsync({ name, entity_type: "people", mode: "manual" });
      await add.mutateAsync({ groupId: g.id, entityType: "people", refs: [leadId] });
      setAdded((s) => new Set(s).add(g.id));
      setCreating(false);
      setNewName("");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-bg-base/70 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-border-default bg-bg-card"
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
          <h2 className="font-display text-[1.05rem] font-medium tracking-tight text-text-primary">
            Add to group
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-7 w-7 place-items-center rounded-md text-text-muted hover:bg-bg-elevated hover:text-text-primary"
          >
            <X size={15} />
          </button>
        </div>

        {showSearch && (
          <div className="border-b border-border-subtle px-6 py-3">
            <div className="flex items-center gap-2 rounded-lg border border-border-default bg-bg-elevated px-3 py-2">
              <Search size={14} className="text-text-muted" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search your groups"
                className="w-full bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-muted"
              />
            </div>
          </div>
        )}

        <ul className="max-h-[46vh] divide-y divide-border-subtle overflow-y-auto">
          {peopleGroups.length === 0 ? (
            <li className="px-6 py-8 text-center text-[13px] text-text-muted">
              No people groups yet. Create one below.
            </li>
          ) : (
            peopleGroups.map((g) => {
              // Both manual and smart people-groups accept a hand-picked
              // member. For a smart group the pin sits on top of its rules
              // (rules + exceptions), so a person who doesn't match the rules
              // can still be added deliberately.
              const isAdded = added.has(g.id);
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    disabled={isAdded || busy === g.id}
                    onClick={() => addTo(g.id)}
                    className="flex w-full items-center justify-between gap-3 px-6 py-3 text-left transition-colors hover:bg-bg-elevated/40 disabled:cursor-default"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[13.5px] font-medium text-text-primary">
                        {g.name}
                      </span>
                      {g.mode === "smart" && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10.5px] font-medium text-accent">
                          <Sparkles size={10} strokeWidth={2} /> Smart
                        </span>
                      )}
                    </span>
                    {isAdded ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-accent">
                        <Check size={13} strokeWidth={2.5} /> Added
                      </span>
                    ) : (
                      <span className="shrink-0 text-[12px] text-text-muted">
                        {busy === g.id ? "Adding…" : "Add"}
                      </span>
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div className="border-t border-border-subtle px-6 py-4">
          {creating ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createAndAdd();
                }}
                placeholder="New group name"
                className="w-full rounded-lg border border-border-default bg-bg-elevated px-3 py-2 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent/50"
              />
              <button
                type="button"
                onClick={createAndAdd}
                disabled={!newName.trim() || busy === "__new__"}
                className="shrink-0 rounded-lg bg-accent px-3 py-2 text-[12.5px] font-medium text-bg-base transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy === "__new__" ? "Creating…" : "Create & add"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-accent transition-opacity hover:opacity-80"
            >
              <Plus size={13} strokeWidth={2.5} /> New group
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
