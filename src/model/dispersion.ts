import type { SkillTier } from "../types";

// ---------------------------------------------------------------------------
// Shot dispersion model.
//
// A full shot is modelled as a 2-D Gaussian around the aim point:
//   - "depth"   = along the target line (short / long)
//   - "offline" = perpendicular to the target line (left / right)
//
// Both scale with the attempted distance. Offline scatter is driven by an
// angular error (degrees), depth by a percentage of the shot distance. Better
// players have tighter cones. These figures are calibrated to be broadly
// consistent with published amateur/pro dispersion data.
// ---------------------------------------------------------------------------

interface TierParams {
  /** Std dev of offline error, in degrees. */
  offlineDeg: number;
  /** Std dev of depth error, as a fraction of shot distance. */
  depthPct: number;
  /** Systematic mean shortfall (fraction). Amateurs tend to come up short. */
  shortBias: number;
}

const TIERS: Record<SkillTier, TierParams> = {
  pro: { offlineDeg: 3.2, depthPct: 0.045, shortBias: 0.0 },
  low: { offlineDeg: 4.5, depthPct: 0.06, shortBias: 0.015 },
  mid: { offlineDeg: 6.0, depthPct: 0.075, shortBias: 0.03 },
  high: { offlineDeg: 8.0, depthPct: 0.095, shortBias: 0.05 },
};

export interface ShotDispersion {
  /** Std dev perpendicular to target line, in yards. */
  offlineYards: number;
  /** Std dev along target line, in yards. */
  depthYards: number;
  /** Mean along-line landing distance (accounts for short bias), in yards. */
  meanDistanceYards: number;
}

export function dispersionFor(
  skill: SkillTier,
  attemptedYards: number,
  scale = 1
): ShotDispersion {
  const t = TIERS[skill];
  const offlineRad = ((t.offlineDeg * scale) * Math.PI) / 180;
  return {
    offlineYards: Math.sin(offlineRad) * attemptedYards,
    depthYards: t.depthPct * scale * attemptedYards,
    meanDistanceYards: attemptedYards * (1 - t.shortBias),
  };
}

/** Human-readable label for the skill tier. */
export function skillLabel(skill: SkillTier): string {
  switch (skill) {
    case "pro":
      return "Scratch / Pro";
    case "low":
      return "Low (≈5 hcp)";
    case "mid":
      return "Mid (≈15 hcp)";
    case "high":
      return "High (≈25+ hcp)";
  }
}

// Standard-normal sample via Box–Muller. Accepts an injectable RNG so the
// strategy engine can be made deterministic in tests.
export function gaussian(rng: () => number = Math.random): number {
  let u = 0,
    v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
