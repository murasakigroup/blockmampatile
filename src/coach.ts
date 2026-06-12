
import { PIECES } from './pieces.js';
import type { GameRecord } from './recorder.js';

// ─── public types ─────────────────────────────────────────────────────────────

export interface CoachStep { piece: string; anchor: [number, number]; }

export interface CoachResult {
  verdict:                 'avoidable' | 'forced' | 'inconclusive';
  rewind?:                 number;                   // minimal R when avoidable (1..4)
  fatalActual?:            CoachStep;                // the player's actual placement at the last-salvation point
  gridBeforeFatal?:        boolean[][];              // board immediately before that placement
  witness?:                CoachStep[];              // surviving line from that point (includes the stuck pieces)
  stuckWith:               string[];                 // pieces in tray at death
  refugeLostMovesBeforeEnd: number | null;           // moves before death that sq3 last fit (0 = fit even at death)
  searchedNodes:           number;
  elapsedMs:               number;
}

// ─── internal replay types ────────────────────────────────────────────────────

interface HistoryEntry {
  piece:      string;
  anchor:     [number, number];
  trayAfter:  (string | null)[];
  gridAfter:  boolean[][];
}

// ─── piece cell cache ─────────────────────────────────────────────────────────

// For each piece name, precompute the [row, col] offsets.
const PIECE_OFFSETS = new Map<string, [number, number][]>();
for (const p of PIECES) {
  PIECE_OFFSETS.set(p.name, p.offsets as [number, number][]);
}

function pieceOffsets(name: string): [number, number][] {
  const o = PIECE_OFFSETS.get(name);
  if (!o) throw new Error(`Unknown piece: ${name}`);
  return o;
}

// ─── bitmask grid helpers ─────────────────────────────────────────────────────
// Represent a grid as Uint16Array of length n (supports up to 16 columns).
// Bit c of row[r] = cell (r, c) is occupied.

function boolGridToMask(grid: boolean[][], n: number): Uint16Array {
  const mask = new Uint16Array(n);
  for (let r = 0; r < n; r++) {
    let row = 0;
    for (let c = 0; c < n; c++) {
      if (grid[r][c]) row |= (1 << c);
    }
    mask[r] = row;
  }
  return mask;
}

function cloneMask(mask: Uint16Array): Uint16Array {
  return mask.slice();
}

function canPlaceMask(mask: Uint16Array, n: number, name: string, r: number, c: number): boolean {
  for (const [dr, dc] of pieceOffsets(name)) {
    const rr = r + dr;
    const cc = c + dc;
    if (rr < 0 || rr >= n || cc < 0 || cc >= n) return false;
    if (mask[rr] & (1 << cc)) return false;
  }
  return true;
}

function placeAndClearMask(mask: Uint16Array, n: number, name: string, r: number, c: number): void {
  // Place
  for (const [dr, dc] of pieceOffsets(name)) {
    mask[r + dr] |= (1 << (c + dc));
  }
  // Find full rows and cols
  const fullRow = (1 << n) - 1;
  const fullRows: number[] = [];
  for (let i = 0; i < n; i++) {
    if (mask[i] === fullRow) fullRows.push(i);
  }
  const fullCols: number[] = [];
  for (let j = 0; j < n; j++) {
    const colBit = 1 << j;
    let full = true;
    for (let i = 0; i < n; i++) {
      if (!(mask[i] & colBit)) { full = false; break; }
    }
    if (full) fullCols.push(j);
  }
  // Clear full rows
  for (const i of fullRows) mask[i] = 0;
  // Clear full cols
  if (fullCols.length > 0) {
    const colClearMask = fullCols.reduce((acc, j) => acc | (1 << j), 0);
    const invMask = (~colClearMask) & fullRow;
    for (let i = 0; i < n; i++) mask[i] &= invMask;
  }
}

function legalAnchors(mask: Uint16Array, n: number, name: string): [number, number][] {
  const result: [number, number][] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (canPlaceMask(mask, n, name, r, c)) result.push([r, c]);
    }
  }
  return result;
}

function maskKey(mask: Uint16Array): string {
  return Array.from(mask).join(',');
}

// ─── replay ───────────────────────────────────────────────────────────────────

interface ReplayResult {
  history:    HistoryEntry[];
  stuckWith:  string[];
  hasDeath:   boolean;
}

