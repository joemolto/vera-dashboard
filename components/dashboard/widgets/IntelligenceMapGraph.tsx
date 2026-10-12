"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  EDGE_TYPE_COLOURS,
  INDUSTRY_CLUSTER_LABELS,
  INDUSTRY_CLUSTER_ORDER,
  classifyIndustry,
  type IndustryCluster,
  type IntelEdge,
  type IntelEdgeType,
  type IntelLayer,
  type IntelMapPayload,
  type IntelNode,
} from "@/lib/dashboard/intelligenceMap";

// =====================================================================
// react-force-graph-3d typings — it mutates node/link objects in place
// and exposes an imperative API via ref. We type only what we touch.
// =====================================================================
type GraphNode = IntelNode & { x?: number; y?: number; z?: number };
type GraphLink = IntelEdge;
// A link end is an id string before the simulation runs, and the live
// node object after — accept either.
type LinkEnd = string | { id: string };

interface D3Force {
  strength?: (v: number) => D3Force;
  distance?: (v: number) => D3Force;
  distanceMax?: (v: number) => D3Force;
}

// Custom force shape — d3-force expects `force(alpha) + force.initialize(nodes)`.
// d3-force-3d nodes have x/y/z + vx/vy/vz. We mutate vx/vy/vz; d3 integrates.
interface SimNode {
  industry?: string;
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
}
type ClusterForceFn = ((alpha: number) => void) & {
  initialize: (nodes: SimNode[]) => void;
};
interface OrbitLikeControls {
  autoRotate?: boolean;
  autoRotateSpeed?: number;
}
interface ForceGraphMethods {
  // Overloaded — read with one arg, write with two. react-force-graph-3d
  // supports `d3Force(name, force)` for custom force registration.
  d3Force: ((name: string) => D3Force | undefined) &
    ((name: string, force: ClusterForceFn) => void);
  d3ReheatSimulation: () => void;
  controls: () => OrbitLikeControls | undefined;
  scene: () => THREE.Scene | undefined;
  postProcessingComposer: () => { addPass: (p: unknown) => void } | undefined;
  zoomToFit: (ms?: number, px?: number) => void;
}

interface FG3DProps {
  graphData: { nodes: GraphNode[]; links: GraphLink[] };
  width: number;
  height: number;
  backgroundColor?: string;
  showNavInfo?: boolean;
  controlType?: "trackball" | "orbit" | "fly";
  enableNodeDrag?: boolean;
  nodeId?: string;
  nodeLabel?: (n: GraphNode) => string;
  nodeVal?: (n: GraphNode) => number;
  nodeThreeObject?: (n: GraphNode) => THREE.Object3D;
  nodeThreeObjectExtend?: boolean;
  linkColor?: (l: GraphLink) => string;
  linkWidth?: (l: GraphLink) => number;
  linkOpacity?: number;
  linkVisibility?: (l: GraphLink) => boolean;
  linkDirectionalParticles?: (l: GraphLink) => number;
  linkDirectionalParticleWidth?: number;
  linkDirectionalParticleSpeed?: number;
  linkDirectionalParticleColor?: (l: GraphLink) => string;
  onNodeClick?: (n: GraphNode) => void;
  onNodeHover?: (n: GraphNode | null) => void;
  onEngineStop?: () => void;
}

// react-force-graph-3d is a forwardRef component — RefAttributes makes
// `ref` a valid, typed JSX attribute pointing at the imperative API.
type FG3DComponent = React.ForwardRefExoticComponent<
  FG3DProps & React.RefAttributes<ForceGraphMethods>
>;

interface IntelligenceMapGraphProps {
  payload: IntelMapPayload;
  activeEdgeTypes: Set<IntelEdgeType>;
  onNodeSelect: (node: IntelNode) => void;
  selectedId: string | null;
  width: number;
  height: number;
}

// =====================================================================
// Star aesthetics
// =====================================================================

// Bright glow colour per situation layer — a node's "star colour".
const LAYER_GLOW: Record<IntelLayer, string> = {
  leadership: "#c4b5fd", // violet
  growth: "#6ee7b7", // mint
  threat: "#fcd34d", // amber
};
// Companies with no live signal yet — faint, cool starlight.
const NEUTRAL_GLOW = "#9fb4e8";

// Leadership reads as the strongest trigger, then growth, then threat.
const LAYER_PRIORITY: IntelLayer[] = ["leadership", "growth", "threat"];

