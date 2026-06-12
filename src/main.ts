
import { createInitialState, GameState } from './state.js';
import type { Phase } from './state.js';
import { createInputBuffer, attachInputHandlers } from './input.js';
import { processInput, update } from './game.js';
import { renderGame } from './renderer.js';
import { computeLayout } from './layout.js';
import { loadAllGames, loadGame, deleteGame, gameToYAML, exportAllJSON } from './recorder.js';
import { initSyncParams, syncPendingGames, syncOneGame, loadSyncedIds, isSyncConfigured } from './sync.js';
import { analyseGame, CoachResult, CoachStep } from './coach.js';
import { PIECES } from './pieces.js';

// Phase is a const enum. Vite bundles main.ts itself via esbuild (no cross-file
// const-enum inlining) while resolving './state.js' to the tsc-emitted artifact,
// which has the enum erased — so a runtime Phase reference here cannot resolve.
// Literal mirrors Phase.GAME_OVER; renderer.ts can use the enum because its
// tsc-emitted renderer.js (with values inlined) is what gets bundled.
const PHASE_GAME_OVER = 3 as Phase;

function sizeCanvas(canvas: HTMLCanvasElement): void {
  const dpr = window.devicePixelRatio || 1;
  const w   = window.innerWidth;
  const h   = window.innerHeight;
  canvas.width        = Math.floor(w * dpr);
  canvas.height       = Math.floor(h * dpr);
  canvas.style.width  = `${w}px`;
  canvas.style.height = `${h}px`;
}

// ─── logs modal ──────────────────────────────────────────────────────────────

function buildSyncIndicator(_gameId: string, synced: boolean): HTMLButtonElement {
  const btn = document.createElement('button');
  Object.assign(btn.style, {
    background:   'none',
    border:       'none',
    cursor:       synced ? 'default' : 'pointer',
    fontSize:     '15px',
    padding:      '0 2px',
    lineHeight:   '1',
    flexShrink:   '0',
    opacity:      synced ? '1' : '0.7',
  });
  if (synced) {
    btn.textContent = '✓';
    btn.title       = 'Synced to laptop';
    btn.style.color = '#4caf50';
  } else {
    btn.textContent = '⇡';
    btn.title       = 'Not synced — click to sync';
    btn.style.color = '#7070b0';
  }
  return btn;
}

function setSyncState(btn: HTMLButtonElement, state: 'syncing' | 'synced' | 'failed'): void {
  if (state === 'syncing') {
    btn.textContent  = '↻';
    btn.title        = 'Syncing…';
    btn.style.color  = '#7070b0';
    btn.style.cursor = 'default';
    btn.disabled     = true;
  } else if (state === 'synced') {
    btn.textContent  = '✓';
    btn.title        = 'Synced to laptop';
    btn.style.color  = '#4caf50';
    btn.style.cursor = 'default';
    btn.style.opacity = '1';
    btn.disabled     = true;
  } else {
    btn.textContent  = '⚠';
    btn.title        = 'Sync failed — click to retry';
    btn.style.color  = '#c07030';
    btn.style.cursor = 'pointer';
    btn.style.opacity = '1';
    btn.disabled     = false;
  }
}