function replayRecord(record: GameRecord): ReplayResult {
  const n     = record.grid_size;
  const grid  = Array.from({ length: n }, () => Array(n).fill(false) as boolean[]);
  const tray: (string | null)[] = [null, null, null];
  const history: HistoryEntry[] = [];
  let stuckWith: string[] = [];
  let hasDeath = false;

  for (const ev of record.events) {
    const type = ev['type'] as string;

    if (type === 'tray_refill') {
      const pieces = ev['pieces'] as string[];
      tray[0] = pieces[0]; tray[1] = pieces[1]; tray[2] = pieces[2];

    } else if (type === 'place') {
      const piece  = ev['piece'] as string;
      const anchor = ev['anchor'] as [number, number];
      const [r, c] = anchor;
      const slot   = ev['slot'] as number;

      // Place (force-place even if illegal, to tolerate corrupted records)
      for (const [dr, dc] of pieceOffsets(piece)) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && rr < n && cc >= 0 && cc < n) {
          grid[rr][cc] = true;
        }
      }

      // Find full rows and cols, clear simultaneously
      const fullRows: number[] = [];
      for (let i = 0; i < n; i++) {
        if (grid[i].every(v => v)) fullRows.push(i);
      }
      const fullCols: number[] = [];
      for (let j = 0; j < n; j++) {
        if (grid.every(row => row[j])) fullCols.push(j);
      }
      for (const i of fullRows) {
        for (let j = 0; j < n; j++) grid[i][j] = false;
      }
      for (const j of fullCols) {
        for (let i = 0; i < n; i++) grid[i][j] = false;
      }

      tray[slot] = null;

      history.push({
        piece,
        anchor,
        trayAfter: [...tray],
        gridAfter: grid.map(row => [...row]),
      });

    } else if (type === 'game_over') {
      stuckWith = tray.filter((p): p is string => p !== null);
      hasDeath  = true;
    }
  }

  return { history, stuckWith, hasDeath };
}

// ─── DFS search ───────────────────────────────────────────────────────────────

interface SearchState {
  nodesLeft:  number;
  deadline:   number;
  deadMemo:   Set<string>;
  nodeCount:  number;
}

function survives(
  mask:      Uint16Array,
  n:         number,
  tray:      string[],        // current group (free order)
  groups:    string[][],      // remaining future groups (ordered)
  groupIdx:  number,          // index into the canonical groups array for memoization
  ss:        SearchState,
): CoachStep[] | null {
  if (tray.length === 0) {
    if (groupIdx >= groups.length) return [];
    return survives(mask, n, [...groups[groupIdx]], groups, groupIdx + 1, ss);
  }

  if (ss.nodesLeft <= 0) return null;

  // Check wall-clock budget every 1024 nodes
  if ((ss.nodeCount & 1023) === 0 && Date.now() > ss.deadline) {
    ss.nodesLeft = 0;
    return null;
  }

  // Memoize dead states only (never a live state)
  const sortedTray = [...tray].sort().join('|');
  const memoKey = maskKey(mask) + '/' + groupIdx + '/' + sortedTray;
  if (ss.deadMemo.has(memoKey)) return null;

  ss.nodesLeft--;
  ss.nodeCount++;

  // Sort pieces by fewest legal anchors first (fail-fast)
  const unique = [...new Set(tray)];
  const byAnchors = unique.map(p => ({ p, anchors: legalAnchors(mask, n, p) }));
  byAnchors.sort((a, b) => a.anchors.length - b.anchors.length);

  for (const { p, anchors } of byAnchors) {
    const rest = [...tray];
    const idx  = rest.indexOf(p);
    rest.splice(idx, 1);

    for (const [r, c] of anchors) {
      const mask2 = cloneMask(mask);
      placeAndClearMask(mask2, n, p, r, c);
      const w = survives(mask2, n, rest, groups, groupIdx, ss);
      if (w !== null) return [{ piece: p, anchor: [r, c] }, ...w];
    }
  }

  // All options exhausted → dead state
  ss.deadMemo.add(memoKey);
  return null;
}

// ─── counterfactual ───────────────────────────────────────────────────────────

interface CFResult {
  R:          number;
  survivable: boolean;
  witness:    CoachStep[] | null;
  exhausted:  boolean;
}

const NODE_CAP  = 400_000;
const TIME_CAP  = 2000; // ms

