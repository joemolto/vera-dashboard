// Base URL of the Vera engine, e.g. https://engine.example.com (server-side
// only). No default on purpose: an unset value fails loudly instead of
// sending requests and the engine key somewhere unexpected.
export function engineBase(): string {
  const base = process.env.ENGINE_API_BASE;
  if (!base) throw new Error("ENGINE_API_BASE is not set");
  return base.replace(/\/+$/, "");
}
