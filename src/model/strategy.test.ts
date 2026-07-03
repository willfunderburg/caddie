import { describe, expect, it } from "vitest";
import { computeStrategy } from "./strategy";
import { expectedStrokes } from "./strokes";
import type { BallPosition, Hole, LatLng, PlayerProfile } from "../types";
import {
  distanceYards,
  makeProjection,
  toLatLng,
  yardsToMeters,
} from "./geo";

// Build a hole running due north from an origin, so we can place features at
// known (east, north) yard offsets.
const ORIGIN: LatLng = { lat: 40, lng: -105 };
const proj = makeProjection(ORIGIN);
const at = (eYd: number, nYd: number): LatLng =>
  toLatLng({ x: yardsToMeters(eYd), y: yardsToMeters(nYd) }, proj);

const blob = (e: number, n: number, r: number): LatLng[] => {
  const out: LatLng[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    out.push(at(e + Math.cos(a) * r, n + Math.sin(a) * r));
  }
  return out;
};

const profile: PlayerProfile = {
  skill: "mid",
  dispersionScale: 1,
  reminders: { all: [], long: [] },
  bag: [
    { id: "d", name: "Driver", carryYards: 230 },
    { id: "7i", name: "7 Iron", carryYards: 150 },
    { id: "pw", name: "PW", carryYards: 115 },
    { id: "sw", name: "SW", carryYards: 85 },
  ],
};

describe("expectedStrokes", () => {
  it("is monotonic-ish: farther fairway shots cost more", () => {
    expect(expectedStrokes("fairway", 200)).toBeGreaterThan(
      expectedStrokes("fairway", 100)
    );
  });
  it("rough costs more than fairway at the same distance", () => {
    expect(expectedStrokes("rough", 150)).toBeGreaterThan(
      expectedStrokes("fairway", 150)
    );
  });
  it("putts from close are near 1", () => {
    expect(expectedStrokes("green", 1)).toBeLessThan(1.2);
  });
});

