# PRODUCT.md — Vera

## Register

Product. The dashboard (`/dashboard/*`) is app UI where design serves the task.

## Who and why

Account-based sales intelligence for cybersecurity vendors and MSSPs. Users are
founders and senior sellers in cyber: technically literate, allergic to
marketing fluff, short on time. They come to see which target accounts moved
and why, then leave. "Intelligence, not outreach": Vera surfaces signals; it
never drafts openers.

## Brand personality

Calm, precise, credible. A senior analyst, not a hype machine. The interface
should read like a well-run SOC: dense where data earns it, quiet everywhere
else.

## Non-negotiable rules (enforced)

- No AI-slop copy. Labels say what the thing is. No "smart/intelligent" dressing.
- No em dashes in user-facing copy; use commas and periods.
- No monospace/uppercase code-style labels for dashboard content; sentence-case Geist.
- No backend vendor names in the UI (PredictLeads, Apollo, Apify, ...).
- No fabricated specificity: empty states over false positives, no invented dates.
- Org-agnostic: every shared widget must work for any client with no code changes.
- Slide-to-confirm on real-money and destructive actions.

## Anti-references

Generic SaaS dashboard chrome, gradient-text heroes, hero-metric cards,
AI-generated "engaging" copy. If it looks like a template, it's wrong.

## Visual system (tokens in app/globals.css)

Geist everywhere (font-display = font-sans). Purple accent (#7c3aed) reserved
for actions, selection, and live state. Light/dark themes via CSS variables:
bg-base / bg-card / bg-elevated, border-subtle/default/strong,
text-primary/secondary/muted. Restrained color strategy; the accent is the
only saturated voice on product surfaces.

## Motion

150-250ms state transitions as the default. Richer, longer motion is earned
only at genuine wait moments (onboarding build screens, first-run) and always
ships a prefers-reduced-motion fallback.
