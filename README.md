# frets

A tiny, single-page fretboard diagram editor. Click frets, build up layered
overlays of scale degrees or note names, save to localStorage. Themed against
Tokyo Night Moon.

## Run

```sh
bun start
```

Open http://localhost:3000.

No build step, no install, no `node_modules` — `bun --hot index.html` serves
`index.html`, `app.ts`, and `style.css` directly with hot reload.

## Features

- **Six-string fretboard** in standard tuning (E A D G B E), 15 frets, with
  nut, fret wires, single/double inlay dots, and fret numbers.
- **View toggle** at the top: show scale degrees or note names.
- **Root selector** for the primary key.
- **Optional second root** ("Root 2"). When set, every marker shows two stacked
  degree labels — the primary in its contrast color on top, the secondary in
  white underneath. Lets you see two interval patterns at once.
- **Layers panel** for building up overlays:
  - `+ Add layer` cycles through 11 Tokyo Night palette colors.
  - Pick a symbol: circle, square, triangle, diamond, star, moon.
  - Pick a color from prefilled swatches (no color picker).
  - Rename the layer inline (Enter or click away to commit, empty reverts to
    `Layer N`).
  - `↑` / `↓` reorder layers. Later layers sit on top — useful when multiple
    layers cover the same fret position.
  - `−` / `+` per-layer scale buttons grow/shrink that layer's markers.
  - Hide / Show, Delete.
- **Click any fret** (including fret 0 for open strings) to toggle a marker on
  the active layer. The active layer is highlighted with an accent border.
- **Overlapping layers stack their shapes** so you can see at a glance when
  multiple layers cover the same position. The label is drawn once per
  position, using the topmost layer's contrast color.
- **Label halos**: every label has a stroke in the opposite of its fill (white
  text → black halo, dark text → white halo) so it stays readable on any
  marker color, at any scale.
- **Persistence**: all state (mode, root, root 2, layers, positions, scales,
  names, active selection) is saved to `localStorage` under `frets:v1` AND
  encoded into the URL hash on every change. On load, the URL hash wins so
  shared links override whatever was last saved locally.
- **Copy link** in the top bar copies a self-contained shareable URL. Paste
  it on another machine and the full diagram loads — no server, no account,
  no sync.

## Layout

```
frets/
├── index.html    Top bar + fretboard SVG + layers panel
├── style.css     Tokyo Night Moon palette + UI styling
├── app.ts        All rendering, state, persistence, event wiring
└── package.json  Single `start` script
```

The theme is sourced from `~/.config/dots/modules/theme.nix` (Tokyo Night
Moon variant). Hex values are inlined as CSS custom properties in
`style.css`.

## Wipe saved state

In the browser DevTools console:

```js
localStorage.removeItem("frets:v1");
location.hash = "";
```

Then refresh.
