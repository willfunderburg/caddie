import type { Course, FeatureKind, Hole, LatLng } from "../types";
import { makeProjection, toLatLng, yardsToMeters } from "../model/geo";

// A synthetic demo hole so the app is usable immediately without drawing a
// course. It's a ~380 yard par 4 running north, with water guarding the front
// -right of the green and a greenside bunker left. Coordinates are placed over
// open ground (a park) purely for demonstration.
const TEE: LatLng = { lat: 40.0, lng: -105.27 };
const proj = makeProjection(TEE);

/** Build a lat/lng point at (eastYards, northYards) from the tee. */
function pt(eastYards: number, northYards: number): LatLng {
  return toLatLng(
    { x: yardsToMeters(eastYards), y: yardsToMeters(northYards) },
    proj
  );
}

/** Build a roughly circular polygon around a centre. */
function blob(
  eastYards: number,
  northYards: number,
  radiusYards: number,
  squashX = 1
): LatLng[] {
  const n = 12;
  const out: LatLng[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(
      pt(
        eastYards + Math.cos(a) * radiusYards * squashX,
        northYards + Math.sin(a) * radiusYards
      )
    );
  }
  return out;
}

function feat(kind: FeatureKind, polygon: LatLng[], n: number) {
  return { id: `demo-${kind}-${n}`, kind, polygon };
}

const PIN = pt(0, 375);

const demoHole: Hole = {
  id: "demo-hole-1",
  number: 1,
  par: 4,
  tee: TEE,
  pin: PIN,
  features: [
    // Fairway strip.
    feat(
      "fairway",
      [
        pt(-16, 30),
        pt(16, 30),
        pt(18, 180),
        pt(14, 300),
        pt(-14, 300),
        pt(-18, 180),
      ],
      1
    ),
    // Green.
    feat("green", blob(0, 375, 13, 1.1), 1),
    // Water front-right of the green.
    feat(
      "water",
      [pt(10, 330), pt(34, 340), pt(36, 375), pt(20, 372), pt(12, 355)],
      1
    ),
    // Greenside bunker, left.
    feat("bunker", blob(-20, 372, 7), 1),
    // Fairway bunker in the driving zone, right.
    feat("bunker", blob(20, 235, 8), 2),
    // Out of bounds down the left tree line.
    feat(
      "oob",
      [pt(-40, 30), pt(-28, 30), pt(-30, 380), pt(-45, 380)],
      1
    ),
  ],
};

export function sampleCourse(): Course {
  return {
    id: "demo-course",
    name: "Demo Links (sample)",
    holes: [demoHole],
  };
}
