// ---------------------------------------------------------------------------
// Domain types shared across the app.
// ---------------------------------------------------------------------------

/** A geographic point, WGS84. */
export interface LatLng {
  lat: number;
  lng: number;
}

/** A club in the player's bag with a typical full-swing carry distance. */
export interface Club {
  id: string;
  /** Display name, e.g. "7 Iron", "Driver", "PW". */
  name: string;
  /** Typical carry distance in yards. */
  carryYards: number;
}

/**
 * Skill tier. Drives shot dispersion. Roughly maps to handicap:
 *  - pro:      scratch / tour
 *  - low:      ~5 handicap
 *  - mid:      ~15 handicap
 *  - high:     ~25+ handicap
 */
export type SkillTier = "pro" | "low" | "mid" | "high";

export interface PlayerProfile {
  bag: Club[];
  skill: SkillTier;
  /**
   * Optional fine-tuning multiplier on dispersion (1 = use tier default).
   * Lets a user who knows they're straight-but-short tune the model.
   */
  dispersionScale: number;
  /** Personal swing keys shown with every recommendation. */
  reminders: {
    /** Shown on every swing. */
    all: string[];
    /** Shown only for long clubs (5-iron and longer). */
    long: string[];
  };
}

/** Types of terrain / features on a hole. */
export type FeatureKind =
  | "green"
  | "fairway"
  | "bunker"
  | "water"
  | "oob" // out of bounds
  | "trees";

/** A polygon region on the hole (green, fairway, hazard, etc.). */
export interface HoleFeature {
  id: string;
  kind: FeatureKind;
  /** Polygon vertices in order. */
  polygon: LatLng[];
}

export interface Hole {
  id: string;
  number: number;
  par: number;
  /** Scorecard yardage (informational). */
  yards?: number;
  /** Scorecard stroke index / handicap ranking 1-18 (informational). */
  handicapIndex?: number;
  /** Flag / pin location. */
  pin?: LatLng;
  /** Tee location (optional, informational). */
  tee?: LatLng;
  features: HoleFeature[];
}

export interface Course {
  id: string;
  name: string;
  holes: Hole[];
}

/** Where the ball currently is, and how it got set. */
export interface BallPosition {
  point: LatLng;
  source: "gps" | "manual";
  /** GPS accuracy in meters, if known. */
  accuracy?: number;
}

/** A single strategy recommendation for a target aim point. */
export interface Recommendation {
  aim: LatLng;
  club: Club;
  /** Straight-line yards from ball to aim point. */
  carryYards: number;
  /** Yards from aim point to pin. */
  toPinYards: number;
  /** Expected total strokes to hole out if playing this target. */
  expectedStrokes: number;
  /** Probability the shot ends in a penalty (water / OOB). */
  penaltyChance: number;
  /** Probability of finishing on the green. */
  greenChance: number;
  /** Probability of finishing in a "good" spot (green + fairway). */
  inPlayChance: number;
  /** Risk-adjusted score used to rank (lower is better). */
  score: number;
  /**
   * Signed degrees the aim deviates from the straight ball→pin line.
   * Positive = right of the line (viewed from the ball). ~0 = straight at it.
   */
  offLineDeg: number;
  /** Club whose full carry matches the distance left to the pin, if any. */
  leavesClub?: string;
  /** 1-sigma landing-dispersion ellipse around the expected landing point. */
  landingZone?: LatLng[];
}

export interface StrategyResult {
  /** Lowest expected strokes — play for the best score. */
  aggressive: Recommendation;
  /** Lowest risk of a blow-up — safest play. */
  safe: Recommendation;
  /** The recommendation matching the user's chosen risk appetite. */
  chosen: Recommendation;
}
