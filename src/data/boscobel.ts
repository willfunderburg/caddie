import type { Course, Hole, LatLng } from "../types";

// Boscobel Golf & Country Club — Pendleton, SC (near Clemson).
// Opened 1932 (Ed Freeman; later renovated by Russell Breeden). Par 71,
// ~6,459 yards from the Blue tees, notable for FIVE par-3s. Data below is
// transcribed from the actual course scorecard (Blue/championship tees, men's
// par and stroke index). Coordinates are the real course location so the
// satellite view opens over Boscobel; trace each hole (or use GPS on-site /
// OSM import) to feed the strategy engine.
const CENTER: LatLng = { lat: 34.608973, lng: -82.766533 };

// Men's par by hole (1-18). Out 36 / In 35 = 71.
const PARS = [5, 4, 4, 3, 5, 4, 3, 4, 4, 3, 4, 3, 4, 3, 5, 4, 4, 5];

// Blue (championship) tee yardages by hole.
const YARDS = [
  494, 368, 390, 225, 490, 420, 160, 410, 285, 204, 345, 175, 400, 185, 553,
  450, 390, 510,
];

// Men's handicap / stroke index by hole (1 = hardest).
const HCP = [15, 13, 9, 5, 7, 3, 11, 1, 17, 4, 14, 16, 10, 18, 8, 2, 6, 12];

function boscobelHoles(): Hole[] {
  return PARS.map((par, i) => ({
    id: `boscobel-${i + 1}`,
    number: i + 1,
    par,
    yards: YARDS[i],
    handicapIndex: HCP[i],
    // Seed each hole at the course center; set the real pin/tee per hole with
    // GPS, by tapping the map, or via OSM import.
    tee: CENTER,
    pin: i === 0 ? CENTER : undefined,
    features: [],
  }));
}

export function boscobelCourse(): Course {
  return {
    id: "boscobel",
    name: "Boscobel Golf & Country Club",
    holes: boscobelHoles(),
  };
}
