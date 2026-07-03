import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import type {
  BallPosition,
  FeatureKind,
  Hole,
  LatLng,
  StrategyResult,
} from "../types";
import { distanceYards } from "../model/geo";

interface Props {
  hole: Hole;
  ball: BallPosition | null;
  result: StrategyResult | null;
  onBallChange: (b: BallPosition) => void;
  onHoleChange: (h: Hole) => void;
  /** Hide the editing toolbar and let the map fill the screen. */
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}

type Tool = "ball" | "pin" | FeatureKind | null;

const FEATURE_STYLE: Record<FeatureKind, { color: string; fill: string }> = {
  fairway: { color: "#4c9a4c", fill: "#5cbf5c" },
  green: { color: "#7ad12f", fill: "#a6e85a" },
  water: { color: "#2f7fbf", fill: "#4aa3df" },
  bunker: { color: "#c9b676", fill: "#e8d9a0" },
  oob: { color: "#f2685c", fill: "#f2685c" },
  trees: { color: "#1f4d2a", fill: "#2f6b3a" },
};

const TOOLS: { tool: Tool; label: string }[] = [
  { tool: "ball", label: "📍 Ball" },
  { tool: "pin", label: "⛳ Pin" },
  { tool: "fairway", label: "Fairway" },
  { tool: "green", label: "Green" },
  { tool: "water", label: "Water" },
  { tool: "bunker", label: "Bunker" },
  { tool: "oob", label: "OOB" },
  { tool: "trees", label: "Trees" },
];

function ll(p: LatLng): L.LatLngTuple {
  return [p.lat, p.lng];
}

