# Getting Started

**Interplanetary Survival Guide: Martian Map** (package name `mars-explorer`) is a browser-based 3D model of Mars: a Solar System view, a detailed globe and flat map with NASA data layers, route planning, a first-person surface view, a detailed 3D model of Gale Crater, and short simulations.

It is plain JavaScript (ES modules) on three.js r128 and Vite

This guide gets the project running in about five minutes.

## Table of Contents

1. [Requirements](#requirements)
2. [Installation](#installation)
3. [Running the App](#running-the-app)
4. [Verifying the Setup](#verifying-the-setup)
5. [Commands](#commands)
6. [Tests](#tests)
7. [Configuration](#configuration)
8. [Project Structure](#project-structure)
9. [Performance Modes](#performance-modes)
10. [Troubleshooting](#troubleshooting)
11. [Next Steps](#next-steps)

---

## Requirements

| Tool | Version | Check |
|------|---------|-------|
| Node.js | 18 or higher (`engines` in `package.json`) | `node -v` |
| npm | comes with Node.js | `npm -v` |
| Browser | recent Chrome, Firefox, Safari or Edge **with WebGL** | |

The app also needs **internet access** while running because map color and layer tiles come from NASA Mars Trek (`trek.nasa.gov`).


## Installation

```bash
git clone <your-repository-url>
cd NASA_Space_Apps_2026
npm install
```


## Running the App

```bash
npm run build:standalone
```

Open the index.html from standalone/dist

## Verifying the Setup

1. You should see the Solar System: an animated Sun, planets and asteroid belt, and a **Discover** label with an arrow above Mars.
2. Click **Discover** (or Mars itself). A loading screen with a "Did you know?" fact appears, then the Mars globe opens.
3. Check these:
   - Drag to rotate, scroll or pinch to zoom.
   - **Layout** → *Elevation (MOLA)* shows a color-coded height map and a legend.
   - **Grid** draws a latitude/longitude grid with labels and shows the local solar time of the sector.
   - **Globe / Map** switches between the 3D globe and a flat map.
   - **Labels** puts place names on the planet.
   - **Markers** (top left) → *Places of interest* flies to Olympus Mons, Gale Crater and others and opens an information card.
   - **Markers** → *Routes*: choose a start and an end and press the search button to get a route, difficulty and elevation profile.
   - Drag the **Explorer** figure onto the planet, wait for the pin and its preview, then press **Land here**: you should get a first-person view with a compass, local solar time and quiet background music.
   - Pin a spot near **Gale Crater** (for example choose Gale Crater in Places and drop the Explorer on it) and press **Detailed view** for the 3D model.
   - **Simulation** opens the standing-viewpoint scenes (day and night, Phobos and Deimos, marsquake, dust storm).
4. Press **Esc** (or the back button) to return one level at a time.

If the planet looks like a plain rust-colored ball without surface detail, the color tiles are not loading. See [Troubleshooting](#troubleshooting).

## Commands

| Command | What it does |
|---------|--------------|
| `npm run build:standalone` | Builds a single-script version into `standalone/dist/` (see below) |
| `npm test` | Runs the unit tests with Node's built-in runner (`node --test`) |


## Tests

```bash
npm test
```

There are 46 tests in `tests/` that run without a browser or three.js:

| File | Covers |
|------|--------|
| `golden.test.js` + `golden.json` | Regression values for math, view, formatting, color ramps, the Mars Sun model, tile URLs and config, recorded from the code before it was split into modules |
| `route-planner.test.js` | The A* route planner |
| `detail.test.js` | Detailed-view geometry |
| `sim.test.js` | The simulation model and noise |

## Configuration

Configuration is in source code:

| What | Where |
|------|-------|
| Camera, distances, mesh sizes, detail window, panorama and surface fog | `src/config.js` |
| Tile server URLs, zoom limits, overlay layers | `src/data/tiles.js` |
| Dev proxy and build options | `vite.config.js` |
| Places of interest and their info cards | `src/markers/places.js` |
| Rovers | `src/markers/vehicles.js` |
| Detailed-view models | `src/mars/detail-geo.js` (`DETAIL_MODELS`) |
| Surface music file and volume (5%) | `src/main.js` and `src/surface/music.js` |

## Project Structure

```
NASA_Space_Apps_2026/
├── index.html              # All HTML: Solar System stage, Mars UI, surface UI, simulation, loading
├── vite.config.js          # Dev/preview proxy for NASA tiles, relative base path
├── package.json
├── standalone/             # Single-script build (config + index.html)
├── tests/                  # node:test unit tests and golden values
├── public/
│   ├── assets/             # height maps, moon textures, music/
│   └── styles/             # CSS (markers/ for the side panel)
└── src/
    ├── main.js             # Wiring and the frame loop
    ├── config.js           # Constants
    ├── app/                # device detection (HEAVY), input handlers
    ├── core/               # three.js bridge, renderer, viewport
    ├── data/               # tiles, mosaics, height decoding, ramps, Mars Sun model, models/
    ├── lib/                # math, formatting, view helpers, async helpers
    ├── solar/              # Solar System scene
    ├── mars/               # Globe: scene, textures, tiles, layers, controls, home, landing, detailed view
    ├── flat/               # Flat map
    ├── surface/            # First-person view: scene, panorama, HUD, controller, music
    ├── markers/            # Side panel: places, marks, vehicles, routes
    ├── sim/                # Simulations
    └── shaders/            # GLSL files and the index.js that assembles them
```

For how the parts fit together, read [architecture.md](architecture.md).

## Performance Modes

| Setting | Desktop | Touch devices |
|---------|---------|---------------|
| Highest global texture | 4096 × 2048 | 2048 × 1024 |
| Terrain self-shadowing on the globe | 6 steps | off |
| Detail tile windows cached | 5 | 2 |
| Surface panorama | 4096 × 2048 | 2048 × 1024 |
| Surface ray-march steps | 70 (live) / 120 (panorama) | 52 / 72 |

The renderer also lowers its pixel ratio automatically when the frame time stays above about 34 ms.

## Troubleshooting

**The planet is a plain rust-colored ball**
Color tiles failed to load. Open the developer tools, check the Network tab for requests to `/trek/...`, and make sure you are using `npm run dev` or `npm run preview` on `localhost` and can reach `trek.nasa.gov`. After editing `vite.config.js`, restart the server.

**The terrain is flat or the elevation layer looks wrong**
Check that `assets/mars-height.png` and `assets/mars-height-surface.png` are served and have not been resized or recompressed.

**"Loading…" stays in the center when switching Layout modes**
Overlay layers (roughness, dust, thermal inertia and others) are also NASA tiles. If they cannot load, the app falls back to the normal view after the requests fail. Persistent failures usually mean a proxy or network problem.

**Route search is slow, or the console shows 404 errors for `tiles/height/...`**
The route planner first tries an optional local height-tile pyramid (`tiles/height/`), which is not part of the repository. It then falls back to Mars Trek elevation colors and finally to the built-in 2048 × 1024 height map. The 404s are harmless, and the result's data note says which source was used.

**No sound in the surface view**
The browser may block autoplay (a warning appears in the console). The music is deliberately quiet (5% volume) and there is no on-screen volume or mute control yet.

**The page shows a message that WebGL could not start**
The browser or GPU driver does not provide WebGL. Try another browser, enable hardware acceleration, or update the driver. (This message and the page title are currently in Russian.)

**Port 5173 is already in use**
Run on another port: `npm run dev -- --port 3001`.

**Strange errors after `npm install`**
Reinstall from the lockfile:

```bash
rm -rf node_modules
npm ci
```

**It is slow on a laptop or phone**
Close other GPU-heavy tabs and, on desktops, make sure the browser uses the discrete GPU. The app reduces resolution by itself, and touch devices already use the lower quality mode.

## Next Steps

- [Architecture](architecture.md): modes, modules, level of detail, shaders, surface, detailed view, simulations and routes.