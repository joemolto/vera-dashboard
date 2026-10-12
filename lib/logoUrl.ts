// Company logo URL: logo.dev when NEXT_PUBLIC_LOGO_DEV_TOKEN is set,
// otherwise DuckDuckGo's favicon service, which needs no key.
const LOGO_DEV_TOKEN = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN;

export function logoUrl(domain: string, size = 128): string {
  const d = encodeURIComponent(domain);
  if (!LOGO_DEV_TOKEN) return `https://icons.duckduckgo.com/ip3/${d}.ico`;
  return `https://img.logo.dev/${d}?token=${LOGO_DEV_TOKEN}&size=${size}&format=png`;
}