function buildLogsModal(state: GameState): HTMLElement {
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position:        'fixed',
    inset:           '0',
    background:      'rgba(5,5,18,0.96)',
    color:           '#c0c0e0',
    fontFamily:      'system-ui, sans-serif',
    display:         'flex',
    flexDirection:   'column',
    zIndex:          '100',
    overflowY:       'hidden',
  });

  const syncEnabled = isSyncConfigured();
  const games       = loadAllGames().reverse();
  const syncedIds   = loadSyncedIds();

  // Map of gameId → sync indicator button, so Sync All can update them
  const indicators  = new Map<string, HTMLButtonElement>();

  // ── Header ────────────────────────────────────────────────────────────────
  const header = document.createElement('div');
  Object.assign(header.style, {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    padding:        '14px 20px',
    borderBottom:   '1px solid #1e1e3a',
    flexShrink:     '0',
    gap:            '10px',
  });

  const title = document.createElement('span');
  title.textContent = 'Game Logs';
  Object.assign(title.style, { fontWeight: 'bold', fontSize: '17px', marginRight: 'auto' });

  const headerRight = document.createElement('div');
  Object.assign(headerRight.style, { display: 'flex', gap: '10px', alignItems: 'center' });

  // Sync All button — only shown when sync is configured
  if (syncEnabled) {
    const pendingCount = games.filter(g => !syncedIds.has(g.game_id)).length;
    const syncAllBtn   = document.createElement('button');
    styleSecondaryBtn(syncAllBtn);
    const updateSyncAllLabel = () => {
      const n = [...indicators.entries()].filter(([, btn]) => btn.textContent === '⇡' || btn.textContent === '⚠').length;
      syncAllBtn.textContent = n > 0 ? `⇡ Sync ${n}` : '✓ All synced';
      syncAllBtn.disabled    = n === 0;
    };
    updateSyncAllLabel();
    if (pendingCount === 0) syncAllBtn.disabled = true;

    syncAllBtn.addEventListener('click', async () => {
      syncAllBtn.disabled = true;
      for (const [gameId, indicator] of indicators) {
        if (indicator.textContent === '⇡' || indicator.textContent === '⚠') {
          setSyncState(indicator, 'syncing');
          const ok = await syncOneGame(gameId);
          setSyncState(indicator, ok ? 'synced' : 'failed');
          updateSyncAllLabel();
        }
      }
    });
    headerRight.append(syncAllBtn);
  }

  const exportBtn = document.createElement('button');
  exportBtn.textContent = 'Export JSON';
  styleSecondaryBtn(exportBtn);
  exportBtn.addEventListener('click', () => {
    const blob = new Blob([exportAllJSON()], { type: 'application/json' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `blockmampatile-games-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  Object.assign(closeBtn.style, {
    background: 'none', border: 'none', color: '#8080b0',
    fontSize: '20px', cursor: 'pointer', padding: '4px 8px', lineHeight: '1',
  });
  closeBtn.addEventListener('click', () => { state.showLogs = false; overlay.remove(); });

  headerRight.append(exportBtn, closeBtn);
  header.append(title, headerRight);

  // ── Scrollable list ────────────────────────────────────────────────────────
  const list = document.createElement('div');
  Object.assign(list.style, { overflowY: 'auto', flex: '1', padding: '12px 20px' });

  if (games.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No games recorded yet.';
    Object.assign(empty.style, { color: '#44447a', marginTop: '20px', textAlign: 'center' });
    list.append(empty);
  } else {
    for (const game of games) {
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '10px 0', borderBottom: '1px solid #12122a',
        fontSize: '13px', flexWrap: 'wrap',
      });

      const info = document.createElement('span');
      const date = game.started_at ? new Date(game.started_at).toLocaleString() : '';
      info.textContent = `${game.mode} ${game.grid_size}×${game.grid_size}  ·  score ${game.final_score}  ·  ${date}`;
      Object.assign(info.style, { flex: '1', minWidth: '160px', color: '#9090c0' });

      const copyBtn = document.createElement('button');
      copyBtn.textContent = 'Copy YAML';
      styleSecondaryBtn(copyBtn);
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(gameToYAML(game)).catch(() => {});
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy YAML'; }, 1400);
      });

      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';
      styleSecondaryBtn(delBtn, true);
      delBtn.addEventListener('click', () => { deleteGame(game.game_id); row.remove(); });

      row.append(info, copyBtn, delBtn);

      if (syncEnabled) {
        const synced    = syncedIds.has(game.game_id);
        const indicator = buildSyncIndicator(game.game_id, synced);
        indicators.set(game.game_id, indicator);

        if (!synced) {
          indicator.addEventListener('click', async () => {
            setSyncState(indicator, 'syncing');
            const ok = await syncOneGame(game.game_id);
            setSyncState(indicator, ok ? 'synced' : 'failed');
          });
        }

        row.append(indicator);
      }

      list.append(row);
    }
  }

  overlay.append(header, list);
  return overlay;
}

function styleSecondaryBtn(btn: HTMLButtonElement, danger = false): void {
  Object.assign(btn.style, {
    background:   'none',
    border:       `1px solid ${danger ? '#442244' : '#1e1e4a'}`,
    color:        danger ? '#8060a0' : '#6060a0',
    borderRadius: '6px',
    padding:      '4px 10px',
    fontSize:     '12px',
    cursor:       'pointer',
    whiteSpace:   'nowrap',
  });
}

// ─── coach modal ─────────────────────────────────────────────────────────────

function drawMiniBoard(
  canvas: HTMLCanvasElement,
  grid:   boolean[][],
  highlight: { cells: [number, number][]; colour: string },
): void {
  const n    = grid.length;
  const size = Math.floor(canvas.width / n);
  const ctx  = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      ctx.fillStyle = grid[r][c] ? '#3a3a6a' : '#11112a';
      ctx.fillRect(c * size + 1, r * size + 1, size - 2, size - 2);
    }
  }
  ctx.fillStyle = highlight.colour;
  for (const [r, c] of highlight.cells) {
    ctx.fillRect(c * size + 1, r * size + 1, size - 2, size - 2);
  }
}

function stepCells(step: CoachStep, _n: number): [number, number][] {
  const offsets = PIECES.find(p => p.name === step.piece)?.offsets ?? [];
  const [ar, ac] = step.anchor;
  return offsets.map(([dr, dc]) => [ar + dr, ac + dc] as [number, number]);
}

function buildCoachModal(result: CoachResult, gridSize: number): HTMLElement {
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position:        'fixed',
    inset:           '0',
    background:      'rgba(5,5,18,0.96)',
    color:           '#c0c0e0',
    fontFamily:      'system-ui, sans-serif',
    display:         'flex',
    flexDirection:   'column',
    zIndex:          '100',
    overflowY:       'auto',
  });

  // ── Header ───────────────────────────────────────────────────────────────
  const header = document.createElement('div');
  Object.assign(header.style, {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    padding:        '14px 20px',
    borderBottom:   '1px solid #1e1e3a',
    flexShrink:     '0',
    gap:            '10px',
  });

  const title = document.createElement('span');
  title.textContent = '🧠 Coach';
  Object.assign(title.style, { fontWeight: 'bold', fontSize: '17px' });

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  Object.assign(closeBtn.style, {
    background: 'none', border: 'none', color: '#8080b0',
    fontSize: '20px', cursor: 'pointer', padding: '4px 8px', lineHeight: '1',
  });
  closeBtn.addEventListener('click', () => overlay.remove());

  header.append(title, closeBtn);

  // ── Body ─────────────────────────────────────────────────────────────────
  const body = document.createElement('div');
  Object.assign(body.style, { padding: '20px', flex: '1' });

  const para = (text: string): HTMLParagraphElement => {
    const p = document.createElement('p');
    p.textContent = text;
    Object.assign(p.style, { margin: '8px 0', lineHeight: '1.5', color: '#c0c0e0' });
    return p;
  };

  // Verdict headline
  let headlineText: string;
  if (result.verdict === 'avoidable' && result.rewind !== undefined) {
    headlineText = `You could have survived — the slip came ${result.rewind} move(s) before the end.`;
  } else if (result.verdict === 'forced') {
    headlineText = `That death was forced — nothing in your last 4 placements could have saved you.`;
  } else {
    headlineText = `Analysis hit its time limit — no verdict.`;
  }
  const headline = para(headlineText);
  Object.assign(headline.style, { fontSize: '15px', fontWeight: 'bold', marginBottom: '12px' });

  body.append(headline);

  // Stuck line
  if (result.stuckWith.length > 0) {
    body.append(para(`You were stuck holding: ${result.stuckWith.join(', ')}.`));
  }

  // Refuge line
  if (result.refugeLostMovesBeforeEnd !== null) {
    const M = result.refugeLostMovesBeforeEnd;
    const refugeText = M === 0
      ? `Your board still had a 3×3 opening at the end — the killer was shape-specific.`
      : `Your last 3×3 opening disappeared ${M} move(s) before the end.`;
    body.append(para(refugeText));
  }

  // Mini boards — only for avoidable verdicts
  if (
    result.verdict === 'avoidable' &&
    result.gridBeforeFatal &&
    result.fatalActual &&
    result.witness &&
    result.witness.length > 0
  ) {
    const boards = document.createElement('div');
    Object.assign(boards.style, {
      display:        'flex',
      gap:            '24px',
      marginTop:      '20px',
      flexWrap:       'wrap',
    });

    const MINI = 180;
    const cellPx = Math.floor(MINI / gridSize);
    const actualPx = cellPx * gridSize;

    function makeBoard(
      caption: string,
      grid:    boolean[][],
      highlight: { cells: [number, number][]; colour: string },
    ): HTMLDivElement {
      const wrap = document.createElement('div');
      Object.assign(wrap.style, { display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' });

      const label = document.createElement('span');
      label.textContent = caption;
      Object.assign(label.style, { fontSize: '12px', color: '#8080b0', textAlign: 'center' });

      const cv = document.createElement('canvas');
      cv.width  = actualPx;
      cv.height = actualPx;
      Object.assign(cv.style, { width: `${actualPx}px`, height: `${actualPx}px`, borderRadius: '4px' });

      drawMiniBoard(cv, grid, highlight);
      wrap.append(label, cv);
      return wrap;
    }

    // Left: what you played
    const fatalCells = stepCells(result.fatalActual, gridSize);
    const leftBoard  = makeBoard('What you played', result.gridBeforeFatal,
      { cells: fatalCells, colour: '#c0152f' });

    // Under left board: name the fatal placement (mirrors the right board's caption)
    const fa = result.fatalActual;
    const faText = document.createElement('span');
    faText.textContent = `${fa.piece} at (${fa.anchor[0]},${fa.anchor[1]})`;
    Object.assign(faText.style, { fontSize: '11px', color: '#9090c0', textAlign: 'center' });
    leftBoard.append(faText);

    // Right: what survives
    const witnessCells = stepCells(result.witness[0], gridSize);
    const rightWrap    = makeBoard('What survives', result.gridBeforeFatal,
      { cells: witnessCells, colour: '#1db85c' });

    // Under right board: textual witness steps
    const w0 = result.witness[0];
    const w0text = document.createElement('span');
    w0text.textContent = `Instead: ${w0.piece} at (${w0.anchor[0]},${w0.anchor[1]})`;
    Object.assign(w0text.style, { fontSize: '11px', color: '#9090c0', textAlign: 'center' });
    rightWrap.append(w0text);

    if (result.witness.length > 1) {
      const rest = result.witness.slice(1)
        .map((s: CoachStep) => `${s.piece} (${s.anchor[0]},${s.anchor[1]})`).join(', ');
      const thenText = document.createElement('span');
      thenText.textContent = `then: ${rest}`;
      Object.assign(thenText.style, { fontSize: '11px', color: '#7070a0', textAlign: 'center', maxWidth: `${actualPx}px` });
      rightWrap.append(thenText);
    }

    boards.append(leftBoard, rightWrap);
    body.append(boards);
  }

  overlay.append(header, body);
  return overlay;
}

// ─── main ─────────────────────────────────────────────────────────────────────

function main(): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  if (!canvas) throw new Error('#game canvas not found');

  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  if (!ctx) throw new Error('No 2D context');

  sizeCanvas(canvas);

  initSyncParams();
  syncPendingGames().catch(() => {});

  const state = createInitialState();
  const input = createInputBuffer();

  attachInputHandlers(canvas, input);

  // ── Coach button ─────────────────────────────────────────────────────────
  const coachBtn = document.createElement('button');
  coachBtn.textContent = '🧠 Coach';
  Object.assign(coachBtn.style, {
    position:     'fixed',
    top:          '12px',
    right:        '12px',
    background:   'none',
    border:       '1px solid #1e1e4a',
    color:        '#6060a0',
    borderRadius: '6px',
    padding:      '4px 10px',
    fontSize:     '13px',
    cursor:       'pointer',
    whiteSpace:   'nowrap',
    display:      'none',
    zIndex:       '50',
  });
  coachBtn.addEventListener('click', () => {
    if (!state.lastGameId) return;
    const existing = document.getElementById('coach-modal');
    if (existing) return;

    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position:        'fixed',
      inset:           '0',
      background:      'rgba(5,5,18,0.96)',
      color:           '#c0c0e0',
      fontFamily:      'system-ui, sans-serif',
      display:         'flex',
      flexDirection:   'column',
      zIndex:          '100',
      overflowY:       'auto',
    });
    overlay.id = 'coach-modal';

    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 20px', borderBottom: '1px solid #1e1e3a', flexShrink: '0',
    });
    const hTitle = document.createElement('span');
    hTitle.textContent = '🧠 Coach';
    Object.assign(hTitle.style, { fontWeight: 'bold', fontSize: '17px' });
    const hClose = document.createElement('button');
    hClose.textContent = '✕';
    Object.assign(hClose.style, {
      background: 'none', border: 'none', color: '#8080b0',
      fontSize: '20px', cursor: 'pointer', padding: '4px 8px', lineHeight: '1',
    });
    hClose.addEventListener('click', () => overlay.remove());
    header.append(hTitle, hClose);

    const bodyEl = document.createElement('div');
    Object.assign(bodyEl.style, { padding: '20px', flex: '1' });
    const analysing = document.createElement('p');
    analysing.textContent = 'Analysing…';
    Object.assign(analysing.style, { color: '#8080b0', fontStyle: 'italic' });
    bodyEl.append(analysing);

    overlay.append(header, bodyEl);
    document.body.append(overlay);

    // Yield to paint, then run analysis
    setTimeout(() => {
      const record = loadGame(state.lastGameId!);
      if (!record) {
        analysing.textContent = 'Game record not found.';
        return;
      }
      const result     = analyseGame(record);
      const filled     = buildCoachModal(result, record.grid_size);
      // Swap in the real modal content
      overlay.replaceWith(filled);
      filled.id = 'coach-modal';
    }, 0);
  });
  document.body.append(coachBtn);

  window.addEventListener('resize', () => sizeCanvas(canvas));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      state.recorder?.flush();
    } else {
      syncPendingGames().catch(() => {});
    }
  });

  let lastTime = 0;

  function loop(timestamp: number): void {
    const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;

    const dpr    = window.devicePixelRatio || 1;
    const w      = canvas.width / dpr;
    const h      = canvas.height / dpr;
    const layout = computeLayout(w, h, state.gridSize);

    processInput(state, input, layout, w);
    update(state, dt);
    renderGame(ctx, canvas, state, layout);

    // Open logs modal when game signals it
    if (state.showLogs && !document.getElementById('logs-modal')) {
      const modal = buildLogsModal(state);
      modal.id    = 'logs-modal';
      document.body.append(modal);
    }

    // Coach button visibility: only in GAME_OVER with a saved game
    coachBtn.style.display =
      (state.phase === PHASE_GAME_OVER && state.lastGameId !== null) ? 'block' : 'none';

    requestAnimationFrame(loop);
  }

  // First frame: set lastTime so dt starts at 0
  requestAnimationFrame((ts) => {
    lastTime = ts;
    loop(ts);
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/blockmampatile/sw.js')
      .catch(err => console.warn('SW registration failed:', err));
  }
}

main();
