import { describe, expect, it } from "vitest";
import { defaultReminders, isLongClub, remindersFor } from "./reminders";

const club = (name: string, carryYards = 150) => ({ id: "x", name, carryYards });

describe("isLongClub", () => {
  it("detects woods, hybrids, and long irons", () => {
    expect(isLongClub(club("Driver", 230))).toBe(true);
    expect(isLongClub(club("3 Wood", 210))).toBe(true);
    expect(isLongClub(club("4 Hybrid", 180))).toBe(true);
    expect(isLongClub(club("5 Iron", 170))).toBe(true);
    expect(isLongClub(club("5i", 170))).toBe(true);
  });
  it("excludes short irons and wedges", () => {
    expect(isLongClub(club("6 Iron", 160))).toBe(false);
    expect(isLongClub(club("8 Iron", 140))).toBe(false);
    expect(isLongClub(club("PW", 115))).toBe(false);
    expect(isLongClub(club("Sand Wedge", 85))).toBe(false);
  });
  it("falls back to carry distance for unrecognized names", () => {
    expect(isLongClub(club("Big Stick", 220))).toBe(true);
    expect(isLongClub(club("Bump Club", 120))).toBe(false);
  });
});

describe("remindersFor", () => {
  it("adds long-club keys only for long clubs", () => {
    const r = defaultReminders();
    expect(remindersFor(club("8 Iron"), r)).toHaveLength(3);
    expect(remindersFor(club("Driver", 230), r)).toHaveLength(4);
  });
  it("drops blank lines from editing", () => {
    const r = { all: ["Light grip", "", "  "], long: [] };
    expect(remindersFor(club("8 Iron"), r)).toEqual(["Light grip"]);
  });
});
