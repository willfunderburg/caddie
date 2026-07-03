import { useState } from "react";
import type { Course, Hole } from "../types";
import { searchCourses, importFeaturesNear, type CourseSearchResult } from "../data/osm";
import {
  courseFileContents,
  courseFileName,
  parseCourseFile,
} from "../data/courseFile";

interface Props {
  courses: Course[];
  selectedCourseId: string;
  selectedHoleId: string;
  onChange: (courses: Course[]) => void;
  onSelect: (courseId: string, holeId: string) => void;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(performance.now())}`;
}

function blankHole(number: number, near?: { lat: number; lng: number }): Hole {
  return {
    id: uid("hole"),
    number,
    par: 4,
    tee: near,
    pin: undefined,
    features: [],
  };
}

export default function CourseManager({
  courses,
  selectedCourseId,
  selectedHoleId,
  onChange,
  onSelect,
}: Props) {
  const course = courses.find((c) => c.id === selectedCourseId) ?? courses[0];
  const hole = course?.holes.find((h) => h.id === selectedHoleId);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CourseSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [scorecard, setScorecard] = useState<string | null>(null);

  function updateCourse(updated: Course) {
    onChange(courses.map((c) => (c.id === updated.id ? updated : c)));
  }

  function addHole() {
    if (!course) return;
    const num = course.holes.length + 1;
    const near = hole?.pin ?? hole?.tee;
    const nh = blankHole(num, near);
    const updated = { ...course, holes: [...course.holes, nh] };
    updateCourse(updated);
    onSelect(course.id, nh.id);
  }

  async function runSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setStatus(null);
    setResults(null);
    try {
      const r = await searchCourses(query.trim());
      setResults(r);
      if (r.length === 0) setStatus("No matches. Try a more specific name + city.");
    } catch (e) {
      setStatus("Search unavailable: " + (e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  function useResult(r: CourseSearchResult) {
    const first = blankHole(1, r.point);
    first.pin = r.point;
    const nc: Course = {
      id: uid("course"),
      name: r.name.split(",")[0],
      holes: [first],
    };
    onChange([...courses, nc]);
    onSelect(nc.id, first.id);
    setResults(null);
    setQuery("");
    setStatus(`Created "${nc.name}". Open Play to trace the hole on satellite.`);
  }

  function exportCourse() {
    if (!course) return;
    const blob = new Blob([courseFileContents(course)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = courseFileName(course);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setStatus(`Exported "${course.name}" — keep the file as your backup.`);
  }

  function importCourseFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = parseCourseFile(String(reader.result));
        onChange([...courses, imported]);
        onSelect(imported.id, imported.holes[0].id);
        setStatus(
          `Imported "${imported.name}" (${imported.holes.length} holes).`
        );
      } catch (e) {
        setStatus("Import failed: " + (e as Error).message);
      }
    };
    reader.readAsText(file);
  }

  async function importOsm() {
    if (!course || !hole) return;
    const center = hole.pin ?? hole.tee;
    if (!center) {
      setStatus("Set the pin (or tee) on this hole first, then import.");
      return;
    }
    setImporting(true);
    setStatus(null);
    try {
      const feats = await importFeaturesNear(center, 220);
      if (feats.length === 0) {
        setStatus("No traced features found nearby on OpenStreetMap.");
      } else {
        updateCourse({
          ...course,
          holes: course.holes.map((h) =>
            h.id === hole.id ? { ...h, features: [...h.features, ...feats] } : h
          ),
        });
        setStatus(`Imported ${feats.length} feature(s) from OpenStreetMap.`);
      }
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="section">
      <h2>Your courses</h2>
      <p className="hint">Pick a course to play, or add one below.</p>
      <div className="pill-group" style={{ marginBottom: 18 }}>
        {courses.map((c) => (
          <button
            key={c.id}
            className={"chip" + (c.id === selectedCourseId ? " active" : "")}
            onClick={() => onSelect(c.id, c.holes[0]?.id ?? "")}
          >
            {c.name}
          </button>
        ))}
      </div>

      <h2>Find a course</h2>
      <p className="hint">
        Search public OpenStreetMap data to drop a pin at a real course, then
        trace the hole on the satellite view. No account or key needed.
      </p>
      <div className="row">
        <input
          type="text"
          style={{ flex: 1 }}
          placeholder="e.g. Bethpage Black, Farmingdale"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
        />
        <button className="btn" onClick={runSearch} disabled={searching}>
          {searching ? "…" : "Search"}
        </button>
      </div>
      {results && results.length > 0 && (
        <div className="mt">
          {results.map((r, i) => (
            <div className="card" key={i} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 13, marginBottom: 8 }}>{r.name}</div>
              <button className="btn secondary" onClick={() => useResult(r)}>
                Use this course
              </button>
            </div>
          ))}
        </div>
      )}
      {status && (
        <div className="note mt">{status}</div>
      )}

      <h2 className="mt">Scan a scorecard</h2>
      <p className="hint">
        Snap your scorecard for reference while you enter each hole's par. (Automatic
        OCR extraction is planned — for now the photo is your cheat-sheet.)
      </p>
      <div className="row">
        <label className="btn secondary" style={{ cursor: "pointer" }}>
          📷 Upload photo
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const reader = new FileReader();
              reader.onload = () => setScorecard(reader.result as string);
              reader.readAsDataURL(f);
            }}
          />
        </label>
        {scorecard && (
          <button className="icon" onClick={() => setScorecard(null)}>
            Remove
          </button>
        )}
      </div>
      {scorecard && (
        <img
          src={scorecard}
          alt="scorecard"
          style={{ maxWidth: "100%", borderRadius: 10, marginTop: 10 }}
        />
      )}

      {course && (
        <>
          <h2 className="mt">Course setup</h2>
          <div className="card">
            <div className="row">
              <span style={{ fontSize: 13, color: "var(--muted)", minWidth: 44 }}>
                Name
              </span>
              <input
                type="text"
                style={{ flex: 1 }}
                value={course.name}
                onChange={(e) => updateCourse({ ...course, name: e.target.value })}
              />
            </div>

            <div className="row mt" style={{ alignItems: "flex-start" }}>
              <span style={{ fontSize: 13, color: "var(--muted)", minWidth: 44 }}>
                Holes
              </span>
              <div className="hole-picker" style={{ flex: 1, background: "none", border: "none", padding: 0 }}>
                {course.holes.map((h) => (
                  <button
                    key={h.id}
                    className={"chip" + (h.id === selectedHoleId ? " active" : "")}
                    onClick={() => onSelect(course.id, h.id)}
                  >
                    {h.number}
                  </button>
                ))}
                <button className="chip ghost" onClick={addHole}>
                  +
                </button>
              </div>
            </div>

            {hole && (
              <div className="row between mt">
                <span style={{ fontSize: 13 }}>
                  Hole {hole.number} · par
                </span>
                <select
                  value={hole.par}
                  onChange={(e) =>
                    updateCourse({
                      ...course,
                      holes: course.holes.map((h) =>
                        h.id === hole.id ? { ...h, par: Number(e.target.value) } : h
                      ),
                    })
                  }
                >
                  {[3, 4, 5, 6].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <button
            className="btn secondary"
            onClick={importOsm}
            disabled={importing}
            style={{ width: "100%" }}
          >
            {importing ? "Importing…" : "⤓ Import hazards near this hole (OpenStreetMap)"}
          </button>

          <h2 className="mt">Backup &amp; share</h2>
          <p className="hint">
            Your traced holes live only on this device. Export a file to back
            them up or share with a friend; import to restore.
          </p>
          <div className="row">
            <button className="btn secondary" onClick={exportCourse}>
              ⇪ Export course
            </button>
            <label className="btn secondary" style={{ cursor: "pointer" }}>
              ⇩ Import course file
              <input
                type="file"
                accept=".json,application/json"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importCourseFile(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </>
      )}
    </div>
  );
}
