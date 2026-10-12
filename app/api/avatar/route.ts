/**
 * Avatar image proxy. LinkedIn's CDN (media.licdn.com) and Apollo's
 * photo hosts serve fine to a server (curl 200) but block hotlinking
 * from a browser on another origin, so <img src="licdn…"> renders as a
 * broken-image icon. This route fetches the image server-side and
 * streams it back from our own origin, where it loads cleanly.
 *
 * Usage: /api/avatar?url=<encoded image url>
 *
 * SSRF guard: only an allowlist of known photo hosts is proxied — this
 * is NOT a general-purpose fetch proxy.
 */

export const runtime = "edge";

const ALLOWED_HOSTS = new Set([
  "media.licdn.com",
  "static.licdn.com",
  "zenprospect-production.s3.amazonaws.com",
]);

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("url");
  if (!raw) return new Response("missing url", { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
    return new Response("host not allowed", { status: 403 });
  }

  // Hardening: abort slow upstreams, refuse oversized responses, and only
  // proxy actual images — this is an image proxy, not a fetch relay.
  const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const upstream = await fetch(target.toString(), {
      signal: controller.signal,
      // No referrer — LinkedIn serves the image when none is sent.
      referrerPolicy: "no-referrer",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; VeraAvatarProxy/1.0)" },
    });
    clearTimeout(timeout);
    if (!upstream.ok || !upstream.body) {
      return new Response("upstream error", { status: 502 });
    }
    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return new Response("not an image", { status: 415 });
    }
    const declaredLen = Number(upstream.headers.get("content-length") ?? 0);
    if (declaredLen > MAX_BYTES) {
      return new Response("image too large", { status: 413 });
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // Cache hard — these photos rarely change and re-fetching the
        // CDN on every render would be wasteful.
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
      },
    });
  } catch {
    clearTimeout(timeout);
    return new Response("fetch failed", { status: 502 });
  }
}
