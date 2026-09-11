<div align="center">

# 🎮 Source Asset Viewer

**View, explore and export Source Engine assets right in your browser.**

Maps · Models · Textures · GLB Export · Local Storage

[![Live Demo](https://img.shields.io/badge/🚀_Live_Demo-ydedwq1.github.io-58a6ff?style=for-the-badge)](https://ydedwq1.github.io/Source-Asset-Viewer/)
[![License](https://img.shields.io/badge/License-MIT-3fb950?style=for-the-badge)](LICENSE)
[![Three.js](https://img.shields.io/badge/Three.js-r160-f0883e?style=for-the-badge)](https://threejs.org/)
[![Status](https://img.shields.io/badge/Status-Active-brightgreen?style=for-the-badge)](#)

No installs. No servers. No uploads.  
Just drop a file and it works — everything runs locally in your browser.

</div>

---

## 📖 Table of Contents

- [What is this?](#-what-is-this)
- [Live Demo](#-live-demo)
- [Features](#-features)
  - [🗺 VMF Map Viewer](#-vmf-map-viewer)
  - [📦 MDL Model Viewer](#-mdl-model-viewer)
  - [🖼 VTF Texture Browser](#-vtf-texture-browser)
  - [💾 Local Storage](#-local-storage-indexeddb)
  - [📱 Cross-platform](#-cross-platform)
- [Screenshots](#-screenshots)
- [How to Use](#-how-to-use)
- [Supported Formats](#-supported-formats)
- [Technical Details](#-technical-details)
- [Project Structure](#-project-structure)
- [Running Locally](#-running-locally)
- [Deploy to GitHub Pages](#-deploy-to-github-pages)
- [Browser Support](#-browser-support)
- [Performance Tips](#-performance-tips)
- [FAQ](#-faq)
- [Known Limitations](#-known-limitations)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [License](#-license)
- [Credits](#-credits)

---

## 🌟 What is this?

**Source Asset Viewer** is a fully client-side web application for viewing and inspecting assets from games built on the **Source Engine** — Half-Life 2, Counter-Strike: Source, CS:GO, Portal, Team Fortress 2, Garry's Mod, and many others.

It reads raw, **uncompiled** files:

- **`.vmf`** — Valve Map Format (the source files Hammer editor saves)
- **`.mdl` / `.vvd` / `.vtx` / `.phy`** — the four-file model format
- **`.vtf`** — Valve Texture Format (materials)

Everything is parsed and rendered directly in the browser using **WebGL** and **Three.js** — no server, no backend, no `.exe` to download. And because it uses **IndexedDB**, everything you load stays available even after you close the tab.

> 💡 **Perfect for:** modders, level designers, 3D artists, reverse engineers, or anyone curious to peek inside Source engine assets without installing Hammer or VTFEdit.

---

## 🚀 Live Demo

### 👉 **[https://ydedwq1.github.io/Source-Asset-Viewer/](https://ydedwq1.github.io/Source-Asset-Viewer/)**

Open the link, drag a `.vmf` file (or a whole `materials` folder) onto the page and start exploring.

You can also try loading:
- A Counter-Strike or Half-Life 2 `.vmf` from `sourcesdk_content/`
- Any `.mdl` + `.vvd` + `.vtx` set from a game's `models/` folder
- A full `materials/` folder from any Source game

---

## ✨ Features

### 🗺 VMF Map Viewer

Render uncompiled Source maps in real time with full brush geometry.

| Feature | Description |
|---|---|
| **Brush parsing** | Every `solid` block is read and reconstructed from its plane list |
| **BSP-less geometry** | No need to compile to `.bsp` — works directly on `.vmf` |
| **Per-face UV mapping** | Respects `uaxis`, `vaxis`, `scale`, and `shift` from the VMF |
| **Material categorization** | Auto-detects concrete / metal / tile / glass / signage / light / skybox |
| **Trigger visualization** | `toolstrigger` brushes shown as orange wireframe boxes |
| **Entity markers** | Lights, props, NPCs shown as colored points with position from `origin` |
| **Texture loading** | Drop a `materials/` folder and textures apply automatically by basename |
| **Fallback colors** | If a texture is missing, a sensible color is used per material category |
| **Transparent glass** | Glass materials rendered with alpha at 30% opacity |
| **GLB export** | Save the whole map as a `.glb` file with embedded textures |
| **HD screenshots** | Capture the viewport at 1× or 2× pixel ratio |
| **Orbit controls** | Left mouse to rotate, right to pan, wheel to zoom |
| **Fit to view** | Auto-frame camera on the map bounding box |

**VTF pixel formats supported in maps:**

`RGBA8888`, `ABGR8888`, `RGB888`, `BGR888`, `RGB565`, `BGR565`, `BGRX5551`, `BGRA4444`, `BGRA5551`, `I8`, `IA88`, `A8`, `P8`, `ARGB8888`, `BGRA8888`, `BGRX8888`, `DXT1`, `DXT3`, `DXT5`, `DXT1_ONEBITALPHA`, plus fallbacks for exotic formats.

---

### 📦 MDL Model Viewer

A full Source model pipeline — all four files parsed from scratch.

| Feature | Description |
|---|---|
| **MDL parser** | Reads body parts, models, meshes, bones, skins, and textures |
| **VVD reader** | Vertex positions, normals, and UVs from the `.vvd` file |
| **VTX parser** | Handles optimized mesh with **auto-detection** of layout version |
| **Multiple layouts** | Tries v7, v44, v49, and fallback struct sizes automatically |
| **Strip + list support** | Correctly handles triangle strips and triangle lists |
| **Skinned meshes** | Applies per-bone `poseToBone` matrices when skeleton mode is on |
| **PHY collision** | Reads convex hulls from `.phy` and renders them as yellow wireframes |
| **Auto texturing** | Matches material names against your loaded `.vtf` files |
| **Fallback colors** | Distinct color per material index when textures are missing |
| **Orbit + auto-rotate** | Full camera control plus optional spin animation |
| **Wireframe mode** | Toggle wireframe on all meshes at once |
| **FPS counter** | Live frames-per-second indicator |
| **Model switcher** | Dropdown to jump between loaded models instantly |

**Supported MDL versions:** 44 through 49 (Half-Life 2, CS:S, CS:GO, Portal, TF2, L4D, L4D2, and most Source games).

---

### 🖼 VTF Texture Browser

Browse, inspect, and export Valve Texture Format files.

| Feature | Description |
|---|---|
| **Folder navigation** | Breadcrumb UI with clickable subfolder hierarchy |
| **Full-text search** | Search across every loaded texture by name or path |
| **Auto thumbnails** | Every `.vtf` gets a generated preview thumbnail |
| **Mipmap selector** | Choose any mip level from the dropdown |
| **Frame selector** | Browse through animated or multi-frame textures |
| **Metadata chips** | Size, format, mipmap count, frame count, version, flags |
| **Warning for exotic formats** | Alerts when the format is approximated |
| **PNG export** | Save any mip/frame combination as a PNG file |
| **Checker background** | Transparency-friendly preview background |

**Supported VTF formats:**

```
RGBA8888   ABGR8888   RGB888    BGR888
RGB565     I8         IA88      P8
A8         ARGB8888   BGRA8888  BGRX8888
BGR565     BGRX5551   BGRA4444  DXT1
DXT3       DXT5       DXT1_1A   BGRA5551
UV88       UVWQ8888   RGBA16F   RGBA16
UVLX8888
```

---

### 💾 Local Storage (IndexedDB)

Your files stay on your device — and stay **loaded** between sessions.

- ✅ **Automatic persistence** — files saved to IndexedDB after every load
- ✅ **Instant startup** — nothing to re-upload next time you open the page
- ✅ **Storage manager UI** — click **Files N** in the top bar
- ✅ **Size & quota display** — see how much space is used and remaining
- ✅ **Delete individual files** — remove specific `.vtf` from storage
- ✅ **Bulk clear** — one click to wipe all textures or everything
- ✅ **No tracking, no cloud** — the browser never talks to a server

Storage limits follow your browser's quota (usually 60% of free disk space on Chrome, ~1 GB on Firefox, ~1 GB on Safari).

---

### 📱 Cross-platform

The UI adapts to any screen size.

- **Desktop** — 3-column layout, full toolbars
- **Laptop** — same, with slightly tighter spacing
- **Tablet** — collapsing sidebar, larger touch targets
- **Mobile** — vertical layout, collapsible panels, touch gestures
- **iOS safe areas** — respects the notch and home indicator

**Touch gestures:**
- 👆 **One finger** — rotate the camera
- ✌️ **Two fingers** — pinch to zoom, drag to pan
- 🖱 **Desktop** — LMB rotate, RMB pan, wheel zoom

---

## 📸 Screenshots

> Replace these with actual screenshots of your app. Example:

### VMF Map Viewer
![Map Viewer](screenshots/map-viewer.png)

### MDL Model Viewer
![Model Viewer](screenshots/model-viewer.png)

### VTF Texture Browser
![Texture Browser](screenshots/texture-browser.png)

### Storage Manager
![Storage](screenshots/storage.png)

---

## 🛠 How to Use

### 🗺 Viewing a Map

1. Open the **Maps** tab
2. Click **📂 Map** or drag a `.vmf` file onto the canvas
3. Wait for the parser to finish (progress bar in the top)
4. Optionally drag a `materials/` folder → textures auto-apply
5. Use the toolbar:
   - **🎨 Textures** — load a new materials folder
   - **💾 GLB** — export map as glTF binary
   - **📷** — take a screenshot (`P` or `Space` shortcut)
   - **🎯** — fit camera to view
   - **▦** — toggle wireframe
   - **📊** — open statistics panel

### 📦 Viewing a Model

1. Open the **Models** tab
2. Click **📦 Load models** → pick a folder with `.mdl`, `.vvd`, `.vtx` (and `.phy`)
3. Click **🎨 Load materials** → pick a folder with `.vtf` files
4. Select a model from the dropdown
5. Toggle options:
   - **Textures VTF** — apply/disable textures
   - **Skeleton pose** — apply bind pose from bones
   - **Show .phy** — render collision hulls
   - **Auto-frame** — auto-center camera on load
6. Use the floating toolbar for grid, wireframe, lights, spin, and fit

### 🖼 Browsing Textures

1. Open the **Textures** tab
2. Click **📁 Choose folder** or drag a folder of `.vtf` files
3. Browse subfolders via the breadcrumb
4. Search by filename or path in the search box
5. Click any texture to preview
6. Pick a mipmap and frame from the dropdowns
7. Click **⬇ Download PNG**

### 💾 Managing Storage

Click **Files N** in the top-right corner:

- View total files and used space
- See browser quota via `navigator.storage.estimate()`
- Delete single files with the **×** button
- Click **🗑 Delete all .vtf** to remove only textures
- Click **🗑 Delete everything** to wipe all storage

---

## 🧩 Supported Formats

| Format | Extensions | Support Level |
|---|---|---|
| **Valve Map Format** | `.vmf`, `.vmx`, `.map` | 🟢 Full — geometry, entities, triggers, UVs |
| **Model** | `.mdl` | 🟢 Full — v44–v49 |
| **Vertices** | `.vvd` | 🟢 Full |
| **Optimized Mesh** | `.vtx` | 🟢 Full — v7, v44, v49 + fallbacks |
| **Collision** | `.phy` | 🟢 Convex hulls |
| **Texture** | `.vtf` | 🟢 25+ pixel formats |
| **GLB Export** | `.glb` | 🟢 With embedded textures |
| **PNG Export** | `.png` | 🟢 From any texture mip/frame |
| **Compiled maps** | `.bsp` | 🔴 Not supported (by design) |

---

## 🧠 Technical Details

### The VMF pipeline

1. **Tokenize** — the file is split into tokens (words, strings, braces)
2. **Parse tree** — a recursive descent parser builds nested blocks
3. **Extract solids** — each `solid` block becomes a list of planes
4. **Intersect planes** — 3-plane combinations produce candidate vertices
5. **Filter by EPS** — vertices are kept only if inside all other planes
6. **Sort by angle** — each face's points are sorted around its centroid
7. **Triangulate** — fan triangulation into a `BufferGeometry`
8. **Group by material** — geometry is batched per material to reduce draw calls
9. **Apply UVs** — uaxis/vaxis projections per face

### The VTX parser

The `.vtx` file structure changed between MDL versions. Instead of assuming one layout, the parser:

1. Reads the `mdlVersion` from the `.mdl` file
2. Uses **precise struct sizes** for that version (v44 vs v49 differ in header sizes)
3. Tries **strip mode first**, then **deep scan** if that fails
4. Falls back to alternative struct-size combinations if still empty
5. Chooses the layout that produces the **most triangles**

This makes it work reliably across HL2, CS:S, CS:GO, Portal, TF2, L4D, and other Source games.

### The VTF decoder

Written from scratch — no external libraries. Handles:

- Block-compressed formats (DXT1/3/5) with proper alpha palettes
- Raw pixel formats with correct channel swizzling
- Low-res thumbnail skipping
- Mipmap offset calculation accounting for `frames × depth`
- Vertical flip (VTF stores bottom-up)

### The skinning math

For each bone in the MDL:

1. Read the `poseToBone` matrix (3×4 row-major)
2. Invert it as a rigid transform (transpose rotation, negate translation)
3. For each vertex, blend up to 3 bone matrices by uniform weight
4. Transform position; normals use rotation-only part

This gives a proper bind-pose render.

---

## 📂 Project Structure

```
Source-Asset-Viewer/
├── index.html          ← the entire application (self-contained)
├── README.md           ← this file
├── LICENSE             ← MIT license
├── screenshots/
│   ├── map-viewer.png
│   ├── model-viewer.png
│   ├── texture-browser.png
│   └── storage.png
└── .gitignore
```

Everything is inside a single `index.html` — HTML, CSS, and JavaScript. No build step, no bundler, no `npm install`. Just open the file and it works.

---

## 💻 Running Locally

### Option 1: Just open the file

Download `index.html` and double-click it. It works immediately.

### Option 2: Serve via HTTP (recommended for folder drag-drop)

Some browsers restrict folder drag-drop on `file://` URLs. Use a simple server:

```bash
# Python 3
python -m http.server 8000

# Node.js
npx serve

# PHP
php -S localhost:8000
```

Then open `http://localhost:8000` in your browser.

---

## 🚀 Deploy to GitHub Pages

1. Create a repository, e.g. `Source-Asset-Viewer`
2. Name the file **`index.html`** (required for Pages)
3. Push:

```bash
git init
git add index.html README.md LICENSE
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/Source-Asset-Viewer.git
git push -u origin main
```

4. Go to **Settings → Pages**
5. Set **Source** to **Deploy from a branch**
6. Choose **main** branch and **/ (root)** folder
7. Save — after ~1 minute your site is live at:

```
https://YOUR-USERNAME.github.io/Source-Asset-Viewer/
```

Every `git push` to `main` automatically redeploys.

---

## 📋 Browser Support

| Browser | Desktop | Mobile | Notes |
|---|---|---|---|
| **Chrome** | ✅ | ✅ | Best performance |
| **Edge** | ✅ | ✅ | Chromium-based |
| **Firefox** | ✅ | ✅ | Slightly slower VTF decode |
| **Safari** | ✅ | ✅ | iOS 15+ recommended |
| **Opera** | ✅ | ✅ | Chromium-based |
| **Brave** | ✅ | ✅ | Chromium-based |

**Requirements:**
- WebGL 2
- IndexedDB
- ES2020 (modules, optional chaining, etc.)

---

## ⚡ Performance Tips

- **Large maps (>500k triangles)** may take 3–10 seconds to parse
- **GLB export** on big maps can take up to a minute — be patient
- **Loading textures**: point the browser at a folder, not a zip
- **Skip textures** for a fast first look at geometry — you can add them later
- **HD screenshots (×2)** take ~3× longer to render
- **Memory**: maps with 200+ MB textures may hit browser limits

---

## ❓ FAQ

**Q: Does it upload my files anywhere?**
No. Everything runs 100% locally in your browser. There is no server, no analytics, no tracking.

**Q: Does it work offline?**
Yes! After the page loads once, all processing happens client-side. You can even use airplane mode.

**Q: Where are my files stored?**
In your browser's **IndexedDB**. Each origin gets its own storage. Deleting browser data or clearing site data removes them.

**Q: Can it open `.bsp` files?**
No — the app works on **uncompiled** `.vmf` maps. Use a decompiler like `VMEX` or `BSPSource` first.

**Q: Why don't textures show on my map?**
VMF files reference textures by name (e.g. `concrete/concretewall001`). You need to load a `materials/` folder that contains the matching `.vtf` files. The app matches by basename, so as long as `concretewall001.vtf` exists anywhere in the folder, it works.

**Q: Can it export the map as `.obj` or `.fbx`?**
Not directly, but **GLB** works in Blender, Maya, 3ds Max, Unity, Unreal, Godot, and most 3D tools. Just import the `.glb`.

**Q: Does it support CS:GO / CS2 models?**
CS:GO models (v49) work. CS2 models use a new format (`.vmdl` + `.vmat`) which is **not** supported — it's a different engine branch.

**Q: What about VMT materials?**
Only the `.vtf` textures are read. VMT parameters like `$basetexture` are not parsed, because the VMF already stores the texture path directly. However, the VMF path is usually the same as `$basetexture`.

**Q: My model has strange geometry — why?**
Some MDL versions have unusual VTX layouts. The parser tries several; if geometry still fails, please [open an issue](https://github.com/ydedwq1/Source-Asset-Viewer/issues) with the file name and game.

**Q: Can I contribute a new format?**
Yes! PRs welcome — especially for CS2 `.vmdl` support, `.vmat` parsing, or better skybox rendering.

---

## 🐛 Known Limitations

- 🔸 `toolsskybox` materials render as a solid color instead of a real skybox
- 🔸 `P8` and `UV88` VTF formats are shown approximately
- 🔸 VMT shaders, `$envmap`, and `$normalmap` are not applied
- 🔸 CS2 `.vmdl` / `.vmat` files are not supported
- 🔸 Very large maps (>500k triangles) may take several seconds
- 🔸 GLB export can be slow on complex maps
- 🔸 No animation playback — only bind pose
- 🔸 No lightmaps or baked lighting

---

## 🗺 Roadmap

- [ ] **Skybox rendering** — real 6-face skybox from `toolsskybox`
- [ ] **VMT parser** — read `$basetexture`, `$normalmap`, `$envmap`, `$translucent`
- [ ] **Animation playback** — read `.ani` and `.vcd` files
- [ ] **Lightmap support** — from `.bsp` if present
- [ ] **BSP support** — direct `.bsp` loading
- [ ] **CS2 support** — `.vmdl` / `.vmat`
- [ ] **OBJ / STL export** — additional formats
- [ ] **Batch PNG export** — save all textures at once
- [ ] **Model comparison** — side-by-side view
- [ ] **Measurement tool** — distances and areas
- [ ] **Physics simulation** — drop the map into a rigid body world

---

## 🤝 Contributing

Contributions are always welcome — bugs, features, translations, docs, whatever you've got.

### Steps

1. **Fork** the repository
2. **Create a branch** for your change: `git checkout -b feature/my-thing`
3. **Make your changes** — keep the code clean, comment where needed
4. **Test** in Chrome, Firefox, and Safari if possible
5. **Commit** — `git commit -m "Add: skybox rendering"`
6. **Push** — `git push origin feature/my-thing`
7. **Open a Pull Request** — describe what you changed and why

### What we're looking for

- 🎨 Better material fallback colors
- 🌍 Translations (RU, DE, FR, ES, PL, PT, CN, JP)
- 🧪 Test VMF/MDL/VTF files from different games
- ⚡ Performance improvements
- 🐛 Bug fixes for edge cases

### Code style

- Pure ES2020, no build tools
- No external dependencies beyond Three.js
- Prefer readability over cleverness
- Keep everything in `index.html` for now (single-file philosophy)

---

## 📝 License

**MIT License** — see [LICENSE](LICENSE) for details.

You're free to:
- ✅ Use commercially
- ✅ Modify
- ✅ Distribute
- ✅ Sublicense
- ✅ Use privately

Just include the original copyright and license notice.

---

## 🙏 Credits

- Built with [Three.js](https://threejs.org/) by [Mr.doob](https://github.com/mrdoob) and contributors
- VTF format documentation from the [Valve Developer Community](https://developer.valvesoftware.com/wiki/VTF_file_format)
- MDL format documentation from the [Valve Developer Community](https://developer.valvesoftware.com/wiki/MDL_(Source))
- Inspired by [Hammer Editor](https://developer.valvesoftware.com/wiki/Hammer_Editor), [VTFEdit](https://developer.valvesoftware.com/wiki/VTFEdit), [Crowbar](https://steamcommunity.com/groups/CrowbarTool), and [Source SDK](https://developer.valvesoftware.com/wiki/SDK)

Special thanks to the Source modding community for keeping these formats documented and alive.

---

## ⭐ Star History

If this project helped you, please consider giving it a star — it really helps.

[![Star History Chart](https://api.star-history.com/svg?repos=ydedwq1/Source-Asset-Viewer&type=Date)](https://star-history.com/#ydedwq1/Source-Asset-Viewer&Date)

---

<div align="center">

**🔗 Live:** [ydedwq1.github.io/Source-Asset-Viewer](https://ydedwq1.github.io/Source-Asset-Viewer/)  
**📦 Repo:** [github.com/ydedwq1/Source-Asset-Viewer](https://github.com/ydedwq1/Source-Asset-Viewer)  
**🐛 Issues:** [Report a bug](https://github.com/ydedwq1/Source-Asset-Viewer/issues)

Made with ❤️ for the Source Engine modding community.

</div>