// =====================================================================
// Industry clustering — fixed centroids on a horizontal ring so each
// industry occupies its own region of the 3D field. Stops the graph
// reading as one dense ball when an org watches mixed verticals.
// =====================================================================

const CLUSTER_RING_RADIUS = 380;
// Small vertical stagger so the ring isn't a flat plane — gives the
// "brain" some depth without losing horizontal cluster separation.
const CLUSTER_Y_STAGGER = 60;
// How hard each node is pulled toward its cluster centroid each tick.
// Tuned against the existing charge (-220) + link (95) — stronger and
// the clusters compress into pinpoints; weaker and they bleed into each
// other. 0.18 sits in the sweet spot for ~30-50 node graphs.
const CLUSTER_FORCE_STRENGTH = 0.18;

function clusterCentroids(
  clustersPresent: IndustryCluster[],
): Map<IndustryCluster, { x: number; y: number; z: number }> {
  // Stable ordering — use INDUSTRY_CLUSTER_ORDER as the reference so the
  // same cluster always sits at the same angle across reloads.
  const ordered = INDUSTRY_CLUSTER_ORDER.filter((c) => clustersPresent.includes(c));
  const n = Math.max(1, ordered.length);
  const out = new Map<IndustryCluster, { x: number; y: number; z: number }>();
  ordered.forEach((cluster, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * CLUSTER_RING_RADIUS;
    const z = Math.sin(angle) * CLUSTER_RING_RADIUS;
    // Alternate clusters up/down for a slight 3D-staircase effect.
    const y = (i % 2 === 0 ? 1 : -1) * CLUSTER_Y_STAGGER;
    out.set(cluster, { x, y, z });
  });
  return out;
}

function makeClusterForce(
  centroids: Map<IndustryCluster, { x: number; y: number; z: number }>,
  strength = CLUSTER_FORCE_STRENGTH,
): ClusterForceFn {
  let simNodes: SimNode[] = [];
  const force = ((alpha: number) => {
    for (const n of simNodes) {
      const c = centroids.get(classifyIndustry(n.industry));
      if (!c) continue;
      const px = c.x - (n.x ?? 0);
      const py = c.y - (n.y ?? 0);
      const pz = c.z - (n.z ?? 0);
      n.vx = (n.vx ?? 0) + px * strength * alpha;
      n.vy = (n.vy ?? 0) + py * strength * alpha;
      n.vz = (n.vz ?? 0) + pz * strength * alpha;
    }
  }) as ClusterForceFn;
  force.initialize = (nodes: SimNode[]) => {
    simNodes = nodes;
  };
  return force;
}

// Build a 2D canvas-rendered text sprite for cluster labels — floats
// above each cluster at its centroid + a vertical offset. Camera-facing.
function makeClusterLabel(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const DPR = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  canvas.width = 512 * DPR;
  canvas.height = 96 * DPR;
  if (ctx) {
    ctx.scale(DPR, DPR);
    // Subtler than v3 — dimmer pill background, font weight down, text
    // colour eased so the labels read as annotation, not signage.
    ctx.fillStyle = "rgba(15,17,23,0.4)";
    ctx.beginPath();
    ctx.roundRect?.(8, 24, 496, 48, 12);
    ctx.fill();
    ctx.font = "500 19px ui-sans-serif, system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(180,190,210,0.72)";
    ctx.fillText(text, 256, 48);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false, // labels always render on top of stars
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(220, 41, 1);
  return sprite;
}

// Edges are calm at rest and only assert themselves around the focused
// star — so the map reads as a star-field, not a wire mesh.
const EDGE_ALPHA_REST = 0.08; // nothing focused — a faint ghost web
const EDGE_ALPHA_FOCUS = 0.85; // touches the focused star — lit
const EDGE_ALPHA_MUTED = 0.03; // a star is focused; this link isn't on it

function nodeGlow(n: IntelNode): string {
  const cats = n.categories ?? [];
  for (const l of LAYER_PRIORITY) if (cats.includes(l)) return LAYER_GLOW[l];
  return NEUTRAL_GLOW;
}

// Star radius grows with how much is happening at the company.
function starSize(n: IntelNode): number {
  return 5 + Math.min(n.signal_count ?? 0, 6) * 2.3;
}

// A link end is an id string before the sim runs, a node object after.
function endId(end: LinkEnd): string {
  return typeof end === "string" ? end : end.id;
}

// Hex "#rrggbb" -> "rgba(r,g,b,a)" so each link can carry its own alpha.
function rgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// A soft radial-gradient sprite texture — one white blob, reused for
// every star and tinted per node via the sprite material. Built lazily,
// client-side (needs a canvas).
let glowTex: THREE.Texture | null = null;
function getGlowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const S = 128;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const ctx = cv.getContext("2d")!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.18, "rgba(255,255,255,0.9)");
  g.addColorStop(0.42, "rgba(255,255,255,0.32)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  glowTex = new THREE.CanvasTexture(cv);
  glowTex.needsUpdate = true;
  return glowTex;
}

