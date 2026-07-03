import type { Course, PlayerProfile } from "../types";
import { defaultBag } from "../data/defaultBag";
import { sampleCourse } from "../data/sampleCourse";
import { boscobelCourse } from "../data/boscobel";

// ---------------------------------------------------------------------------
// Tiny localStorage-backed persistence. No backend required for the MVP.
// ---------------------------------------------------------------------------

const PROFILE_KEY = "caddie.profile.v1";
const COURSES_KEY = "caddie.courses.v1";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota / privacy-mode errors; app still works in-memory.
  }
}

export function loadProfile(): PlayerProfile {
  return load<PlayerProfile>(PROFILE_KEY, {
    bag: defaultBag(),
    skill: "mid",
    dispersionScale: 1,
  });
}

export function saveProfile(p: PlayerProfile): void {
  save(PROFILE_KEY, p);
}

export function loadCourses(): Course[] {
  const courses = load<Course[]>(COURSES_KEY, []);
  // First run: start with Boscobel (real location) plus a fully-traced demo
  // hole so the strategy engine works immediately.
  if (courses.length === 0) return [boscobelCourse(), sampleCourse()];
  return courses;
}

export function saveCourses(c: Course[]): void {
  save(COURSES_KEY, c);
}
