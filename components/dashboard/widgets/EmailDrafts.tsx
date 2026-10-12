"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EmailDraft, EmailTone } from "@/lib/dashboard/types";

const TONE_ORDER: EmailTone[] = ["direct", "formal", "informal", "humour", "curiosity"];

const TONE_LABELS: Record<EmailTone, string> = {
  direct: "Direct",
  formal: "Formal",
  informal: "Informal",
  humour: "Humour",
  curiosity: "Curiosity",
};

const TONE_BLURBS: Record<EmailTone, string> = {
  direct: "Plain, no-frills, get-to-the-point.",
  formal: "Polished business English — for regulated industries.",
  informal: "Conversational, like a peer.",
  humour: "One well-placed joke landing off the prospect's situation.",
  curiosity: "Lead with a question; ask second.",
};

function CopyButton({
  text,
  label,
  size = "sm",
}: {
  text: string;
  label: string;
  size?: "sm" | "xs";
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Older browsers / insecure contexts — silent no-op
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-bg-base/50 font-mono uppercase tracking-[0.16em] transition-colors",
        size === "xs" ? "px-2 py-0.5 text-[9.5px]" : "px-2.5 py-1 text-[10.5px]",
        copied
          ? "border-accent/40 text-accent"
          : "text-text-muted hover:border-border-default hover:text-text-secondary",
      )}
      aria-label={`Copy ${label.toLowerCase()}`}
    >
      {copied ? <Check size={size === "xs" ? 9 : 11} strokeWidth={2.2} /> : <Copy size={size === "xs" ? 9 : 11} strokeWidth={1.8} />}
      <span>{copied ? "Copied" : `Copy ${label}`}</span>
    </button>
  );
}

// Render the body as discrete paragraphs split on blank lines, falling back
// to a single paragraph if the body has no breaks. Soft line breaks (single
// \n inside a paragraph) are preserved so wrapped poetry-style text still
// reads as the writer intended.
function EmailBody({ body }: { body: string }) {
  const paragraphs = body
    .split(/\n{2,}/g)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return null;

  return (
    <div className="flex flex-col gap-3.5 text-[12.5px] leading-[1.65] text-text-primary">
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  );
}

export interface EmailRecipient {
  name?: string | null;
  email?: string | null;
  company?: string | null;
}

export function EmailDraftsCard({
  drafts,
  recipient,
}: {
  drafts: Partial<Record<EmailTone, EmailDraft>>;
  recipient?: EmailRecipient;
}) {
  const availableTones = TONE_ORDER.filter((t) => drafts[t]);
  const [active, setActive] = useState<EmailTone>(availableTones[0] ?? "direct");

  if (availableTones.length === 0) return null;

  const draft = drafts[active];
  if (!draft) return null;

  const toLine = (() => {
    const name = recipient?.name?.trim();
    const email = recipient?.email?.trim();
    if (name && email) return `${name} <${email}>`;
    return name || email || recipient?.company || "—";
  })();

  const fullEmail = `Subject: ${draft.subject}\n\n${draft.body}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
      className="overflow-hidden rounded-2xl border border-border-default bg-bg-card"
    >
      <div className="flex items-center gap-2 border-b border-border-subtle px-7 py-4">
        <Mail size={14} strokeWidth={1.7} className="text-accent" />
        <h2 className="font-display text-[1.05rem] font-medium tracking-tight text-text-primary">
          Email drafts
        </h2>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
          Pick a tone · copy · send
        </span>
      </div>

      <div role="tablist" aria-label="Email tone" className="flex gap-1 overflow-x-auto border-b border-border-subtle bg-bg-base/30 px-7 py-2">
        {availableTones.map((tone) => {
          const isActive = tone === active;
          return (
            <button
              key={tone}
              role="tab"
              aria-selected={isActive}
              type="button"
              onClick={() => setActive(tone)}
              className={cn(
                "shrink-0 rounded-md px-3 py-1.5 text-[12px] font-medium tracking-tight transition-colors",
                isActive
                  ? "bg-accent/15 text-accent"
                  : "text-text-muted hover:bg-bg-elevated/40 hover:text-text-secondary",
              )}
            >
              {TONE_LABELS[tone]}
            </button>
          );
        })}
      </div>

      <div className="px-7 py-5">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-muted">
          {TONE_BLURBS[active]}
        </p>

        {/* Email envelope — looks like a draft sitting in an outbox */}
        <div className="mt-4 overflow-hidden rounded-xl border border-border-default bg-bg-base/70 shadow-sm">
          {/* Envelope header (To / Subject) */}
          <div className="flex flex-col divide-y divide-border-subtle/70">
            <div className="flex items-baseline gap-3 px-5 py-2.5">
              <span className="w-14 shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
                To
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-text-secondary">
                {toLine}
              </span>
            </div>
            <div className="flex items-baseline gap-3 px-5 py-2.5">
              <span className="w-14 shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
                Subject
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium tracking-tight text-text-primary">
                {draft.subject}
              </span>
              <CopyButton text={draft.subject} label="subject" size="xs" />
            </div>
          </div>

          {/* Body */}
          <div className="border-t border-border-subtle bg-bg-card/50 px-5 py-5">
            <EmailBody body={draft.body} />
          </div>

          {/* Compose-style footer */}
          <div className="flex items-center justify-between gap-3 border-t border-border-subtle bg-bg-base/30 px-5 py-2.5">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-text-muted">
              Draft · ready to send
            </span>
            <div className="flex items-center gap-1.5">
              <CopyButton text={draft.body} label="body" size="xs" />
              <CopyButton text={fullEmail} label="full" size="xs" />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
