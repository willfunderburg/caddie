import type { FeatureKind } from "../types";

// ---------------------------------------------------------------------------
// "Expected strokes to hole out" baseline, à la strokes-gained analysis
// (Broadie). Values are approximate PGA/amateur composite baselines and are
// good enough to *rank* targets, which is all the strategy engine needs.
//
// All distances here are yards-to-the-pin unless noted. Putting is handled
// separately in feet.
// ---------------------------------------------------------------------------

type Table = [distanceYards: number, strokes: number][];

// Expected strokes from the FAIRWAY at a given distance to the pin.
const FAIRWAY: Table = [
  [10, 2.18],
  [20, 2.4],
  [30, 2.52],
  [40, 2.6],
  [50, 2.66],
  [60, 2.7],
  [70, 2.72],
  [80, 2.75],
  [90, 2.77],
  [100, 2.8],
  [120, 2.85],
  [140, 2.91],
  [160, 2.98],
  [180, 3.08],
  [200, 3.19],
  [220, 3.32],
  [240, 3.45],
  [260, 3.58],
  [280, 3.7],
];

// Rough is a bit worse than fairway; the penalty grows with distance because
// long shots from rough are much harder to control.
function roughPenalty(distance: number): number {
  return 0.12 + Math.min(0.28, distance / 1000);
}

// Sand around/short of the green and fairway bunkers.
const SAND: Table = [
  [10, 2.5],
  [20, 2.53],
  [30, 2.66],
  [40, 2.82],
  [50, 2.92],
  [60, 3.0],
  [80, 3.08],
  [100, 3.1],
  [120, 3.15],
  [140, 3.22],
  [160, 3.34],
  [180, 3.5],
  [200, 3.68],
  [220, 3.85],
];

// Recovery (trees / deep trouble): you'll likely have to punch out.
const RECOVERY: Table = [
  [10, 3.0],
  [30, 3.2],
  [60, 3.4],
  [100, 3.6],
  [140, 3.8],
  [180, 4.0],
  [220, 4.2],
];

// Putting: expected putts from a distance in FEET on the green.
const PUTT: Table = [
  [1, 1.0],
  [2, 1.01],
  [3, 1.05],
  [4, 1.13],
  [5, 1.23],
  [6, 1.34],
  [7, 1.42],
  [8, 1.5],
  [9, 1.56],
  [10, 1.61],
  [15, 1.78],
  [20, 1.87],
  [25, 1.94],
  [30, 2.0],
  [40, 2.09],
  [50, 2.18],
  [60, 2.26],
  [90, 2.5],
];

function interp(table: Table, x: number): number {
  if (x <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (x >= last[0]) {
    // Extrapolate gently beyond the table using the final slope.
    const prev = table[table.length - 2];
    const slope = (last[1] - prev[1]) / (last[0] - prev[0]);
    return last[1] + slope * (x - last[0]);
  }
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const [x0, y0] = table[i - 1];
      const [x1, y1] = table[i];
      const t = (x - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return last[1];
}

const YARDS_TO_FEET = 3;

/**
 * Expected strokes to hole out from a given lie and distance-to-pin (yards).
 * For the green we convert to feet and use the putting table.
 */
export function expectedStrokes(
  lie: FeatureKind | "green" | "rough",
  distanceYards: number
): number {
  switch (lie) {
    case "green":
      return interp(PUTT, distanceYards * YARDS_TO_FEET);
    case "fairway":
      return interp(FAIRWAY, distanceYards);
    case "bunker":
      return interp(SAND, distanceYards);
    case "trees":
      return interp(RECOVERY, distanceYards);
    case "water":
    case "oob":
      // Callers handle penalty accounting explicitly; treat the lie itself as
      // rough for the follow-up shot.
      return interp(FAIRWAY, distanceYards) + roughPenalty(distanceYards);
    default:
      // "rough" and anything unmapped.
      return interp(FAIRWAY, distanceYards) + roughPenalty(distanceYards);
  }
}
