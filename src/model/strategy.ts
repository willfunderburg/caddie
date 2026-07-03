import type {
  BallPosition,
  Club,
  Hole,
  LatLng,
  PlayerProfile,
  Recommendation,
  StrategyResult,
} from "../types";
import {
  bboxContains,
  bboxOf,
  makeProjection,
  metersToYards,
  pointInPolygonXY,
  toLatLng,
  toXY,
  yardsToMeters,
  type BBox,
  type Projection,
  type XY,
} from "./geo";
import { dispersionFor, gaussian } from "./dispersion";
import { expectedStrokes } from "./strokes";

type Lie = "green" | "fairway" | "bunker" | "water" | "oob" | "trees" | "rough";

interface PreparedFeature {
  kind: Lie;
  poly: XY[];
  bbox: BBox;
}

interface Ctx {
  proj: Projection;
  ball: XY;
  pin: XY;
  ballToPinYards: number;
  features: PreparedFeature[];
  profile: PlayerProfile;
  rng: () => number;
}

// A small deterministic RNG (mulberry32) so results are stable frame-to-frame
// and testable. Seeded from the ball position so recomputing the same shot
// gives the same answer.
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Which lie is a landing point in? Higher-priority features win when polygons
// overlap (a green painted over fairway should read as green; a hazard over
// fairway should read as hazard).
const PRIORITY: Lie[] = ["green", "water", "oob", "bunker", "trees", "fairway"];

function lieAt(pt: XY, ctx: Ctx): Lie {
  let best: Lie | null = null;
  let bestRank = Infinity;
  for (const f of ctx.features) {
    if (!bboxContains(f.bbox, pt)) continue;
    if (!pointInPolygonXY(pt, f.poly)) continue;
    const rank = PRIORITY.indexOf(f.kind);
    if (rank !== -1 && rank < bestRank) {
      bestRank = rank;
      best = f.kind;
    }
  }
  return best ?? "rough";
}

interface Evaluated extends Recommendation {
  stdev: number;
}

const SAMPLES = 240;

function evaluateAim(aim: LatLng, club: Club, attemptedYards: number, ctx: Ctx): Evaluated {
  const aimXY = toXY(aim, ctx.proj);
  const dx = aimXY.x - ctx.ball.x;
  const dy = aimXY.y - ctx.ball.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len; // unit vector ball -> aim
  const px = -uy;
  const py = ux; // perpendicular

  const disp = dispersionFor(
    ctx.profile.skill,
    attemptedYards,
    ctx.profile.dispersionScale
  );

  let sum = 0;
  let sumSq = 0;
  let penalties = 0;
  let greens = 0;
  let inPlay = 0;

  const meanDistM = yardsToMeters(disp.meanDistanceYards);
  const depthM = yardsToMeters(disp.depthYards);
  const offM = yardsToMeters(disp.offlineYards);

  for (let i = 0; i < SAMPLES; i++) {
    const along = meanDistM + gaussian(ctx.rng) * depthM;
    const off = gaussian(ctx.rng) * offM;
    const land: XY = {
      x: ctx.ball.x + ux * along + px * off,
      y: ctx.ball.y + uy * along + py * off,
    };
    const lie = lieAt(land, ctx);
    const toPin = metersToYards(Math.hypot(land.x - ctx.pin.x, land.y - ctx.pin.y));

    let cost: number;
    if (lie === "water") {
      penalties++;
      // Penalty stroke, then play on from a drop near the landing point.
      cost = 1 + expectedStrokes("rough", toPin);
    } else if (lie === "oob") {
      penalties++;
      // Stroke and distance: replay from the original ball position.
      cost = 1 + expectedStrokes("fairway", ctx.ballToPinYards);
    } else if (lie === "green") {
      greens++;
      inPlay++;
      cost = expectedStrokes("green", toPin);
    } else {
      if (lie === "fairway") inPlay++;
      cost = expectedStrokes(lie, toPin);
    }
    sum += cost;
    sumSq += cost * cost;
  }

  const meanCost = sum / SAMPLES;
  const varCost = Math.max(0, sumSq / SAMPLES - meanCost * meanCost);
  const expected = 1 + meanCost;

  return {
    aim,
    club,
    carryYards: attemptedYards,
    toPinYards: metersToYards(Math.hypot(aimXY.x - ctx.pin.x, aimXY.y - ctx.pin.y)),
    expectedStrokes: expected,
    penaltyChance: penalties / SAMPLES,
    greenChance: greens / SAMPLES,
    inPlayChance: inPlay / SAMPLES,
    stdev: Math.sqrt(varCost),
    score: expected,
  };
}

