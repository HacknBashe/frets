// Frets — a tiny fretboard editor

type Mode = "degree" | "note";
type Symbol = "circle" | "square" | "triangle" | "diamond" | "star" | "moon";

interface Layer {
  id: string;
  name: string;
  color: string;
  symbol: Symbol;
  visible: boolean;
  scale: number; // marker size multiplier
  positions: Set<string>; // "stringIdx-fret"
}

const MIN_SCALE = 0.6;
const MAX_SCALE = 2.4;
const SCALE_STEP = 1.15;

const NOTES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

// Standard tuning, low to high (index 0 = low E)
const TUNING = ["E", "A", "D", "G", "B", "E"];
const NUM_FRETS = 15;
const NUM_STRINGS = 6;

// SVG layout constants
const PAD_L = 40;
const PAD_R = 20;
const PAD_T = 40;
const PAD_B = 20;
const FRET_W = 70;
const STRING_GAP = 36;
const NUT_W = 8;

const SVG_W = PAD_L + NUT_W + FRET_W * NUM_FRETS + PAD_R;
const SVG_H = PAD_T + STRING_GAP * (NUM_STRINGS - 1) + PAD_B;

const SYMBOLS: Symbol[] = [
  "circle",
  "square",
  "triangle",
  "diamond",
  "star",
  "moon",
];
// Tokyo Night Moon palette (sourced from ~/.config/dots/modules/theme.nix)
const LAYER_COLORS = [
  "#ff757f", // red
  "#ff966c", // orange
  "#ffc777", // yellow
  "#c3e88d", // green
  "#4fd6be", // teal
  "#86e1fc", // cyan
  "#65bcff", // blue1
  "#82aaff", // blue
  "#c099ff", // magenta
  "#fca7ea", // pink
  "#ff007c", // hot pink
];

const SCALE_DEGREE_LABELS = [
  "1",
  "b2",
  "2",
  "b3",
  "3",
  "4",
  "b5",
  "5",
  "b6",
  "6",
  "b7",
  "7",
];

// State
let mode: Mode = "degree";
let root: string = "A";
let root2: string | null = null; // optional secondary root for dual interval display
const layers: Layer[] = [];
let activeLayerId: string | null = null;

const STORAGE_KEY = "frets:v1";

interface PersistedLayer {
  id: string;
  name: string;
  color: string;
  symbol: Symbol;
  visible: boolean;
  scale?: number;
  positions: string[];
}

interface PersistedState {
  mode: Mode;
  root: string;
  root2?: string | null;
  activeLayerId: string | null;
  layers: PersistedLayer[];
}

