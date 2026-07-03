import type { LatLng } from "../types";

// ---------------------------------------------------------------------------
// Geometry helpers. We work in a local flat (equirectangular) projection
// centred on the hole so that distance / point-in-polygon math is simple and
// fast. Over the scale of a golf hole (a few hundred yards) the distortion is
// negligible.
// ---------------------------------------------------------------------------

const EARTH_RADIUS_M = 6_378_137;
export const METERS_PER_YARD = 0.9144;
export const YARDS_PER_METER = 1 / METERS_PER_YARD;

export interface XY {
  x: number; // meters east of origin
  y: number; // meters north of origin
}

/** A projection anchored at an origin lat/lng. */
export interface Projection {
  origin: LatLng;
  cosLat: number;
}

export function makeProjection(origin: LatLng): Projection {
  return { origin, cosLat: Math.cos((origin.lat * Math.PI) / 180) };
}

export function toXY(p: LatLng, proj: Projection): XY {
  const dLat = ((p.lat - proj.origin.lat) * Math.PI) / 180;
  const dLng = ((p.lng - proj.origin.lng) * Math.PI) / 180;
  return {
    x: dLng * proj.cosLat * EARTH_RADIUS_M,
    y: dLat * EARTH_RADIUS_M,
  };
}

export function toLatLng(xy: XY, proj: Projection): LatLng {
  const dLat = (xy.y / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLng =
    (xy.x / (EARTH_RADIUS_M * proj.cosLat)) * (180 / Math.PI);
  return {
    lat: proj.origin.lat + dLat,
    lng: proj.origin.lng + dLng,
  };
}

/** Great-circle-ish distance in meters (flat approximation). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const proj = makeProjection(a);
  const p = toXY(b, proj);
  return Math.hypot(p.x, p.y);
}

export function distanceYards(a: LatLng, b: LatLng): number {
  return distanceMeters(a, b) * YARDS_PER_METER;
}

export function metersToYards(m: number): number {
  return m * YARDS_PER_METER;
}

export function yardsToMeters(y: number): number {
  return y * METERS_PER_YARD;
}

/** Ray-casting point-in-polygon test. Polygon is a list of XY vertices. */
export function pointInPolygonXY(pt: XY, poly: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      yi = poly[i].y;
    const xj = poly[j].x,
      yj = poly[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Axis-aligned bounding box of a set of XY points. */
export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function bboxOf(poly: XY[]): BBox {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function bboxContains(b: BBox, pt: XY): boolean {
  return pt.x >= b.minX && pt.x <= b.maxX && pt.y >= b.minY && pt.y <= b.maxY;
}

function cross(o: XY, a: XY, b: XY): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Do segments AB and CD properly intersect? (Collinear touches ignored.) */
export function segmentsIntersect(a: XY, b: XY, c: XY, d: XY): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}

/**
 * Does segment AB cross the polygon boundary, or lie (partly) inside it?
 * Pass the polygon's bbox to allow a cheap early-out.
 */
export function segmentIntersectsPolygon(
  a: XY,
  b: XY,
  poly: XY[],
  bbox?: BBox
): boolean {
  if (bbox) {
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    if (
      maxX < bbox.minX ||
      minX > bbox.maxX ||
      maxY < bbox.minY ||
      minY > bbox.maxY
    ) {
      return false;
    }
  }
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (segmentsIntersect(a, b, poly[j], poly[i])) return true;
  }
  // No boundary crossing: either fully inside or fully outside.
  return pointInPolygonXY(a, poly) || pointInPolygonXY(b, poly);
}

/** Centroid of a polygon (simple average of vertices). */
export function centroidXY(poly: XY[]): XY {
  let x = 0,
    y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  return { x: x / poly.length, y: y / poly.length };
}
