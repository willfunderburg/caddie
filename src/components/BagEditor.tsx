import type { PlayerProfile, SkillTier } from "../types";
import { newClub } from "../data/defaultBag";
import { skillLabel } from "../model/dispersion";

interface Props {
  profile: PlayerProfile;
  onChange: (p: PlayerProfile) => void;
}

const SKILLS: SkillTier[] = ["pro", "low", "mid", "high"];

export default function BagEditor({ profile, onChange }: Props) {
  function updateClub(id: string, patch: Partial<{ name: string; carryYards: number }>) {
    onChange({
      ...profile,
      bag: profile.bag.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  }

  const sorted = [...profile.bag].sort((a, b) => b.carryYards - a.carryYards);

  return (
    <div className="section">
      <h2>Your game</h2>
      <p className="hint">
        These numbers drive every recommendation. Set your <b>carry</b> distances
        (how far the ball flies in the air), not total roll-out.
      </p>

      <div className="card">
        <div className="row between">
          <b>Skill level</b>
        </div>
        <div className="pill-group mt">
          {SKILLS.map((s) => (
            <button
              key={s}
              className={"chip" + (profile.skill === s ? " active" : "")}
              onClick={() => onChange({ ...profile, skill: s })}
            >
              {skillLabel(s)}
            </button>
          ))}
        </div>
        <div className="row between mt">
          <label style={{ fontSize: 13, color: "var(--muted)" }}>
            Fine-tune shot spread
          </label>
          <span style={{ fontSize: 13 }}>
            {Math.round(profile.dispersionScale * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={0.6}
          max={1.5}
          step={0.05}
          value={profile.dispersionScale}
          onChange={(e) =>
            onChange({ ...profile, dispersionScale: Number(e.target.value) })
          }
          style={{ width: "100%" }}
        />
        <p className="hint" style={{ marginTop: 6, marginBottom: 0 }}>
          Lower = tighter/straighter than your handicap suggests; higher = wilder.
        </p>
      </div>

      <div className="row between">
        <h2 style={{ margin: 0 }}>Clubs ({profile.bag.length})</h2>
        <button
          className="btn secondary"
          onClick={() => onChange({ ...profile, bag: [...profile.bag, newClub()] })}
        >
          + Add club
        </button>
      </div>

      {sorted.map((c) => (
        <div className="club-row" key={c.id}>
          <input
            type="text"
            value={c.name}
            onChange={(e) => updateClub(c.id, { name: e.target.value })}
          />
          <div className="yards">
            <input
              type="number"
              inputMode="numeric"
              value={c.carryYards}
              onChange={(e) =>
                updateClub(c.id, { carryYards: Number(e.target.value) || 0 })
              }
            />
            <span>yds</span>
          </div>
          <button
            className="icon"
            title="Remove"
            onClick={() =>
              onChange({
                ...profile,
                bag: profile.bag.filter((x) => x.id !== c.id),
              })
            }
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
