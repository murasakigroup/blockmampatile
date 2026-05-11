import { loadGame, loadAllGames, gameToYAML } from './recorder.js';

const SYNCED_KEY    = 'bm-synced-ids';
const SYNC_URL_KEY  = 'bm-sync-url';
const TOKEN_KEY     = 'bm-sync-token';

export function loadSyncedIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SYNCED_KEY) ?? '[]')); }
  catch { return new Set(); }
}

export function isSyncConfigured(): boolean {
  return !!(localStorage.getItem(SYNC_URL_KEY) && localStorage.getItem(TOKEN_KEY));
}

export function clearSyncedIds(): void {
  localStorage.removeItem(SYNCED_KEY);
}

export async function syncOneGame(gameId: string): Promise<boolean> {
  const url   = localStorage.getItem(SYNC_URL_KEY);
  const token = localStorage.getItem(TOKEN_KEY);
  if (!url || !token) return false;
  const game  = loadGame(gameId);
  if (!game) return false;
  try {
    const res = await fetch(`${url}/sync`, {
      method:  'POST',
      headers: {
        'Content-Type':  'text/yaml',
        'Authorization': `Bearer ${token}`,
        'X-Game-Id':     gameId,
      },
      body: gameToYAML(game),
    });
    if (res.ok) { markSynced(gameId); return true; }
    return false;
  } catch {
    return false;
  }
}

function markSynced(id: string): void {
  const ids = loadSyncedIds();
  ids.add(id);
  localStorage.setItem(SYNCED_KEY, JSON.stringify([...ids]));
}

// Reads bm-sync-token / bm-sync-url from URL params on first load, saves to
// localStorage, then strips the params so they don't linger in the address bar.
export function initSyncParams(): void {
  const params = new URLSearchParams(window.location.search);
  const token  = params.get('bm-sync-token');
  const url    = params.get('bm-sync-url');
  if (!token && !url) return;
  if (token) localStorage.setItem(TOKEN_KEY,    token);
  if (url)   localStorage.setItem(SYNC_URL_KEY, url);
  params.delete('bm-sync-token');
  params.delete('bm-sync-url');
  const qs     = params.toString();
  const newUrl = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
  history.replaceState(null, '', newUrl);
}

// Fire-and-forget POST for game-end — sendBeacon survives tab close.
// Token and game_id go in query params because sendBeacon can't set headers.
export function triggerBeaconSync(gameId: string): void {
  const url   = localStorage.getItem(SYNC_URL_KEY);
  const token = localStorage.getItem(TOKEN_KEY);
  if (!url || !token) return;
  const game  = loadGame(gameId);
  if (!game) return;
  const blob  = new Blob([gameToYAML(game)], { type: 'text/yaml' });
  navigator.sendBeacon(
    `${url}/sync?token=${encodeURIComponent(token)}&game_id=${gameId}`,
    blob,
  );
}

// Diff game index against synced IDs; POST each pending game via fetch.
// Silent on network failure — leaves pending for the next trigger.
export async function syncPendingGames(): Promise<void> {
  const url   = localStorage.getItem(SYNC_URL_KEY);
  const token = localStorage.getItem(TOKEN_KEY);
  if (!url || !token) return;

  const synced  = loadSyncedIds();
  const pending = loadAllGames().filter(g => !synced.has(g.game_id));

  for (const game of pending) {
    try {
      const res = await fetch(`${url}/sync`, {
        method:  'POST',
        headers: {
          'Content-Type':  'text/yaml',
          'Authorization': `Bearer ${token}`,
          'X-Game-Id':     game.game_id,
        },
        body: gameToYAML(game),
      });
      if (res.ok) markSynced(game.game_id);
    } catch {
      break;
    }
  }
}
