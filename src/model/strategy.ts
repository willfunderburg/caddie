import type {
  BallPosition,
  Club,
  Hole,
  PlayerProfile,
  Recommendation,
  StrategyResult,
} from "../types";
import {
  bboxContains,
  bboxOf,
  centroidXY,
  makeProjection,
  metersToYards,
  pointInPolygonXY,
  segmentIntersectsPolygon,
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
  /** Bearing (radians, math convention) from ball to pin. */
  baseAngle: number;
  features: PreparedFeature[];
  profile: PlayerProfile;
  clubsAsc: Club[];
  shortestCarry: number;
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

// ---------------------------------------------------------------------------
// Next-shot-aware landing value.
//
// Research this encodes (Broadie "Every Shot Counts", Fawcett's DECADE,
// Stagner's amateur data):
//  - Distance-to-pin is the dominant driver of expected strokes; angles only
//    matter through real geometry, so we derive them from it rather than
//    hard-coding "position golf".
//  - Trees between the landing spot and the pin block the LINE: a perfect lie
//    behind trees is a punch-out, not an approach (doglegs!).
//  - A hazard crossing the final ~35y into the pin means a forced carry /
//    short-side situation — that's what "a bad angle" actually is.
//  - Leaving a full-swing club number is mildly better than an awkward
//    partial; the effect is real but small, so the bonuses are small.
// ---------------------------------------------------------------------------

const GUARD_ZONE_YDS = 35; // hazards this close to the pin "guard" it
const BLOCKED_PENALTY = 0.42; // strokes: must punch out instead of attacking
const GUARD_WATER_PENALTY = 0.22;
const GUARD_BUNKER_PENALTY = 0.1;
const FULL_CLUB_BONUS = 0.02;

// Trees crossing the CURRENT shot's line while the ball is still climbing
// (the first ~35% of the flight) make the shot unplayable as aimed. Trees
// crossed mid-flight can be carried — that's just cutting the corner.
const CLIMB_FRACTION = 0.35;
const FLIGHT_BLOCK_PENALTY = 0.9;

/** Parameter t along segment AB where it first crosses CD, or null. */
function segIntersectT(a: XY, b: XY, c: XY, d: XY): number | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denom;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/** Is the shot from `from` toward `aim` blocked by trees early in flight? */
function flightBlocked(from: XY, aim: XY, ctx: Ctx): boolean {
  for (const f of ctx.features) {
    if (f.kind !== "trees") continue;
    // Cheap bbox rejection against the segment's box.
    const minX = Math.min(from.x, aim.x);
    const maxX = Math.max(from.x, aim.x);
    const minY = Math.min(from.y, aim.y);
    const maxY = Math.max(from.y, aim.y);
    if (
      maxX < f.bbox.minX ||
      minX > f.bbox.maxX ||
      maxY < f.bbox.minY ||
      minY > f.bbox.maxY
    ) {
      continue;
    }
    if (pointInPolygonXY(from, f.poly)) return true; // standing in the trees
    let firstT: number | null = null;
    for (let i = 0, j = f.poly.length - 1; i < f.poly.length; j = i++) {
      const t = segIntersectT(from, aim, f.poly[j], f.poly[i]);
      if (t !== null && (firstT === null || t < firstT)) firstT = t;
    }
    if (firstT !== null && firstT < CLIMB_FRACTION) return true;
  }
  return false;
}

function landingCost(land: XY, lie: Lie, toPinYards: number, ctx: Ctx): number {
  if (lie === "green") return expectedStrokes("green", toPinYards);
  let cost = expectedStrokes(lie, toPinYards);
  // Inside ~8y the next shot is a chip regardless of geometry.
  if (toPinYards < 8 || lie === "trees") return cost + comfort(toPinYards, ctx);

  // Line-of-play checks from this landing spot to the pin.
  const dx = ctx.pin.x - land.x;
  const dy = ctx.pin.y - land.y;
  const len = Math.hypot(dx, dy) || 1;
  // Start of the "guard zone": the last GUARD_ZONE_YDS yards before the pin.
  const gz = Math.min(yardsToMeters(GUARD_ZONE_YDS), len);
  const guardStart: XY = {
    x: ctx.pin.x - (dx / len) * gz,
    y: ctx.pin.y - (dy / len) * gz,
  };

  let blocked = false;
  let guardWater = false;
  let guardBunker = false;
  for (const f of ctx.features) {
    if (f.kind === "trees") {
      // Trees anywhere along the line block the next shot.
      if (!blocked && segmentIntersectsPolygon(land, ctx.pin, f.poly, f.bbox)) {
        blocked = true;
      }
    } else if (f.kind === "water" || f.kind === "oob") {
      if (
        !guardWater &&
        segmentIntersectsPolygon(guardStart, ctx.pin, f.poly, f.bbox)
      ) {
        guardWater = true;
      }
    } else if (f.kind === "bunker") {
      if (
        !guardBunker &&
        segmentIntersectsPolygon(guardStart, ctx.pin, f.poly, f.bbox)
      ) {
        guardBunker = true;
      }
    }
  }
  if (blocked) cost += BLOCKED_PENALTY;
  if (guardWater) cost += GUARD_WATER_PENALTY;
  else if (guardBunker) cost += GUARD_BUNKER_PENALTY;

  return cost + comfort(toPinYards, ctx);
}

/** Small full-club bonus / awkward-partial penalty on the distance left. */
function comfort(toPinYards: number, ctx: Ctx): number {
  let adj = 0;
  if (toPinYards > 25) {
    let best = Infinity;
    for (const c of ctx.clubsAsc) {
      const d = Math.abs(c.carryYards - toPinYards);
      if (d < best) best = d;
    }
    if (best <= Math.max(4, toPinYards * 0.04)) adj -= FULL_CLUB_BONUS;
  }
  // Awkward part-swing zone: shorter than a comfortable full swing of the
  // shortest club but too long to be a simple chip. Better players handle it.
  if (toPinYards > 12 && toPinYards < ctx.shortestCarry * 0.65) {
    adj +=
      ctx.profile.skill === "pro"
        ? 0
        : ctx.profile.skill === "low"
          ? 0.03
          : 0.06;
  }
  return adj;
}

interface Evaluated extends Recommendation {
  stdev: number;
}

const COARSE_SAMPLES = 96;
const FINE_SAMPLES = 320;
const REFINE_TOP = 22;

function evaluateAim(
  aimXY: XY,
  club: Club,
  attemptedYards: number,
  ctx: Ctx,
  samples: number
): Evaluated {
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

  for (let i = 0; i < samples; i++) {
    const along = meanDistM + gaussian(ctx.rng) * depthM;
    const off = gaussian(ctx.rng) * offM;
    const land: XY = {
      x: ctx.ball.x + ux * along + px * off,
      y: ctx.ball.y + uy * along + py * off,
    };
    const lie = lieAt(land, ctx);
    const toPin = metersToYards(
      Math.hypot(land.x - ctx.pin.x, land.y - ctx.pin.y)
    );

    let cost: number;
    if (lie === "water") {
      penalties++;
      // Penalty stroke, then play on from a drop near the landing point.
      cost = 1 + landingCost(land, "rough", toPin, ctx);
    } else if (lie === "oob") {
      penalties++;
      // Stroke and distance: replay from the original ball position.
      cost = 1 + landingCost(ctx.ball, "fairway", ctx.ballToPinYards, ctx);
    } else {
      if (lie === "green") {
        greens++;
        inPlay++;
      } else if (lie === "fairway") {
        inPlay++;
      }
      cost = landingCost(land, lie, toPin, ctx);
    }
    sum += cost;
    sumSq += cost * cost;
  }

  const meanCost = sum / samples;
  const varCost = Math.max(0, sumSq / samples - meanCost * meanCost);
  let expected = 1 + meanCost;

  // If trees near the ball cross this line while the ball is still low, the
  // shot can't actually be played as aimed.
  if (flightBlocked(ctx.ball, aimXY, ctx)) expected += FLIGHT_BLOCK_PENALTY;

  const aimToPin = metersToYards(
    Math.hypot(aimXY.x - ctx.pin.x, aimXY.y - ctx.pin.y)
  );

  // Signed deviation from the direct line (positive = right of it).
  const aimAngle = Math.atan2(dy, dx);
  let delta = ctx.baseAngle - aimAngle;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  const offLineDeg = (delta * 180) / Math.PI;

  // Does the leave match a full club?
  let leavesClub: string | undefined;
  if (aimToPin > 25) {
    let best = Infinity;
    for (const c of ctx.clubsAsc) {
      const d = Math.abs(c.carryYards - aimToPin);
      if (d < best) {
        best = d;
        if (d <= Math.max(5, aimToPin * 0.05)) leavesClub = c.name;
      }
    }
  }

  return {
    aim: toLatLng(aimXY, ctx.proj),
    club,
    carryYards: attemptedYards,
    toPinYards: aimToPin,
    expectedStrokes: expected,
    penaltyChance: penalties / samples,
    greenChance: greens / samples,
    inPlayChance: inPlay / samples,
    stdev: Math.sqrt(varCost),
    score: expected,
    offLineDeg,
    leavesClub,
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

interface Candidate {
  aim: XY;
  dist: number; // attempted yards
}

/**
 * Generate candidate aim points:
 *  - a radial sweep of every useful distance across a wide fan of lines, and
 *  - anchors inside traced fairway/green polygons (centroid + pulled-in
 *    vertices), so doglegs and offset landing zones are always considered
 *    even when they sit far off the direct line.
 */
function candidateAims(ctx: Ctx): Candidate[] {
  const clubs = ctx.clubsAsc;
  const maxCarry = clubs[clubs.length - 1].carryYards;
  const out: Candidate[] = [];

  const distances = new Set<number>();
  for (const c of clubs) distances.add(c.carryYards);
  if (ctx.ballToPinYards <= maxCarry + 15) distances.add(ctx.ballToPinYards);
  for (const frac of [0.5, 0.65, 0.8]) {
    const d = ctx.ballToPinYards * frac;
    if (d >= 30) distances.add(d);
  }

  const angleOffsets = [
    -45, -36, -28, -21, -15, -10, -6, -3, 0, 3, 6, 10, 15, 21, 28, 36, 45,
  ];

  for (const r of distances) {
    if (r < 20 || r > maxCarry + 15) continue;
    const rMeters = yardsToMeters(r);
    for (const deg of angleOffsets) {
      const a = ctx.baseAngle + (deg * Math.PI) / 180;
      out.push({
        aim: {
          x: ctx.ball.x + Math.cos(a) * rMeters,
          y: ctx.ball.y + Math.sin(a) * rMeters,
        },
        dist: r,
      });
    }
  }

  // Feature-anchored candidates (fairway landing zones, center of green).
  const seen = new Set<string>();
  let anchors = 0;
  for (const f of ctx.features) {
    if (f.kind !== "fairway" && f.kind !== "green") continue;
    const c = centroidXY(f.poly);
    const pts: XY[] = [c];
    for (const v of f.poly) {
      pts.push({ x: v.x + (c.x - v.x) * 0.55, y: v.y + (c.y - v.y) * 0.55 });
    }
    for (const p of pts) {
      const dist = metersToYards(
        Math.hypot(p.x - ctx.ball.x, p.y - ctx.ball.y)
      );
      if (dist < 25 || dist > maxCarry + 10) continue;
      // Dedupe on a ~12y grid so dense polygons don't flood the search.
      const key =
        Math.round(p.x / yardsToMeters(12)) +
        ":" +
        Math.round(p.y / yardsToMeters(12));
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ aim: p, dist });
      if (++anchors >= 48) return out;
    }
  }
  return out;
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

  const clubsAsc = [...profile.bag].sort((a, b) => a.carryYards - b.carryYards);

  const ctx: Ctx = {
    proj,
    ball: ballXY,
    pin: pinXY,
    ballToPinYards,
    baseAngle: Math.atan2(pinXY.y - ballXY.y, pinXY.x - ballXY.x),
    features,
    profile,
    clubsAsc,
    shortestCarry: clubsAsc[0].carryYards,
    rng: makeRng(
      Math.round(ball.point.lat * 1e6) ^ Math.round(ball.point.lng * 1e6)
    ),
  };

  const candidates = candidateAims(ctx);
  if (candidates.length === 0) return null;

  // Pass 1: coarse Monte-Carlo over every candidate.
  const coarse = candidates.map((c) =>
    evaluateAim(c.aim, clubForDistance(clubsAsc, c.dist), c.dist, ctx, COARSE_SAMPLES)
  );

  // Pass 2: refine the most promising candidates (by score and by safety)
  // with a larger sample so the final numbers are stable.
  const byScore = coarse
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.expectedStrokes - b.e.expectedStrokes)
    .slice(0, REFINE_TOP);
  const bySafe = coarse
    .map((e, i) => ({ e, i }))
    .sort((a, b) => objective(a.e, 1.6) - objective(b.e, 1.6))
    .slice(0, REFINE_TOP);
  const refineIdx = new Set<number>();
  for (const { i } of byScore) refineIdx.add(i);
  for (const { i } of bySafe) refineIdx.add(i);

  const evals: Evaluated[] = [];
  for (const i of refineIdx) {
    const c = candidates[i];
    evals.push(
      evaluateAim(c.aim, clubForDistance(clubsAsc, c.dist), c.dist, ctx, FINE_SAMPLES)
    );
  }

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