function save() {
  try {
    const state: PersistedState = {
      mode,
      root,
      root2,
      activeLayerId,
      layers: layers.map((l) => ({
        id: l.id,
        name: l.name,
        color: l.color,
        symbol: l.symbol,
        visible: l.visible,
        scale: l.scale,
        positions: [...l.positions],
      })),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / privacy mode errors
  }
}

function load(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const state = JSON.parse(raw) as PersistedState;
    mode = state.mode === "note" ? "note" : "degree";
    root = typeof state.root === "string" ? state.root : "A";
    root2 = typeof state.root2 === "string" ? state.root2 : null;
    activeLayerId = state.activeLayerId ?? null;
    layers.length = 0;
    for (const l of state.layers ?? []) {
      const symbol =
        (l.symbol as string) === "hexagon" ? "moon" : (l.symbol as Symbol);
      layers.push({
        id: l.id,
        name: l.name,
        color: l.color,
        symbol,
        visible: l.visible !== false,
        scale: typeof l.scale === "number" ? l.scale : 1,
        positions: new Set(l.positions ?? []),
      });
    }
    return layers.length > 0;
  } catch {
    return false;
  }
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function moveLayer(id: string, dir: -1 | 1) {
  const idx = layers.findIndex((l) => l.id === id);
  if (idx === -1) return;
  const target = idx + dir;
  if (target < 0 || target >= layers.length) return;
  const [layer] = layers.splice(idx, 1);
  layers.splice(target, 0, layer);
  save();
  render();
}

function noteAt(stringIdx: number, fret: number): string {
  const openIdx = NOTES.indexOf(TUNING[stringIdx]);
  return NOTES[(openIdx + fret) % 12];
}

function degreeAtFor(
  stringIdx: number,
  fret: number,
  rootNote: string,
): string {
  const rootIdx = NOTES.indexOf(rootNote);
  const noteIdx = NOTES.indexOf(noteAt(stringIdx, fret));
  const interval = (noteIdx - rootIdx + 12) % 12;
  return SCALE_DEGREE_LABELS[interval];
}

function primaryLabel(stringIdx: number, fret: number): string {
  return mode === "note"
    ? noteAt(stringIdx, fret)
    : degreeAtFor(stringIdx, fret, root);
}

function secondaryLabel(stringIdx: number, fret: number): string | null {
  if (mode !== "degree" || !root2) return null;
  return degreeAtFor(stringIdx, fret, root2);
}

function nextLayerColor(): string {
  const used = new Set(layers.map((l) => l.color));
  const unused = LAYER_COLORS.find((c) => !used.has(c));
  if (unused) return unused;
  return LAYER_COLORS[layers.length % LAYER_COLORS.length];
}

function addLayer() {
  const idx = layers.length;
  const layer: Layer = {
    id: uid(),
    name: `Layer ${idx + 1}`,
    color: nextLayerColor(),
    symbol: SYMBOLS[idx % SYMBOLS.length],
    visible: true,
    scale: 1,
    positions: new Set(),
  };
  layers.push(layer);
  activeLayerId = layer.id;
  save();
  render();
}

function scaleLayer(id: string, dir: -1 | 1) {
  const layer = layers.find((l) => l.id === id);
  if (!layer) return;
  const next = dir === 1 ? layer.scale * SCALE_STEP : layer.scale / SCALE_STEP;
  layer.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
  save();
  render();
}

function removeLayer(id: string) {
  const idx = layers.findIndex((l) => l.id === id);
  if (idx === -1) return;
  layers.splice(idx, 1);
  if (activeLayerId === id) {
    activeLayerId = layers.length ? layers[layers.length - 1].id : null;
  }
  save();
  render();
}

function togglePosition(stringIdx: number, fret: number) {
  if (!activeLayerId) return;
  const layer = layers.find((l) => l.id === activeLayerId);
  if (!layer) return;
  const key = `${stringIdx}-${fret}`;
  if (layer.positions.has(key)) layer.positions.delete(key);
  else layer.positions.add(key);
  save();
  renderFretboard();
}

function fretX(fret: number): number {
  // fret 0 = open (left of nut); 1..N centered between fret wires
  if (fret === 0) return PAD_L + NUT_W / 2 - 14;
  const wireLeft = PAD_L + NUT_W + (fret - 1) * FRET_W;
  return wireLeft + FRET_W / 2;
}

function stringY(stringIdx: number): number {
  // stringIdx 0 = low E (drawn at bottom)
  const drawIdx = NUM_STRINGS - 1 - stringIdx;
  return PAD_T + drawIdx * STRING_GAP;
}

// Inlay dots at single-dot frets 3,5,7,9,15 and double 12
const SINGLE_INLAYS = [3, 5, 7, 9, 15];
const DOUBLE_INLAYS = [12];

function renderFretboard() {
  const svg = document.getElementById("fretboard")!;
  svg.setAttribute("viewBox", `0 0 ${SVG_W} ${SVG_H}`);
  svg.setAttribute("width", String(SVG_W));
  svg.setAttribute("height", String(SVG_H));

  let parts: string[] = [];

  // Fretboard surface
  const boardTop = PAD_T - 12;
  const boardH = STRING_GAP * (NUM_STRINGS - 1) + 24;
  parts.push(
    `<rect x="${PAD_L + NUT_W}" y="${boardTop}" width="${FRET_W * NUM_FRETS}" height="${boardH}" fill="var(--fret-surface)" stroke="var(--fret-surface-edge)" stroke-width="1" />`,
  );

  // Inlay dots
  const inlayY = PAD_T + (STRING_GAP * (NUM_STRINGS - 1)) / 2;
  for (const f of SINGLE_INLAYS) {
    const cx = PAD_L + NUT_W + (f - 1) * FRET_W + FRET_W / 2;
    parts.push(
      `<circle cx="${cx}" cy="${inlayY}" r="5" fill="var(--inlay)" />`,
    );
  }
  for (const f of DOUBLE_INLAYS) {
    const cx = PAD_L + NUT_W + (f - 1) * FRET_W + FRET_W / 2;
    const offset = STRING_GAP * 1.2;
    parts.push(
      `<circle cx="${cx}" cy="${inlayY - offset}" r="5" fill="var(--inlay)" />`,
    );
    parts.push(
      `<circle cx="${cx}" cy="${inlayY + offset}" r="5" fill="var(--inlay)" />`,
    );
  }

  // Nut
  parts.push(
    `<rect x="${PAD_L}" y="${boardTop}" width="${NUT_W}" height="${boardH}" fill="var(--nut)" />`,
  );

  // Fret wires
  for (let f = 1; f <= NUM_FRETS; f++) {
    const x = PAD_L + NUT_W + f * FRET_W;
    parts.push(
      `<line x1="${x}" y1="${PAD_T - 12}" x2="${x}" y2="${PAD_T + STRING_GAP * (NUM_STRINGS - 1) + 12}" stroke="var(--fret-wire)" stroke-width="2" />`,
    );
  }

  // Fret numbers (above the board)
  for (let f = 1; f <= NUM_FRETS; f++) {
    const cx = PAD_L + NUT_W + (f - 1) * FRET_W + FRET_W / 2;
    parts.push(
      `<text x="${cx}" y="${PAD_T - 20}" text-anchor="middle" fill="var(--muted)" font-size="11" font-weight="600">${f}</text>`,
    );
  }

  // Strings
  for (let s = 0; s < NUM_STRINGS; s++) {
    const y = stringY(s);
    const thickness = 1 + (NUM_STRINGS - 1 - s) * 0.35;
    parts.push(
      `<line x1="${PAD_L}" y1="${y}" x2="${SVG_W - PAD_R}" y2="${y}" stroke="var(--string)" stroke-width="${thickness}" />`,
    );
    // String label on left
    parts.push(
      `<text x="${PAD_L - 12}" y="${y + 4}" text-anchor="end" fill="var(--muted)" font-size="12" font-weight="600">${TUNING[s]}</text>`,
    );
  }

  // Click targets for each (string, fret) position. fret 0 = open string.
  for (let s = 0; s < NUM_STRINGS; s++) {
    for (let f = 0; f <= NUM_FRETS; f++) {
      const x = fretX(f);
      const y = stringY(s);
      parts.push(
        `<g class="fret-cell" data-string="${s}" data-fret="${f}">
          <circle class="hover-indicator" cx="${x}" cy="${y}" r="14" fill="#fff" opacity="0" />
          <rect x="${x - FRET_W / 2}" y="${y - STRING_GAP / 2}" width="${FRET_W}" height="${STRING_GAP}" fill="transparent" />
        </g>`,
      );
    }
  }

  // Shapes: every visible layer paints its symbol at each of its positions.
  // Overlapping selections stack on purpose (later layers on top).
  for (const layer of layers) {
    if (!layer.visible) continue;
    for (const pos of layer.positions) {
      const [sStr, fStr] = pos.split("-");
      const s = parseInt(sStr, 10);
      const f = parseInt(fStr, 10);
      parts.push(
        renderShape(fretX(f), stringY(s), layer.color, layer.symbol, layer.scale),
      );
    }
  }

  // Labels: exactly one per (string, fret). The topmost (last) visible layer
  // covering that spot owns the label so its contrast color picks the right
  // text color and scale.
  const labelOwner = new Map<string, Layer>();
  for (const layer of layers) {
    if (!layer.visible) continue;
    for (const pos of layer.positions) {
      labelOwner.set(pos, layer);
    }
  }
  for (const [pos, layer] of labelOwner) {
    const [sStr, fStr] = pos.split("-");
    const s = parseInt(sStr, 10);
    const f = parseInt(fStr, 10);
    parts.push(
      renderLabel(
        fretX(f),
        stringY(s),
        layer.color,
        primaryLabel(s, f),
        secondaryLabel(s, f),
      ),
    );
  }

  svg.innerHTML = parts.join("");

  // Bind clicks
  svg.querySelectorAll<SVGGElement>(".fret-cell").forEach((cell) => {
    cell.addEventListener("click", () => {
      const s = parseInt(cell.dataset.string!, 10);
      const f = parseInt(cell.dataset.fret!, 10);
      togglePosition(s, f);
    });
  });
}

function renderShape(
  cx: number,
  cy: number,
  color: string,
  symbol: Symbol,
  scale: number = 1,
): string {
  const r = 14 * scale;
  switch (symbol) {
    case "circle":
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="#000" stroke-width="1" />`;
    case "square":
      return `<rect x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" fill="${color}" stroke="#000" stroke-width="1" />`;
    case "triangle": {
      const pts = `${cx},${cy - r} ${cx + r},${cy + r * 0.85} ${cx - r},${cy + r * 0.85}`;
      return `<polygon points="${pts}" fill="${color}" stroke="#000" stroke-width="1" />`;
    }
    case "diamond": {
      const pts = `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
      return `<polygon points="${pts}" fill="${color}" stroke="#000" stroke-width="1" />`;
    }
    case "star":
      return `<polygon points="${starPoints(cx, cy, r, r * 0.45, 5)}" fill="${color}" stroke="#000" stroke-width="1" />`;
    case "moon":
      return `<path d="${moonPath(cx, cy, r)}" fill="${color}" stroke="#000" stroke-width="1" />`;
  }
}

function moonPath(cx: number, cy: number, r: number): string {
  // True crescent: two circular arcs meet at the points where the outer disc
  // and an offset inner cutout disc intersect. Those intersection points are
  // the moon's tips — and because the two arcs cross at different tangents
  // there, the tips come to a real point.
  //
  //   R  = outer radius
  //   r2 = inner cutout radius (controls how much gets bitten out)
  //   d  = distance the inner cutout is shifted toward the open side
  //
  // Constraint: |R - r2| < d < R + r2 (the two circles must actually cross).
  // Tune for chunkiness: larger d / smaller r2 => chunkier moon, pointier
  // tips that sit further inside the outer bounding box.
  const R = r;
  const r2 = r * 0.8;
  const d = r * 0.6;

  const xInt = (d * d + R * R - r2 * r2) / (2 * d);
  const yInt = Math.sqrt(Math.max(0, R * R - xInt * xInt));

  const tipTopX = cx + xInt;
  const tipTopY = cy - yInt;
  const tipBotX = cx + xInt;
  const tipBotY = cy + yInt;

  // Outer arc tip_top -> tip_bot, long way (large=1) around the LEFT side of
  // outer (sweep=0, visually CCW). Then inner arc tip_bot -> tip_top, long
  // way around the LEFT side of the inner cutout (sweep=1, visually CW from
  // inner's POV). The two arcs cancel winding inside the cutout region, so
  // the bite is correctly excluded with the default nonzero fill rule.
  return (
    `M ${tipTopX},${tipTopY} ` +
    `A ${R},${R} 0 1,0 ${tipBotX},${tipBotY} ` +
    `A ${r2},${r2} 0 1,1 ${tipTopX},${tipTopY} Z`
  );
}

// Labels stay a fixed size regardless of layer scale so they're always
// readable, even on tiny markers.
const LABEL_SIZE = 11;
const DUAL_LABEL_SIZE = 10;

// Each label gets a halo stroke in the opposite of its fill: white text gets
// a black halo, dark text gets a white halo. `paint-order="stroke"` lays the
// stroke first, then the fill on top, so the halo never bleeds into the glyph.
function oppositeFill(fill: string): string {
  return fill === "#fff" || fill === "#ffffff" ? "#111" : "#fff";
}

function renderLabel(
  cx: number,
  cy: number,
  ownerColor: string,
  primary: string,
  secondary: string | null,
): string {
  const primaryFill = textColorFor(ownerColor);
  const primaryStroke = oppositeFill(primaryFill);
  if (secondary) {
    const gap = DUAL_LABEL_SIZE * 0.45;
    return (
      `<text x="${cx}" y="${cy - gap}" text-anchor="middle" dominant-baseline="central" fill="${primaryFill}" stroke="${primaryStroke}" stroke-width="2" paint-order="stroke" font-size="${DUAL_LABEL_SIZE}">${escapeHtml(primary)}</text>` +
      `<text x="${cx}" y="${cy + gap}" text-anchor="middle" dominant-baseline="central" fill="#fff" stroke="#111" stroke-width="2" paint-order="stroke" font-size="${DUAL_LABEL_SIZE}">${escapeHtml(secondary)}</text>`
    );
  }
  return `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="${primaryFill}" stroke="${primaryStroke}" stroke-width="2" paint-order="stroke" font-size="${LABEL_SIZE}">${escapeHtml(primary)}</text>`;
}

// Used by the layer-row preview (icon + optional label as a single SVG snippet).
function renderMarker(
  cx: number,
  cy: number,
  color: string,
  symbol: Symbol,
  primary: string,
  secondary: string | null = null,
  scale: number = 1,
): string {
  const shape = renderShape(cx, cy, color, symbol, scale);
  const text = primary ? renderLabel(cx, cy, color, primary, secondary) : "";
  return `<g class="fret-marker">${shape}${text}</g>`;
}

function starPoints(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  points: number,
): string {
  const step = Math.PI / points;
  const out: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = -Math.PI / 2 + i * step;
    out.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
  }
  return out.join(" ");
}

function textColorFor(bg: string): string {
  // crude luminance check
  const c = bg.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#111" : "#fff";
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!,
  );
}

function renderLayers() {
  const list = document.getElementById("layerList")!;
  list.innerHTML = "";

  if (layers.length === 0) {
    list.innerHTML = `<li class="empty">No layers yet. Click "+ Add layer" to start.</li>`;
    return;
  }

  for (const layer of layers) {
    const li = document.createElement("li");
    li.className = "layer" + (layer.id === activeLayerId ? " active" : "");
    li.dataset.id = layer.id;

    const preview = document.createElement("div");
    preview.className = "preview";
    preview.innerHTML = `<svg viewBox="0 0 32 32" width="28" height="28">${renderMarker(16, 16, layer.color, layer.symbol, "")}</svg>`;

    const name = document.createElement("input");
    name.type = "text";
    name.className = "name";
    name.value = layer.name;
    name.spellcheck = false;
    name.addEventListener("click", (e) => e.stopPropagation());
    name.addEventListener("input", () => {
      layer.name = name.value;
      save();
    });
    name.addEventListener("blur", () => {
      // Empty name -> revert to default so layers stay identifiable
      if (!layer.name.trim()) {
        layer.name = `Layer ${layers.indexOf(layer) + 1}`;
        save();
        render();
      }
    });
    name.addEventListener("keydown", (e) => {
      if (e.key === "Enter") name.blur();
    });

    const controls = document.createElement("div");
    controls.className = "controls";

    // Symbol swatches
    const symGroup = document.createElement("div");
    symGroup.className = "group";
    const symLabel = document.createElement("span");
    symLabel.className = "group-label";
    symLabel.textContent = "Symbol";
    const symSwatches = document.createElement("div");
    symSwatches.className = "symbol-swatches";
    for (const sym of SYMBOLS) {
      const btn = document.createElement("button");
      btn.className = "sym" + (sym === layer.symbol ? " selected" : "");
      btn.title = sym;
      btn.innerHTML = `<svg viewBox="0 0 22 22" width="16" height="16">${symbolPreview(sym)}</svg>`;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        layer.symbol = sym;
        save();
        render();
      });
      symSwatches.appendChild(btn);
    }
    symGroup.append(symLabel, symSwatches);

    // Color swatches
    const colorGroup = document.createElement("div");
    colorGroup.className = "group";
    const colorLabel = document.createElement("span");
    colorLabel.className = "group-label";
    colorLabel.textContent = "Color";
    const colorSwatches = document.createElement("div");
    colorSwatches.className = "swatches";
    for (const color of LAYER_COLORS) {
      const btn = document.createElement("button");
      btn.className = "swatch" + (color === layer.color ? " selected" : "");
      btn.title = color;
      btn.innerHTML = `<span class="dot" style="background:${color}"></span>`;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        layer.color = color;
        save();
        render();
      });
      colorSwatches.appendChild(btn);
    }
    colorGroup.append(colorLabel, colorSwatches);

    controls.append(symGroup, colorGroup);

    const actions = document.createElement("div");
    actions.className = "actions";

    const idx = layers.indexOf(layer);

    const upBtn = document.createElement("button");
    upBtn.className = "icon-btn arrow";
    upBtn.textContent = "↑";
    upBtn.title = "Move up";
    upBtn.disabled = idx === 0;
    upBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      moveLayer(layer.id, -1);
    });

    const downBtn = document.createElement("button");
    downBtn.className = "icon-btn arrow";
    downBtn.textContent = "↓";
    downBtn.title = "Move down";
    downBtn.disabled = idx === layers.length - 1;
    downBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      moveLayer(layer.id, 1);
    });

    const visBtn = document.createElement("button");
    visBtn.className = "icon-btn";
    visBtn.textContent = layer.visible ? "Hide" : "Show";
    visBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      layer.visible = !layer.visible;
      save();
      render();
    });

    const delBtn = document.createElement("button");
    delBtn.className = "icon-btn danger";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeLayer(layer.id);
    });

    const shrinkBtn = document.createElement("button");
    shrinkBtn.className = "icon-btn arrow";
    shrinkBtn.textContent = "−";
    shrinkBtn.title = "Shrink";
    shrinkBtn.disabled = layer.scale <= MIN_SCALE + 0.001;
    shrinkBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      scaleLayer(layer.id, -1);
    });

    const growBtn = document.createElement("button");
    growBtn.className = "icon-btn arrow";
    growBtn.textContent = "+";
    growBtn.title = "Grow";
    growBtn.disabled = layer.scale >= MAX_SCALE - 0.001;
    growBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      scaleLayer(layer.id, 1);
    });

    actions.append(upBtn, downBtn, shrinkBtn, growBtn, visBtn, delBtn);
    li.append(preview, name, controls, actions);

    li.addEventListener("click", () => {
      activeLayerId = layer.id;
      save();
      renderLayers();
    });

    list.appendChild(li);
  }
}

function symbolPreview(symbol: Symbol): string {
  const cx = 11;
  const cy = 11;
  const r = 8;
  const stroke = "currentColor";
  switch (symbol) {
    case "circle":
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="1.5" />`;
    case "square":
      return `<rect x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" fill="none" stroke="${stroke}" stroke-width="1.5" />`;
    case "triangle":
      return `<polygon points="${cx},${cy - r} ${cx + r},${cy + r * 0.85} ${cx - r},${cy + r * 0.85}" fill="none" stroke="${stroke}" stroke-width="1.5" />`;
    case "diamond":
      return `<polygon points="${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}" fill="none" stroke="${stroke}" stroke-width="1.5" />`;
    case "star":
      return `<polygon points="${starPoints(cx, cy, r, r * 0.45, 5)}" fill="none" stroke="${stroke}" stroke-width="1.5" />`;
    case "moon":
      return `<path d="${moonPath(cx, cy, r)}" fill="${stroke}" />`;
  }
}

function render() {
  renderFretboard();
  renderLayers();
}

// Wire up top controls
document.getElementById("viewToggle")!.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (target.tagName !== "BUTTON") return;
  const newMode = target.dataset.mode as Mode;
  if (!newMode || newMode === mode) return;
  mode = newMode;
  document.querySelectorAll("#viewToggle button").forEach((b) => {
    b.classList.toggle("active", (b as HTMLElement).dataset.mode === mode);
  });
  save();
  renderFretboard();
});

const rootSelect = document.getElementById("rootSelect") as HTMLSelectElement;
rootSelect.addEventListener("change", () => {
  root = rootSelect.value;
  save();
  renderFretboard();
});

const root2Select = document.getElementById("root2Select") as HTMLSelectElement;
root2Select.addEventListener("change", () => {
  root2 = root2Select.value === "" ? null : root2Select.value;
  save();
  renderFretboard();
});

document.getElementById("addLayer")!.addEventListener("click", () => addLayer());

// Boot: restore from localStorage if present, otherwise seed one starter layer.
const restored = load();
if (restored) {
  // Sync UI controls to restored state
  rootSelect.value = root;
  root2Select.value = root2 ?? "";
  document.querySelectorAll("#viewToggle button").forEach((b) => {
    b.classList.toggle("active", (b as HTMLElement).dataset.mode === mode);
  });
  render();
} else {
  addLayer();
}
