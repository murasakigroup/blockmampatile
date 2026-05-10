
import { Grid, createGrid } from './grid.js';
import { PieceDefinition } from './pieces.js';
import { newTray } from './tray.js';

export const enum Phase {
  MENU,
  PLAYING,
  CLEARING,
  GAME_OVER,
}

export type GameMode = 'classic' | 'powerup';

export interface DragState {
  slotIndex: number;
  pointerX:  number;
  pointerY:  number;
}

export interface GameState {
  phase:             Phase;
  gameMode:          GameMode;
  gridSize:          number;
  grid:              Grid;
  tray:              (PieceDefinition | null)[];
  score:             number;
  displayScore:      number;   // smoothly counts toward score
  best:              number;
  drag:              DragState | null;
  clearingCells:     [number, number][];
  clearTimer:        number;   // seconds remaining in clear animation
  pendingSpawnLines: number;   // line count for powerup spawn after clear animation (0 = none)
}

function bestKey(mode: GameMode): string {
  return mode === 'classic' ? 'bm-best-classic' : 'bm-best-powerup';
}

export function saveBest(state: GameState): void {
  localStorage.setItem(bestKey(state.gameMode), String(state.best));
}

export function createInitialState(): GameState {
  // Start in MENU; load classic best so score bar shows something meaningful
  // once the user picks Classic mode.
  const stored = parseInt(localStorage.getItem('bm-best-classic') ?? '0', 10);
  const best = Number.isFinite(stored) ? stored : 0;
  return {
    phase:             Phase.MENU,
    gameMode:          'classic',
    gridSize:          8,
    grid:              createGrid(8),
    tray:              newTray(),
    score:             0,
    displayScore:      0,
    best,
    drag:              null,
    clearingCells:     [],
    clearTimer:        0,
    pendingSpawnLines: 0,
  };
}

/** Go back to the main menu. */
export function resetToMenu(state: GameState): void {
  const mode = state.gameMode;
  const stored = parseInt(localStorage.getItem(bestKey(mode)) ?? '0', 10);
  const best = Number.isFinite(stored) ? stored : 0;
  state.phase             = Phase.MENU;
  state.gameMode          = mode;
  state.grid              = createGrid(state.gridSize);
  state.tray              = newTray();
  state.score             = 0;
  state.displayScore      = 0;
  state.best              = best;
  state.drag              = null;
  state.clearingCells     = [];
  state.clearTimer        = 0;
  state.pendingSpawnLines = 0;
}

/** Restart the current mode without leaving it. */
export function retryState(state: GameState): void {
  const mode = state.gameMode;
  const stored = parseInt(localStorage.getItem(bestKey(mode)) ?? '0', 10);
  const best = Number.isFinite(stored) ? stored : 0;
  state.phase             = Phase.PLAYING;
  state.gameMode          = mode;
  state.grid              = createGrid(state.gridSize);
  state.tray              = newTray();
  state.score             = 0;
  state.displayScore      = 0;
  state.best              = best;
  state.drag              = null;
  state.clearingCells     = [];
  state.clearTimer        = 0;
  state.pendingSpawnLines = 0;
}