export default function HoleMap({
  hole,
  ball,
  result,
  onBallChange,
  onHoleChange,
  fullscreen,
  onToggleFullscreen,
}: Props) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const featureLayer = useRef<L.LayerGroup | null>(null);
  const overlayLayer = useRef<L.LayerGroup | null>(null);
  const draftLayer = useRef<L.LayerGroup | null>(null);
  const didFit = useRef(false);

  const [tool, setTool] = useState<Tool>(null);
  const [draft, setDraft] = useState<LatLng[]>([]);

  // Keep latest values available to the (stable) map click handler.
  const toolRef = useRef(tool);
  const draftRef = useRef(draft);
  toolRef.current = tool;
  draftRef.current = draft;
  const holeRef = useRef(hole);
  holeRef.current = hole;

  // --- Init map once ---
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, {
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 21,
        maxNativeZoom: 19,
        attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
      }
    ).addTo(map);

    featureLayer.current = L.layerGroup().addTo(map);
    overlayLayer.current = L.layerGroup().addTo(map);
    draftLayer.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    map.on("click", (e: L.LeafletMouseEvent) => {
      const point: LatLng = { lat: e.latlng.lat, lng: e.latlng.lng };
      const t = toolRef.current;
      if (t === "ball" || t === null) {
        onBallChange({ point, source: "manual" });
      } else if (t === "pin") {
        onHoleChange({ ...holeRef.current, pin: point });
        setTool(null);
      } else {
        setDraft([...draftRef.current, point]);
      }
    });

    // Initial view.
    const center = hole.pin ?? hole.tee ?? ball?.point ?? { lat: 40, lng: -105.27 };
    map.setView(ll(center), 17);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Fit to hole once we have geometry ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || didFit.current) return;
    const pts: L.LatLngTuple[] = [];
    if (hole.pin) pts.push(ll(hole.pin));
    if (hole.tee) pts.push(ll(hole.tee));
    if (ball) pts.push(ll(ball.point));
    for (const f of hole.features) for (const p of f.polygon) pts.push(ll(p));
    if (pts.length >= 2) {
      map.fitBounds(L.latLngBounds(pts), { padding: [40, 40] });
      didFit.current = true;
    }
  }, [hole, ball]);

  // Re-fit when the hole changes (different hole selected).
  useEffect(() => {
    didFit.current = false;
  }, [hole.id]);

  // Leaflet needs a size recalc when the container grows/shrinks.
  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 60);
    return () => clearTimeout(t);
  }, [fullscreen]);

  // --- Draw features ---
  useEffect(() => {
    const lg = featureLayer.current;
    if (!lg) return;
    lg.clearLayers();
    for (const f of hole.features) {
      if (f.polygon.length < 2) continue;
      const style = FEATURE_STYLE[f.kind];
      const poly = L.polygon(f.polygon.map(ll), {
        color: style.color,
        weight: f.kind === "oob" ? 2 : 1.5,
        fillColor: style.fill,
        fillOpacity: f.kind === "oob" ? 0.12 : 0.38,
        dashArray: f.kind === "oob" ? "6 5" : undefined,
      });
      poly.on("click", (e) => {
        // Allow deleting a feature by clicking it when its tool is active.
        if (toolRef.current === f.kind) {
          L.DomEvent.stop(e);
          if (confirm(`Remove this ${f.kind}?`)) {
            onHoleChange({
              ...holeRef.current,
              features: holeRef.current.features.filter((x) => x.id !== f.id),
            });
          }
        }
      });
      poly.addTo(lg);
    }
  }, [hole, onHoleChange]);

  // --- Draw pin, ball, and strategy overlay ---
  useEffect(() => {
    const lg = overlayLayer.current;
    if (!lg) return;
    lg.clearLayers();

    if (hole.pin) {
      L.marker(ll(hole.pin), {
        icon: L.divIcon({
          className: "",
          html: '<div style="font-size:22px;line-height:22px;filter:drop-shadow(0 1px 2px #000)">⛳</div>',
          iconSize: [22, 22],
          iconAnchor: [3, 22],
        }),
        interactive: false,
      }).addTo(lg);
    }

    // Strategy targets + aim line from ball.
    if (result && ball) {
      const chosen = result.chosen;
      L.polyline([ll(ball.point), ll(chosen.aim)], {
        color: "#57d98a",
        weight: 2,
        dashArray: "4 6",
      }).addTo(lg);

      // Your 1-sigma shot pattern around the expected landing point — shows
      // where the ball actually finishes when you aim here.
      if (chosen.landingZone && chosen.landingZone.length >= 3) {
        L.polygon(chosen.landingZone.map(ll), {
          color: "#ffffff",
          weight: 1.5,
          dashArray: "3 4",
          fillColor: "#ffffff",
          fillOpacity: 0.08,
          interactive: false,
        }).addTo(lg);
      }

      addTarget(lg, chosen.aim, "target", `${chosen.club.name} · ${Math.round(chosen.carryYards)}y`);

      // Show the alternative (aggressive vs safe) that isn't the chosen one.
      const alt =
        chosen === result.aggressive ? result.safe : result.aggressive;
      const altIsSafe = alt === result.safe;
      if (dist(alt.aim, chosen.aim) > 5) {
        addTarget(
          lg,
          alt.aim,
          altIsSafe ? "safe" : "target",
          altIsSafe ? "safe" : "aggressive",
          true
        );
      }
    }

    if (ball) {
      const m = L.marker(ll(ball.point), {
        icon: L.divIcon({
          className: "",
          html: '<div class="ball-marker"></div>',
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
        draggable: true,
      }).addTo(lg);
      m.on("dragend", () => {
        const p = m.getLatLng();
        onBallChange({ point: { lat: p.lat, lng: p.lng }, source: "manual" });
      });
    }
  }, [hole.pin, ball, result, onBallChange]);

  // --- Draw the in-progress polygon draft ---
  useEffect(() => {
    const lg = draftLayer.current;
    if (!lg) return;
    lg.clearLayers();
    if (draft.length === 0) return;
    L.polyline(draft.map(ll), {
      color: "#ffffff",
      weight: 2,
      dashArray: "3 5",
    }).addTo(lg);
    for (const p of draft) {
      L.circleMarker(ll(p), {
        radius: 4,
        color: "#fff",
        fillColor: "#57d98a",
        fillOpacity: 1,
      }).addTo(lg);
    }
  }, [draft]);

  const drawingFeature =
    tool !== null && tool !== "ball" && tool !== "pin" ? tool : null;

  function finishDraft() {
    if (drawingFeature && draft.length >= 3) {
      const f = {
        id: `f-${Date.now().toString(36)}`,
        kind: drawingFeature,
        polygon: draft,
      };
      onHoleChange({ ...hole, features: [...hole.features, f] });
    }
    setDraft([]);
    setTool(null);
  }

  function locate() {
    if (!navigator.geolocation) {
      alert("Geolocation is not available on this device/browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        onBallChange({ point, source: "gps", accuracy: pos.coords.accuracy });
        mapRef.current?.panTo(ll(point));
      },
      (err) => alert("Couldn't get GPS location: " + err.message),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <>
      {!fullscreen && (
        <div className="map-toolbar">
          <button className="chip" onClick={locate}>
            🛰️ GPS
          </button>
          {TOOLS.map((t) => (
            <button
              key={t.label}
              className={"chip" + (tool === t.tool ? " active" : "")}
              onClick={() => {
                setDraft([]);
                setTool(tool === t.tool ? null : t.tool);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {drawingFeature && (
        <div className="map-toolbar" style={{ paddingTop: 0 }}>
          <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center" }}>
            Tap the map to outline the {drawingFeature}. {draft.length} point
            {draft.length === 1 ? "" : "s"}.
          </span>
          <button className="chip active" onClick={finishDraft}>
            ✓ Finish
          </button>
          <button className="chip ghost" onClick={() => { setDraft([]); setTool(null); }}>
            Cancel
          </button>
        </div>
      )}
      {tool === "ball" && !drawingFeature && (
        <div className="map-toolbar" style={{ paddingTop: 0 }}>
          <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center" }}>
            Tap the map to drop your ball, or drag the ball marker.
          </span>
        </div>
      )}
      {tool === "pin" && (
        <div className="map-toolbar" style={{ paddingTop: 0 }}>
          <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center" }}>
            Tap the green to place the pin.
          </span>
        </div>
      )}

      <div className="map-wrap">
        <div className="map" ref={mapEl} />
        <div className="map-float">
          <button
            className="float-btn"
            title={fullscreen ? "Exit full map" : "Full map"}
            onClick={onToggleFullscreen}
          >
            {fullscreen ? "✕" : "⛶"}
          </button>
          {fullscreen && (
            <button className="float-btn" title="GPS" onClick={locate}>
              🛰️
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function dist(a: LatLng, b: LatLng): number {
  return distanceYards(a, b);
}

function addTarget(
  lg: L.LayerGroup,
  at: LatLng,
  cls: "target" | "safe",
  label: string,
  small = false
) {
  const color = cls === "safe" ? "#4aa3df" : "#57d98a";
  L.circleMarker(ll(at), {
    radius: small ? 6 : 9,
    color: "#fff",
    weight: 2,
    fillColor: color,
    fillOpacity: 0.9,
  }).addTo(lg);
  L.marker(ll(at), {
    icon: L.divIcon({
      className: "",
      html: `<div class="map-label ${cls}">${label}</div>`,
      iconSize: [10, 10],
      iconAnchor: [-8, 8],
    }),
    interactive: false,
  }).addTo(lg);
}
