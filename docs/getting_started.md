# Getting Started

**Mars Explorer** is a browser-based 3D model of Mars. It starts from a view of the Solar System, lets you open a detailed globe (or a flat map), switch data layers, and "land" on any point to see the surface from a first-person viewpoint with a real-time Sun and sky.

It is plain JavaScript (ES modules) on top of [three.js](https://threejs.org/) r128 and [Vite](https://vitejs.dev/). There is no backend and no framework.

This guide gets the project running locally in about five minutes.

## Table of Contents

1. [Requirements](#requirements)
2. [Installation](#installation)
3. [Running the App](#running-the-app)
4. [Verifying the Setup](#verifying-the-setup)
5. [Commands](#commands)
6. [Configuration](#configuration)
7. [Project Structure](#project-structure)
8. [Performance Modes](#performance-modes)
9. [Troubleshooting](#troubleshooting)
10. [Next Steps](#next-steps)

---

## Requirements

| Tool | Version | Check |
|------|---------|-------|
| Node.js | 18 or higher (`engines` in `package.json`) | `node -v` |
| npm | comes with Node.js | `npm -v` |
| Browser | recent Chrome, Firefox, Safari or Edge **with WebGL** | |

The app also needs **internet access** while running:

- map color tiles are loaded from NASA Mars Trek (`trek.nasa.gov`);
- the Fredoka font is loaded from Google Fonts (the page falls back to system fonts if it is blocked).

## Installation

```bash
git clone <your-repository-url> mars-explorer
cd mars-explorer
npm install
```

## Running the App

```bash
npm run dev
```

Vite prints a local address, by default:

```
http://localhost:5173
```

Open it in your browser. While running on `localhost`, the dev server proxies every request to `/trek/...` to NASA Mars Trek (see [Network and Deployment Notes](#network-and-deployment-notes)).

## Verifying the Setup

1. You should see the Solar System with an animated Sun, planets and an asteroid belt, and a **Discover** label with an arrow above Mars.
2. Click **Discover** or Mars itself, then the Mars globe opens.
3. Check that these work:
   - drag to rotate, scroll or pinch to zoom;
   - **Layout** → *Elevation (MOLA)* shows a color-coded height map and a legend;
   - **Grid** draws a latitude/longitude grid with labels;
   - **Globe / Map** switches between the 3D globe and a flat map;
   - **Markers** (top left) → *Places of interest* flies the camera to Olympus Mons, Gale Crater and others;
   - drag the **Explorer** button onto the planet, press **Land here**, and you should see a first-person view of the surface with a compass and local solar time.
4. Press **Esc** (or the back button) to return one level at a time.

If the planet looks like a plain rust-colored ball without surface detail, the color tiles are not loading. See [Troubleshooting](#troubleshooting).

## Commands

| Command | What it does |
|---------|--------------|
| `npm run dev` | Starts the Vite dev server with hot reload and the `/trek` proxy |
| `npm run build` | Builds the production version into `dist/` |
| `npm run build:standalone` | Builds with `standalone/vite.standalone.config.js` (a separate config; it must exist in your repo) |
| `npm run preview` | Serves the built `dist/` locally, also with the `/trek` proxy |
| `npm test` | Runs `node --test` (Node's built-in test runner) |

## Configuration

| What | Where |
|------|-------|
| Camera, distances, mesh sizes, detail-window size, height range | `src/config.js` |
| Tile server URLs, zoom limits, overlay layers | `src/data/tiles.js` |
| Dev proxy and build options | `vite.config.js` |
| Places of interest list | `src/markers/places.js` |

## Project Structure

```
NASA_Space_Apps_2026/
├── index.html            # All HTML: Solar System stage, Mars UI, surface UI, loading veil
├── vite.config.js        # Dev/preview proxy for NASA tiles, relative base path
├── package.json
├── package-log.json
├── public/
│   ├── assets/           # mars-height.png, mars-height-surface.png
│   └── styles/           # CSS files (variables, base, mars-ui, surface, markers/...)
└── src/
    ├── main.js           # Entry point: creates every module and runs the frame loop
    ├── config.js         # Constants
    ├── app/              # device detection (HEAVY), DOM input handlers
    ├── core/             # three.js bridge, renderer, viewport/resize
    ├── data/             # tile sources, mosaics, height decoding, color ramps, Mars Sun model
    ├── lib/              # math, formatting, view helpers, async helpers
    ├── solar/            # Solar System view: Sun, planets, asteroid belt, stars
    ├── mars/             # Mars globe: scene, textures, tiles, layers, controls, home, landing
    ├── flat/             # Flat (equirectangular) map view
    ├── surface/          # First-person surface view: scene, panorama, HUD, controller
    ├── markers/          # "Markers" side panel and Places of interest
    └── shaders/          # GLSL files plus the index.js that assembles them
```

Further, read [architecture.md](architecture.md).

## Performance Modes

| Setting | Desktop | Touch devices |
|---------|---------|---------------|
| Highest global texture | 4096 × 2048 | 2048 × 1024 |
| Terrain self-shadowing on globe | 6 steps | off |
| Detail tile windows cached | 5 | 2 |
| Surface panorama | 4096 × 2048 | 2048 × 1024 |
| Surface ray-march steps | 70 (live) / 120 (panorama) | 52 / 72 |

The renderer also lowers its pixel ratio automatically when the frame time stays above about 34 ms.

## Troubleshooting

**The planet is a plain rust-colored ball**
Color tiles failed to load. Open the browser developer tools, look at the Network tab, and check requests to `/trek/...`. Make sure you are using `npm run dev` or `npm run preview` on `localhost`, and that your network can reach `trek.nasa.gov`. After editing `vite.config.js`, restart the dev server.

**The terrain is flat or the elevation layer looks wrong**
Check that `assets/mars-height.png` and `assets/mars-height-surface.png` are served (open them directly in the browser) and have not been resized or recompressed.

**"Loading…" stays in the center when switching Layout modes**
Overlay layers (roughness, dust, thermal inertia and others) are also NASA tiles. If they cannot load, the app falls back to the normal view after the requests fail. Persistent failures usually mean a proxy or network problem.

**The page shows a message that WebGL could not start**
The browser or the GPU driver does not provide WebGL. Try another browser, enable hardware acceleration, or update the graphics driver. (This message and the page title are currently in Russian.)

**Port 5173 is already in use**
Run on another port: `npm run dev -- --port 3001`.

**Strange errors after `npm install`**
Delete `node_modules` and reinstall from the lockfile:

```bash
rm -rf node_modules
npm ci
```

**It is slow on a laptop or phone**
Close other GPU-heavy tabs, and on desktops make sure the browser uses the discrete GPU. The app reduces resolution by itself, but touch devices are already in the lower quality mode.

See also: [Architecture](architecture.md),[Data sources](data-sources.md)
