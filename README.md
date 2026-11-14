# Mars Explorer

An interactive 3D model of Mars that runs in the browser. Start from the Solar System, open a detailed globe (or a flat map), switch data layers, and **land on any spot** to look around from the surface under a real-time Sun and Martian sky.

Built with plain JavaScript, [three.js](https://threejs.org/) and [Vite](https://vitejs.dev/). No backend, no framework.

<!-- Add a screenshot or GIF here, for example: -->
<!-- ![Mars Explorer](docs/images/screenshot.png) -->

## Features

- **Solar System view:** animated Sun, eight planets, asteroid belt and twinkling stars.
- **Mars globe:** real terrain relief, the planet's day and night sides lit by the current Sun position, terrain shadows, atmosphere glow, and the moons Phobos and Deimos.
- **Flat map:** switch between the 3D globe and an equirectangular map with the same layers.
- **Data layers:** natural color, elevation (MOLA), modelled live surface temperature, roughness, global dust, plagioclase, sheet silicates / high-Si glass, and thermal inertia.
- **Grid and sectors:** a latitude/longitude grid with labels and the local solar time of the selected sector.
- **Places of interest:** fly to Olympus Mons, Valles Marineris, Hellas Basin, Gale Crater, Jezero Crater and more.
- **Home sector:** mark an area (about 60 km) and see its elevation and modelled temperature.
- **Explorer:** drag the mark onto the planet, preview the landing site, and press **Land here** for a first-person view with a compass, local solar time, sunrise and sunset, and a day-to-night sky.

## Quick Start

Requirements: **Node.js 18+** and a browser with **WebGL**. Internet access is needed for NASA map tiles.

```bash
git clone https://github.com/annamelnyk008/NASA_Space_Apps_2026.git
cd NASA_Space_Apps_2026
npm install
npm run dev
```

Open the address Vite prints (by default `http://localhost:5173`) and click **Discover** above Mars.

Other commands:

| Command | What it does |
|---------|--------------|
| `npm run build:standalone` | Production build into `dist/standalone` |

See [Getting Started](getting_started.md) for the full setup, troubleshooting and the files the app needs.

## Controls

| Action | Mouse / touch | Keyboard |
|--------|---------------|----------|
| Rotate the globe | Drag | |
| Zoom | Scroll, pinch, or the **+** / **−** buttons | `+` / `-` |
| Toggle grid | **Grid** button | `G` |
| Fly to a place | **Markers** panel or the place chips | |
| Land on the surface | Drag **Explorer** onto the planet, or click it and then click a spot, then **Land here** | |
| Look around (surface) | Drag, scroll or pinch to change the field of view | Arrow keys, `+` / `-` |
| Go back one level | Back button | `Esc` |

## Documentation

| Document | Contents |
|----------|----------|
| [Getting Started](docs/getting_started.md) | Install, run, verify, commands, required files, troubleshooting |
| [Architecture](docs/architecture.md) | Modes, modules, frame loop, level of detail, shaders, surface renderer, conventions |
| [Data Sources](docs/data-sources.md) | NASA and USGS data used, encodings, resolution, licenses |

## Project Layout

```
index.html          HTML for every screen (Solar System, Mars UI, surface UI, loading)
vite.config.js      Dev/preview proxy for NASA tiles
public/assets/      Height maps (mars-height.png, mars-height-surface.png)
public/styles/      CSS
src/
  main.js           Wiring and frame loop
  core/ app/ lib/   Renderer, input, helpers
  solar/            Solar System scene
  mars/ flat/       Globe and flat map
  surface/          First-person view
  markers/          Side panel with places
  data/             Tile sources, height decoding, Sun model
  shaders/          GLSL programs
```

Folder names are taken from the code's import paths. See [Architecture](architecture.md) for details.

## Data and Credits

Map data comes from NASA's Mars Global Surveyor (MOLA and TES) and Viking Orbiter missions, processed and distributed by the USGS Astrogeology Science Center and NASA Mars Trek. The Viking color mosaic was colorized by NASA Ames. The Sun position uses the Allison and McEwen (2000) Mars24 algorithm. Surface temperature is a simplified model, not measured data.

## Built With

- [three.js](https://threejs.org/) 0.128.0
- [Vite](https://vitejs.dev/) 5

