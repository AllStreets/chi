# CHI ATLAS — Design Overhaul Spec (2026-07-03)

Chicago Explorer becomes **CHI ATLAS**: a cinematic, mission-control city atlas.
Reference aesthetic: dark 3D transit-map HUDs (Tokyo Metro 3D, SF Tech Atlas) —
near-black canvas, glass panels, neon line glows, mono clocks, keyboard-hint chips.

**Hard rule: zero feature removal.** Every page keeps all existing data, hooks,
interactions, filters, and API calls. This is a reskin + chrome upgrade, not a rewrite.

## Brand

- Wordmark: `CHI ATLAS` set in Michroma, wide letter-spacing, cyan tick accent.
- Tagline: `CHICAGO CITY INTELLIGENCE`.
- App title (index.html): `CHI ATLAS — Chicago City Intelligence`.

## Typography

- **Display** — `Michroma` (page titles, wordmark, big HUD numerals' labels). Use sparingly.
- **UI** — `Archivo` (all body/labels/buttons). Replaces Space Grotesk.
- **Data** — `IBM Plex Mono` (clocks, coords, counts, prices, statuses). Replaces JetBrains Mono.

Fonts load via `<link>` in `index.html` (not CSS @import).

## Palette / Tokens (frontend/src/styles/global.css)

Legacy token names stay defined (all 17 pages consume them) and are remapped:

```css
--bg: #030509;            /* near-black blue */
--bg-elev: #070c16;
--surface: #0a111f;       /* legacy name, darker glass-solid */
--border: rgba(148, 187, 255, 0.13);   /* hairline */
--border-strong: rgba(148, 187, 255, 0.28);
--text: #e8eef9;
--text-muted: #7e8aa3;
--text-faint: #4e5a72;
--accent: #45d8ff;        /* electric cyan — user-overridable via Settings */
--accent-rgb: 69, 216, 255;
--red: #ff3b53;           /* Chicago-flag red, secondary accent */
--panel: rgba(9, 14, 26, 0.72);        /* glass fill (pair with backdrop-blur) */
--font-display: 'Michroma', sans-serif;
--font-ui: 'Archivo', sans-serif;
--font-mono: 'IBM Plex Mono', monospace;
--r-sm: 8px; --r-md: 12px; --r-lg: 16px;
```

Settings appearance override (`--accent`, `--accent-rgb` via JS setProperty) and
`data-density` must keep working.

## HUD Primitives (defined once in global.css, used everywhere)

- `.hud-panel` — glass: `background: var(--panel); backdrop-filter: blur(18px) saturate(1.3);
  border: 1px solid var(--border); border-radius: var(--r-lg);` subtle top-edge light line.
- `.hud-label` — 10px uppercase, `letter-spacing: 0.22em`, `color: var(--text-faint)`, Archivo 600.
- `.hud-title` — Michroma page title, ~20px, `letter-spacing: 0.12em`, uppercase.
- `.hud-pill` / `.hud-pill.active` — capsule toggle buttons (mode pills, filters).
- `.hud-kbd` — keyboard chip: mono 10px, 1px hairline, 4px radius.
- `.hud-chip` — status chip w/ pulsing dot option (`.live` gets cyan pulse dot).
- `.hud-corners` — absolute corner ticks (1px, 10px arms) for framed panels.
- Grain: `body::after` fixed SVG-noise overlay at ~3% opacity, pointer-events none.
- Custom scrollbars (thin, hairline thumb), cyan `::selection`.

## Page Header Pattern (all content pages)

```
ATLAS / <SECTION>          ← .hud-label eyebrow (with cyan slash)
<PAGE TITLE>               ← .hud-title (Michroma)
<sub/status chips>         ← .hud-chip row (live counts, mono)
```

Cards become `.hud-panel`-style glass with hover: `border-color: var(--border-strong);
transform: translateY(-1px)`. Numbers/dates/prices in mono. Filter rows become pill groups.

## App Shell

- Sidebar: glass, hairline right border, wordmark `CHI ATLAS`, nav items with
  cyan left tick + soft glow when active, live mono clock (CT) pinned at bottom.
- Global **⌘K command palette** (`src/components/hud/CommandPalette.jsx`):
  fuzzy page navigation across all 17 routes, glass modal, kbd hints. Opens with
  ⌘K / Ctrl+K; Escape closes; arrows + Enter navigate.
- `src/components/hud/HudClock.jsx` — live America/Chicago mono clock.

## Map Pages (Home, Transit, Food, Nightlife)

- Full-bleed map stays. HUD chrome on top: top-left glass chip stack (LIVE badge,
  counts), bottom hint bar with `.hud-kbd` chips ("Drag rotate · Scroll zoom · ⌘K search"),
  vignette overlay (radial gradient, pointer-events none).
- Home additionally gets a cinematic slow camera intro (fly from high zoom, ease 4s)
  and keeps every existing layer (trains, routes, food, nightlife, stadiums,
  neighborhoods, pulse marker, IntelFeed).
- Transit gets a Tokyo-Metro-style left glass panel: all 8 CTA lines with colored
  glow badges, per-line live train counts, status; big mono clock header.

## Out of Scope

Backend logic, API routes, DB, service worker, tests' behavior — unchanged.
Only visual/JSX-chrome changes in frontend; class names may change with CSS.
