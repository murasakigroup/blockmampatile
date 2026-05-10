
import { Grid, Cell, createDemoGrid } from './grid.js';
import { GameState, Phase } from './state.js';
import { canPlace, pieceBounds, pointerToAnchor, CLEAR_DURATION } from './game.js';
import { PieceDefinition } from './pieces.js';
import { Layout, MenuButton, SCORE_BAR_H, MARGIN, CELL_GAP, RADIUS_FRAC } from './layout.js';

// ─── palette ────────────────────────────────────────────────────────────────

const BG          = '#0a0a1a';
const CELL_EMPTY  = '#1a1a2e';
const CELL_BORDER = '#0f0f1f';
const TEXT_COL    = '#e0e0f0';
const SCORE_BG    = '#12122a';
const TRAY_BG     = '#0e0e22';

// ─── sprite cache ────────────────────────────────────────────────────────────

const spriteCache = new Map<string, HTMLCanvasElement>();
let cachedDpr = 0;

function invalidateSpriteCache(dpr: number): void {
  if (dpr !== cachedDpr) {
    spriteCache.clear();
    cachedDpr = dpr;
  }
}

// ─── cell drawing ────────────────────────────────────────────────────────────

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function renderGemCell(
  ctx: CanvasRenderingContext2D,
  px: number, py: number,
  size: number,
  colour: string,
): void {
  const r     = Math.max(2, size * RADIUS_FRAC);
  const inner = size - CELL_GAP * 2;
  const ix    = px + CELL_GAP;
  const iy    = py + CELL_GAP;

  roundRect(ctx, ix, iy, inner, inner, r);
  ctx.fillStyle = colour;
  ctx.fill();

  const grad = ctx.createLinearGradient(ix, iy, ix + inner * 0.7, iy + inner * 0.7);
  grad.addColorStop(0,   'rgba(255,255,255,0.30)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.08)');
  grad.addColorStop(1,   'rgba(0,0,0,0.20)');
  roundRect(ctx, ix, iy, inner, inner, r);
  ctx.fillStyle = grad;
  ctx.fill();

  const specR = inner * 0.18;
  const gSpec = ctx.createRadialGradient(
    ix + specR, iy + specR, 0,
    ix + specR, iy + specR, specR * 2,
  );
  gSpec.addColorStop(0, 'rgba(255,255,255,0.55)');
  gSpec.addColorStop(1, 'rgba(255,255,255,0.00)');
  ctx.beginPath();
  ctx.arc(ix + specR, iy + specR, specR * 1.5, 0, Math.PI * 2);
  ctx.fillStyle = gSpec;
  ctx.fill();
}

