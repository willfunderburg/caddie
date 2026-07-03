import { useEffect, useMemo, useState } from "react";
import type { BallPosition, Course, Hole, PlayerProfile } from "./types";
import {
  loadCourses,
  loadProfile,
  saveCourses,
  saveProfile,
} from "./state/store";
import { computeStrategy } from "./model/strategy";
import { distanceYards } from "./model/geo";
import HoleMap from "./components/HoleMap";
import StrategyPanel from "./components/StrategyPanel";
import BagEditor from "./components/BagEditor";
import CourseManager from "./components/CourseManager";

type Tab = "play" | "bag" | "course";

export default function App() {
  const [profile, setProfile] = useState<PlayerProfile>(() => loadProfile());
  const [courses, setCourses] = useState<Course[]>(() => loadCourses());
  const [tab, setTab] = useState<Tab>("play");
  const [riskAppetite, setRiskAppetite] = useState(0.6);
  const [mapFull, setMapFull] = useState(false);

  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [holeId, setHoleId] = useState(courses[0]?.holes[0]?.id ?? "");

  // Ball position per hole so switching holes keeps each ball.
  const [balls, setBalls] = useState<Record<string, BallPosition>>({});

  useEffect(() => saveProfile(profile), [profile]);
  useEffect(() => saveCourses(courses), [courses]);

  const course = courses.find((c) => c.id === courseId) ?? courses[0];
  const hole =
    course?.holes.find((h) => h.id === holeId) ?? course?.holes[0];

  // Keep selection valid if courses change underneath us.
  useEffect(() => {
    if (!course) return;
    if (course.id !== courseId) setCourseId(course.id);
    if (!course.holes.find((h) => h.id === holeId)) {
      setHoleId(course.holes[0]?.id ?? "");
    }
  }, [course, courseId, holeId]);

  const ball = hole ? balls[hole.id] ?? null : null;

  function setBall(b: BallPosition) {
    if (!hole) return;
    setBalls((prev) => ({ ...prev, [hole.id]: b }));
  }

  function updateHole(updated: Hole) {
    if (!course) return;
    setCourses((prev) =>
      prev.map((c) =>
        c.id === course.id
          ? {
              ...c,
              holes: c.holes.map((h) => (h.id === updated.id ? updated : h)),
            }
          : c
      )
    );
  }

  const result = useMemo(() => {
    if (!hole || !ball) return null;
    return computeStrategy(ball, hole, profile, { riskAppetite });
  }, [hole, ball, profile, riskAppetite]);

  const ballToPin =
    ball && hole?.pin ? distanceYards(ball.point, hole.pin) : null;

  const hideChrome = mapFull && tab === "play";

  return (
    <div className="app">
      {!hideChrome && (
        <div className="topbar">
          <div className="logo">
            Cad<span>die</span>
          </div>
          <div className="sub">
            {course ? course.name : "No course"}
            {hole
              ? ` · Hole ${hole.number} · par ${hole.par}${
                  hole.yards ? ` · ${hole.yards}y` : ""
                }`
              : ""}
          </div>
        </div>
      )}

      {!hideChrome && (
      <div className="tabs">
        <button
          className={tab === "play" ? "active" : ""}
          onClick={() => setTab("play")}
        >
          ⛳ Play
        </button>
        <button
          className={tab === "bag" ? "active" : ""}
          onClick={() => setTab("bag")}
        >
          🎒 My Bag
        </button>
        <button
          className={tab === "course" ? "active" : ""}
          onClick={() => setTab("course")}
        >
          🗺️ Course
        </button>
      </div>
      )}

      {tab === "play" && (
        <div className="content play">
          {!hideChrome && course && course.holes.length > 1 && (
            <div className="hole-picker">
              {course.holes.map((h) => (
                <button
                  key={h.id}
                  className={"chip" + (h.id === hole?.id ? " active" : "")}
                  onClick={() => setHoleId(h.id)}
                >
                  {h.number}
                </button>
              ))}
            </div>
          )}
          {hole ? (
            <>
              <HoleMap
                key={hole.id}
                hole={hole}
                ball={ball}
                result={result}
                onBallChange={setBall}
                onHoleChange={updateHole}
                fullscreen={hideChrome}
                onToggleFullscreen={() => setMapFull((f) => !f)}
              />
              {hideChrome && result && (
                <div className="fs-pill">
                  <b>{result.chosen.club.name}</b> · aim{" "}
                  {Math.round(result.chosen.carryYards)}y
                  {ballToPin != null && <> · {Math.round(ballToPin)}y to pin</>}
                </div>
              )}
              {!hideChrome && (
                <StrategyPanel
                  result={result}
                  ball={ball}
                  hole={hole}
                  ballToPinYards={ballToPin}
                  riskAppetite={riskAppetite}
                  onRiskChange={setRiskAppetite}
                  profile={profile}
                />
              )}
            </>
          ) : (
            <div className="empty">
              No hole selected. Add one in the Course tab.
            </div>
          )}
        </div>
      )}

      {tab === "bag" && (
        <div className="content">
          <BagEditor profile={profile} onChange={setProfile} />
        </div>
      )}

      {tab === "course" && (
        <div className="content">
          <CourseManager
            courses={courses}
            selectedCourseId={course?.id ?? ""}
            selectedHoleId={hole?.id ?? ""}
            onChange={setCourses}
            onSelect={(cId, hId) => {
              setCourseId(cId);
              setHoleId(hId);
            }}
          />
        </div>
      )}
    </div>
  );
}