function counterfactual(
  n:         number,
  history:   HistoryEntry[],
  stuckWith: string[],
): { results: CFResult[]; totalNodes: number } {
  let totalNodes = 0;

  const results: CFResult[] = [];
  for (let R = 1; R <= 4; R++) {
    if (R > history.length) break;

    // Grid state before the last R placements
    const startGrid =
      R < history.length
        ? history[history.length - R - 1].gridAfter
        : Array.from({ length: n }, () => Array(n).fill(false) as boolean[]);

    const mask = boolGridToMask(startGrid, n);

    // Build piece groups from the window
    const window = history.slice(history.length - R);

    const groups: string[][] = [];
    let cur: string[] = [];
    for (const h of window) {
      cur.push(h.piece);
      if (h.trayAfter.every(p => p === null)) {
        groups.push(cur);
        cur = [];
      }
    }
    cur.push(...stuckWith);
    if (cur.length > 0) groups.push(cur);
    if (groups.length === 0) groups.push([...stuckWith]);

    const ss: SearchState = {
      nodesLeft: NODE_CAP,
      deadline:  Date.now() + TIME_CAP,
      deadMemo:  new Set(),
      nodeCount: 0,
    };

    const w = survives(mask, n, [...groups[0]], groups, 1, ss);
    const exhausted = ss.nodesLeft <= 0;

    totalNodes += NODE_CAP - ss.nodesLeft;

    results.push({ R, survivable: w !== null, witness: w, exhausted });

    if (w !== null) break;
  }

  return { results, totalNodes };
}

// ─── refuge metric ────────────────────────────────────────────────────────────

function computeRefugeLostMovesBeforeEnd(history: HistoryEntry[], n: number): number | null {
  const sq3offsets: [number, number][] = [
    [0,0],[0,1],[0,2],
    [1,0],[1,1],[1,2],
    [2,0],[2,1],[2,2],
  ];

  function sq3Fits(grid: boolean[][]): boolean {
    for (let r = 0; r <= n - 3; r++) {
      for (let c = 0; c <= n - 3; c++) {
        if (sq3offsets.every(([dr, dc]) => !grid[r + dr][c + dc])) return true;
      }
    }
    return false;
  }

  // Scan backwards from the final grid
  for (let i = history.length - 1; i >= 0; i--) {
    if (sq3Fits(history[i].gridAfter)) {
      return (history.length - 1) - i;   // how many moves before the end
    }
  }
  return null; // sq3 never fit (or empty history)
}

// ─── main entry point ─────────────────────────────────────────────────────────

export function analyseGame(record: GameRecord): CoachResult {
  const t0 = Date.now();

  const { history, stuckWith, hasDeath } = replayRecord(record);
  const n = record.grid_size;

  if (!hasDeath || history.length === 0) {
    return {
      verdict:                  'inconclusive',
      stuckWith,
      refugeLostMovesBeforeEnd: null,
      searchedNodes:            0,
      elapsedMs:                Date.now() - t0,
    };
  }

  const refugeLostMovesBeforeEnd = computeRefugeLostMovesBeforeEnd(history, n);

  const { results, totalNodes } = counterfactual(n, history, stuckWith);

  const last    = results[results.length - 1];
  const anyBust = results.some(r => r.exhausted);

  let verdict: CoachResult['verdict'];
  let rewind: number | undefined;
  let fatalActual: CoachStep | undefined;
  let gridBeforeFatal: boolean[][] | undefined;
  let witness: CoachStep[] | undefined;

  if (last.survivable && last.witness !== null) {
    verdict     = 'avoidable';
    rewind      = last.R;
    const R     = last.R;
    fatalActual = { piece: history[history.length - R].piece, anchor: history[history.length - R].anchor };
    gridBeforeFatal =
      R < history.length
        ? history[history.length - R - 1].gridAfter
        : Array.from({ length: n }, () => Array(n).fill(false) as boolean[]);
    witness     = last.witness;
  } else if (anyBust) {
    verdict = 'inconclusive';
  } else {
    verdict = 'forced';
  }

  return {
    verdict,
    rewind,
    fatalActual,
    gridBeforeFatal,
    witness,
    stuckWith,
    refugeLostMovesBeforeEnd,
    searchedNodes: totalNodes,
    elapsedMs:     Date.now() - t0,
  };
}
