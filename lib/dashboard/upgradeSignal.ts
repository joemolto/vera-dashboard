// Global cap-hit signal. The engine returns a 429 with a structured cap
// error when a plan limit is reached (or a zeroed cap on a lapsed org).
// claraApi emits here so ONE shared upgrade/reactivate modal opens no
// matter which action triggered it — instead of a raw error toast.

export type CapHit = {
  cap?: string; // accounts | watched | unlocks_per_month | monitored_people | person_intel_accounts
  limit?: number;
  message?: string; // the engine's human message
};

type Listener = (hit: CapHit) => void;
const listeners = new Set<Listener>();

export function onCapHit(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function emitCapHit(hit: CapHit): void {
  for (const cb of listeners) {
    try {
      cb(hit);
    } catch {
      // never let one listener break another
    }
  }
}

// Parse an engine 429 body — the cap doors return
// {"detail": {"error":"solo_limit_reached", "cap", "limit", "message"}}.
// Returns the CapHit, or null if this 429 isn't a cap/limit response.
export function parseCapError(status: number, body: string): CapHit | null {
  if (status !== 429) return null;
  try {
    const parsed = JSON.parse(body) as {
      detail?: { error?: string; cap?: string; limit?: number; message?: string };
      error?: string;
      cap?: string;
      limit?: number;
      message?: string;
    };
    const d = parsed?.detail ?? parsed;
    if (d && (d.error === "solo_limit_reached" || typeof d.cap === "string")) {
      return { cap: d.cap, limit: d.limit, message: d.message };
    }
    return { message: typeof d?.message === "string" ? d.message : undefined };
  } catch {
    return {};
  }
}
