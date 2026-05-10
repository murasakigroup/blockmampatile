
import { Grid } from './grid.js';
import { PieceDefinition, getRandomPiece } from './pieces.js';
import { GameState, Phase, saveBest, bestKey, resetToMenu, retryState } from './state.js';
import { InputBuffer, clearInputBuffer } from './input.js';
import { Layout, MenuButton } from './layout.js';
import { spawnPowerup, resolvePowerups } from './powerups.js';

export const CLEAR_DURATION = 0.3; // seconds

// ─── piece geometry ──────────────────────────────────────────────────────────

export interface PieceBounds {
  minR: number; maxR: number;
  minC: number; maxC: number;
  rows: number; cols: number;
}

export function pieceBounds(piece: PieceDefinition): PieceBounds {
  const rs = piece.offsets.map(([r]) => r);
  const cs = piece.offsets.map(([, c]) => c);
  const minR = Math.min(...rs), maxR = Math.max(...rs);
  const minC = Math.min(...cs), maxC = Math.max(...cs);
  return { minR, maxR, minC, maxC, rows: maxR - minR + 1, cols: maxC - minC + 1 };
}

export function pointerToAnchor(
  pointerX: number,
  pointerY: number,
  piece: PieceDefinition,
  cellSize: number,
  gridLeft: number,
  gridTop: number,
): { anchorRow: number; anchorCol: number } {
  const { minR, minC, rows, cols } = pieceBounds(piece);
  const floatTopLeftX = pointerX - (cols / 2) * cellSize;
  const floatTopLeftY = pointerY - (rows / 2 + 1.5) * cellSize;
  const tlRow = Math.round((floatTopLeftY - gridTop)  / cellSize);
  const tlCol = Math.round((floatTopLeftX - gridLeft) / cellSize);
  return { anchorRow: tlRow - minR, anchorCol: tlCol - minC };
}

// ─── placement logic ─────────────────────────────────────────────────────────

export function canPlace(grid: Grid, piece: PieceDefinition, row: number, col: number): boolean {
  for (const [dr, dc] of piece.offsets) {
    const r = row + dr;
    const c = col + dc;
    if (r < 0 || r >= grid.length || c < 0 || c >= grid.length || grid[r][c] !== null) return false;
  }
  return true;
}

function placePiece(grid: Grid, piece: PieceDefinition, row: number, col: number): void {
  for (const [dr, dc] of piece.offsets) {
    grid[row + dr][col + dc] = { colour: piece.colour };
  }
}

function findFullLines(grid: Grid): { fullRows: number[]; fullCols: number[] } {
  const size = grid.length;
  const fullRows: number[] = [];
  const fullCols: number[] = [];
  for (let r = 0; r < size; r++) {
    if (grid[r].every(c => c !== null)) fullRows.push(r);
  }
  for (let c = 0; c < size; c++) {
    if (grid.every(row => row[c] !== null)) fullCols.push(c);
  }
  return { fullRows, fullCols };
}

function collectClearingCells(fullRows: number[], fullCols: number[], size: number): [number, number][] {
  const seen  = new Set<number>();
  const cells: [number, number][] = [];
  for (const r of fullRows) {
    for (let c = 0; c < size; c++) {
      const key = r * size + c;
      if (!seen.has(key)) { seen.add(key); cells.push([r, c]); }
    }
  }
  for (const c of fullCols) {
    for (let r = 0; r < size; r++) {
      const key = r * size + c;
      if (!seen.has(key)) { seen.add(key); cells.push([r, c]); }
    }
  }
  return cells;
}

function applyClear(grid: Grid, cells: [number, number][]): void {
  for (const [r, c] of cells) grid[r][c] = null;
}

function anyPieceFits(grid: Grid, tray: (PieceDefinition | null)[]): boolean {
  const size = grid.length;
  for (const piece of tray) {
    if (piece === null) continue;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (canPlace(grid, piece, r, c)) return true;
      }
    }
  }
  return false;
}

