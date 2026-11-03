# Paul Allen’s interactive business card

A framework-free WebGL paper study inspired by the supplied Paul Allen card reference from *American Psycho*. Rotate and inspect recessed lettering, wet the paper, dry it, burn holes, or make a crease.

## Run locally

No build step or runtime dependencies. Serve this repository with any static web server:

```sh
python3 -m http.server 8000
```

Open `index.html` for the original UI or `examples/custom-ui.html` for a different layout and style. Use HTTP rather than opening files directly: ES modules and the bundled fonts must be served by the same origin (or an explicitly CORS-enabled host).

## Use your own UI

Copy `src/` into your site's public assets. Keep the JavaScript module and its two `.otf` files together. Your site owns every control and layout decision; the renderer provides only a transparent interactive viewport inside a Shadow DOM boundary. No iframe or framework required.

```html
<div id="card" style="height: 500px"></div>
<button id="water">Water</button>
<button id="fresh">Fresh card</button>
<p id="status" role="status"></p>
<script type="module">
  import { createMaterialCard } from './src/material-card.js';

  const container = document.querySelector('#card');
  container.addEventListener('cardstatus', ({ detail }) => {
    document.querySelector('#status').textContent = detail.message;
  });

  try {
    const card = await createMaterialCard(container);
    document.querySelector('#water').onclick = () => card.setTool('water');
    document.querySelector('#fresh').onclick = () => card.fresh();
    // On navigation / component teardown: card.destroy();
  } catch (error) {
    container.textContent = error.message;
  }
</script>
```

Give the container an explicit height. Style the surrounding page, buttons, and readouts normally. Optional CSS custom properties on the container: `--card-focus`, `--card-shadow`, `--card-brush`, and `--card-fallback`. Each instance maintains independent camera and material state.

### API

`await createMaterialCard(container)` returns:

| Method | Behavior |
| --- | --- |
| `setTool('rotate' \| 'water' \| 'burn' \| 'crease')` | Select pointer / keyboard interaction |
| `setBrushSize(0.04 … 0.20)` | Brush radius relative to sheet height |
| `setLight(-10 … 10)` | Move the light horizontally |
| `setRakingLight(boolean)` | Low light for inspecting the relief |
| `inspect(boolean = true)` | Toggle close-up; false restores the camera |
| `flip()` | Turn over |
| `dry()` | Accelerate drying, retaining stains and warp |
| `fresh()` | Clear all material damage and restore the view |
| `resetView()` | Restore camera and lighting, preserving damage |
| `apply(tool, u = .5, v = .5, amount = .4)` | Programmatically apply a material tool at sheet coordinates; `u,v` are 0–1, origin at bottom left; amount is >0 and ≤1 |
| `getState()` | Snapshot of tool, wet/char fractions, peak heat, simulation activity, light, inspection mode, rotation, and distance |
| `destroy()` | Stop rendering; remove listeners, observers, viewport, and GPU resources; safe to call twice |

Listen on your container for `cardstatus` (`detail.message`) and `cardstatechange` (`detail` is a state snapshot). Periodic state events occur while material evolves. The returned `canvas` and `element` identify the renderer's elements. Call `destroy()` before removing a mounted viewport; create a new instance to mount again. Treat a destroyed controller as inactive.

Pointer: drag to orbit, scroll/pinch to zoom, secondary drag to pan. Shift-drag pans in Rotate and temporarily rotates in material tools. Focus the viewport for arrow-key orbit, Shift-arrow pan, +/− zoom, and Space to apply the selected material tool at the center. The simulation pauses offscreen and in hidden tabs.

## Deploy / pull from GitHub

Commit or pin this repository as a dependency, or copy its `src/` directory into your site's assets. Serve those files through your own static host. Do not use GitHub's `blob` URLs as module URLs. Updating GitHub does not deploy a personal site automatically. No external hosting or GitHub Pages deployment is required for embedding.

## Scope and attribution

See [MATERIAL-LAB.md](MATERIAL-LAB.md) for the material model and its limitations. This is a visual experiment, not validated paper/fluid/fire physics. The card proportions and approximately 0.3 mm thickness are approximations, not verified movie prop measurements. The source card is approximately 1.59:1; the earlier 3.5 × 2 inch PNG export used standard US sizing instead.

Copperplate CC is an open-source revival, not a verified match to the prop's exact font. Bundled font licenses are in `licenses/`. The film reference does not imply endorsement. No license is asserted over third-party film imagery or branding.

## Browser checks

The regression test uses Node.js and Playwright with Chromium. Install Playwright separately, then run:

```sh
node tests/browser.cjs
```

Set `CHROMIUM_PATH` if Chromium is not at `/usr/bin/chromium`. The test serves the repository locally; checks the public API, material coupling, independent instances, cleanup/re-mount, and both example UIs.
