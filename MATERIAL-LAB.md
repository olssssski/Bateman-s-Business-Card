# Interactive paper study

Serve this repository with `python3 -m http.server 8000` and open `index.html` in a WebGL-capable browser. The renderer and fonts are bundled in `src/`; no external services are needed. ES modules require a static server rather than opening the HTML directly. `examples/custom-ui.html` demonstrates independent controls and styling. See README.md for the embedding API.

## Controls

- Rotate: drag; scroll or pinch to zoom; Shift + drag or secondary drag to pan.
- Water / Burn / Crease: press or paint on the card. Hold Burn to progress from scorching to a hole. Shift + drag temporarily rotates instead of painting.
- Keyboard: focus the viewer; arrows rotate, Shift + arrows pan, + / - zoom. Space applies the selected material tool at the center.
- Inspect impression: a close view with low lighting. Light moves the source.
- Dry paper: accelerates evaporation, leaving a stain and residual warp.
- Reset view: restores the camera and lighting, preserving experiments.
- Fresh card: clears all experiments and restores the view.

## The material model

A deterministic network of 78,000 overlapping curved fiber strokes produces the paper height field. Samples of this field provide local density and a directional transport bias; the printed impression increases local density. The shader compresses grain inside the letters and ray-marches a shallow recessed mask for parallax.

A 112 × 72 material grid stores moisture, temperature, char, drying stains, and deformation memory. An explicit finite-difference update spreads moisture and heat between neighboring cells. Fiber density and direction influence transport. Water cools the material and suppresses charring. Evaporation deposits stains, while accumulated char eventually removes fragments of both faces. Burn holes expose the background; no interior cut-wall geometry is generated.

The same state alters roughness, color, fiber relief, and a subdivided sheet mesh. Wet areas swell; drying retains a small warp; char curls and thins the material. Creases impose a narrow geometric ridge. Mesh ray picking places tools on the actual deformed surface, including the reverse side. Evolution pauses when the viewer is offscreen or the document is hidden. Rendering stops when the material settles.

This is an illustrative real-time material experiment. It is not a calibrated fluid solver, combustion model, finite-element paper model, or implementation of a verified research paper. It does not model flames, smoke, free droplets, ink chemistry, or structural fracture. The approximate 0.3 mm stock thickness assumes an 89 mm card width. Fonts and paper remain a visual interpretation of the supplied photo.

## Font attribution

Copperplate CC is by Owen Earl / the Cowboy Collective, under the SIL Open Font License: https://github.com/CowboyCollective/CopperplateCC. Its license is included in `licenses/Copperplate-CC-OFL.txt`. URW Gothic is bundled under its font embedding exception; its distribution terms are in `licenses/URW-Base35.txt`. Copperplate CC is a revival, not a verified match to the movie prop's exact typeface.

## Verification

Browser checks exercised water painting, accelerated drying, burn-through, creasing, front/reverse damage, keyboard tools, orbit, fresh reset, and mobile layout. A comparison using the same center heat input confirmed less charring after wetting the paper. JavaScript and WebGL error checks passed. These checks validate the implemented interactions, not physical accuracy or performance on every device.
