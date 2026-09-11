# Source Asset Viewer

> View Source Engine assets — **VMF maps**, **MDL models**, and **VTF textures** — directly in your browser. No installs, no servers, no uploads. Everything runs locally and persists in IndexedDB.

![Status](https://img.shields.io/badge/status-active-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Made with Three.js](https://img.shields.io/badge/three.js-0.160-orange)

---

## ✨ Features

### 🗺 VMF Map Viewer
- Parse `.vmf` / `.vmx` / `.map` files and render them in real time
- Full brush geometry with per-face UV mapping (uaxis/vaxis support)
- Automatic material category detection (concrete, metal, tile, glass, signs, lights, skybox)
- Load `.vtf` textures from disk or folder — applied to surfaces automatically
- **VTF texture support:** DXT1, DXT3, DXT5, DXT1_ONEBITALPHA, RGBA8888, ABGR8888, ARGB8888, BGRA8888, BGRX8888, RGB888, BGR888, RGB565, BGR565, BGRX5551, BGRA4444, BGRA5551, I8, IA88, A8, UV88, and fallbacks
- Toggle triggers, entities, glass transparency, and texture display
- Export the whole map as **GLB** (glTF binary) with embedded textures
- Built-in screenshot tool with **HD ×2** mode

### 📦 MDL Model Viewer
- Full **MDL / VVD / VTX / PHY** pipeline in pure JavaScript
- Auto-detects VTX layout version (v7, v44, v49, and alternatives)
- Correct index parsing for triangle strips and index lists
- Optional **skeleton pose** application via bone matrices
- Convex hull **collision meshes** rendered from `.phy`
- Auto-applies **VTF textures** to model materials
- Full orbit camera, wireframe, grid, lights toggle, FPS counter

### 🖼 VTF Texture Browser
- Drop a folder (e.g. `materials`) or select individual `.vtf` files
- Folder navigation with breadcrumbs and full-text search
- Thumbnails for every texture, generated on the fly
- Mipmap and frame selection
- **Export as PNG** at any mip level
- Works with cubemaps, animated textures, and multi-frame formats

### 💾 Local Storage (IndexedDB)
- **Everything you load is saved** to your browser's IndexedDB
- Reload the page — your maps, models, and textures are still there
- Storage manager: view used space, quota, delete individual files or all `.vtf`
- No uploads, no cloud, no account — **100% offline after first load**

### 📱 Cross-platform
- Works on **desktop, laptop, tablet, and mobile**
- Responsive layout with collapsible sidebars
- Touch gestures: **one finger to rotate, two fingers to zoom & pan**
- Safe-area insets for iOS notch devices

---

## 🚀 Live Demo

👉 **[Open Source Asset Viewer](https://YOUR-USERNAME.github.io/source-asset-viewer/)**

Just drag a `.vmf` file onto the page — or a whole `materials` folder — and start exploring.

---

## 🛠 Usage

### Viewing a Map
1. Open the **Maps** tab
2. Click **📂 Map** or drag a `.vmf` file onto the canvas
3. Optionally drag a folder with `.vtf` textures — they'll be applied automatically
4. Use the toolbar to take screenshots or export as **GLB**

### Viewing a Model
1. Open the **Models** tab
2. Click **📦 Load models** and pick a folder containing `.mdl`, `.vvd`, `.vtx` and optionally `.phy`
3. Click **🎨 Load materials** and pick a folder with matching `.vtf` files
4. Toggle skeleton pose, collision hulls, wireframe, or auto-rotation

### Browsing Textures
1. Open the **Textures** tab
2. Click **📁 Choose folder** or drag a folder of `.vtf` files
3. Browse subfolders, search by name, pick a mipmap and frame
4. Click **⬇ Download PNG** to save the current view

### Managing Storage
Click **Files N** in the top-right corner to open the storage manager:
- See every file, its size, and total quota used
- Delete individual files or clear all `.vtf` at once

---

## 🧩 Supported Formats

| Format | Extension | Status |
|---|---|---|
| VMF map | `.vmf`, `.vmx`, `.map` | ✅ Full geometry + entities + triggers |
| MDL model | `.mdl` | ✅ Version 44–49 |
| VVD vertices | `.vvd` | ✅ |
| VTX optimized mesh | `.vtx` | ✅ v7, v44, v49, fallback layouts |
| PHY collision | `.phy` | ✅ Convex hulls |
| VTF texture | `.vtf` | ✅ 20+ pixel formats, DXT 1/3/5, animated, cubemaps |
| GLB export | `.glb` | ✅ With embedded textures |

---

## 🧠 Technical Notes

- **Three.js** r160 for WebGL rendering
- **IndexedDB** for persistent local file storage
- **VTF decoder** written from scratch — no external dependencies
- **VMF BSP-less brush reconstruction** — plane intersection + convex face extraction
- **VTX parser** tries multiple layout variants automatically until it finds geometry
- **Skeleton skinning** by inverting `poseToBone` matrices for each bone
- **Screenshots** with configurable pixel ratio (up to ×2)
- **GLB export** via `THREE.GLTFExporter` with texture embedding

---

## 📋 Browser Support

| Browser | Desktop | Mobile |
|---|---|---|
| Chrome / Edge | ✅ | ✅ |
| Firefox | ✅ | ✅ |
| Safari | ✅ | ✅ |
| Opera | ✅ | ✅ |

Requires a browser with **WebGL 2** and **IndexedDB** support.

---

## 📝 License

MIT — free to use, modify, and distribute. Attribution appreciated but not required.

---

## 🙏 Credits

- Built with [Three.js](https://threejs.org/)
- VTF format documentation from the [Valve Developer Community](https://developer.valvesoftware.com/)
- Inspired by Hammer, VTFEdit, and Source SDK tools

---

## 🐛 Known Limitations

- `toolsskybox` materials render as a solid color instead of a skybox
- `P8` and `UV88` VTF formats are displayed approximately
- Large maps (>500k triangles) may take a few seconds to parse
- GLB export can be slow for complex maps (up to a minute)
- No `.bsp` support — only uncompiled `.vmf` maps

---

## 🤝 Contributing

Pull requests are welcome! If you find a bug or want a new feature, open an issue.

If you like this project, ⭐ **star the repo** — it helps a lot! 
