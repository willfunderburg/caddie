import type { FeatureKind, HoleFeature, LatLng } from "../types";

// ---------------------------------------------------------------------------
// OpenStreetMap integration — keyless and free.
//  - Nominatim for course search / geocoding.
//  - Overpass for importing hole features (greens, bunkers, water) that
//    mappers have already traced. Best-effort: failures degrade to "trace it
//    yourself on the satellite image".
// ---------------------------------------------------------------------------

export interface CourseSearchResult {
  name: string;
  point: LatLng;
}

export async function searchCourses(query: string): Promise<CourseSearchResult[]> {
  const q = /golf/i.test(query) ? query : query + " golf course";
  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=" +
    encodeURIComponent(q);
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("Search failed (" + res.status + ")");
  const data = (await res.json()) as Array<{
    display_name: string;
    lat: string;
    lon: string;
  }>;
  return data.map((d) => ({
    name: d.display_name,
    point: { lat: parseFloat(d.lat), lng: parseFloat(d.lon) },
  }));
}

// Map OSM golf/natural tags to our feature kinds.
function classify(tags: Record<string, string>): FeatureKind | "pin" | null {
  const golf = tags.golf;
  if (golf === "green") return "green";
  if (golf === "bunker") return "bunker";
  if (golf === "fairway") return "fairway";
  if (golf === "tee") return "fairway"; // treat tee box as playable ground
  if (golf === "water_hazard" || golf === "lateral_water_hazard") return "water";
  if (golf === "rough") return null;
  if (tags.natural === "water" || tags.waterway) return "water";
  if (tags.natural === "wood" || tags.landuse === "forest") return "trees";
  return null;
}

interface OverpassElement {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
  center?: { lat: number; lon: number };
}

/**
 * Import traced hole features from OSM within `radiusM` of a point. Returns an
 * empty array (never throws) if nothing is found or the service is unreachable.
 */
export async function importFeaturesNear(
  center: LatLng,
  radiusM = 200
): Promise<HoleFeature[]> {
  const query = `[out:json][timeout:25];
(
  way["golf"](around:${radiusM},${center.lat},${center.lng});
  way["natural"="water"](around:${radiusM},${center.lat},${center.lng});
  way["waterway"](around:${radiusM},${center.lat},${center.lng});
);
out geom;`;
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: "data=" + encodeURIComponent(query),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { elements: OverpassElement[] };
    const out: HoleFeature[] = [];
    for (const el of data.elements) {
      if (!el.geometry || el.geometry.length < 3 || !el.tags) continue;
      const kind = classify(el.tags);
      if (!kind || kind === "pin") continue;
      const polygon: LatLng[] = el.geometry.map((g) => ({
        lat: g.lat,
        lng: g.lon,
      }));
      out.push({ id: `osm-${el.type}-${el.id}`, kind, polygon });
    }
    return out;
  } catch {
    return [];
  }
}
