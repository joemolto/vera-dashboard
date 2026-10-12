"use client";

/**
 * LinkedIn-style post card — renders scraped post content so it reads
 * like the post itself, not a bare headline + link. Used by Competitor
 * watch and the People posts feed.
 *
 * Deliberately reminiscent of a LinkedIn post (circular avatar, name +
 * title + relative time, body, reaction counts) WITHOUT LinkedIn
 * branding — no logo, no trademark blue; a plain "View on LinkedIn"
 * link is the only reference. All content is public data collected by
 * the engine; nothing here fabricates engagement we didn't observe.
 */

import { EV, track } from "@/lib/analytics";
import { logoUrl } from "@/lib/logoUrl";
import { useState } from "react";

export type PostEngagement = {
  likes?: number;
  comments?: number;
  shares?: number;
};

/** Author mark: photo when we have one, company favicon when we have a
 * domain, initials otherwise. Every image falls back on load error —
 * LinkedIn CDN photo URLs expire after some weeks. */
export function PostAvatar({
  name,
  imageUrl,
  domain,
  size = 9,
}: {
  name: string;
  imageUrl?: string | null;
  domain?: string | null;
  size?: 6 | 9;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);
  const dim = size === 9 ? "h-9 w-9" : "h-6 w-6";
  if (imageUrl && !imgFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        className={`${dim} shrink-0 rounded-full object-cover`}
        onError={() => setImgFailed(true)}
      />
    );
  }
  if (domain && !iconFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl(domain, 128)}
        alt=""
        className={`${dim} shrink-0 rounded-lg border border-border-subtle bg-white object-contain p-1`}
        onError={() => setIconFailed(true)}
      />
    );
  }
  return (
    <div
      className={`flex ${dim} shrink-0 items-center justify-center rounded-full bg-bg-elevated text-[13px] font-medium text-text-secondary`}
    >
      {name
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w.charAt(0).toUpperCase())
        .join("")}
    </div>
  );
}

/** Overlapping row of small engager photos. Faces that fail to load
 * simply drop out; never renders a broken image. */
export function Facepile({
  people,
  max = 5,
}: {
  people: Array<{ name: string; picture_url?: string | null }>;
  max?: number;
}) {
  const withFace = people.filter((p) => p.picture_url).slice(0, max);
  if (withFace.length === 0) return null;
  return (
    <span className="flex shrink-0 -space-x-1.5">
      {withFace.map((p) => (
        <Face key={(p.picture_url || "") + p.name} src={p.picture_url!} title={p.name} />
      ))}
    </span>
  );
}

function Face({ src, title }: { src: string; title: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      title={title}
      className="h-6 w-6 rounded-full border-2 border-bg-base object-cover"
      onError={() => setFailed(true)}
    />
  );
}

export function LinkedInPostCard({
  authorName,
  authorTitle,
  authorAvatarUrl,
  authorDomain,
  postedAt,
  text,
  engagement,
  url,
  context,
}: {
  authorName: string;
  authorTitle?: string | null;
  authorAvatarUrl?: string | null;
  /** Company domain — renders the company logo when there's no photo. */
  authorDomain?: string | null;
  postedAt?: string | null;
  text: string;
  engagement?: PostEngagement | null;
  url?: string | null;
  /** Optional line above the card body, e.g. “Jane commented on this”. */
  context?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 340;
  const shown = expanded || !long ? text : text.slice(0, 340).trimEnd() + "…";
  const likes = engagement?.likes ?? 0;
  const comments = engagement?.comments ?? 0;

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-elevated/50 p-4">
      {context && (
        <p className="mb-2 text-[11.5px] italic text-text-muted">{context}</p>
      )}
      <div className="flex items-center gap-2.5">
        <PostAvatar name={authorName} imageUrl={authorAvatarUrl} domain={authorDomain} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold leading-tight text-text-primary">
            {authorName}
          </p>
          <p className="truncate text-[11.5px] leading-tight text-text-muted">
            {authorTitle || " "}
            {postedAt && (
              <span> · {relativeDays(postedAt)}</span>
            )}
          </p>
        </div>
      </div>

      <p
        className={`mt-3 whitespace-pre-line break-words [overflow-wrap:anywhere] text-[13px] leading-relaxed text-text-secondary ${url ? "cursor-pointer hover:text-text-primary" : ""}`}
        onClick={() => {
          if (url) {
            track(EV.postOpened, { author: authorName });
            window.open(url, "_blank", "noopener,noreferrer");
          }
        }}
      >
        {shown}
        {long && !expanded && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(true);
            }}
            className="ml-1 text-text-muted hover:text-text-primary"
          >
            more
          </button>
        )}
      </p>

      {(likes > 0 || comments > 0 || !!url) && (
        <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-2.5 text-[11.5px] text-text-muted">
          <span>
            {likes > 0 && `${likes} reaction${likes === 1 ? "" : "s"}`}
            {likes > 0 && comments > 0 && " · "}
            {comments > 0 && `${comments} comment${comments === 1 ? "" : "s"}`}
          </span>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="hover:text-text-primary"
            >
              View on LinkedIn
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function relativeDays(value: string): string | null {
  try {
    const d = Math.round((Date.now() - new Date(value).getTime()) / 86_400_000);
    if (d < 1) return "today";
    if (d === 1) return "1d";
    return `${d}d`;
  } catch {
    return null;
  }
}
