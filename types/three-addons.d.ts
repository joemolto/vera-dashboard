// three.js ships its addons (examples/jsm) without bundled .d.ts files.
// We only use UnrealBloomPass for the Intelligence Map's node glow — a
// minimal ambient declaration covering the surface we touch.
declare module "three/addons/postprocessing/UnrealBloomPass.js" {
  export class UnrealBloomPass {
    constructor(
      resolution?: unknown,
      strength?: number,
      radius?: number,
      threshold?: number,
    );
    strength: number;
    radius: number;
    threshold: number;
  }
}
