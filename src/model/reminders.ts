import type { Club } from "../types";

// Personal swing keys shown with every recommendation. Stored on the profile
// so they're editable; these are the defaults.
export interface SwingReminders {
  /** Shown on every swing. */
  all: string[];
  /** Shown only for long clubs (5-iron and longer). */
  long: string[];
}

export function defaultReminders(): SwingReminders {
  return {
    all: [
      "Light grip",
      "Shortest backswing possible!",
      "Head behind the ball at impact",
    ],
    long: ["Let the club do the work — swing it like an 8-iron"],
  };
}

/**
 * Is this a "long club" (5-iron or longer)? Detected from the name
 * (driver / woods / hybrids / 1-5 irons), falling back to carry distance.
 */
export function isLongClub(club: Club): boolean {
  const n = club.name.toLowerCase();
  if (/(driver|wood|hybrid|rescue)/.test(n)) return true;
  const iron = n.match(/\b([1-9])\s*(?:i|iron)\b/);
  if (iron) return Number(iron[1]) <= 5;
  // Wedges and short irons are never "long".
  if (/(wedge|\bpw\b|\bgw\b|\bsw\b|\blw\b|\baw\b)/.test(n)) return false;
  return club.carryYards >= 170;
}

/** The reminder list to show for a given club (blank lines dropped). */
export function remindersFor(
  club: Club,
  reminders: SwingReminders
): string[] {
  const list = isLongClub(club)
    ? [...reminders.all, ...reminders.long]
    : reminders.all;
  return list.map((s) => s.trim()).filter((s) => s !== "");
}
