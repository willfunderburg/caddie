import { describe, expect, it } from "vitest";
import { computeStrategy } from "./strategy";
import { expectedStrokes } from "./strokes";
import type { BallPosition, Hole, LatLng, PlayerProfile } from "../types";
import { makeProjection, toLatLng, yardsToMeters } from "./geo";

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