function renderEmptyCell(
  ctx: CanvasRenderingContext2D,
  px: number, py: number,
  size: number,
): void {
  const r     = Math.max(2, size * RADIUS_FRAC);
  const inner = size - CELL_GAP * 2;
  roundRect(ctx, px + CELL_GAP, py + CELL_GAP, inner, inner, r);
  ctx.fillStyle = CELL_EMPTY;
  ctx.fill();
  roundRect(ctx, px + CELL_GAP, py + CELL_GAP, inner, inner, r);
  ctx.strokeStyle = CELL_BORDER;
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

function getGemSprite(size: number, colour: string): HTMLCanvasElement {
  const key = `g|${colour}|${size}`;
  let s = spriteCache.get(key);
  if (s) return s;

  const px = Math.ceil(size * cachedDpr);
  s = document.createElement('canvas');
  s.width = px;
  s.height = px;
  const c = s.getContext('2d')!;
  c.scale(cachedDpr, cachedDpr);
  renderGemCell(c, 0, 0, size, colour);
  spriteCache.set(key, s);
  return s;
}

function getEmptySprite(size: number): HTMLCanvasElement {
  const key = `e|${size}`;
  let s = spriteCache.get(key);
  if (s) return s;

  const px = Math.ceil(size * cachedDpr);
  s = document.createElement('canvas');
  s.width = px;
  s.height = px;
  const c = s.getContext('2d')!;
  c.scale(cachedDpr, cachedDpr);
  renderEmptyCell(c, 0, 0, size);
  spriteCache.set(key, s);
  return s;
}

function drawGemCell(
  ctx: CanvasRenderingContext2D,
  px: number, py: number,
  size: number,
  colour: string,
): void {
  ctx.drawImage(getGemSprite(size, colour), px, py, size, size);
}

function drawPowerupIcon(
  ctx: CanvasRenderingContext2D,
  cell: Cell,
  px: number, py: number,
  size: number,
): void {
  const cx = px + size / 2;
  const cy = py + size / 2;
  const r  = size * 0.28;

  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle   = '#ffffff';
  ctx.lineWidth   = Math.max(1, size * 0.07);
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  if (cell.powerup === 'rocket') {
    // Arrow pointing up — the rocket
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r * 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.55, cy - r * 0.2);
    ctx.lineTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.55, cy - r * 0.2);
    ctx.stroke();
    // Small tail fins
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.4, cy + r * 0.3);
    ctx.lineTo(cx - r * 0.7, cy + r * 0.75);
    ctx.lineTo(cx, cy + r * 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.4, cy + r * 0.3);
    ctx.lineTo(cx + r * 0.7, cy + r * 0.75);
    ctx.lineTo(cx, cy + r * 0.6);
    ctx.stroke();
  } else if (cell.powerup === 'bomb') {
    // Circle with a spark on top
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.15, r * 0.75, 0, Math.PI * 2);
    ctx.stroke();
    // Spark / fuse
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.45, cy - r * 0.45);
    ctx.quadraticCurveTo(cx + r * 0.9, cy - r * 0.9, cx + r * 0.6, cy - r * 1.1);
    ctx.stroke();
    // Spark tip dot
    ctx.beginPath();
    ctx.arc(cx + r * 0.62, cy - r * 1.12, size * 0.06, 0, Math.PI * 2);
    ctx.fill();
  } else if (cell.powerup === 'colourBurst') {
    // Eight radiating lines — burst
    const spokes = 8;
    for (let i = 0; i < spokes; i++) {
      const angle  = (i / spokes) * Math.PI * 2;
      const inner  = r * 0.4;
      const outer  = r * 0.95;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawEmptyCell(
  ctx: CanvasRenderingContext2D,
  px: number, py: number,
  size: number,
): void {
  ctx.drawImage(getEmptySprite(size), px, py, size, size);
}

// ─── sub-renderers ───────────────────────────────────────────────────────────

function drawRestartButton(ctx: CanvasRenderingContext2D, layout: Layout): void {
  const { restartX, restartY, restartSize } = layout;
  const cx = restartX + restartSize / 2;
  const cy = restartY + restartSize / 2;
  const r  = restartSize * 0.35;

  ctx.save();
  ctx.strokeStyle = '#9090b0';
  ctx.lineWidth   = 2;
  ctx.lineCap     = 'round';

  // Draw a ~270° arc
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI * 0.5, Math.PI * 0.75);
  ctx.stroke();

  // Arrowhead at the end of the arc
  const endAngle = Math.PI * 0.75;
  const ex       = cx + r * Math.cos(endAngle);
  const ey       = cy + r * Math.sin(endAngle);
  const arrowLen = 5;
  ctx.beginPath();
  ctx.moveTo(ex - arrowLen, ey - arrowLen);
  ctx.lineTo(ex, ey);
  ctx.lineTo(ex + arrowLen, ey - arrowLen + 2);
  ctx.stroke();

  ctx.restore();
}

function drawExitButton(ctx: CanvasRenderingContext2D, layout: Layout): void {
  const { exitBtnX, exitBtnY, exitBtnSize } = layout;
  const cx = exitBtnX + exitBtnSize / 2;
  const cy = exitBtnY + exitBtnSize / 2;
  const s  = exitBtnSize * 0.28;

  ctx.save();
  ctx.strokeStyle = '#9090b0';
  ctx.lineWidth   = 2;
  ctx.lineCap     = 'round';

  // Left-pointing chevron (< shape)
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.4, cy - s);
  ctx.lineTo(cx - s * 0.4, cy);
  ctx.lineTo(cx + s * 0.4, cy + s);
  ctx.stroke();

  ctx.restore();
}