/** Risk-adjusted objective. lambda 0 = pure expected score; higher = safer. */
function objective(e: Evaluated, lambda: number): number {
  return e.expectedStrokes + lambda * (2.5 * e.penaltyChance + 0.6 * e.stdev);
}

export interface StrategyOptions {
  /** 0 = safest, 1 = most aggressive. */
  riskAppetite: number;
}

/**
 * Compute the recommended targets for a shot. Returns null if there isn't
 * enough information (need a pin, a ball, and at least one club).
 */
export function computeStrategy(
  ball: BallPosition,
  hole: Hole,
  profile: PlayerProfile,
  opts: StrategyOptions
): StrategyResult | null {
  if (!hole.pin || profile.bag.length === 0) return null;

  const proj = makeProjection(ball.point);
  const ballXY = toXY(ball.point, proj);
  const pinXY = toXY(hole.pin, proj);
  const ballToPinYards = metersToYards(
    Math.hypot(pinXY.x - ballXY.x, pinXY.y - ballXY.y)
  );

  const features: PreparedFeature[] = hole.features
    .filter((f) => f.polygon.length >= 3)
    .map((f) => {
      const poly = f.polygon.map((p) => toXY(p, proj));
      return { kind: f.kind as Lie, poly, bbox: bboxOf(poly) };
    });

  const ctx: Ctx = {
    proj,
    ball: ballXY,
    pin: pinXY,
    ballToPinYards,
    features,
    profile,
    rng: makeRng(Math.round(ball.point.lat * 1e6) ^ Math.round(ball.point.lng * 1e6)),
  };

  // Bearing from ball to pin.
  const baseAngle = Math.atan2(pinXY.y - ballXY.y, pinXY.x - ballXY.x);

  // Candidate attempted distances: every club, plus "flag distance" and a few
  // lay-up fractions so the engine can choose to leave a full shot in.
  const clubs = [...profile.bag].sort((a, b) => a.carryYards - b.carryYards);
  const maxCarry = clubs[clubs.length - 1].carryYards;

  const distanceCandidates = new Set<number>();
  for (const c of clubs) distanceCandidates.add(c.carryYards);
  if (ballToPinYards <= maxCarry + 15) distanceCandidates.add(ballToPinYards);
  // Lay-up options short of the pin (useful in front of water).
  for (const frac of [0.5, 0.65, 0.8]) {
    const d = ballToPinYards * frac;
    if (d >= 30) distanceCandidates.add(d);
  }

  // Lateral aim sweep, in degrees off the ball->pin line.
  const angleOffsets = [-30, -22, -15, -9, -4, 0, 4, 9, 15, 22, 30];

  const evals: Evaluated[] = [];
  for (const r of distanceCandidates) {
    if (r < 20 || r > maxCarry + 15) continue;
    // Report the club whose carry best matches this attempted distance.
    const club = clubForDistance(clubs, r);
    const rMeters = yardsToMeters(r);
    for (const deg of angleOffsets) {
      const a = baseAngle + (deg * Math.PI) / 180;
      const aimXY: XY = {
        x: ballXY.x + Math.cos(a) * rMeters,
        y: ballXY.y + Math.sin(a) * rMeters,
      };
      const aim = toLatLng(aimXY, proj);
      evals.push(evaluateAim(aim, club, r, ctx));
    }
  }

  if (evals.length === 0) return null;

  const aggressive = evals.reduce((best, e) =>
    e.expectedStrokes < best.expectedStrokes ? e : best
  );
  const safe = evals.reduce((best, e) =>
    objective(e, 1.6) < objective(best, 1.6) ? e : best
  );
  const lambda = (1 - clamp01(opts.riskAppetite)) * 1.6;
  const chosen = evals.reduce((best, e) =>
    objective(e, lambda) < objective(best, lambda) ? e : best
  );

  return { aggressive, safe, chosen };
}

function clubForDistance(clubsAsc: Club[], yards: number): Club {
  // Prefer the shortest club that carries at least this far; otherwise the
  // longest club available.
  for (const c of clubsAsc) {
    if (c.carryYards >= yards - 3) return c;
  }
  return clubsAsc[clubsAsc.length - 1];
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
