/**
 * Format the Apollo employee-range string for display.
 *
 * Apollo stores headcount ranges as a literal "low,high" string —
 * "1001,5000", "51,200", "10001,1000000". Rendered raw, "1001,5000"
 * looks like a malformed number ("1001,50…" when truncated). This
 * helper turns it into a clean "1,001–5,000" with the upper bucket
 * "10001,1000000" shown as "10,000+".
 *
 * Also handles the legacy single-number case (e.g. "2900" already
 * captured on some old SDGE-style rows) — just inserts thousands
 * separators and returns it as-is.
 */
export function formatSizeBand(s: string | null | undefined): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed) return null;

  // Apollo "low,high" — two ints separated by a comma.
  const m = trimmed.match(/^(\d+),(\d+)$/);
  if (m) {
    const lo = parseInt(m[1], 10);
    const hi = parseInt(m[2], 10);
    // Apollo uses 1,000,000 as the sentinel for "10k+". Render as "10k+"
    // rather than the literal "1,000,000" upper bound.
    if (hi >= 1_000_000) return `${formatNumber(lo)}+`;
    return `${formatNumber(lo)}–${formatNumber(hi)}`;
  }

  // Single-number form or already-formatted — number-format if pure digits,
  // otherwise pass through.
  if (/^\d+$/.test(trimmed)) return formatNumber(parseInt(trimmed, 10));
  return trimmed;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}
