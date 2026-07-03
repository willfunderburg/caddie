import type { Course, FeatureKind, Hole, HoleFeature, LatLng } from "../types";

// ---------------------------------------------------------------------------
// Course backup files. Export writes the course as pretty-printed JSON;
// import validates the shape defensively (files can come from anywhere) and
// regenerates ids so an import never collides with existing courses.
// ---------------------------------------------------------------------------

const KINDS: FeatureKind[] = [
  "green",
  "fairway",
  "bunker",
  "water",
  "oob",
  "trees",
];

function isNum(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function asLatLng(x: unknown): LatLng | null {
  if (!x || typeof x !== "object") return null;
  const p = x as Record<string, unknown>;
  if (!isNum(p.lat) || !isNum(p.lng)) return null;
  if (Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) return null;
  return { lat: p.lat, lng: p.lng };
}

/**
 * Parse an exported course file. Throws with a readable message when the
 * file isn't a valid course.
 */
export function parseCourseFile(text: string): Course {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (!raw || typeof raw !== "object") throw new Error("Not a course file.");
  const c = raw as Record<string, unknown>;
  if (typeof c.name !== "string" || !Array.isArray(c.holes)) {
    throw new Error("Not a course file (missing name/holes).");
  }

  const cid = `course-${Date.now().toString(36)}-${Math.floor(
    Math.random() * 1e6
  )}`;

  const holes: Hole[] = [];
  for (let i = 0; i < c.holes.length; i++) {
    const h = c.holes[i] as Record<string, unknown>;
    if (!h || typeof h !== "object") continue;

    const features: HoleFeature[] = [];
    if (Array.isArray(h.features)) {
      for (let j = 0; j < h.features.length; j++) {
        const f = h.features[j] as Record<string, unknown>;
        if (!f || !KINDS.includes(f.kind as FeatureKind)) continue;
        if (!Array.isArray(f.polygon)) continue;
        const polygon = f.polygon
          .map(asLatLng)
          .filter((p): p is LatLng => p !== null);
        if (polygon.length < 3) continue;
        features.push({
          id: `${cid}-h${i + 1}-f${j}`,
          kind: f.kind as FeatureKind,
          polygon,
        });
      }
    }

    holes.push({
      id: `${cid}-h${i + 1}`,
      number: isNum(h.number) ? h.number : i + 1,
      par: isNum(h.par) && h.par >= 3 && h.par <= 6 ? h.par : 4,
      yards: isNum(h.yards) ? h.yards : undefined,
      handicapIndex: isNum(h.handicapIndex) ? h.handicapIndex : undefined,
      pin: asLatLng(h.pin) ?? undefined,
      tee: asLatLng(h.tee) ?? undefined,
      features,
    });
  }
  if (holes.length === 0) throw new Error("The file contains no valid holes.");

  return { id: cid, name: c.name, holes };
}

/** Serialize a course for download. */
export function courseFileContents(course: Course): string {
  return JSON.stringify(course, null, 2);
}

/** Suggested filename for a course export. */
export function courseFileName(course: Course): string {
  const safe = course.name.replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "");
  return `${safe || "course"}.caddie.json`;
}
