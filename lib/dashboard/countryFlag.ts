/**
 * Country name → flag emoji. Tolerant to common variants (US/USA/United
 * States/America). Returns null for unrecognised inputs so the caller can
 * render country text alone.
 *
 * Covers the long tail of countries that show up in Apollo's hq_country.
 * Anything missing falls through to null — adds country, not bugs.
 */

const ALIAS: Record<string, string> = {
  // Country aliases → canonical key in FLAGS
  america: "united states",
  usa: "united states",
  us: "united states",
  "united states of america": "united states",
  uk: "united kingdom",
  "u.k.": "united kingdom",
  britain: "united kingdom",
  "great britain": "united kingdom",
  england: "united kingdom",
  scotland: "united kingdom",
  wales: "united kingdom",
  "northern ireland": "united kingdom",
  uae: "united arab emirates",
  "u.a.e.": "united arab emirates",
  "korea, south": "south korea",
  "republic of korea": "south korea",
  "korea, north": "north korea",
  "russian federation": "russia",
  czechia: "czech republic",
  "ivory coast": "côte d'ivoire",
  "cote d'ivoire": "côte d'ivoire",

  // US states — older engine rows store location like "Boston,
  // Massachusetts" with no explicit country. Mapping each state to
  // "united states" so the right-to-left walk in countryFlag()
  // resolves to the USA flag.
  alabama: "united states", alaska: "united states", arizona: "united states",
  arkansas: "united states", california: "united states", colorado: "united states",
  connecticut: "united states", delaware: "united states", florida: "united states",
  georgia: "united states", hawaii: "united states", idaho: "united states",
  illinois: "united states", indiana: "united states", iowa: "united states",
  kansas: "united states", kentucky: "united states", louisiana: "united states",
  maine: "united states", maryland: "united states", massachusetts: "united states",
  michigan: "united states", minnesota: "united states", mississippi: "united states",
  missouri: "united states", montana: "united states", nebraska: "united states",
  nevada: "united states", "new hampshire": "united states", "new jersey": "united states",
  "new mexico": "united states", "new york": "united states",
  "north carolina": "united states", "north dakota": "united states",
  ohio: "united states", oklahoma: "united states", oregon: "united states",
  pennsylvania: "united states", "rhode island": "united states",
  "south carolina": "united states", "south dakota": "united states",
  tennessee: "united states", texas: "united states", utah: "united states",
  vermont: "united states", virginia: "united states", washington: "united states",
  "west virginia": "united states", wisconsin: "united states", wyoming: "united states",
  "district of columbia": "united states", "washington dc": "united states",
  "washington d.c.": "united states",

  // Canadian provinces — same reasoning
  ontario: "canada", quebec: "canada", "british columbia": "canada",
  alberta: "canada", manitoba: "canada", saskatchewan: "canada",
  "nova scotia": "canada", "new brunswick": "canada",
  "newfoundland and labrador": "canada", "prince edward island": "canada",
};

const FLAGS: Record<string, string> = {
  "united states": "🇺🇸",
  "united kingdom": "🇬🇧",
  ireland: "🇮🇪",
  germany: "🇩🇪",
  france: "🇫🇷",
  spain: "🇪🇸",
  portugal: "🇵🇹",
  italy: "🇮🇹",
  netherlands: "🇳🇱",
  belgium: "🇧🇪",
  luxembourg: "🇱🇺",
  switzerland: "🇨🇭",
  austria: "🇦🇹",
  sweden: "🇸🇪",
  norway: "🇳🇴",
  denmark: "🇩🇰",
  finland: "🇫🇮",
  iceland: "🇮🇸",
  poland: "🇵🇱",
  "czech republic": "🇨🇿",
  slovakia: "🇸🇰",
  hungary: "🇭🇺",
  romania: "🇷🇴",
  bulgaria: "🇧🇬",
  greece: "🇬🇷",
  turkey: "🇹🇷",
  ukraine: "🇺🇦",
  russia: "🇷🇺",
  estonia: "🇪🇪",
  latvia: "🇱🇻",
  lithuania: "🇱🇹",
  canada: "🇨🇦",
  mexico: "🇲🇽",
  brazil: "🇧🇷",
  argentina: "🇦🇷",
  chile: "🇨🇱",
  colombia: "🇨🇴",
  peru: "🇵🇪",
  uruguay: "🇺🇾",
  australia: "🇦🇺",
  "new zealand": "🇳🇿",
  japan: "🇯🇵",
  "south korea": "🇰🇷",
  china: "🇨🇳",
  "hong kong": "🇭🇰",
  taiwan: "🇹🇼",
  singapore: "🇸🇬",
  malaysia: "🇲🇾",
  indonesia: "🇮🇩",
  thailand: "🇹🇭",
  philippines: "🇵🇭",
  vietnam: "🇻🇳",
  india: "🇮🇳",
  pakistan: "🇵🇰",
  bangladesh: "🇧🇩",
  "sri lanka": "🇱🇰",
  "saudi arabia": "🇸🇦",
  "united arab emirates": "🇦🇪",
  qatar: "🇶🇦",
  kuwait: "🇰🇼",
  bahrain: "🇧🇭",
  oman: "🇴🇲",
  israel: "🇮🇱",
  jordan: "🇯🇴",
  lebanon: "🇱🇧",
  egypt: "🇪🇬",
  "south africa": "🇿🇦",
  nigeria: "🇳🇬",
  kenya: "🇰🇪",
  ghana: "🇬🇭",
  morocco: "🇲🇦",
  tunisia: "🇹🇳",
  "côte d'ivoire": "🇨🇮",
};

export function countryFlag(name: string | null | undefined): string | null {
  if (!name) return null;
  const raw = name.trim().toLowerCase();
  if (!raw) return null;

  // Fast path: the whole string is a recognised country (or alias).
  const direct = ALIAS[raw] ?? raw;
  if (FLAGS[direct]) return FLAGS[direct];

  // Fallback: older engine-enrichment rows store location as
  // "London, England, United Kingdom" or "Austin, Texas, United
  // States" — comma-separated, city-first. Walk the parts and return
  // the first one that matches a known country (or alias). Iterate
  // RIGHT-TO-LEFT because the country tends to be the last segment.
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    const canonical = ALIAS[part] ?? part;
    if (FLAGS[canonical]) return FLAGS[canonical];
  }
  return null;
}
