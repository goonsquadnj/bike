# Ramp Rider

A simple 2D side-scrolling motorcycle game, built by Jeffrey (with Julian).
Vanilla HTML/CSS/JS on an HTML5 canvas — **no framework, no build step, no dependencies.**

## Running it
- **To play:** open `index.html` directly in a browser (double-click), or serve the
  folder (`python -m http.server`). It runs entirely client-side.
- Jeffrey plays and tests in his own browser — that costs no API tokens. The in-app
  preview is only for Claude's own verification and can get flaky after repeated use.

## Files
- `index.html` — page, HUD, start/result overlay, on-screen touch controls
- `style.css` — dark theme, HUD, controls
- `game.js` — everything: terrain, physics, input, rendering, game loop

## How `game.js` is organized
- **Tuning constants** at the top (`SPEED`, `BOOST_MULT`, `GRAVITY`, `JUMP_VEL`, rotation,
  `COG_HEIGHT`, `HALF_WB`, …). Change game feel here.
- **The level is data:** `buildLevel()` walks a cursor and emits `SEGS` (solid surface
  segments), `CRATES`, and `POWERUPS`. A *gap* is just an x-range with no segment; a vertical
  height jump between segments is a *cliff/wall*. Low-level ops: `flat`, `ramp`, `gap`, `step`
  (cliff), `crate`, `power('boost'|'djump')`.
- **Built from reusable chunks:** `hills`, `whoops`, `aCrate`, `crateRun`, `aGap`, `kicker`,
  `ledgeMesa`, `djumpTower`, `boostGap`, `gauntlet`, `climbHigh`, `valley`. Each is
  **elevation-neutral and runway-padded** so they compose in any order without stacked /
  impossible hazards. The level composes ~50 of them across 4 escalating "acts" (~37k px,
  ~6× the original POC). A seeded RNG keeps it deterministic. To change length/difficulty,
  add/remove chunk calls in the acts.
- `surfaceAt(x)` / `groundY(x)` — the highest solid surface at x, or `null` over a gap.
- `update(dt)` — fixed timestep (1/120 s): speed (boostable), gravity, jump, air rotation,
  ground/gap/wall contact, pickups, collisions, finish.
- Particle system (`parts`) for dust, boost trail, crash burst, ambient motes.
- `render()` — dusk parallax sky/sun/mountains, terrain mesas, obstacles, power-ups, particles, bike.
- Main loop uses a fixed-timestep accumulator (with a `window.__pause` debug hook).

## Key design decisions
- **One base speed.** The player controls jump + forward/back rotation in the air,
  with gentle auto-leveling when no rotate button is held (hold to spin/flip, release to settle).
- **Crash conditions:** hitting an obstacle, a bad landing, falling in a gap, or ramming a wall.
- **Landing uses a center-of-gravity rule** (`landingIsStable`): a landing is safe as long
  as the center of gravity projects between the two wheels; tilt past that and the bike tips.
  Tunable via `COG_HEIGHT` (lower = more forgiving) and `HALF_WB`. Max safe tilt ≈ ~60°.
- **Ramps launch by real momentum** — the ground only pushes up, never pins the bike to a
  downward-curving crest, so a fast run up a ramp carries it into the air.
- **Gaps & a second level:** drive off into a gap and you fall to your death; raised
  platforms make an upper route you must *jump onto* (running into the wall = crash).
- **Power-ups** (`POWERUPS`, two types) each power exactly **one** big move and **end on the
  next landing** (not a timer), so they never bleed into the next section:
  - `boost` — extra horizontal speed (`BOOST_MULT`) for **distance**; some wide gaps need it.
  - `djump` — one mid-air **double-jump** (`bike.airJumps`) for **height**; tall towers need it.
  - Gotchas learned the hard way: a power-up must sit on flat ground **after** the previous
    hazard's landing and **before** the move that needs it — otherwise it gets grabbed/spent
    early. Tall-tower double-jumps need ~285px of runway so the 2nd-jump apex aligns with the wall.
- **Art:** dusk-silhouette style (Alto's-Adventure-ish) — gradient sky, low sun, parallax
  mountain layers, mesa terrain with warm rim light, silhouette bike with boost trail.

## How we build together (workflow: hybrid orchestrator)
- **Opus** (the main session) plans, writes specs, and reviews.
- Well-scoped, self-contained chunks (UI, layout, isolated features, boilerplate) get
  **delegated to a Sonnet agent**.
- Context-heavy or subtle work — physics, game feel, anything depending on prior tuning —
  stays **inline with Opus**.
- Rule of thumb: delegate what can be fully described in one prompt; keep what depends on
  what we've learned together.

## Conventions
- Keep it simple and dependency-free. Match the existing style in `game.js`.
- After changing anything observable, **verify before claiming it works.** Physics can be
  tested deterministically: set `window.__pause = true`, then drive `update(1/120)` from the
  console / preview eval (a debug pause hook exists in the game loop). A scripted full
  playthrough should still reach the finish line.

## Status / TODO
- Large chunk-composed level (~37k px, ~6× the POC; 4 acts, ~50 hazards) built and **verified
  beatable in simulation** (a hazard-deriving bot reaches the finish across a range of jump
  timings). Dusk art + ⚡ boost / ⏫ double-jump power-ups. **Not yet playtested by a human.**
- It's a long run with no checkpoints (one crash = restart) — adding checkpoints/zone-restart
  is a likely next ask if it feels punishing.
- Verification approach that works: in preview eval, set `window.__pause=true`, derive hazards
  from `SEGS`/`CRATES`, run a bot that jumps with type-based lead (gap≈edge, crate≈120, tall
  rise≈285) and double-jumps at apex when charged; confirm it reaches `FINISH_X`.
- **Debug tab** to visualize/tune the CoG rule: still requested, **not yet built**.
