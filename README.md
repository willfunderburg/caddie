# Caddie ⛳

A GPS golf-course strategy app. Tell it where your ball is on a hole and it
recommends the smartest target — optimized for **your** club distances and
**your** skill level — using a strokes-gained Monte-Carlo model.

It answers the two questions that actually lower scores:

- **Where do I aim for the best score?** (lowest expected strokes)
- **What's the safe play?** (lowest chance of a penalty / blow-up)

…and lets you dial anywhere in between with a risk slider.

## What it does

- **Know your spot.** Use your phone's **GPS**, or (MVP-friendly) just **drag a
  dot** to your ball on a real satellite view of the hole.
- **Optimized for you.** Configure the clubs in your bag and the carry distance
  you hit each one. Set a skill level (which controls how much your shots
  scatter). Every recommendation is computed from *your* numbers.
- **Real recommendations.** For hundreds of candidate targets, the engine
  simulates your shot dispersion, works out where the ball is likely to end up
  (green / fairway / rough / bunker / water / OOB), and scores each target by
  expected strokes to hole out. You get a club, an aim point, and the odds:
  % on green, % in play, % penalty risk.
- **Bring your course.** Several ways to set up a hole:
  1. **Trace it** on the satellite image (tap to outline the green, water,
     bunkers, OOB).
  2. **Search** public **OpenStreetMap** data to jump to a real course
     (no account or API key).
  3. **Import hazards** that OSM mappers have already traced near a hole.
  4. **Snap your scorecard** as a reference while you set each hole's par.
- **Starts loaded with Boscobel Golf & Country Club** (Pendleton, SC) — the real
  Par-71 scorecard (five par-3s), plus a fully-traced demo hole so the strategy
  engine works the moment you open the app.

Everything is stored locally in your browser — no backend, no sign-up.

## How the strategy engine works

- **Dispersion model** (`src/model/dispersion.ts`): a full shot is a 2-D
  Gaussian around the aim point. Offline error is an angular cone (degrees) and
  depth error is a percentage of the shot distance; both tighten for better
  players. A fine-tune slider scales the whole cone.
- **Expected-strokes baseline** (`src/model/strokes.ts`): approximate
  strokes-gained tables (Broadie-style) giving expected strokes to hole out by
  lie and distance, including putting by feet.
- **Search** (`src/model/strategy.ts`): sweeps candidate aim points across every
  club distance and a range of lateral aim lines, Monte-Carlo simulates each,
  accounts for water (penalty + drop) and OOB (stroke-and-distance), and returns
  the **aggressive** (min expected strokes), **safe** (min risk-adjusted), and
  **chosen** (your risk-slider) plays.

## Run it

```bash
npm install
npm run dev        # local dev server
npm run build      # production build to dist/
npm run preview    # serve the production build
npm test           # unit tests for the strategy engine
```

Open on your phone, add it to your home screen, and use it on the course.

## Roadmap

- Automatic scorecard OCR (photo → pars/yardages) via a vision model.
- Live GPS tracking (`watchPosition`) with a "distance to front/center/back of
  green" readout.
- Elevation & wind adjustments to carry distances.
- Auto-detecting the hole you're standing on from GPS.
- Per-round shot tracking to auto-calibrate your real club distances and
  dispersion over time.

## Tech

Vite + React + TypeScript, Leaflet with free Esri World Imagery tiles. Course
search/import uses OpenStreetMap (Nominatim + Overpass). No API keys required.
