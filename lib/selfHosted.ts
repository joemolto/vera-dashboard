// Self-hosted edition: hides the hosted service's billing, plan-cap and
// upgrade chrome. On unless NEXT_PUBLIC_SELF_HOSTED is "false" (read at build
// time). Pair it with the engine's SELF_HOSTED=true, which lifts every cap.
export const SELF_HOSTED = process.env.NEXT_PUBLIC_SELF_HOSTED !== "false";
