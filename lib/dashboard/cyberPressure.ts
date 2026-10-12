/**
 * Cyber-pressure derivations for the tabbed account page.
 *
 * Pure functions — no React, no fetching. Take account inputs, return
 * structured signals (frameworks, regulated exposure, sensitive data,
 * security proof gaps) + the four scores (fit, timing, cyber pressure,
 * data confidence).
 *
 * Everything here is *inferred from public data we already collect*.
 * Inferred items are labelled so the UI can render them honestly.
 */

// ---------------------------------------------------------------------------
// Framework detection — beyond what deep_research_data.compliance keys cover.
// ---------------------------------------------------------------------------

export const FRAMEWORKS = [
  { id: "soc_2", label: "SOC 2", patterns: [/\bsoc[\s\-]?2\b/i, /soc\s*ii/i] },
  { id: "iso_27001", label: "ISO 27001", patterns: [/iso[\s/\-]?27001/i, /iso[\s/\-]?27\d{3}/i] },
  { id: "iso_27017", label: "ISO 27017", patterns: [/iso[\s/\-]?27017/i] },
  { id: "iso_27018", label: "ISO 27018", patterns: [/iso[\s/\-]?27018/i] },
  { id: "pci_dss", label: "PCI-DSS", patterns: [/pci[\s\-]?dss/i, /\bpci\b/i] },
  { id: "hipaa", label: "HIPAA", patterns: [/\bhipaa\b/i] },
  { id: "hitrust", label: "HITRUST", patterns: [/\bhitrust\b/i] },
  { id: "gdpr", label: "GDPR", patterns: [/\bgdpr\b/i, /general data protection/i] },
  { id: "ccpa", label: "CCPA", patterns: [/\bccpa\b/i, /california consumer privacy/i] },
  { id: "nis2", label: "NIS2", patterns: [/\bnis[\s\-]?2\b/i, /\bnis\s*ii\b/i] },
  { id: "dora", label: "DORA", patterns: [/\bdora\b/i, /digital operational resilience/i] },
  { id: "fedramp", label: "FedRAMP", patterns: [/fed[\s\-]?ramp/i] },
  { id: "cmmc", label: "CMMC", patterns: [/\bcmmc\b/i] },
  { id: "cyber_essentials", label: "Cyber Essentials", patterns: [/cyber essentials/i] },
  { id: "cyber_essentials_plus", label: "Cyber Essentials+", patterns: [/cyber essentials\s*plus/i, /ce\+/i] },
  { id: "crest", label: "CREST", patterns: [/\bcrest\b/i] },
  { id: "check", label: "CHECK", patterns: [/\bcheck\b/i] },
  { id: "swift_csp", label: "SWIFT CSP", patterns: [/swift\s*csp/i] },
  { id: "soc_1", label: "SOC 1", patterns: [/\bsoc[\s\-]?1\b/i] },
] as const;

export type FrameworkId = (typeof FRAMEWORKS)[number]["id"];

export interface DetectedFramework {
  id: FrameworkId;
  label: string;
  source: "confirmed" | "mentioned";
  evidence?: string;
}

/**
 * Detect frameworks across multiple inputs.
 *
 *  - `confirmed`: explicit boolean=true in deep_research_data.compliance, or
 *    listed in `other_certifications`.
 *  - `mentioned`: regex match in description/business intel text — present
 *    on public surfaces but not formally claimed as a certification.
 */
