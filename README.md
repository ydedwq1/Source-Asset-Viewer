**🌐 Language: English · [Русский](README.ru.md)**

# Source Asset Viewer

A browser-based viewer for Source engine (and partly Source 2) game assets: maps, models, textures and music. It runs entirely on the client, with no server and no build step. Everything is opened and stored locally in your browser.

## Features

### 🗺 Maps
- Opens `.vmf` (Source 1) and `.vmap` (Source 2 / CS2, DMX binary 5–9) files. `.vmx`, `.map` and `.txt` are also accepted.
- Imports BSP maps through the built-in BSP → VMF converter; the source BSP and prepared map files are stored together in Settings → BSP.
- Builds geometry from brushes, with support for displacements and texture blending.
- VTF textures, transparent glass, triggers, skybox (including 3D skybox), entities and entity icons.
- Prop models inside the map and attachment points.
- Statistics: brushes, polygons, triangles, entities, materials, displacements, map size.
- Export to **GLB** (options: entities, triggers, max texture size up to 4096), screenshots (including HD ×2), wireframe mode.

### 📦 Models
- Parsers for `.mdl`, `.vvd`, `.vtx` and `.phy`.
- Skin families, bind pose, physics model.
- Thumbnail gallery, search and per-game filter.
- Export to **GLB**, **OBJ** and **SMD**.

### 🖼 Textures
- `.vtf` viewer with folder navigation, search and lazy-loaded thumbnails.

### 🎵 Music
- Player for `mp3`, `ogg` and `wav` (including MS-ADPCM and IMA-ADPCM) with playlist, shuffle and repeat.
- Download single tracks or a ZIP archive, with format conversion.

### 📚 Archives and storage
- Reads **VPK** (v1 and v2, including multi-part), **WAD3** and **PAK**.
- Archive-bomb protection: limits on tree size, file count and total size.
- Resource files are saved to **IndexedDB** (SHA-256 deduplication, compression). A storage dialog shows file count, size and quota, and lets you delete all `.vtf` files or everything.
- Imported BSP maps have a dedicated list in Settings. Deleting a map also removes its associated stored files, while shared game resources are kept.
- Per-game filter, detected from the VPK path or the folder structure.

### 🎬 Cutscenes
- The cutscene plugin connects to the loaded map and provides a playback button in the interface.
- Playback depends on the map’s entities and animation data; some scenes may require additional game assets.

### 🌐 Interface
- 13 languages: ru, en, uk, de, fr, es, it, pt, pl, tr, zh, ja, ko (`i18n.json`).
- The language is detected automatically and remembered.
- Responsive layout that works on mobile devices.

## Project structure

| File | Purpose |
|---|---|
| `index.html` | UI markup: tabs, panels, storage modal |
| `i18n.json` | Interface translations |
| `core.js` | Core: i18n, storage (IndexedDB), packing, game filter, drag & drop |
| `archives.js` | VPK / WAD3 / PAK parsers |
| `vmf.js` | VMF/VMAP loading and rendering, GLB export |
| `vmap.js` | Source 2 map parser (DMX binary) |
| `models.js` | MDL/VVD/VTX/PHY parsers, model viewer, GLB/OBJ/SMD export |
| `textures.js` | VTF textures tab |
| `music.js` | Audio player and audio export |

`index.html` and the modules also load `app.js`, `style.css`, `pack.js`, `vtf.js` and `export.js`, which must be placed alongside them.

## Running

No build is needed. The app uses ES modules, so opening `index.html` via `file://` will not work. Start any static server:

```bash
# Python
python3 -m http.server 8080

# or Node.js
npx serve .
```

Then open `http://localhost:8080`.

An internet connection is required: **three.js 0.160.0** is loaded from a CDN (unpkg) through an `importmap`. To work offline, download the library locally and update the paths in the `importmap` inside `index.html`.

## Usage

1. Drag a map file (`.vmf`, `.vmap`) or a resource folder into the "Maps" tab. Import BSP maps through the built-in converter, then manage the stored map under Settings → BSP. You can also load `.vpk`, `.wad`, `.pak` files and folders with `.vtf`, `.mdl` and `.png` icons.
2. For textures, models and sounds, drop the relevant archives or folders. They go into local storage and become available in all tabs.
3. Open the storage dialog (the "Files" pill at the top) to see what is loaded or to free up space.

3D controls: **left mouse button** to rotate, **right mouse button** to pan, **wheel** to zoom.

## Requirements

- A modern browser with ES modules, WebGL and IndexedDB support (Chrome, Edge, Firefox, Safari).
- Exporting audio to `ogg`/`mp4` requires the browser to support the corresponding codecs.

## Tech stack

JavaScript (ES modules), [three.js](https://threejs.org/) (OrbitControls, GLTFExporter, ConvexGeometry, RoomEnvironment), IndexedDB, Web Audio. No frameworks or bundlers.

## License

Specify the project license here.

> This project is not affiliated with Valve. Game assets belong to their respective owners. Only use files you have the rights to.