function drawScoreBar(
  ctx: CanvasRenderingContext2D,
  w: number,
  displayScore: number,
  best: number,
  layout: Layout,
): void {
  ctx.fillStyle = SCORE_BG;
  ctx.fillRect(0, 0, w, SCORE_BAR_H);

  ctx.fillStyle = TEXT_COL;
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.textBaseline = 'middle';

  // Score text starts after the exit button
  ctx.textAlign = 'left';
  const scoreLeft = layout.exitBtnX + layout.exitBtnSize + 8;
  ctx.fillText(`${Math.floor(displayScore)}`, scoreLeft, SCORE_BAR_H / 2);

  ctx.textAlign = 'right';
  ctx.fillText(`Best: ${best}`, w - MARGIN, SCORE_BAR_H / 2);
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  grid: Grid,
  layout: Layout,
): void {
  const { cellSize, gridLeft, gridTop } = layout;

  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      const px   = gridLeft + col * cellSize;
      const py   = gridTop  + row * cellSize;
      const cell = grid[row][col];
      if (cell !== null) {
        drawGemCell(ctx, px, py, cellSize, cell.colour);
        if (cell.powerup != null) drawPowerupIcon(ctx, cell, px, py, cellSize);
      } else {
        drawEmptyCell(ctx, px, py, cellSize);
      }
    }
  }
}

/** Flash a white overlay over cells being cleared. */
function drawClearingOverlay(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  layout: Layout,
): void {
  if (state.phase !== Phase.CLEARING || state.clearingCells.length === 0) return;

  const { cellSize, gridLeft, gridTop } = layout;
  const progress = 1 - Math.max(0, state.clearTimer / CLEAR_DURATION);
  const alpha    = 0.3 + 0.5 * progress;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#ffffff';

  for (const [r, c] of state.clearingCells) {
    const px    = gridLeft + c * cellSize + CELL_GAP;
    const py    = gridTop  + r * cellSize + CELL_GAP;
    const inner = cellSize - CELL_GAP * 2;
    const rad   = Math.max(2, cellSize * RADIUS_FRAC);
    roundRect(ctx, px, py, inner, inner, rad);
    ctx.fill();
  }

  ctx.restore();
}

function drawTray(
  ctx: CanvasRenderingContext2D,
  tray: (PieceDefinition | null)[],
  drag: GameState['drag'],
  layout: Layout,
  canvasW: number,
): void {
  const { trayTop, trayHeight, cellSize } = layout;
  const trayCellSize = Math.max(1, Math.floor(cellSize * 0.5));

  ctx.fillStyle = TRAY_BG;
  ctx.fillRect(0, trayTop, canvasW, trayHeight);

  const slotW = canvasW / 3;

  for (let i = 0; i < 3; i++) {
    const piece = tray[i];
    if (piece === null) continue;

    const isDragging = drag?.slotIndex === i;
    const { minR, minC, rows, cols } = pieceBounds(piece);

    const piecePixW   = cols * trayCellSize;
    const piecePixH   = rows * trayCellSize;
    const slotCentreX = slotW * i + slotW / 2;
    const slotCentreY = trayTop + trayHeight / 2;
    const originX     = Math.floor(slotCentreX - piecePixW / 2);
    const originY     = Math.floor(slotCentreY - piecePixH / 2);

    ctx.save();
    if (isDragging) ctx.globalAlpha = 0.25;

    for (const [dr, dc] of piece.offsets) {
      drawGemCell(
        ctx,
        originX + (dc - minC) * trayCellSize,
        originY + (dr - minR) * trayCellSize,
        trayCellSize,
        piece.colour,
      );
    }

    ctx.restore();
  }
}

