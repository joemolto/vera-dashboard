import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface PollOptions {
  maxDurationMs?: number;
  initialIntervalMs?: number;
  backoffAfterMs?: number;
  backoffIntervalMs?: number;
}

const DEFAULTS: Required<PollOptions> = {
  maxDurationMs: 180_000,
  initialIntervalMs: 5_000,
  backoffAfterMs: 60_000,
  backoffIntervalMs: 10_000,
};

export class PollTimeoutError extends Error {
  isSoftTimeout = true;
  constructor() {
    super("Research is taking longer than usual. Check back shortly.");
    this.name = "PollTimeoutError";
  }
}

export async function pollLeadStatus(
  leadId: string,
  options: PollOptions = {},
): Promise<Record<string, unknown>> {
  const opts = { ...DEFAULTS, ...options };
  const start = Date.now();
  const supabase = createSupabaseBrowserClient();

  while (Date.now() - start < opts.maxDurationMs) {
    const elapsed = Date.now() - start;
    const interval =
      elapsed < opts.backoffAfterMs
        ? opts.initialIntervalMs
        : opts.backoffIntervalMs;
    await new Promise((r) => setTimeout(r, interval));
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();
    if (error) continue;
    const fully =
      data.enrichment_status === "enriched" && data.scored_at !== null;
    if (fully) return data;
  }
  throw new PollTimeoutError();
}
