# Changelog

## 2026-03-11 — Visual customization, shadows, and reset

### Added
- **Reset FAB**: Recycle icon button (bottom bar) resets all params to defaults, clears localStorage
- **Appearance controls** (Visual tab > Appearance):
  - Chime, ring, clapper color pickers
  - String color picker and width slider
- **Lighting controls** (Visual tab > Lighting):
  - Key light color, intensity, direction (X/Y/Z)
- **Ground plane** (Visual tab > Ground):
  - Adjustable height (groundY param)
  - Shadow-receiving MeshStandardMaterial surface (replaced sky.js floor disc)
- **Shadow improvements**:
  - PCFSoftShadowMap for soft shadow edges
  - Ring and chime end caps now cast shadows
  - Shadow camera bounds configured for windchime area
- **Preset format v2**: 73 fields (v1 + 11 new appearance/lighting/ground fields); v1 URLs remain decodable
- `DEFAULT_PARAMS` export from params.js for reset functionality

### Changed
- Materials in rendering.js created per-rebuild and synced each frame (were module-level constants)
- scene.js returns key light and ground refs for per-frame updates in main.js
- Share FAB repositioned (left: 84px → 144px) to make room for reset FAB

## 2026-03-10 — Preset system

### Added
- **Binary preset codec** (preset-codec.js): bitstream packing, CRC-16, base64url encoding
- **Preset format v1** (preset-format.js): 62 fields with lin/int/log/bool/color/semitones/gradient encodings
- **localStorage persistence** (preset-storage.js): auto-save (800ms debounce), JSON snapshots
- **URL hash import**: one-time preset load from hash, cleared after apply
- **Share FAB + modal**: generates shareable URL, copy-to-clipboard
- **Toast notifications**: transient status messages
- Scale helpers (scales.js): log/exp scale math shared by GUI and codec
- GUI proxy refresh system for external param changes (preset load)

## 2026-03-09 — Initial release

### Added
- Three.js + Cannon-ES physics simulation of a wind chime
- Fractal wind system with Perlin-like noise
- Web Audio synthesis: per-chime frequencies with semitone tuning and detune for duplicates
- Tweakpane v4 GUI with 4 tabs (Physics, Geometry, Audio, Visual)
- Debounced geometry rebuild on structural param changes
- Sky dome with vertex-colored gradients (3-gradient interpolation)
- Camera parallax driven by wind
- Bokeh depth-of-field post-processing (optional)
- Audio gated on user gesture (unmute button)
- esbuild bundler with full and lite (CDN) build targets
- Express dev server with watch mode