function drawDragOverlay(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  layout: Layout,
): void {
  if (state.drag === null) return;

  const { slotIndex, pointerX, pointerY } = state.drag;
  const piece = state.tray[slotIndex];
  if (piece === null) return;

  const { cellSize, gridLeft, gridTop } = layout;
  const { minR, minC, rows, cols } = pieceBounds(piece);

  const floatTopLeftX = pointerX - (cols / 2) * cellSize;
  const floatTopLeftY = pointerY - (rows / 2 + 1.5) * cellSize;

  // Ghost on grid (no strict bounds — canPlace rejects invalid anchors)
  {
    const { anchorRow, anchorCol } = pointerToAnchor(
      pointerX, pointerY, piece, cellSize, gridLeft, gridTop,
    );
    if (canPlace(state.grid, piece, anchorRow, anchorCol)) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      for (const [dr, dc] of piece.offsets) {
        drawGemCell(
          ctx,
          gridLeft + (anchorCol + dc) * cellSize,
          gridTop  + (anchorRow + dr) * cellSize,
          cellSize,
          piece.colour,
        );
      }
      ctx.restore();
    }
  }

  // Floating piece
  for (const [dr, dc] of piece.offsets) {
    drawGemCell(
      ctx,
      floatTopLeftX + (dc - minC) * cellSize,
      floatTopLeftY + (dr - minR) * cellSize,
      cellSize,
      piece.colour,
    );
  }
}

function drawGameOver(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  score: number,
  best: number,
  layout: Layout,
): void {
  ctx.fillStyle = 'rgba(0, 0, 26, 0.88)';
  ctx.fillRect(0, 0, w, h);

  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#e0e0f0';
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.fillText('Game Over', w / 2, h * 0.38);

  ctx.font = '26px system-ui, sans-serif';
  ctx.fillText(`Score  ${score}`, w / 2, h * 0.52);

  ctx.fillStyle = '#9090b0';
  ctx.fillText(`Best  ${best}`, w / 2, h * 0.61);

  // Two buttons: retry and menu
  drawMenuButton(ctx, layout.goRetryBtn, 'Play Again', false);
  drawMenuButton(ctx, layout.goMenuBtn,  'Menu',       false);
}

// ─── menu ────────────────────────────────────────────────────────────────────

// Lazily created once; stays the same every frame.
let _demoGrid: Grid | null = null;
function getDemoGrid(): Grid {
  if (_demoGrid === null) _demoGrid = createDemoGrid();
  return _demoGrid;
}

function drawMenuButton(
  ctx: CanvasRenderingContext2D,
  btn: MenuButton,
  label: string,
  disabled: boolean,
): void {
  const { x, y, width, height } = btn;
  const r = Math.min(height * 0.3, 14);

  // Background fill
  const bgColour = disabled ? '#1a1a30' : '#1e1e42';
  roundRect(ctx, x, y, width, height, r);
  ctx.fillStyle = bgColour;
  ctx.fill();

  // Border
  roundRect(ctx, x, y, width, height, r);
  ctx.strokeStyle = disabled ? '#333358' : '#5555a0';
  ctx.lineWidth   = disabled ? 1 : 1.5;
  ctx.stroke();

  // Subtle top-edge highlight (only on active)
  if (!disabled) {
    const highlightGrad = ctx.createLinearGradient(x, y, x, y + height * 0.5);
    highlightGrad.addColorStop(0, 'rgba(255,255,255,0.07)');
    highlightGrad.addColorStop(1, 'rgba(255,255,255,0.00)');
    roundRect(ctx, x, y, width, height, r);
    ctx.fillStyle = highlightGrad;
    ctx.fill();
  }

  // Label
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.font         = `bold 20px system-ui, sans-serif`;
  ctx.fillStyle    = disabled ? '#44447a' : TEXT_COL;
  ctx.fillText(label, x + width / 2, y + height / 2);

  if (disabled) {
    ctx.font      = '13px system-ui, sans-serif';
    ctx.fillStyle = '#333360';
    ctx.fillText('coming soon', x + width / 2, y + height / 2 + 16);
  }
}

