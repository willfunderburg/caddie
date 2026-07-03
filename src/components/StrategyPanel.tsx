import type { BallPosition, Hole, StrategyResult } from "../types";

interface Props {
  result: StrategyResult | null;
  ball: BallPosition | null;
  hole: Hole;
  ballToPinYards: number | null;
  riskAppetite: number;
  onRiskChange: (v: number) => void;
}

function pct(x: number): string {
  return Math.round(x * 100) + "%";
}

function chanceClass(p: number): string {
  if (p >= 0.15) return "bad";
  if (p >= 0.05) return "warn";
  return "good";
}

export default function StrategyPanel({
  result,
  ball,
  hole,
  ballToPinYards,
  riskAppetite,
  onRiskChange,
}: Props) {
  if (!hole.pin) {
    return (
      <div className="strategy">
        <div className="empty">
          Set the <b>⛳ Pin</b> on the map to get a recommendation.
        </div>
      </div>
    );
  }
  if (!ball) {
    return (
      <div className="strategy">
        <div className="empty">
          Drop your <b>📍 Ball</b> (or tap <b>GPS</b>) to see the play.
        </div>
      </div>
    );
  }
  if (!result) {
    return (
      <div className="strategy">
        <div className="empty">Add clubs to your bag to get a recommendation.</div>
      </div>
    );
  }

  const c = result.chosen;
  return (
    <div className="strategy">
      <div className="headline">
        <span className="club">{c.club.name}</span>
        <span className="dist">
          aim {Math.round(c.carryYards)}y
          {ballToPinYards != null && <> · {Math.round(ballToPinYards)}y to pin</>}
        </span>
      </div>
      <div className="tagline">
        Leaves ~{c.toPinYards < 1 ? "tap-in" : Math.round(c.toPinYards) + "y"} to
        the hole · expected {c.expectedStrokes.toFixed(2)} strokes to hole out
      </div>

      <div className="stat-row">
        <div className="stat">
          <div className="v good">{pct(c.greenChance)}</div>
          <div className="l">On green</div>
        </div>
        <div className="stat">
          <div className="v">{pct(c.inPlayChance)}</div>
          <div className="l">In play</div>
        </div>
        <div className="stat">
          <div className={"v " + chanceClass(c.penaltyChance)}>
            {pct(c.penaltyChance)}
          </div>
          <div className="l">Penalty risk</div>
        </div>
        <div className="stat">
          <div className="v">{c.expectedStrokes.toFixed(2)}</div>
          <div className="l">Exp. strokes</div>
        </div>
      </div>

      <div className="risk">
        <label>Safe</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={riskAppetite}
          onChange={(e) => onRiskChange(Number(e.target.value))}
        />
        <label style={{ textAlign: "right" }}>Aggressive</label>
      </div>

      <div className="compare">
        <div className="opt agg">
          <b>Aggressive</b>
          {result.aggressive.club.name} · {Math.round(result.aggressive.carryYards)}y
          <br />
          {result.aggressive.expectedStrokes.toFixed(2)} exp ·{" "}
          {pct(result.aggressive.penaltyChance)} risk
        </div>
        <div className="opt safe">
          <b>Safe</b>
          {result.safe.club.name} · {Math.round(result.safe.carryYards)}y
          <br />
          {result.safe.expectedStrokes.toFixed(2)} exp ·{" "}
          {pct(result.safe.penaltyChance)} risk
        </div>
      </div>
    </div>
  );
}
