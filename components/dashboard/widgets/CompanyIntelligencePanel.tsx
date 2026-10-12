"use client";

import { motion } from "framer-motion";
import {
  Award,
  Building2,
  CheckCircle2,
  Quote,
  ShieldCheck,
  Target,
  Wrench,
} from "lucide-react";
import {
  Card,
  Pill,
  SectionHeader,
} from "@/components/dashboard/primitives";
import type { WebsiteIntel } from "@/lib/dashboard/types";

interface Props {
  intel: WebsiteIntel | null | undefined;
  /** Pages scraped — shown as a small footer note for transparency. */
  pagesScraped?: string[];
}

/**
 * Surfaces the proprietary intelligence Vera extracted from the prospect's
 * own website — services, case study customers, compliance posture, and
 * positioning language. Each section is paired with a "why this matters"
 * line so the salesperson understands what to do with it, not just what
 * Vera found.
 *
 * Reads from `lead.enrichment_data.website`. Renders nothing if there's
 * no website intel on the lead.
 */
export function CompanyIntelligencePanel({ intel, pagesScraped }: Props) {
  if (!intel) return null;

  const hasAnything =
    (intel.services_offered?.length ?? 0) > 0 ||
    (intel.case_study_clients?.length ?? 0) > 0 ||
    (intel.case_study_industries?.length ?? 0) > 0 ||
    (intel.named_clients?.length ?? 0) > 0 ||
    (intel.certifications_mentioned?.length ?? 0) > 0 ||
    (intel.compliance_frameworks?.length ?? 0) > 0 ||
    (intel.differentiator_claims?.length ?? 0) > 0 ||
    intel.has_trust_centre === true;

  if (!hasAnything) return null;

  return (
    <Card delay={0.2} className="overflow-hidden">
      <div className="border-b border-border-subtle p-6 md:p-7">
        <SectionHeader
          title="Company intelligence"
          subtitle="What Vera extracted from this company's own website. None of this comes from a data vendor — it's all directly observed."
          right={
            pagesScraped && pagesScraped.length > 0 ? (
              <Pill variant="outline">
                {pagesScraped.length} {pagesScraped.length === 1 ? "page" : "pages"} scraped
              </Pill>
            ) : null
          }
        />
      </div>

      <div className="flex flex-col divide-y divide-border-subtle">
        {/* What they do — services + company type */}
        <ServicesSection intel={intel} />

        {/* Who they sell to — case studies, named customers, target industries */}
        <CustomersSection intel={intel} />

        {/* Trust posture — certifications, compliance, trust centre */}
        <CompliancePostureSection intel={intel} />

        {/* Their own words — differentiators + pain language */}
        <PositioningSection intel={intel} />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------
// Sub-sections
// ---------------------------------------------------------------

function ServicesSection({ intel }: { intel: WebsiteIntel }) {
  const services = intel.services_offered ?? [];
  if (services.length === 0 && !intel.company_type) return null;
  return (
    <SubSection
      Icon={Wrench}
      title="What they do"
      whyItMatters="Vera reads the prospect's own service pages so the briefing reflects what they actually sell — not a vendor's guess from a NAICS code."
    >
      {intel.company_type && (
        <div className="mb-3 text-[12.5px] text-text-secondary">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
            Type ·{" "}
          </span>
          {prettyCompanyType(intel.company_type)}
        </div>
      )}
      {services.length > 0 && (
        <ChipRow
          items={services}
          variant="muted"
          empty="No services listed publicly"
        />
      )}
    </SubSection>
  );
}

function CustomersSection({ intel }: { intel: WebsiteIntel }) {
  const studies = intel.case_study_clients ?? [];
  const named = intel.named_clients ?? [];
  const industries = intel.case_study_industries ?? [];
  const targetIndustries = intel.target_industries_mentioned ?? [];
  const targetBuyers = intel.target_buyer_personas_mentioned ?? [];

  if (
    studies.length === 0 &&
    named.length === 0 &&
    industries.length === 0 &&
    targetIndustries.length === 0
  ) {
    return null;
  }

  return (
    <SubSection
      Icon={Target}
      title="Who they sell to"
      whyItMatters="Their case studies + named customers reveal the prospect's proven ICP. Match those industries to your own buyer profile and the conversation writes itself."
    >
      {(studies.length > 0 || named.length > 0) && (
        <div className="mb-4">
          <Label>Customers we identified</Label>
          <ChipRow
            items={[...new Set([...studies, ...named])]}
            variant="accent"
            empty="—"
          />
          {(intel.number_of_case_studies ?? 0) > 0 && (
            <div className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-text-muted">
              {intel.number_of_case_studies} case{" "}
              {intel.number_of_case_studies === 1 ? "study" : "studies"} on site
            </div>
          )}
        </div>
      )}
      {industries.length > 0 && (
        <div className="mb-4">
          <Label>Industries in their case studies</Label>
          <ChipRow items={industries} variant="muted" empty="—" />
        </div>
      )}
      {targetIndustries.length > 0 && industries.length === 0 && (
        <div className="mb-4">
          <Label>Industries they target (per their site)</Label>
          <ChipRow items={targetIndustries} variant="muted" empty="—" />
        </div>
      )}
      {targetBuyers.length > 0 && (
        <div>
          <Label>Buyer personas they target</Label>
          <ChipRow items={targetBuyers} variant="muted" empty="—" />
        </div>
      )}
    </SubSection>
  );
}

function CompliancePostureSection({ intel }: { intel: WebsiteIntel }) {
  const certs = intel.certifications_mentioned ?? [];
  const frameworks = intel.compliance_frameworks ?? [];

  if (
    certs.length === 0 &&
    frameworks.length === 0 &&
    intel.has_trust_centre !== true
  ) {
    return null;
  }

  return (
    <SubSection
      Icon={ShieldCheck}
      title="Trust & compliance posture"
      whyItMatters="What this company publicly claims about its security posture. Compliance gaps in regulated industries are a buying window — and missing certifications versus competitors are real positioning hooks."
    >
      <div className="flex flex-wrap items-center gap-2">
        {intel.has_trust_centre === true && (
          <Pill variant="accent" className="!normal-case !tracking-normal">
            <CheckCircle2 size={11} strokeWidth={2} />
            Public trust centre
          </Pill>
        )}
        {certs.map((c) => (
          <Pill
            key={`cert-${c}`}
            variant="accent"
            className="!normal-case !tracking-normal"
          >
            <Award size={10} strokeWidth={2} />
            {c}
          </Pill>
        ))}
        {frameworks.map((f) => (
          <Pill
            key={`framework-${f}`}
            variant="muted"
            className="!normal-case !tracking-normal"
          >
            {f}
          </Pill>
        ))}
      </div>
    </SubSection>
  );
}

function PositioningSection({ intel }: { intel: WebsiteIntel }) {
  const claims = intel.differentiator_claims ?? [];
  const painLanguage = intel.pain_point_language_used ?? [];
  if (claims.length === 0 && painLanguage.length === 0) return null;

  return (
    <SubSection
      Icon={Quote}
      title="Their own positioning"
      whyItMatters="Verbatim phrases from the prospect's site. Use one of these in your opening line so the email sounds like a peer who's read their site, not a vendor reading from a script."
    >
      {claims.length > 0 && (
        <div className="mb-3">
          <Label>Differentiator claims</Label>
          <ul className="mt-2 flex flex-col gap-1.5">
            {claims.slice(0, 6).map((c, i) => (
              <li
                key={i}
                className="rounded-lg border border-border-subtle bg-bg-elevated/40 px-3 py-2 text-[12.5px] italic leading-relaxed text-text-secondary"
              >
                &ldquo;{c}&rdquo;
              </li>
            ))}
          </ul>
        </div>
      )}
      {painLanguage.length > 0 && (
        <div>
          <Label>Pain-point language they use</Label>
          <ChipRow items={painLanguage.slice(0, 8)} variant="muted" empty="—" />
        </div>
      )}
    </SubSection>
  );
}

// ---------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------

function SubSection({
  Icon,
  title,
  whyItMatters,
  children,
}: {
  Icon: typeof Wrench;
  title: string;
  whyItMatters: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="px-6 py-5 md:px-7 md:py-6"
    >
      <div className="mb-3 flex items-center gap-2">
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
          <Icon size={13} strokeWidth={1.7} />
        </div>
        <h3 className="font-display text-[14px] font-medium tracking-tight text-text-primary">
          {title}
        </h3>
      </div>
      <p className="mb-4 max-w-2xl text-[12px] leading-relaxed text-text-muted">
        <span className="font-mono uppercase tracking-[0.18em] text-text-muted">
          Why it matters ·{" "}
        </span>
        {whyItMatters}
      </p>
      {children}
    </motion.div>
  );
}

function ChipRow({
  items,
  variant,
  empty,
}: {
  items: string[];
  variant: "accent" | "muted";
  empty: string;
}) {
  if (items.length === 0) {
    return (
      <span className="text-[12.5px] text-text-muted">{empty}</span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <Pill
          key={`${item}-${i}`}
          variant={variant}
          className="!normal-case !tracking-normal"
        >
          {item}
        </Pill>
      ))}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
      {children}
    </div>
  );
}

// Map raw company_type values from the prompt schema to readable labels
function prettyCompanyType(t: string): string {
  switch (t.toLowerCase()) {
    case "mssp":
      return "MSSP (Managed Security Service Provider)";
    case "pen_testing":
      return "Penetration testing";
    case "threat_intel":
      return "Threat intelligence";
    case "grc":
      return "GRC (Governance, Risk, Compliance)";
    case "consulting":
      return "Cybersecurity consulting";
    case "product":
      return "Cybersecurity product / SaaS";
    case "mixed":
      return "Mixed / multi-discipline";
    default:
      return t;
  }
}
