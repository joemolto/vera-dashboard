"use client";

/**
 * TargetRolesCard — Settings control for the job titles Vera looks for
 * at every account (icp_config.personas[0].target_titles). Solo orgs
 * don't get the multi-profile BuyerProfilesCard, and until this card the
 * list was set once by the onboarding wizard and then unreachable
 * (2026-09-19). Writes through the engine's persona
 * endpoint so the flat target_titles copy every reader uses stays in sync.
 */

import { useState, type KeyboardEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, X } from "lucide-react";
import { Card, SectionHeader, Shimmer } from "@/components/dashboard/primitives";
import { useOrg } from "@/components/dashboard/OrgContext";
import {
  useIcpPersonas,
  type IcpPersona,
  type IcpPersonasResponse,
} from "@/lib/dashboard/queries";
import { claraApi } from "@/lib/dashboard/claraApi";

export function TargetRolesCard() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const personas = useIcpPersonas();
  const primary = personas.data?.personas[0];

  // null = no unsaved edits; the list shown is whatever the persona holds.
  const [draft, setDraft] = useState<string[] | null>(null);
  const [input, setInput] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const titles = draft ?? primary?.target_titles ?? [];
  const dirty = draft !== null;

  const save = useMutation({
    mutationFn: () =>
      claraApi<{ persona: IcpPersona }>(`/icp/personas/${primary!.id}`, {
        method: "PUT",
        body: JSON.stringify({ org_id: orgId, target_titles: titles }),
      }),
    onSuccess: (res) => {
      // Seed the cache from the response so clearing the draft doesn't
      // flash the old list while the refetch is in flight.
      qc.setQueryData<IcpPersonasResponse>(["icp-personas", orgId], (prev) =>
        prev
          ? { ...prev, personas: prev.personas.map((p) => (p.id === res.persona.id ? res.persona : p)) }
          : prev,
      );
      qc.invalidateQueries({ queryKey: ["target_titles", orgId] }); // account people lists
      setDraft(null);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    },
  });

  function add() {
    const v = input.trim();
    if (v && !titles.includes(v)) setDraft([...titles, v]);
    setInput("");
  }

  function remove(t: string) {
    setDraft(titles.filter((x) => x !== t));
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !input && titles.length) {
      remove(titles[titles.length - 1]);
    }
  }

  return (
    <Card delay={0.08} className="overflow-hidden">
      <div className="border-b border-border-subtle p-5">
        <SectionHeader
          title="Target roles"
          subtitle="The job titles Vera looks for at every account. Live people searches use the list straight away; each account's saved key contacts pick it up on their next refresh."
        />
      </div>
      <div className="p-5">
        {personas.isLoading ? (
          <Shimmer className="h-10 w-full max-w-md" />
        ) : personas.isError || !primary ? (
          <p className="text-[13px] text-text-muted">
            Couldn&apos;t load your target roles. Refresh to try again.
          </p>
        ) : (
          <>
            <span className="text-[12.5px] font-medium text-text-secondary">Job titles</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5 rounded-lg border border-border-default bg-bg-card px-2 py-1.5 focus-within:border-accent/50">
              {titles.map((t) => (
                <span
                  key={t}
                  className="flex items-center gap-1 rounded-md bg-bg-elevated px-2 py-1 text-[12.5px] text-text-primary"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => remove(t)}
                    aria-label={`Remove ${t}`}
                    className="text-text-muted transition-colors hover:text-state-danger"
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKey}
                onBlur={add}
                placeholder={titles.length === 0 ? "Add a title, press Enter" : ""}
                className="min-w-[160px] flex-1 bg-transparent px-1 py-0.5 text-[13px] text-text-primary outline-none placeholder:text-text-muted"
              />
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => save.mutate()}
                disabled={!dirty || titles.length === 0 || save.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-text-primary px-4 py-2 text-[13.5px] font-medium text-bg-card transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {save.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : savedFlash ? (
                  <Check size={14} />
                ) : null}
                {savedFlash ? "Saved" : "Save"}
              </button>
              <span className="text-[12px] text-text-muted">
                Type a title and press Enter to add it.
              </span>
            </div>
          </>
        )}
        {save.isError && (
          <p className="mt-3 text-[12.5px] text-red-400">
            {(save.error as Error)?.message ?? "Couldn't save. Try again."}
          </p>
        )}
      </div>
    </Card>
  );
}