// ─── placement action ────────────────────────────────────────────────────────

function tryPlace(state: GameState, slotIndex: number, row: number, col: number): void {
  const piece = state.tray[slotIndex];
  if (piece === null) return;
  if (!canPlace(state.grid, piece, row, col)) return;

  placePiece(state.grid, piece, row, col);
  state.tray[slotIndex] = null;

  // Score for blocks placed
  state.score += piece.offsets.length;

  // Check for full lines
  const { fullRows, fullCols } = findFullLines(state.grid);
  const lineCount = fullRows.length + fullCols.length;

  if (lineCount > 0) {
    // Line score: 18 per line + 10 per extra line in multi-clear
    state.score += lineCount * 18 + Math.max(0, lineCount - 1) * 10;

    const lineCells = collectClearingCells(fullRows, fullCols, state.grid.length);

    if (state.gameMode === 'powerup') {
      // Expand clearing set: any powerup cell in the lines fires its effect.
      const expanded = resolvePowerups(state.grid, lineCells);
      const bonus    = expanded.length - lineCells.length;
      if (bonus > 0) state.score += bonus * 2;
      state.clearingCells = expanded;
      // Record line count so the animation-end handler can spawn the next powerup.
      state.pendingSpawnLines = lineCount;
    } else {
      state.clearingCells = lineCells;
    }

    state.clearTimer = CLEAR_DURATION;
    state.phase      = Phase.CLEARING;
  } else {
    afterClear(state);
  }

  // Update best
  if (state.score > state.best) {
    state.best = state.score;
    saveBest(state);
  }
}

