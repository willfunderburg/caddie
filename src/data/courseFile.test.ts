import { describe, expect, it } from "vitest";
import { courseFileContents, parseCourseFile } from "./courseFile";
import type { Course } from "../types";

const course: Course = {
  id: "boscobel",
  name: "Boscobel Golf & Country Club",
  holes: [
    {
      id: "boscobel-1",
      number: 1,
      par: 5,
      yards: 494,
      handicapIndex: 15,
      pin: { lat: 34.609, lng: -82.7665 },
      tee: { lat: 34.6089, lng: -82.766 },
      features: [
        {
          id: "f1",
          kind: "green",
          polygon: [
            { lat: 34.6091, lng: -82.7666 },
            { lat: 34.6092, lng: -82.7665 },
            { lat: 34.6091, lng: -82.7664 },
          ],
        },
      ],
    },
  ],
};

describe("course export/import", () => {
  it("round-trips a course through export and import", () => {
    const parsed = parseCourseFile(courseFileContents(course));
    expect(parsed.name).toBe(course.name);
    expect(parsed.holes).toHaveLength(1);
    const h = parsed.holes[0];
    expect(h.par).toBe(5);
    expect(h.yards).toBe(494);
    expect(h.pin).toEqual(course.holes[0].pin);
    expect(h.features).toHaveLength(1);
    expect(h.features[0].kind).toBe("green");
    expect(h.features[0].polygon).toHaveLength(3);
    // Ids regenerate so imports never collide.
    expect(parsed.id).not.toBe(course.id);
  });

  it("rejects garbage", () => {
    expect(() => parseCourseFile("not json")).toThrow(/JSON/);
    expect(() => parseCourseFile('{"foo": 1}')).toThrow(/course/i);
    expect(() => parseCourseFile('{"name":"x","holes":[]}')).toThrow(/holes/i);
  });

  it("drops malformed features but keeps the hole", () => {
    const dirty = JSON.parse(courseFileContents(course));
    dirty.holes[0].features.push({ kind: "lava", polygon: [] });
    dirty.holes[0].features.push({ kind: "water", polygon: [{ lat: 999, lng: 0 }] });
    const parsed = parseCourseFile(JSON.stringify(dirty));
    expect(parsed.holes[0].features).toHaveLength(1);
  });
});