export function detectFrameworks(args: {
  compliance: Record<string, unknown> | null | undefined;
  otherCertifications: unknown;
  texts: (string | null | undefined)[];
}): DetectedFramework[] {
  const out: DetectedFramework[] = [];
  const seen = new Set<FrameworkId>();

  const compliance = args.compliance ?? {};

  for (const fw of FRAMEWORKS) {
    // 1. Confirmed via compliance boolean
    const flag = (compliance as Record<string, unknown>)[fw.id];
    if (flag === true || flag === "true" || flag === "yes") {
      out.push({ id: fw.id, label: fw.label, source: "confirmed" });
      seen.add(fw.id);
      continue;
    }
  }

  // 2. Confirmed via other_certifications array (free-text certs the engine pulled out)
  const otherCerts = normaliseStringList(args.otherCertifications);
  for (const cert of otherCerts) {
    for (const fw of FRAMEWORKS) {
      if (seen.has(fw.id)) continue;
      if (fw.patterns.some((p) => p.test(cert))) {
        out.push({ id: fw.id, label: fw.label, source: "confirmed", evidence: cert });
        seen.add(fw.id);
      }
    }
  }

  // 3. Mentioned in description / website text
  const combined = args.texts
    .filter((t): t is string => !!t && typeof t === "string")
    .join(" \n ");
  if (combined) {
    for (const fw of FRAMEWORKS) {
      if (seen.has(fw.id)) continue;
      if (fw.patterns.some((p) => p.test(combined))) {
        out.push({ id: fw.id, label: fw.label, source: "mentioned" });
        seen.add(fw.id);
      }
    }
  }

  return out;
}

function normaliseStringList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x) => String(x)).filter(Boolean);
  if (typeof raw === "string" && raw.trim()) return [raw];
  return [];
}

// ---------------------------------------------------------------------------
// Regulated-industry exposure — both the account's own industry AND the
// industries of their customers (case studies).
// ---------------------------------------------------------------------------

const REGULATED_SEGMENTS: { id: string; label: string; patterns: RegExp[] }[] = [
  { id: "financial_services", label: "Financial services", patterns: [/financ/i, /\bbank/i, /capital markets/i, /asset management/i, /wealth/i] },
  { id: "insurance", label: "Insurance", patterns: [/insur/i, /reinsur/i, /underwrit/i] },
  { id: "healthcare", label: "Healthcare", patterns: [/health/i, /hospital/i, /clinic/i, /medical/i, /pharma/i, /biotech/i, /life sciences/i] },
  { id: "government", label: "Government & defence", patterns: [/government/i, /\bgov\b/i, /public sector/i, /defen[cs]e/i, /military/i, /federal/i, /agency/i] },
  { id: "critical_infra", label: "Critical infrastructure", patterns: [/utilit/i, /energy/i, /electric/i, /water/i, /oil\s*&?\s*gas/i, /nuclear/i] },
  { id: "telecom", label: "Telecom", patterns: [/telecom/i, /telco/i, /carrier/i, /mobile network/i] },
  { id: "education", label: "Education", patterns: [/educat/i, /universit/i, /school/i, /\bk-?12\b/i] },
  { id: "legal", label: "Legal", patterns: [/\blegal\b/i, /law firm/i, /barrister/i] },
  { id: "retail_payments", label: "Retail & payments", patterns: [/retail/i, /e-?commerce/i, /payments/i, /point of sale/i, /\bpos\b/i] },
];

export interface RegulatedExposure {
  ownIndustry: { id: string; label: string } | null;
  customerSegments: { id: string; label: string; evidence: string }[];
}

export function deriveRegulatedExposure(args: {
  industry: string | null | undefined;
  description: string | null | undefined;
  customerNames: string[];
  caseStudyIndustries: string[];
}): RegulatedExposure {
  let ownIndustry: RegulatedExposure["ownIndustry"] = null;
  const haystack = `${args.industry ?? ""} ${args.description ?? ""}`;
  for (const seg of REGULATED_SEGMENTS) {
    if (seg.patterns.some((p) => p.test(haystack))) {
      ownIndustry = { id: seg.id, label: seg.label };
      break;
    }
  }

  const customerSegments: RegulatedExposure["customerSegments"] = [];
  const seen = new Set<string>();
  for (const name of [...args.caseStudyIndustries, ...args.customerNames]) {
    if (!name) continue;
    for (const seg of REGULATED_SEGMENTS) {
      if (seen.has(seg.id)) continue;
      if (seg.patterns.some((p) => p.test(name))) {
        customerSegments.push({ id: seg.id, label: seg.label, evidence: name });
        seen.add(seg.id);
        break;
      }
    }
  }

  return { ownIndustry, customerSegments };
}

