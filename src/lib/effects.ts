// Plugin-based timeline video effects. An "effect" is a registry entry (see
// EFFECT_PLUGINS) that declares the full-strength look it wants as a partial
// PostFxParams patch (lib/compositor.ts owns the actual param set and the
// Canvas2D/GPU rendering of it); adding a new effect is just adding an entry
// here, no renderer changes required. Segments place a plugin + intensity
// over a time range on the timeline's Effects track, mirroring ZoomSegment
// in lib/autoZoom.ts.

import {
  mixPostFx,
  NEUTRAL_POST_FX,
  type PostFxParams,
} from "./compositor";

export type EffectSegment = {
  id: string;
  startMs: number;
  endMs: number;
  pluginId: string;
  /** 0..1 — how strongly the plugin's full-strength look is applied. */
  intensity: number;
  disabled: boolean;
};

export type EffectPluginDef = {
  id: string;
  name: string;
  description: string;
  /** Full-strength (intensity = 1) look; only keys that differ from neutral. */
  target: Partial<PostFxParams>;
};

export const EFFECT_PLUGINS: EffectPluginDef[] = [
  {
    id: "bw",
    name: "Black & White",
    description: "Classic desaturated look with a touch of extra contrast.",
    target: { saturation: 0, contrast: 1.08 },
  },
  {
    id: "sepia",
    name: "Sepia",
    description: "Warm monochrome tint, like an old photograph.",
    target: { sepia: 0.85, contrast: 1.05 },
  },
  {
    id: "vintage-film",
    name: "Vintage Film",
    description: "Faded warmth, a soft vignette, and animated grain.",
    target: {
      sepia: 0.35,
      saturation: 0.85,
      contrast: 1.1,
      vignette: 0.55,
      vignetteSoftness: 0.55,
      grain: 0.3,
    },
  },
  {
    id: "vignette",
    name: "Vignette",
    description: "Darkens the frame edges to draw focus to the center.",
    target: { vignette: 0.65, vignetteSoftness: 0.6 },
  },
  {
    id: "warm-glow",
    name: "Warm Glow",
    description: "Golden-hour warmth with a gentle bloom.",
    target: { temperature: 0.6, brightness: 1.08, blur: 2.5 },
  },
  {
    id: "cool-tone",
    name: "Cool Tone",
    description: "Crisp, blue-leaning color grade.",
    target: { temperature: -0.55, contrast: 1.05 },
  },
  {
    id: "dreamy-soft",
    name: "Dreamy Soft",
    description: "Soft-focus glow for a dreamy, ethereal feel.",
    target: { blur: 6, brightness: 1.1, contrast: 0.95 },
  },
  {
    id: "high-contrast",
    name: "High Contrast",
    description: "Punchy contrast and richer color for extra impact.",
    target: { contrast: 1.45, saturation: 1.25 },
  },
  {
    id: "film-grain",
    name: "Film Grain",
    description: "Adds animated grain texture without changing the grade.",
    target: { grain: 0.5 },
  },
  {
    id: "invert",
    name: "Invert Flash",
    description: "Inverts colors — a stylized flash/glitch accent.",
    target: { invert: 1 },
  },
];

export function effectPlugin(id: string): EffectPluginDef {
  return EFFECT_PLUGINS.find((p) => p.id === id) ?? EFFECT_PLUGINS[0];
}

export const DEFAULT_EFFECT_INTENSITY = 0.75;
export const DEFAULT_EFFECT_DURATION_SEC = 2;

let segIdCounter = 0;
function nextEffectSegId(): string {
  segIdCounter += 1;
  return `fx-${Date.now().toString(36)}-${segIdCounter}`;
}

export function newEffectSegment(
  startMs: number,
  endMs: number,
  pluginId: string = EFFECT_PLUGINS[0].id,
  intensity: number = DEFAULT_EFFECT_INTENSITY,
): EffectSegment {
  return {
    id: nextEffectSegId(),
    startMs,
    endMs,
    pluginId,
    intensity,
    disabled: false,
  };
}

// Segments crossfade toward neutral over this many ms at each edge (clamped
// to half the segment's own length), so a look fades in/out instead of
// popping — mirrors the zoom segment's lead-in/release feel.
const EFFECT_CROSSFADE_MS = 220;

function activeEffectAt(
  tMs: number,
  segments: EffectSegment[],
): { seg: EffectSegment; weight: number } | null {
  for (const seg of segments) {
    if (seg.disabled) continue;
    if (tMs >= seg.startMs && tMs <= seg.endMs) {
      const span = seg.endMs - seg.startMs;
      const fade = Math.min(EFFECT_CROSSFADE_MS, span / 2);
      const edge = Math.min(tMs - seg.startMs, seg.endMs - tMs);
      const weight = fade > 0 ? Math.max(0, Math.min(1, edge / fade)) : 1;
      return { seg, weight };
    }
  }
  return null;
}

/** Resolve the blended post-fx params at `tMs`. Neutral when nothing active. */
export function resolveEffectParams(
  tMs: number,
  segments: EffectSegment[],
): PostFxParams {
  const active = activeEffectAt(tMs, segments);
  if (!active) return { ...NEUTRAL_POST_FX };
  const plugin = effectPlugin(active.seg.pluginId);
  const full = mixPostFx(plugin.target, active.seg.intensity);
  const keys = Object.keys(NEUTRAL_POST_FX) as (keyof PostFxParams)[];
  const out = {} as PostFxParams;
  for (const k of keys) {
    out[k] = NEUTRAL_POST_FX[k] + (full[k] - NEUTRAL_POST_FX[k]) * active.weight;
  }
  return out;
}

/** Segment whose id is `id`, or null. */
export function findEffectSegment(
  segments: EffectSegment[],
  id: string | null,
): EffectSegment | null {
  if (!id) return null;
  return segments.find((s) => s.id === id) ?? null;
}
