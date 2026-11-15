# Interplanetary Survival Guide: Martian Map

An interactive 3D model of Mars that runs in the browser. Start from the Solar System, open a detailed globe (or a flat map), switch NASA data layers, plan routes, and **land on any spot** to look around from the surface under a real-time Sun and Martian sky. Built for NASA Space Apps 2026.

The code is plain JavaScript (ES modules) on three.js r128 and Vite.

## Features

**Explore the planet**
- **Solar System view:** an animated Sun, eight planets and an asteroid belt, with a "Discover" label that leads to Mars.
- **3D globe with real relief,** lit by the actual current Sun position, with terrain shadows, atmosphere glow, and the moons Phobos and Deimos.
- **Flat map:** switch between the globe and an equirectangular map. All layers work in both.
- **Eight data layers:** natural color, elevation (MOLA), modelled live surface temperature, roughness, global dust, plagioclase, sheet silicates / high-Si glass and thermal inertia.
- **Grid, place labels and legend:** a 30° latitude/longitude grid with local solar time per sector, optional name labels on the planet, and color legends.

**Places, marks and routes** (the **Markers** panel)
- **Places of interest:** ten places plus the two moons, each with an information card, a highlight ring and a fly-to.
- **User marks:** drop your own pins with a name, a note and a category (Info, Home, Food, Water, Danger). Mark one as your **Home**.
- **Vehicles:** show NASA and ESA rovers on the planet.
- **Routes:** pick a start and an end, and an A* planner finds a gentle route over the terrain. You get length, difficulty, ascent and descent, slope statistics and an elevation profile.
- **Exploration history:** every landing and detailed visit is remembered.

**Go there**
- **Explorer:** drag the figure onto the planet and press **Land here** for a first-person view with a compass, local solar time, sunrise and sunset, a day-to-night sky and background music.
- **Detailed view:** a high-resolution 3D model of Gale Crater that you can fly around.
- **Simulations:** four illustrative scenarios from a standing viewpoint: day and night, Phobos and Deimos, marsquake and dust storm.

**Quality:** lower-quality settings on touch devices, and automatic resolution scaling when frames get slow.

## Quick Start

Requirements: **Node.js 18+** and a browser with **WebGL**. Internet access is needed for NASA map tiles.

```bash
git clone <your-repository-url>
cd NASA_Space_Apps_2026
npm install
npm run build:standalone
```

Open the index.html from standalone/dist

## Controls

| Action | Mouse / touch | Keyboard |
|--------|---------------|----------|
| Rotate the globe | Drag | |
| Zoom | Scroll, pinch, or the **+** / **−** buttons | `+` / `-` |
| Toggle grid | **Grid** button | `G` |
| Fly to a place | **Markers** → Places of interest, or the place chips | |
| Land on the surface | Drag **Explorer** onto the planet (or click it, then click a spot), then **Land here** | |
| Look around (surface) | Drag, scroll or pinch to change the field of view | Arrow keys, `+` / `-` |
| Detailed view | Pin a spot near Gale Crater, then **Detailed view**. Drag to orbit, Shift-drag or right-drag to pan | `+` / `-` |
| Go back one level | Back button | `Esc` |

## Documentation

| Document | Contents |
|----------|----------|
| [Getting Started](docs/getting_started.md) | Install, run, verify, commands, standalone build, saved data, troubleshooting |
| [Architecture](docs/architecture.md) | Modes, modules, frame loop, level of detail, shaders, surface, detailed view, simulations, routes, conventions |

## Project Layout

```
index.html            All HTML (Solar System, Mars UI, surface UI, simulation, loading)
vite.config.js        Dev/preview proxy for NASA tiles
standalone/           Single-script build configuration
public/assets/        Height maps, moon textures, surface music
public/styles/        CSS
src/
  main.js             Wiring and frame loop
  core/ app/ lib/     Renderer, input, helpers
  solar/              Solar System scene
  mars/ flat/         Globe, flat map, detailed view
  surface/            First-person view and music
  markers/            Markers panel: places, marks, vehicles, routes
  sim/                Simulations
  data/               Tile sources, height decoding, Sun model, Gale model
  shaders/            GLSL programs
tests/                Unit tests (node:test)
```

## Privacy

Everything runs in your browser. The app requests map tiles from NASA Mars Trek and the Fredoka font from Google Fonts. Your marks, home point, exploration history, rover selection and label setting are stored only in your browser's `localStorage`. Nothing is sent to a server of ours.

## Deployment Note

NASA Mars Trek tiles are blocked in the browser when requested directly from another website (no CORS headers, according to the code comments). The dev and preview servers work around this with a proxy on `/trek`. A deployed site needs its own proxy or its own copy of the tiles. See [Getting Started](docs/getting_started.md#network-and-deployment-notes).

## Data and Credits

Map data comes from NASA's Mars Global Surveyor (MOLA and TES) and Viking Orbiter missions, processed and distributed by the USGS Astrogeology Science Center and NASA Mars Trek. The Sun position uses the Allison and McEwen (2000) Mars24 algorithm. The surface temperature, the dust storm, the marsquake and the day-night scenarios are simplified, illustrative models, not measurements.

## Built With

- [three.js](https://threejs.org/) 0.128.0
- [Vite](https://vitejs.dev/) 5