// ---------------------------------------------------------------------------
// Sensitive data indicators — handles PII / PHI / payment / identity data?
// ---------------------------------------------------------------------------

const SENSITIVE_DATA_TYPES: { id: string; label: string; patterns: RegExp[] }[] = [
  { id: "pii", label: "Personal data (PII)", patterns: [/\bpii\b/i, /personal data/i, /personally identifiable/i, /customer data/i] },
  { id: "phi", label: "Health data (PHI)", patterns: [/\bphi\b/i, /protected health/i, /patient data/i, /clinical/i, /medical record/i, /ehr/i, /emr/i] },
  { id: "payment", label: "Payment / cardholder data", patterns: [/cardholder/i, /credit card/i, /payment data/i, /pci/i, /\bpan\b/i] },
  { id: "identity", label: "Identity / authentication", patterns: [/identity/i, /authentication/i, /biometric/i, /\bkyc\b/i, /\baml\b/i, /know.your.customer/i] },
  { id: "financial", label: "Financial transactions", patterns: [/transactions?/i, /trading/i, /portfolio/i, /accounting/i, /payroll/i] },
  { id: "ip", label: "Intellectual property", patterns: [/intellectual property/i, /\bip\b/i, /trade secret/i, /proprietary/i, /r&d/i, /research and dev/i] },
];