function afterClear(state: GameState): void {
  // Refill tray once all 3 slots are empty
  if (state.tray.every(p => p === null)) {
    state.tray = [getRandomPiece(), getRandomPiece(), getRandomPiece()];
  }

  // Game over: no remaining piece fits anywhere
  if (!anyPieceFits(state.grid, state.tray)) {
    state.phase = Phase.GAME_OVER;
  } else {
    state.phase = Phase.PLAYING;
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function hitTest(btn: MenuButton, x: number, y: number): boolean {
  return x >= btn.x && x <= btn.x + btn.width &&
         y >= btn.y && y <= btn.y + btn.height;
}

// ─── frame functions ─────────────────────────────────────────────────────────

export function processInput(
  state: GameState,
  input: InputBuffer,
  layout: Layout,
  canvasW: number,
): void {
  // --- MENU phase: button taps ---
  if (state.phase === Phase.MENU) {
    if (input.down) {
      const { x, y } = input.down;
      if (hitTest(layout.menuClassicBtn, x, y)) {
        state.gameMode = 'classic';
        state.grid     = Array.from({ length: state.gridSize }, () => Array(state.gridSize).fill(null));
        state.tray     = [getRandomPiece(), getRandomPiece(), getRandomPiece()];
        state.score    = 0;
        state.displayScore = 0;
        const stored = parseInt(localStorage.getItem(bestKey('classic', state.gridSize)) ?? '0', 10);
        state.best = Number.isFinite(stored) ? stored : 0;
        state.phase = Phase.PLAYING;
      } else if (hitTest(layout.menuPowerUpBtn, x, y)) {
        state.gameMode = 'powerup';
        state.gridSize = 8;  // Power-Up is 8×8 only
        state.grid     = Array.from({ length: 8 }, () => Array(8).fill(null));
        state.tray     = [getRandomPiece(), getRandomPiece(), getRandomPiece()];
        state.score    = 0;
        state.displayScore = 0;
        const stored = parseInt(localStorage.getItem(bestKey('powerup', 8)) ?? '0', 10);
        state.best = Number.isFinite(stored) ? stored : 0;
        state.phase = Phase.PLAYING;
      } else if (hitTest(layout.menuSize8Btn, x, y)) {
        state.gridSize = 8;
        const stored = parseInt(localStorage.getItem(bestKey('classic', 8)) ?? '0', 10);
        state.best = Number.isFinite(stored) ? stored : 0;
      } else if (hitTest(layout.menuSize10Btn, x, y)) {
        state.gridSize = 10;
        const stored = parseInt(localStorage.getItem(bestKey('classic', 10)) ?? '0', 10);
        state.best = Number.isFinite(stored) ? stored : 0;
      }
    }
    clearInputBuffer(input);
    return;
  }

  // --- score bar buttons (work in PLAYING / CLEARING / GAME_OVER) ---
  if (input.down) {
    const { x, y } = input.down;

    // Restart button → retry same mode
    const { restartX, restartY, restartSize } = layout;
    if (x >= restartX && x <= restartX + restartSize &&
        y >= restartY && y <= restartY + restartSize) {
      retryState(state);
      clearInputBuffer(input);
      return;
    }

    // Exit button → back to menu
    const { exitBtnX, exitBtnY, exitBtnSize } = layout;
    if (x >= exitBtnX && x <= exitBtnX + exitBtnSize &&
        y >= exitBtnY && y <= exitBtnY + exitBtnSize) {
      resetToMenu(state);
      clearInputBuffer(input);
      return;
    }
  }

  // --- GAME_OVER: two explicit buttons ---
  if (state.phase === Phase.GAME_OVER) {
    if (input.down) {
      const { x, y } = input.down;
      if (hitTest(layout.goRetryBtn, x, y)) {
        retryState(state);
      } else if (hitTest(layout.goMenuBtn, x, y)) {
        resetToMenu(state);
      }
    }
    clearInputBuffer(input);
    return;
  }

  if (state.phase !== Phase.PLAYING) {
    clearInputBuffer(input);
    return;
  }

  // --- drag start ---
  if (input.down) {
    const { x, y } = input.down;
    if (y >= layout.trayTop) {
      const slotW     = canvasW / 3;
      const slotIndex = Math.min(2, Math.max(0, Math.floor(x / slotW)));
      if (state.tray[slotIndex] !== null) {
        state.drag = { slotIndex, pointerX: x, pointerY: y };
      }
    }
  }

  // --- drag move ---
  if (input.move && state.drag) {
    state.drag = { ...state.drag, pointerX: input.move.x, pointerY: input.move.y };
  }

  // --- drag cancel ---
  if (input.cancel && state.drag) {
    state.drag = null;
  }

  // --- drag end / drop ---
  if (input.up && state.drag) {
    const { slotIndex, pointerX, pointerY } = state.drag;
    state.drag = null;

    const piece = state.tray[slotIndex];
    if (piece !== null) {
      // No strict bounds check — pointerToAnchor maps pointer to grid cell
      // accounting for the upward offset, and canPlace rejects out-of-bounds.
      const { anchorRow, anchorCol } = pointerToAnchor(
        pointerX, pointerY, piece,
        layout.cellSize, layout.gridLeft, layout.gridTop,
      );
      tryPlace(state, slotIndex, anchorRow, anchorCol);
    }
  }

  clearInputBuffer(input);
}

export function update(state: GameState, dt: number): void {
  // Animate displayed score toward actual score
  if (state.displayScore < state.score) {
    state.displayScore = Math.min(state.score, state.displayScore + dt * 200);
  }

  // Clearing animation countdown
  if (state.phase === Phase.CLEARING) {
    state.clearTimer -= dt;
    if (state.clearTimer <= 0) {
      const justCleared = state.clearingCells;
      applyClear(state.grid, justCleared);
      // Spawn a powerup on one of the cleared cells after a multi-clear.
      if (state.pendingSpawnLines >= 2) {
        spawnPowerup(state.grid, justCleared, state.pendingSpawnLines);
        state.pendingSpawnLines = 0;
      }
      state.clearingCells = [];
      state.clearTimer    = 0;
      afterClear(state);
    }
  }
}