// One node's renderable: a coloured halo + a near-white core, both
// additive sprites so overlapping stars bloom into a glimmering field.
interface Star {
  group: THREE.Group;
  core: THREE.Sprite;
  halo: THREE.Sprite;
  base: number; // base star size
}

function makeStar(n: IntelNode): Star {
  const tex = getGlowTexture();
  const colour = new THREE.Color(nodeGlow(n));
  const base = starSize(n);

  // Halo eased back (0.24 → 0.16) and tightened (×3.0 → ×2.3) so it
  // reads as a soft glow around the core, not a smudge.
  const haloMat = new THREE.SpriteMaterial({
    map: tex,
    color: colour,
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.setScalar(base * 2.3);

  // Core tilts toward white but less aggressively (0.62 → 0.45) and at
  // lower opacity (0.52 → 0.4) — keeps the colour identity, dims the
  // hot-pixel intensity so bloom doesn't catch it as hard.
  const coreMat = new THREE.SpriteMaterial({
    map: tex,
    color: colour.clone().lerp(new THREE.Color("#ffffff"), 0.45),
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const core = new THREE.Sprite(coreMat);
  core.scale.setScalar(base * 1.2);

  const group = new THREE.Group();
  group.add(halo, core);
  return { group, core, halo, base };
}

// A faint distant starfield shell — gives depth + parallax as the user
// orbits, and sells the "stars in the sky" backdrop.
function makeStarfield(): THREE.Points {
  // v4: fewer, dimmer, more neutral. The previous 700-point bluish field
  // at opacity 0.55 was adding a uniform haze across the whole frame —
  // cumulative additive light masquerading as backdrop.
  const COUNT = 300;
  const pos = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    const r = 2600 + Math.random() * 1800;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i * 3 + 2] = r * Math.cos(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xb8c0d0, // near-white grey, no blue tint
    size: 1.6,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

export function IntelligenceMapGraph({
  payload,
  activeEdgeTypes,
  onNodeSelect,
  selectedId,
  width,
  height,
}: IntelligenceMapGraphProps) {
  const fgRef = useRef<ForceGraphMethods | null>(null);
  const starsRef = useRef<Map<string, Star>>(new Map());
  const starfieldAddedRef = useRef(false);
  const clusterForceAddedRef = useRef(false);
  const clusterLabelsAddedRef = useRef(false);
  // The camera is auto-fitted exactly ONCE, after the first layout
  // settles. Never again — re-fitting on every engine stop is what
  // yanked the camera back whenever the user zoomed or clicked.
  const didFitRef = useRef(false);

  // Compute which clusters are present in this payload — drives both the
  // force centroids and the floating labels. Recomputed when the payload
  // identity changes (filter toggles don't, so labels stay stable).
  const clusterMap = useMemo(() => {
    const present = new Set<IndustryCluster>();
    for (const n of payload.nodes) present.add(classifyIndustry(n.industry));
    return clusterCentroids(Array.from(present));
  }, [payload]);

  // onNodeSelect arrives as a fresh closure on every parent render;
  // mirror it in a ref so our click handler can stay referentially
  // stable (react-force-graph re-processes the graph when accessor
  // identities change).
  const onSelectRef = useRef(onNodeSelect);
  onSelectRef.current = onNodeSelect;

  // The hovered star drives the reveal; a selection keeps it lit while
  // the panel is open. The render loop reads the focus + neighbours via
  // refs so it never has to restart.
  const [hoverId, setHoverId] = useState<string | null>(null);
  const focusRef = useRef<string | null>(null);
  focusRef.current = hoverId ?? selectedId;

  // Neighbours via *visible* edges only — drives which stars stay lit
  // when one is focused.
  const neighbours = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of payload.edges) {
      if (!activeEdgeTypes.has(e.edge_type)) continue;
      if (!m.has(e.source)) m.set(e.source, new Set());
      if (!m.has(e.target)) m.set(e.target, new Set());
      m.get(e.source)!.add(e.target);
      m.get(e.target)!.add(e.source);
    }
    return m;
  }, [payload, activeEdgeTypes]);
  const neighboursRef = useRef(neighbours);
  neighboursRef.current = neighbours;

  // react-force-graph-3d references `window` at import time, so it can
  // never be server-rendered — load it client-side inside an effect.
  const [FG, setFG] = useState<FG3DComponent | null>(null);
  useEffect(() => {
    let alive = true;
    void import("react-force-graph-3d").then((m) => {
      if (alive) setFG(() => m.default as unknown as FG3DComponent);
    });
    return () => {
      alive = false;
    };
  }, []);

  // The library mutates node/link objects in place — hand it fresh
  // copies whenever the payload changes. Filter + hover changes never
  // touch this, so they never trigger a re-layout.
  const graphData = useMemo(
    () => ({
      nodes: payload.nodes.map((n) => ({ ...n })),
      links: payload.edges.map((e) => ({ ...e })),
    }),
    [payload],
  );

  // Each node renders as a glowing star; keep a handle for twinkling.
  const nodeThreeObject = useCallback((n: GraphNode) => {
    const star = makeStar(n);
    starsRef.current.set(n.id, star);
    return star.group;
  }, []);

  // Hover-reveal loop — keeps each star's glow steady (no pulsing), and
  // dims the field down to the focused star + its neighbours when one is
  // in focus. Runs alongside the library's own render loop (kept warm by
  // autoRotate).
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const focus = focusRef.current;
      const lit = focus ? neighboursRef.current.get(focus) : null;
      for (const [id, s] of starsRef.current) {
        const isFocus = id === focus;
        // A star is dimmed only when something else is focused and this
        // star isn't a neighbour of it.
        const dim = focus && !isFocus && !lit?.has(id) ? 0.26 : 1;
        s.halo.scale.setScalar(s.base * (isFocus ? 4.0 : 3.0));
        s.halo.material.opacity = (isFocus ? 0.5 : 0.24) * dim;
        s.core.scale.setScalar(s.base * (isFocus ? 1.9 : 1.2));
        s.core.material.opacity = (isFocus ? 0.65 : 0.4) * dim;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // --- Accessors -----------------------------------------------------
  // Every accessor handed to react-force-graph is referentially stable.
  // A changing identity makes the library re-process the graph (and can
  // reheat the layout), so hover/select must NEVER churn these.

  const nodeLabel = useCallback((n: GraphNode) => n.label, []);
  const nodeVal = useCallback((n: GraphNode) => starSize(n), []);

  // Link width is constant — the reveal is done with colour + particles,
  // which restyle cheaply without rebuilding link geometry every hover.
  const linkWidth = useCallback((l: GraphLink) => 0.5 + l.weight * 1.3, []);

  const linkVisibility = useCallback(
    (l: GraphLink) => activeEdgeTypes.has(l.edge_type),
    [activeEdgeTypes],
  );

  const linkParticleColor = useCallback(
    (l: GraphLink) => EDGE_TYPE_COLOURS[l.edge_type] ?? "#64748b",
    [],
  );

  // Calm at rest, lit around the focused star. Re-styles on hover/select
  // — colour only, so it never touches geometry or the layout.
  const linkColor = useCallback(
    (l: GraphLink) => {
      const base = EDGE_TYPE_COLOURS[l.edge_type] ?? "#64748b";
      const focus = hoverId ?? selectedId;
      if (!focus) return rgba(base, EDGE_ALPHA_REST);
      const on = endId(l.source) === focus || endId(l.target) === focus;
      return rgba(base, on ? EDGE_ALPHA_FOCUS : EDGE_ALPHA_MUTED);
    },
    [hoverId, selectedId],
  );

  // Particles flow only along the focused star's links — the rest of
  // the field is still.
  const linkParticles = useCallback(
    (l: GraphLink) => {
      if (!activeEdgeTypes.has(l.edge_type)) return 0;
      const focus = hoverId ?? selectedId;
      if (!focus) return 0;
      return endId(l.source) === focus || endId(l.target) === focus ? 3 : 0;
    },
    [activeEdgeTypes, hoverId, selectedId],
  );

  const handleNodeClick = useCallback((n: GraphNode) => {
    onSelectRef.current(n);
  }, []);

  const handleNodeHover = useCallback((n: GraphNode | null) => {
    setHoverId(n ? n.id : null);
  }, []);

  // Fit the camera once, when the first layout settles — then leave the
  // user's zoom/pan strictly alone.
  const handleEngineStop = useCallback(() => {
    if (didFitRef.current) return;
    didFitRef.current = true;
    fgRef.current?.zoomToFit(1200, 140);
  }, []);

  // Forces, idle spin, crisp bloom, starfield backdrop. react-force-
  // graph-3d builds its simulation and WebGL renderer asynchronously
  // after mount, so this is retried until every piece is ready. Camera
  // framing is handled once by handleEngineStop, not here.
  const applySetup = useCallback((): boolean => {
    const fg = fgRef.current;
    if (!fg) return false;
    const charge = fg.d3Force("charge");
    const link = fg.d3Force("link");
    if (!charge || !link) return false; // simulation not ready yet

    // A wide, airy field — strong repulsion over a long range and long
    // links, so the connected cluster breathes out instead of balling up.
    // Repulsion eased back vs v2 (-220 → -160) because the per-industry
    // cluster force now does most of the spreading; too much charge on
    // top of clustering and intra-cluster nodes drift apart.
    charge.strength?.(-160);
    charge.distanceMax?.(520);
    link.distance?.(80);

    // Cluster force — pulls each node toward its industry centroid.
    // Added once per mount; re-applied on re-render via clusterMap memo.
    if (!clusterForceAddedRef.current) {
      clusterForceAddedRef.current = true;
      fg.d3Force("cluster", makeClusterForce(clusterMap));
      // Re-heat so the new force shakes the layout into its clusters
      // instead of waiting for the next user interaction.
      fg.d3ReheatSimulation?.();
    }

    // Floating cluster labels — one camera-facing sprite per cluster
    // at its centroid + a vertical offset. depthTest off so they read
    // above the stars.
    const scene = fg.scene();
    if (scene && !clusterLabelsAddedRef.current && clusterMap.size > 0) {
      clusterLabelsAddedRef.current = true;
      const labelGroup = new THREE.Group();
      labelGroup.name = "vera-cluster-labels";
      for (const [cluster, c] of clusterMap.entries()) {
        const sprite = makeClusterLabel(INDUSTRY_CLUSTER_LABELS[cluster]);
        // Lift labels above the cluster cloud so they don't sit inside the stars.
        sprite.position.set(c.x, c.y + 110, c.z);
        labelGroup.add(sprite);
      }
      scene.add(labelGroup);
    }

    const controls = fg.controls();
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.35; // a slow, ambient drift
    }

    if (scene && !starfieldAddedRef.current) {
      starfieldAddedRef.current = true;
      scene.add(makeStarfield());
    }

    // v4: UnrealBloomPass removed. Even at low strength it lifts the
    // whole frame's luminance, reading as a hazy wash over the background
    // instead of the deep void we want. The additive-blended sprite
    // halos give each star its own soft glow without needing a global
    // post-pass.
    return !!controls && !!scene;
  }, [clusterMap]);

  // Drive applySetup until it fully lands (or give up after ~20s).
  useEffect(() => {
    if (!FG) return;
    starfieldAddedRef.current = false;
    clusterForceAddedRef.current = false;
    clusterLabelsAddedRef.current = false;
    didFitRef.current = false;
    // Drop any previous label group from the scene before the next pass
    // re-adds one (org-switch / payload reload).
    const scene = fgRef.current?.scene();
    const stale = scene?.getObjectByName("vera-cluster-labels");
    if (scene && stale) scene.remove(stale);
    let ticks = 0;
    const id = window.setInterval(() => {
      ticks += 1;
      if (applySetup() || ticks > 80) window.clearInterval(id);
    }, 250);
    return () => window.clearInterval(id);
  }, [FG, applySetup]);

  if (!FG) {
    return (
      <div className="flex h-full w-full items-center justify-center text-[13px] text-text-muted">
        Loading the map…
      </div>
    );
  }

  return (
    <FG
      ref={fgRef}
      graphData={graphData}
      width={width}
      height={height}
      backgroundColor="#060610"
      showNavInfo={false}
      controlType="orbit"
      enableNodeDrag={false}
      nodeId="id"
      nodeLabel={nodeLabel}
      nodeVal={nodeVal}
      nodeThreeObject={nodeThreeObject}
      nodeThreeObjectExtend={false}
      linkColor={linkColor}
      linkWidth={linkWidth}
      linkOpacity={1}
      linkVisibility={linkVisibility}
      linkDirectionalParticles={linkParticles}
      linkDirectionalParticleWidth={1.8}
      linkDirectionalParticleSpeed={0.006}
      linkDirectionalParticleColor={linkParticleColor}
      onNodeClick={handleNodeClick}
      onNodeHover={handleNodeHover}
      onEngineStop={handleEngineStop}
    />
  );
}
