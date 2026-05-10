
import { Grid, PowerupKind } from './grid.js';

// ─── spawn ────────────────────────────────────────────────────────────────────

/**
 * After a multi-clear in powerup mode, stamp a powerup onto one of the just-
 * cleared cells.  The cell must still be null at this point (clear already
 * applied) so we find the best candidate: preferably an interior cell
 * (not on the edge) so Rocket and Bomb have maximum reach.
 *
 * Thresholds (from design doc):
 *   2 lines cleared  → Rocket
 *   3+ lines cleared → Bomb
 *   (ColourBurst is reserved for future special combos)
 */
export function spawnPowerup(
  grid:       Grid,
  clearedCells: [number, number][],
  lineCount:  number,
): void {
  if (lineCount < 2 || clearedCells.length === 0) return;

  const kind: PowerupKind = lineCount >= 3 ? 'bomb' : 'rocket';

  // Prefer an interior cell so the effect has maximum reach.
  const size     = grid.length;
  const interior = clearedCells.filter(([r, c]) => r > 0 && r < size - 1 && c > 0 && c < size - 1);
  const pool     = interior.length > 0 ? interior : clearedCells;
  const [r, c]   = pool[Math.floor(Math.random() * pool.length)];

  // The cell was just cleared so it's null — stamp the powerup as a dim
  // marker cell (dark neutral colour so the icon reads clearly).
  grid[r][c] = { colour: '#1e1e3a', powerup: kind };
}

// ─── trigger ──────────────────────────────────────────────────────────────────

/**
 * Examine cells about to be cleared; for each one that carries a powerup,
 * compute the extra cells that powerup destroys and merge them in.
 *
 * Returns the final expanded set of cells to clear (deduped, sorted).
 * Called with the initial clearing set; may recurse if newly added cells
 * themselves carry powerups (chain reactions).
 */
export function resolvePowerups(
  grid:  Grid,
  cells: [number, number][],
): [number, number][] {
  const size = grid.length;
  const seen = new Set<number>(cells.map(([r, c]) => r * size + c));
  const work = [...cells];
  let i = 0;

  while (i < work.length) {
    const [r, c] = work[i++];
    const cell   = grid[r][c];
    if (cell?.powerup == null) continue;

    const extras = effectCells(grid, r, c, cell.powerup);
    for (const [er, ec] of extras) {
      const key = er * size + ec;
      if (!seen.has(key)) {
        seen.add(key);
        work.push([er, ec]);
      }
    }
  }

  return work;
}

// ─── effects ──────────────────────────────────────────────────────────────────

function effectCells(
  grid:  Grid,
  row:   number,
  col:   number,
  kind:  PowerupKind,
): [number, number][] {
  switch (kind) {
    case 'rocket':      return rocketCells(grid, row, col);
    case 'bomb':        return bombCells(grid, row, col);
    case 'colourBurst': return colourBurstCells(grid, row, col);
  }
}

/** Rocket: blast the perpendicular line (if row was cleared → clear the column, and vice versa).
 *  Since we don't track which axis triggered it, we blast BOTH the full row and column. */
function rocketCells(grid: Grid, row: number, col: number): [number, number][] {
  const cells: [number, number][] = [];
  for (let c = 0; c < grid[row].length; c++) if (grid[row][c] !== null) cells.push([row, c]);
  for (let r = 0; r < grid.length; r++) if (grid[r][col] !== null) cells.push([r, col]);
  return cells;
}

/** Bomb: clear a 3×3 area centred on the cell. */
function bombCells(grid: Grid, row: number, col: number): [number, number][] {
  const cells: [number, number][] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < grid.length && c >= 0 && c < grid.length && grid[r][c] !== null) cells.push([r, c]);
    }
  }
  return cells;
}

/** ColourBurst: remove every cell on the board that shares the powerup cell's colour. */
function colourBurstCells(grid: Grid, row: number, col: number): [number, number][] {
  const target = grid[row][col]?.colour;
  if (target == null) return [];
  const cells: [number, number][] = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c]?.colour === target) cells.push([r, c]);
    }
  }
  return cells;
}