describe("computeStrategy", () => {
  const ball: BallPosition = { point: at(0, 0), source: "manual" };

  it("returns null without a pin", () => {
    const hole: Hole = { id: "h", number: 1, par: 4, features: [] };
    expect(computeStrategy(ball, hole, profile, { riskAppetite: 0.5 })).toBeNull();
  });

  it("recommends aiming at the green on a simple approach", () => {
    const hole: Hole = {
      id: "h",
      number: 1,
      par: 3,
      pin: at(0, 150),
      features: [{ id: "g", kind: "green", polygon: blob(0, 150, 15) }],
    };
    const res = computeStrategy(ball, hole, profile, { riskAppetite: 1 });
    expect(res).not.toBeNull();
    // Aggressive line should leave us close to the pin.
    expect(res!.aggressive.toPinYards).toBeLessThan(40);
    expect(res!.chosen.greenChance).toBeGreaterThan(0);
  });

  it("steers the safe line away from water toward lower penalty risk", () => {
    // Green at 150 with water covering the direct line's landing zone on the
    // right; safe play should carry less penalty risk than the aggressive one.
    const hole: Hole = {
      id: "h",
      number: 1,
      par: 4,
      pin: at(0, 150),
      features: [
        { id: "g", kind: "green", polygon: blob(0, 150, 14) },
        { id: "w", kind: "water", polygon: blob(6, 150, 16) },
        { id: "f", kind: "fairway", polygon: blob(-6, 150, 20) },
      ],
    };
    const res = computeStrategy(ball, hole, profile, { riskAppetite: 0 });
    expect(res).not.toBeNull();
    expect(res!.safe.penaltyChance).toBeLessThanOrEqual(
      res!.aggressive.penaltyChance + 1e-9
    );
  });

  it("routes around a dogleg instead of aiming through trees", () => {
    // Fairway runs due north then turns east to the green; a big stand of
    // trees fills the inside of the corner, directly on the ball→pin line.
    const hole: Hole = {
      id: "h",
      number: 1,
      par: 4,
      pin: at(90, 160),
      features: [
        // North leg of the fairway.
        {
          id: "f1",
          kind: "fairway",
          polygon: [at(-20, 20), at(20, 20), at(20, 175), at(-20, 175)],
        },
        // East leg toward the green.
        {
          id: "f2",
          kind: "fairway",
          polygon: [at(20, 140), at(75, 140), at(75, 180), at(20, 180)],
        },
        { id: "g", kind: "green", polygon: blob(90, 160, 13) },
        // Trees blocking the direct line at the inside of the corner.
        { id: "t", kind: "trees", polygon: blob(45, 80, 38) },
      ],
    };
    const res = computeStrategy(ball, hole, profile, { riskAppetite: 0.5 });
    expect(res).not.toBeNull();
    // The direct line runs ~29° east of north through the trees; a smart
    // play deviates well off that line (up the north fairway leg).
    expect(Math.abs(res!.chosen.offLineDeg)).toBeGreaterThan(10);
    // And it should be a routing play, not a full-send: shorter than a
    // straight max-distance blast at the pin.
    expect(res!.chosen.expectedStrokes).toBeLessThan(5);
  });

  it("prefers the approach side with an open angle to the pin", () => {
    // Wide fairway, green due north. Water hugs the left side of (and short
    // of) the green, so a left-side landing spot must carry water into the
    // pin while a right-side one has an open look.
    const hole: Hole = {
      id: "h",
      number: 1,
      par: 4,
      pin: at(0, 220),
      features: [
        {
          id: "f",
          kind: "fairway",
          polygon: [at(-60, 30), at(60, 30), at(60, 185), at(-60, 185)],
        },
        { id: "g", kind: "green", polygon: blob(0, 220, 13) },
        {
          id: "w",
          kind: "water",
          polygon: [at(-45, 170), at(-4, 170), at(-4, 226), at(-45, 226)],
        },
      ],
    };
    const res = computeStrategy(ball, hole, profile, { riskAppetite: 0 });
    expect(res).not.toBeNull();
    // Safest play should NOT be left of the direct line (toward the water
    // side); it should hold the line or favor the open right side.
    expect(res!.safe.offLineDeg).toBeGreaterThan(-3);
    expect(res!.safe.penaltyChance).toBeLessThan(0.1);
  });

  it("never plants the aim point on a bunker when clean targets score similarly", () => {
    // Wide fairway with a pot bunker dead-center at driver distance. The
    // statistically ideal center-of-pattern sits on the sand; the engine
    // should shade the aim to clean grass beside it.
    const bunkerCenter = at(0, 230);
    const hole: Hole = {
      id: "h",
      number: 1,
      par: 5,
      pin: at(0, 380),
      features: [
        {
          id: "f",
          kind: "fairway",
          polygon: [at(-40, 40), at(40, 40), at(40, 300), at(-40, 300)],
        },
        { id: "g", kind: "green", polygon: blob(0, 380, 13) },
        { id: "b", kind: "bunker", polygon: blob(0, 230, 12) },
      ],
    };
    const res = computeStrategy(ball, hole, profile, { riskAppetite: 0.5 });
    expect(res).not.toBeNull();
    for (const rec of [res!.chosen, res!.safe]) {
      const dToBunker = distanceYards(rec.aim, bunkerCenter);
      expect(dToBunker).toBeGreaterThan(12);
    }
  });

  it("lays up on a reachable par 5 when the green is guarded (mid skill)", () => {
    // 225y to a small green ringed by bunkers with trees flanking — the
    // situation from Boscobel: reachable in two, but a mid-handicapper's
    // long-club mishit tail plus a weak amateur short game around a guarded
    // green make a full-wedge layup the smarter play.
    const hole: Hole = {
      id: "h",
      number: 1,
      par: 5,
      pin: at(0, 225),
      features: [
        {
          id: "f",
          kind: "fairway",
          polygon: [at(-22, 30), at(22, 30), at(22, 180), at(-22, 180)],
        },
        { id: "g", kind: "green", polygon: blob(0, 225, 11) },
        { id: "b1", kind: "bunker", polygon: blob(-14, 212, 7) },
        { id: "b2", kind: "bunker", polygon: blob(14, 212, 7) },
        { id: "b3", kind: "bunker", polygon: blob(0, 240, 7) },
        { id: "t1", kind: "trees", polygon: blob(-38, 218, 17) },
        { id: "t2", kind: "trees", polygon: blob(38, 218, 17) },
      ],
    };
    const res = computeStrategy(ball, hole, profile, { riskAppetite: 0.5 });
    expect(res).not.toBeNull();
    // The recommended play is a layup, not a full send at the green.
    expect(res!.chosen.carryYards).toBeLessThanOrEqual(175);
    expect(res!.chosen.toPinYards).toBeGreaterThanOrEqual(50);
    // The safe play certainly lays up.
    expect(res!.safe.carryYards).toBeLessThanOrEqual(175);
  });

  it("is deterministic for the same inputs", () => {
    const hole: Hole = {
      id: "h",
      number: 1,
      par: 3,
      pin: at(0, 150),
      features: [{ id: "g", kind: "green", polygon: blob(0, 150, 15) }],
    };
    const a = computeStrategy(ball, hole, profile, { riskAppetite: 0.5 });
    const b = computeStrategy(ball, hole, profile, { riskAppetite: 0.5 });
    expect(a!.chosen.expectedStrokes).toBe(b!.chosen.expectedStrokes);
  });
});
