
import { createInitialState, GameState } from './state.js';
import { createInputBuffer, attachInputHandlers } from './input.js';
import { processInput, update } from './game.js';
import { renderGame } from './renderer.js';
import { computeLayout } from './layout.js';
import { loadAllGames, deleteGame, gameToYAML, exportAllJSON } from './recorder.js';
import { initSyncParams, syncPendingGames, syncOneGame, loadSyncedIds, isSyncConfigured } from './sync.js';

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