export function deriveSensitiveData(args: {
  description: string | null | undefined;
  industry: string | null | undefined;
  services: string[];
}): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const haystack = [args.description, args.industry, ...args.services]
    .filter(Boolean)
    .join(" \n ");
  if (!haystack) return out;
  for (const t of SENSITIVE_DATA_TYPES) {
    if (t.patterns.some((p) => p.test(haystack))) {
      out.push({ id: t.id, label: t.label });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Security proof gaps — public-surface things you'd expect a serious cyber
// posture to have, but the data doesn't show.
//
// Carefully scoped by the no-misleading-gap-indicators rule: only surface
// gaps where ABSENCE is genuinely meaningful. Never imply a missing EDR/SIEM
// is a "gap" (false negative rate too high). Stick to *public* proof.
// ---------------------------------------------------------------------------

/**
 * Observed *visibility* of public security/compliance proof. These are NOT
 * deficiency claims about the company — only observations about what's
 * (or isn't) on the public surface today.
 *
 * Absence of evidence is not evidence of absence: a regulated company
 * almost certainly holds the standard frameworks internally. The fact
 * that they're not published on the marketing site is meaningful for the rep's *discovery
 * motion* (they'll have to ask rather than reference), not a statement
 * about the prospect's capability.
 *
 * Renamed 2026-05-28 from `SecurityProofGap` + `deriveSecurityProofGaps`
 * which were misframed as deficiency signals.
 */
export interface PublicProofVisibility {
  id: string;
  label: string;
  why: string;
}

export function derivePublicProofVisibility(args: {
  securityPosture: Record<string, unknown> | null | undefined;
  frameworks: DetectedFramework[];
  regulatedExposure: RegulatedExposure;
}): PublicProofVisibility[] {
  const out: PublicProofVisibility[] = [];
  const posture = args.securityPosture ?? {};

  const has = (k: string) => posture[k] === true || posture[k] === "true";

  const sellsToRegulated =
    !!args.regulatedExposure.ownIndustry ||
    args.regulatedExposure.customerSegments.length > 0;

  const hasFormalCert = args.frameworks.some((f) => f.source === "confirmed");

  if (sellsToRegulated && !has("has_trust_centre")) {
    out.push({
      id: "no_public_trust_centre",
      label: "No public trust centre",
      why: "You'll need to ask for security documentation in discovery rather than reference it up front. Most regulated companies have this — just not surfaced publicly.",
    });
  }
  if (sellsToRegulated && !hasFormalCert) {
    out.push({
      id: "no_public_cert_claim",
      label: "No certification visible on public surfaces",
      why: "A company of this profile almost certainly holds SOC 2 / ISO 27001 internally — kept behind procurement / NDA. Confirm during discovery.",
    });
  }
  if (sellsToRegulated && !has("has_security_page")) {
    out.push({
      id: "no_public_security_page",
      label: "No public security page",
      why: "Discovery question for the rep, not a posture claim about the prospect.",
    });
  }
  if (!has("has_responsible_disclosure") && hasFormalCert) {
    out.push({
      id: "no_public_disclosure_program",
      label: "No public responsible disclosure program",
      why: "They hold a formal cert but no public researcher reporting path. Common — usually a documentation gap rather than a security one.",
    });
  }

  return out;
}

// Backwards-compat alias for callers that still reference the old names.
// New code should use derivePublicProofVisibility / PublicProofVisibility.
export type SecurityProofGap = PublicProofVisibility;
export const deriveSecurityProofGaps = derivePublicProofVisibility;

// ---------------------------------------------------------------------------
// Four scores: fit / timing / cyber pressure / data confidence.
//
// Deterministic. No LLM. Designed so the bands have honest meaning,
// not vanity-pumped scores.
// ---------------------------------------------------------------------------

export type ScoreBand = "high" | "medium" | "low" | "unknown";

export interface ScoreValue {
  value: number;       // 0-100
  band: ScoreBand;
  reasoning: string;
}

export interface AccountScorecard {
  fit: ScoreValue;
  timing: ScoreValue;
  cyberPressure: ScoreValue;
  dataConfidence: ScoreValue;
}

function bandFor(v: number): ScoreBand {
  if (v >= 70) return "high";
  if (v >= 40) return "medium";
  return "low";
}

export function computeScorecard(args: {
  industry: string | null;
  sizeBand: string | null;
  highValueSegments: string[];
  latestSignalAt: string | null;
  signalCount: number;
  growthSignalCount: number;
  cyberFindingCount: number;
  frameworks: DetectedFramework[];
  regulatedExposure: RegulatedExposure;
  sensitiveData: { id: string; label: string }[];
  proofGaps: SecurityProofGap[];
  enrichedAt: string | null;
}): AccountScorecard {
  // ----- Fit: how well this account matches the cyber-vendor ICP -----
  let fit = 30;
  const fitReasons: string[] = [];
  const ind = (args.industry ?? "").toLowerCase();
  const inHighValue =
    args.highValueSegments.some((seg) => seg && ind.includes(seg.toLowerCase()));
  if (inHighValue) {
    fit += 25;
    fitReasons.push("in your high-value segment");
  }
  if (args.regulatedExposure.ownIndustry) {
    fit += 20;
    fitReasons.push("regulated industry");
  }
  if (args.regulatedExposure.customerSegments.length > 0) {
    fit += 15;
    fitReasons.push("serves regulated customers");
  }
  const emp = parseEmp(args.sizeBand);
  if (emp != null && emp >= 200) {
    fit += 10;
    fitReasons.push("enterprise-scale");
  }
  fit = Math.min(100, fit);

  // ----- Timing: how recently has the account moved -----
  let timing = 0;
  let timingReason = "no public movement in 90+ days";
  if (args.latestSignalAt) {
    const days = (Date.now() - new Date(args.latestSignalAt).getTime()) / 86_400_000;
    if (days < 7) {
      timing = 90;
      timingReason = `fresh signal in last week`;
    } else if (days < 30) {
      timing = 65;
      timingReason = `signal in last month`;
    } else if (days < 90) {
      timing = 35;
      timingReason = `signal in last quarter`;
    } else {
      timing = 15;
      timingReason = `last signal > 90 days ago`;
    }
  }
  // Stack growth signals on top
  if (args.growthSignalCount > 0) timing = Math.min(100, timing + 10);

  // ----- Cyber pressure: do they need what cyber vendors sell -----
  let pressure = 0;
  const pressureReasons: string[] = [];
  if (args.regulatedExposure.ownIndustry) {
    pressure += 25;
    pressureReasons.push("regulated themselves");
  }
  if (args.regulatedExposure.customerSegments.length > 0) {
    pressure += 20;
    pressureReasons.push(`serves ${args.regulatedExposure.customerSegments.length} regulated segment(s)`);
  }
  if (args.sensitiveData.length > 0) {
    pressure += 15;
    pressureReasons.push(`handles ${args.sensitiveData.length} sensitive data type(s)`);
  }
  if (args.cyberFindingCount > 0) {
    pressure += Math.min(20, args.cyberFindingCount * 5);
    pressureReasons.push(`${args.cyberFindingCount} cyber-relevant signal(s)`);
  }
  if (args.proofGaps.length > 0) {
    pressure += Math.min(15, args.proofGaps.length * 5);
    // Visibility framing (absence of evidence is not evidence of absence)
    pressureReasons.push(
      `${args.proofGaps.length} public-proof item${args.proofGaps.length === 1 ? "" : "s"} not visible`,
    );
  }
  if (args.frameworks.length === 0 && args.regulatedExposure.ownIndustry) {
    pressure += 10;
    pressureReasons.push("no public framework certs");
  }
  pressure = Math.min(100, pressure);

  // ----- Data confidence: how much do we actually know -----
  let confidence = 0;
  const confidenceAxes = [
    !!args.industry,
    !!args.sizeBand,
    !!args.latestSignalAt,
    args.signalCount > 0,
    args.frameworks.length > 0,
    args.regulatedExposure.customerSegments.length > 0 ||
      args.regulatedExposure.ownIndustry != null,
    !!args.enrichedAt,
  ];
  const axisCount = confidenceAxes.filter(Boolean).length;
  confidence = Math.round((axisCount / confidenceAxes.length) * 100);
  // Penalise stale data
  if (args.enrichedAt) {
    const ageDays = (Date.now() - new Date(args.enrichedAt).getTime()) / 86_400_000;
    if (ageDays > 60) confidence = Math.max(0, confidence - 20);
    else if (ageDays > 30) confidence = Math.max(0, confidence - 10);
  }

  return {
    fit: {
      value: fit,
      band: bandFor(fit),
      reasoning: fitReasons.length > 0 ? fitReasons.join(", ") : "limited fit signal",
    },
    timing: {
      value: timing,
      band: bandFor(timing),
      reasoning: timingReason,
    },
    cyberPressure: {
      value: pressure,
      band: bandFor(pressure),
      reasoning:
        pressureReasons.length > 0
          ? pressureReasons.join(", ")
          : "no public cyber pressure detected",
    },
    dataConfidence: {
      value: confidence,
      band: bandFor(confidence),
      reasoning: `${axisCount} of ${confidenceAxes.length} evidence axes`,
    },
  };
}

function parseEmp(sizeBand: string | null): number | null {
  if (!sizeBand) return null;
  const nums = (sizeBand.match(/\d+/g) ?? []).map(Number).filter((n) => !isNaN(n));
  if (nums.length === 0) return null;
  if (nums.length >= 2) return Math.floor((nums[0] + nums[1]) / 2);
  return nums[0];
}

// ---------------------------------------------------------------------------
// "Why this account matters" — synthesise an interpretive paragraph from
// the four scores + top signals. Deterministic, no LLM.
// ---------------------------------------------------------------------------

export interface WhyThisMattersSummary {
  /** Headline — the account name. No narrative, no "X is moving" copy. */
  headline: string;
  /** Plain factual context line — derived from scores, no embellishment. */
  context: string;
  /** Up to 3 top public signals with short labels. */
  topSignals: { label: string; detail?: string }[];
  /** Operating context — observed facts about who they are / who they sell to.
   *  Never an inference about how they feel or what they need. */
  operatingContext: string | null;
  band: ScoreBand;
}

export function synthesiseWhyMatters(args: {
  companyName: string;
  scorecard: AccountScorecard;
  topSignalLabels: { label: string; detail?: string }[];
  regulatedExposure: RegulatedExposure;
  sensitiveData: { id: string; label: string }[];
  frameworks: DetectedFramework[];
  proofGaps: SecurityProofGap[];
}): WhyThisMattersSummary {
  // Stripped template-y headlines 2026-05-28 ("X is moving — and the cyber
  // surface is real"). Rule: facts only, no AI-style narrative.
  // The headline is now just the company name; the band drives the colour.
  const { scorecard, companyName } = args;
  const band: ScoreBand =
    scorecard.timing.band === "high" || scorecard.cyberPressure.band === "high"
      ? "high"
      : scorecard.timing.band === "medium" || scorecard.cyberPressure.band === "medium"
        ? "medium"
        : "low";

  // Operating-context: who they are + who they sell to + what data they
  // handle. Observed facts, no "pressure" language, no "they need X" claims.
  const parts: string[] = [];
  if (args.regulatedExposure.ownIndustry) {
    parts.push(
      `Regulated industry: ${args.regulatedExposure.ownIndustry.label.toLowerCase()}`,
    );
  }
  if (args.regulatedExposure.customerSegments.length > 0) {
    const segs = args.regulatedExposure.customerSegments
      .map((s) => s.label.toLowerCase())
      .slice(0, 3)
      .join(", ");
    parts.push(`Sells into ${segs}`);
  }
  if (args.sensitiveData.length > 0) {
    parts.push(
      `Handles ${args.sensitiveData.map((d) => d.label.toLowerCase()).slice(0, 2).join(" and ")}`,
    );
  }
  if (
    args.frameworks.length === 0
    && (args.regulatedExposure.ownIndustry || args.regulatedExposure.customerSegments.length > 0)
  ) {
    parts.push(
      "No SOC 2 / ISO 27001 visible on the public surface (likely held behind procurement)",
    );
  } else if (args.proofGaps.length > 0) {
    parts.push(
      `${args.proofGaps.length} security/compliance item${args.proofGaps.length === 1 ? "" : "s"} not surfaced publicly`,
    );
  }
  const operatingContext = parts.length > 0 ? parts.join(". ") + "." : null;

  // Context line: just the factual score reasoning, joined plainly.
  const contextParts: string[] = [];
  if (scorecard.timing.band !== "low") contextParts.push(scorecard.timing.reasoning);
  if (scorecard.cyberPressure.band !== "low") contextParts.push(scorecard.cyberPressure.reasoning);
  const context = contextParts.length > 0
    ? capitalise(contextParts.join(". ") + ".")
    : "Public surface is quiet.";

  return {
    headline: companyName,
    context,
    topSignals: args.topSignalLabels.slice(0, 3),
    operatingContext,
    band,
  };
}

function capitalise(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Tech detection tier — translate detection_methods array into the
// confirmed / mentioned / detected / inferred taxonomy from the spec.
// ---------------------------------------------------------------------------

export type TechTier = "confirmed" | "mentioned" | "detected" | "inferred";

export function techTier(detectionMethods: string[] | undefined | null): TechTier {
  if (!detectionMethods || detectionMethods.length === 0) return "inferred";
  const lc = detectionMethods.map((m) => m.toLowerCase());
  // DNS records / HTML source / official partner page = confirmed (we can prove it)
  if (lc.some((m) => m === "dns" || m === "htmlsourcecode" || m === "subprocessor")) {
    return "confirmed";
  }
  // Job description / subpage scrape = mentioned (it appears publicly but
  // isn't necessarily live in production)
  if (lc.some((m) => m === "joblisting" || m === "subpage" || m === "case_study")) {
    return "mentioned";
  }
  // PL behavioural / sdk-detection / heuristic = detected
  return "detected";
}

export const TECH_TIER_LABELS: Record<TechTier, string> = {
  confirmed: "Confirmed",
  mentioned: "Mentioned",
  detected: "Detected",
  inferred: "Inferred",
};

export const TECH_TIER_DESCRIPTIONS: Record<TechTier, string> = {
  confirmed: "Live evidence on the public surface (DNS record, HTML source, subprocessor list)",
  mentioned: "Named in a public artefact (job description, security page, case study)",
  detected: "Behavioural fingerprint — tool likely in use but not provable",
  inferred: "Stack pattern suggests this — no direct evidence",
};

// ---------------------------------------------------------------------------
// Signal-source URL extraction — pull the best URL out of signal_data
// across all the shapes the engine writes.
// ---------------------------------------------------------------------------

export function extractSignalUrl(
  signalData: Record<string, unknown> | undefined | null,
): string | null {
  if (!signalData) return null;
  const candidates = [
    signalData.source_url,
    signalData.url,
    signalData.link,
    signalData.article_url,
    signalData.posting_url,
    signalData.profile_url,
    signalData.evidence_url,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && /^https?:\/\//i.test(c)) return c;
  }
  return null;
}

/**
 * Defensive guard for the tenure-claim bug class (2026-05-28).
 *
 * `security_leadership_hire` is supposed to mean *the person is new in
 * seat*. Pre-fix engine code fired it whenever the lead had a security
 * title, with no tenure check — producing copy like "X has a new
 * security leader" for people who'd been there for years.
 *
 * Returns true when the signal carries dated evidence of newness:
 *   - evidence_kind set by the post-fix engine (predictleads_event |
 *     linkedin_started_at), OR
 *   - hire_event_summary (PL news mention with date), OR
 *   - started_at within the last ~180 days (defence in depth in case
 *     the engine wrote started_at but not evidence_kind).
 *
 * Any `security_leadership_hire` signal that fails this check is a
 * stale/buggy row and must NOT drive "new in seat" copy. The dashboard
 * filters those rows out at render time via filterTenureClaimSignals.
 */
export function hasTenureEvidence(
  signalData: Record<string, unknown> | undefined | null,
): boolean {
  if (!signalData) return false;
  if (typeof signalData.evidence_kind === "string" && signalData.evidence_kind) {
    return true;
  }
  if (
    typeof signalData.hire_event_summary === "string" &&
    signalData.hire_event_summary.length > 0
  ) {
    return true;
  }
  const startedAt = signalData.started_at;
  if (typeof startedAt === "string" && startedAt) {
    try {
      const startMs = new Date(startedAt).getTime();
      if (!Number.isNaN(startMs)) {
        const daysAgo = (Date.now() - startMs) / 86_400_000;
        if (daysAgo <= 180) return true;
      }
    } catch {
      /* fall through */
    }
  }
  return false;
}

/**
 * Drop any signal whose type implies a person-tenure claim but whose
 * signal_data lacks the evidence to back it up. Renders are safer with
 * a missing row than a hallucinated one.
 */
export function filterTenureClaimSignals<
  T extends { signal_type: string; signal_data?: Record<string, unknown> | null },
>(signals: T[]): T[] {
  return signals.filter((s) => {
    if (
      s.signal_type === "security_leadership_hire" ||
      s.signal_type === "person_new_in_role" ||
      s.signal_type === "person_promoted" ||
      s.signal_type === "person_changed_company"
    ) {
      return hasTenureEvidence(s.signal_data ?? null);
    }
    return true;
  });
}

export function extractSignalSourceLabel(
  signalSource: string | undefined | null,
  signalData: Record<string, unknown> | undefined | null,
): string | null {
  if (typeof signalData?.source_label === "string") return signalData.source_label;
  if (typeof signalData?.publisher === "string") return signalData.publisher;
  if (!signalSource) return null;
  // Source strings from the engine like "predictleads_news" → "News"
  const known: Record<string, string> = {
    predictleads_news: "News",
    predictleads_funding: "Funding announcement",
    predictleads_acquisition: "M&A filing",
    predictleads_job: "Job posting",
    predictleads_tech: "Tech detection",
    apollo_people: "Apollo people graph",
    company_website: "Company website",
    deep_research: "Public research",
    tavily_search: "Search",
    perplexity_search: "Search",
  };
  return known[signalSource] ?? null;
}