function drawSizePill(
  ctx:      CanvasRenderingContext2D,
  btn:      MenuButton,
  label:    string,
  selected: boolean,
): void {
  const { x, y, width, height } = btn;
  const r = height * 0.45;

  roundRect(ctx, x, y, width, height, r);
  ctx.fillStyle = selected ? '#2a2a5a' : '#141428';
  ctx.fill();

  roundRect(ctx, x, y, width, height, r);
  ctx.strokeStyle = selected ? '#7070d0' : '#333358';
  ctx.lineWidth   = selected ? 1.5 : 1;
  ctx.stroke();

  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.font         = `bold 14px system-ui, sans-serif`;
  ctx.fillStyle    = selected ? TEXT_COL : '#55558a';
  ctx.fillText(label, x + width / 2, y + height / 2);
}

function drawMenu(
  ctx:      CanvasRenderingContext2D,
  w:        number,
  h:        number,
  layout:   Layout,
  gridSize: number,
): void {
  // Background already filled to BG by renderGame

  // Demo grid — dimmed, rendered behind the UI
  const demoGrid = getDemoGrid();
  const { cellSize, gridLeft, gridTop } = layout;
  ctx.save();
  ctx.globalAlpha = 0.22;
  for (let row = 0; row < demoGrid.length; row++) {
    for (let col = 0; col < demoGrid[row].length; col++) {
      const px   = gridLeft + col * cellSize;
      const py   = gridTop  + row * cellSize;
      const cell = demoGrid[row][col];
      if (cell !== null) {
        drawGemCell(ctx, px, py, cellSize, cell.colour);
      } else {
        drawEmptyCell(ctx, px, py, cellSize);
      }
    }
  }
  ctx.restore();

  // Gradient veil over the demo grid so title reads clearly
  const veil = ctx.createLinearGradient(0, 0, 0, h);
  veil.addColorStop(0,    'rgba(10,10,26,0.92)');
  veil.addColorStop(0.45, 'rgba(10,10,26,0.70)');
  veil.addColorStop(1,    'rgba(10,10,26,0.92)');
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, w, h);

  // Title
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  ctx.font      = `bold ${Math.max(28, Math.min(48, w * 0.11))}px system-ui, sans-serif`;
  ctx.fillStyle = TEXT_COL;
  ctx.fillText('Block Mampatile', w / 2, h * 0.28);

  // Subtitle — reflects selected grid size
  ctx.font      = `16px system-ui, sans-serif`;
  ctx.fillStyle = '#6060a0';
  ctx.fillText(`${gridSize} × ${gridSize} block puzzle`, w / 2, h * 0.28 + Math.max(28, Math.min(48, w * 0.11)) * 0.72);

  // Mode buttons
  drawMenuButton(ctx, layout.menuClassicBtn, 'Classic',  false);
  drawMenuButton(ctx, layout.menuPowerUpBtn, 'Power-Up', false);

  // Size toggle
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'middle';
  ctx.font         = `13px system-ui, sans-serif`;
  ctx.fillStyle    = '#55558a';
  const pillMidY = layout.menuSize8Btn.y + layout.menuSize8Btn.height / 2;
  ctx.fillText('Size:', layout.menuSize8Btn.x - 8, pillMidY);
  drawSizePill(ctx, layout.menuSize8Btn,  '8 × 8',   gridSize === 8);
  drawSizePill(ctx, layout.menuSize10Btn, '10 × 10', gridSize === 10);
}

// ─── public API ──────────────────────────────────────────────────────────────

export function renderGame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  state: GameState,
  layout: Layout,
): void {
  const dpr = window.devicePixelRatio || 1;
  invalidateSpriteCache(dpr);
  const w   = canvas.width  / dpr;
  const h   = canvas.height / dpr;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.scale(dpr, dpr);

  if (state.phase === Phase.MENU) {
    drawMenu(ctx, w, h, layout, state.gridSize);
  } else {
    drawScoreBar(ctx, w, state.displayScore, state.best, layout);
    drawExitButton(ctx, layout);
    drawRestartButton(ctx, layout);
    drawGrid(ctx, state.grid, layout);
    drawClearingOverlay(ctx, state, layout);
    drawTray(ctx, state.tray, state.drag, layout, w);

    if (state.drag !== null) {
      drawDragOverlay(ctx, state, layout);
    }

    if (state.phase === Phase.GAME_OVER) {
      drawGameOver(ctx, w, h, state.score, state.best, layout);
    }
  }

  ctx.restore();
}
