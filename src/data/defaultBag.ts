import type { Club } from "../types";

let seq = 0;
const id = () => `club-${Date.now().toString(36)}-${seq++}`;

/**
 * A sensible default bag with typical mid-handicap carry distances (yards).
 * Users edit these to their own numbers.
 */
export function defaultBag(): Club[] {
  return [
    { id: id(), name: "Driver", carryYards: 230 },
    { id: id(), name: "3 Wood", carryYards: 210 },
    { id: id(), name: "5 Wood", carryYards: 195 },
    { id: id(), name: "4 Hybrid", carryYards: 180 },
    { id: id(), name: "5 Iron", carryYards: 170 },
    { id: id(), name: "6 Iron", carryYards: 160 },
    { id: id(), name: "7 Iron", carryYards: 150 },
    { id: id(), name: "8 Iron", carryYards: 140 },
    { id: id(), name: "9 Iron", carryYards: 128 },
    { id: id(), name: "PW", carryYards: 115 },
    { id: id(), name: "GW", carryYards: 100 },
    { id: id(), name: "SW", carryYards: 85 },
    { id: id(), name: "LW", carryYards: 65 },
  ];
}

export function newClub(): Club {
  return { id: id(), name: "New Club", carryYards: 150 };
}
