# Data Sources

This document lists every piece of data Mars Explorer uses: where it comes from, how it is stored and processed, its resolution and limits, and what you need to credit. It also explains how to replace or regenerate the data.

> **Status of this document.** The technical facts (URLs, encodings, resolutions) come from the project source. Descriptions and licenses of the NASA/USGS datasets come from their public catalog pages. Items marked **To confirm** are things the source code cannot tell us, such as how exactly the height PNGs were produced. Please fill those in. This is not legal advice.

## Table of Contents

1. [Overview](#overview)
2. [Remote Data: NASA Mars Trek Tiles](#remote-data-nasa-mars-trek-tiles)
3. [Local Data: Height Maps](#local-data-height-maps)
4. [Resolution in the App](#resolution-in-the-app)
5. [Computed Data and Models](#computed-data-and-models)
6. [Hand-Written Content](#hand-written-content)
7. [Third-Party Software and Fonts](#third-party-software-and-fonts)
---

## Overview

| Data | Origin | Where it lives | Used for |
|------|--------|----------------|----------|
| Color tiles | NASA Mars Trek, Viking MDIM 2.1 color mosaic | Remote, loaded at run time | Surface color on the globe, flat map and first-person view |
| Elevation color tiles | NASA Mars Trek, MOLA colorized shaded relief | Remote | Layout → Elevation view |
| Overlay tiles (5 layers) | NASA Mars Trek (MOLA roughness and TES products) | Remote | Layout → Roughness, Dust, Plagioclase, Glass/Clay, Thermal inertia |
| Height maps (2 PNGs) | Mars MOLA altimetry (see [To confirm](#local-data-height-maps)) | `assets/` in the repository | Relief, elevation readout, landing-site height, first-person terrain |
| Sun position, flux, temperature | Computed in code (Mars24 algorithm and a simple energy-balance model) | `src/data/marsSolar.js`, shaders, `home.js` | Lighting, day and night, local solar time, temperature layer |
| Solar System planets, stars, moons | Procedurally generated | `src/solar/`, `src/mars/scene.js` | Decorative scenery |
| Places, facts, labels | Hand-written | `src/markers/places.js`, `spaceFacts.js`, `index.html` | Interface text |

## Remote Data: NASA Mars Trek Tiles

Mars Trek is NASA's web portal for Mars map data. The project requests **pre-rendered map tiles** from its WMTS-style tile server:

```
https://trek.nasa.gov/tiles/Mars/EQ/<LayerName>/1.0.0/<Style>/<TileMatrixSet>/<z>/<row>/<col>.<ext>
```

The code uses `Style = default` and `TileMatrixSet = default028mm`. On `localhost` the same path is requested as `/trek/<LayerName>/...` and the Vite dev proxy forwards it to the server (see [getting_started.md](getting_started.md)).

### Tile scheme

- Equirectangular (simple cylindrical) projection covering −180° to +180° longitude and 90° to −90° latitude.
- At zoom `z` there are `2^(z+1)` columns and `2^z` rows; row 0 is the north, column 0 is at −180°.
- Tiles are 256 × 256 px for the color and overlay layers.

### Layers

| Layer name in the URL | File type | Max zoom used | Underlying data | App feature |
|-----------------------|-----------|---------------|-----------------|-------------|
| `Mars_Viking_MDIM21_ClrMosaic_global_232m` | JPG | 8 | Viking Orbiter mosaic (MDIM 2.1), colorized | Natural color (default) |
| `Mars_MGS_MOLA_ClrShade_merge_global_463m` | JPG | 7 | MOLA shaded relief colorized by elevation | Layout → Elevation (MOLA) |
| `mola_roughness` | PNG | 1 | MOLA-derived surface roughness | Layout → Roughness |
| `TES_Dust` | PNG | 1 | Thermal Emission Spectrometer dust cover | Layout → Global dust |
| `TES_Plagioclase` | PNG | 1 | TES mineral abundance: plagioclase | Layout → Plagioclase abundance |
| `TES_Glass_Clay` | PNG | 1 | TES mineral abundance: sheet silicates / high-Si glass | Layout → Sheet silicates / high-Si glass |
| `TES_Thermal_Inertia` | PNG | 1 | TES thermal inertia | Layout → Thermal inertia |

### About the underlying datasets

- **Viking MDIM 2.1 color mosaic.** The USGS Astrogeology Science Center publishes it as a 232 m/pixel (256 pixels per degree) global mosaic. NASA Ames warped the original Viking color mosaic and blended it over the black-and-white MDIM 2.1 mosaic. The catalog describes it as an artistically colorized version, and its positional accuracy is about one pixel (about 200 m). The color is therefore **not true color**.
- **MOLA colorized shaded relief.** Derived from the Mars Orbiter Laser Altimeter (MOLA) on Mars Global Surveyor, at 128 pixels per degree (about 463 m/pixel). Elevation is mapped to a color ramp over a shaded relief. The elevation range runs from about −8.2 km to +21.2 km, which matches the legend in the app. The USGS notes the color scheme only represents elevation and does not imply anything about water or ice.
- **TES layers.** Maps derived from MGS's Thermal Emission Spectrometer. The dust layer corresponds to the *dust cover index* (Ruff and Christensen, 2002); the plagioclase and sheet-silicate/high-Si-glass layers correspond to mineral-abundance maps (Bandfield and co-authors); the thermal-inertia layer measures how quickly the ground heats and cools, which relates to grain size and rock content.
- **MOLA roughness.** A MOLA-derived measure of surface roughness.

### What the app does with them

- Tiles are fetched as images with CORS enabled and stitched into canvases (`src/data/mosaic.js`), then uploaded as WebGL textures.
- Missing or failed tiles do not stop the app: a placeholder color (`rgb(158,92,62)`) is used instead, so a network problem shows up as a plain, uniform planet.
- Up to 160 tile images are cached in memory (`loadTileImg`).
- The overlay layers only have two tile levels (zoom 0 and 1), so the app builds one global mosaic at zoom 1 (1024 × 512 px).

## Local Data: Height Maps

Two PNG files in `assets/` carry the terrain:

| File | Size | File size | Role |
|------|------|-----------|------|
| `mars-height.png` | 2048 × 1024 | about 3.3 MB | Globe and flat-map relief, elevation lookups (`pick.siteHeightKm`), home-sector elevation |
| `mars-height-surface.png` | 1024 × 512 | about 0.8 MB | Relief for the first-person view |

### Encoding

The images are ordinary 8-bit RGB PNGs that store a **16-bit elevation** in two channels:

| Channel | Content |
|---------|---------|
| R | High byte |
| G | Low byte |
| B | Unused (0) |

```
value  = R × 256 + G                        (0 … 65535)
km     = value / 65535 × 31 − 9             (−9 … +22 km)
```

The resolution of one step is about 0.47 m, so quantization is not an issue. The images look like colored noise in an image viewer, because the low byte changes rapidly. That is normal. Do not resize, apply lossy compression or color-manage them, or the heights will be corrupted.

The images use an equirectangular layout: left edge at −180° longitude, top edge at +90° latitude, and heights are in kilometres relative to the Mars datum (the areoid used by MOLA).

## Resolution in the App

The tile pyramid is `2^(z+1) × 256` pixels wide at zoom `z`. At the equator (Mars circumference about 21,297 km) that gives:

| Zoom | Width (px) | Km per pixel at the equator |
|------|-----------|-----------------------------|
| 0 | 512 | 41.6 |
| 1 | 1,024 | 20.8 |
| 2 | 2,048 | 10.4 |
| 3 | 4,096 | 5.2 |
| 4 | 8,192 | 2.6 |
| 5 | 16,384 | 1.3 |
| 6 | 32,768 | 0.65 |
| 7 | 65,536 | 0.33 |
| 8 | 131,072 | 0.16 |

The color mosaic's native pixel size is about 232 m, so zoom 8 (about 160 m per pixel) is finer than the original data, and zoom 7 (about 325 m) is close to it. The deepest levels therefore add smoothness more than real detail.

What the app actually uses:

| Item | Resolution | About (km per pixel at the equator) |
|------|-----------|-------------------------------------|
| Global color texture, full quality (desktop) | 4096 × 2048 | 5.2 |
| Global color texture, touch devices | 2048 × 1024 | 10.4 |
| Detail window (color only) | 1024 × 1024 px at zoom 4 to 7, centered on the view | 2.6 down to 0.33 |
| Globe relief | 2048 × 1024 height PNG | 10.4 |
| First-person relief | 1024 × 512 height PNG | 20.8 |
| Mesh | 160 × 80 to 480 × 240 segments | n/a |


## Computed Data and Models

These values are calculated at run time. No data files are involved.

| Quantity | Method | File |
|----------|--------|------|
| Sub-solar longitude and latitude, solar longitude (Ls), equation of time, Mars Coordinated Time | Allison and McEwen Mars24 algorithm, using the current UTC time | `src/data/marsSolar.js` |
| Sun direction at a surface point (east, north, up) and star orientation | Spherical geometry from the above | `sunFor()` in `marsSolar.js` |
| Solar flux at Mars | 1361 W/m² divided by the square of the Mars–Sun distance, using an orbital eccentricity of 0.0934 and perihelion at Ls 251° | `src/mars/update.js` |
| Local true solar time | `12 + (longitude − sub-solar longitude) / 15` hours | `controls.js`, `hud.js` |
| Sunrise and sunset times | Standard hour-angle formula using the Sun's declination | `src/surface/hud.js` |
| Surface temperature (layer and home sector) | A simple energy-balance model: absorbed sunlight, night-time cooling and a thermal lag of 18° of longitude, clamped to 148–318 K | `mars.frag` (GPU) and `src/mars/home.js` (CPU) |
| Sky, Sun disc, dust haze | Procedural shader (no measurements) | `surface-body.glsl` |

> The modelled temperature is an **illustration**, not measured data. The interface already labels it "modelled, live". The CPU and GPU versions use slightly different albedo handling, so values will not match exactly.

## Hand-Written Content

| Content | Location | Notes |
|---------|----------|-------|
| Ten places of interest with coordinates and camera distances | `src/markers/places.js` | Coordinates were entered by hand. The official names and positions of Martian features are maintained in the IAU Gazetteer of Planetary Nomenclature (USGS), which is the right reference for verifying them. **To confirm:** your coordinate source. |
| Quick-navigation chips (Olympus Mons, Valles Marineris, Hellas Basin, North pole) | `index.html` | Duplicates part of `places.js` and must be kept in sync by hand. |
| Planet facts (diameter, day length, gravity, moons) | `index.html` | Typed by hand. The "Day: 24 h 37 min" value is Mars's **sidereal** rotation period, while the app's solar-time calculations use the **solar** day (24 h 39 min 35 s). Consider labeling it clearly or using the solar value. |
| "Did you know?" facts | `src/data/spaceFacts.js` | 28 hand-written statements. Review them for accuracy and add sources if you publish. One fact mixes the 24 h 37 min and 39-minute figures in a confusing way. |

## Third-Party Software and Fonts

| Component | Version | License (to verify when publishing) | Use |
|-----------|---------|-------------------------------------|-----|
| three.js | 0.128.0 (pinned) | MIT | 3D engine |
| Vite | 5.4.x | MIT | Build and dev server |
| Fredoka font (Google Fonts) | loaded from `fonts.googleapis.com` | Open-source font; see the Google Fonts page for the exact terms | Interface typeface |

The font is loaded from Google's servers at run time. The page falls back to system fonts if it cannot load.

See also: [Getting Started](getting_started.md),[Architecture](architecture.md)




