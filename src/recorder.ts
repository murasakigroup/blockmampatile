
// ─── ULID ────────────────────────────────────────────────────────────────────

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function generateULID(): string {
  let t = Date.now();
  let s = '';
  for (let i = 9; i >= 0; i--) { s = B32[t & 0x1f] + s; t = Math.floor(t / 32); }
  for (let i = 0; i < 16; i++) s += B32[Math.random() * 32 | 0];
  return s;
}

// ─── YAML stringifier ────────────────────────────────────────────────────────

function yamlScalar(v: unknown): string {
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return String(v);
  if (v === null || v === undefined) return 'null';
  const s = String(v);
  if (s === '' || s === 'true' || s === 'false' || s === 'null' ||
      /[:{}\[\],#\n]/.test(s) || /^[\d\-]/.test(s)) {
    return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }
  return s;
}

function yamlFlow(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(yamlFlow).join(', ') + ']';
  if (v !== null && typeof v === 'object') {
    return '{ ' + Object.entries(v as object)
      .map(([k, val]) => `${k}: ${yamlFlow(val)}`).join(', ') + ' }';
  }
  return yamlScalar(v);
}

// ─── types ───────────────────────────────────────────────────────────────────

interface RecordedEvent {
  t:    number;
  type: string;
  [key: string]: unknown;
}

export interface GameRecord {
  schema_version:    number;
  game_id:           string;
  mode:              string;
  grid_size:         number;
  seed:              number;
  piece_pool_version: number;
  started_at:        string;
  ended_at:          string;
  final_score:       number;
  final_best:        number;
  events:            RecordedEvent[];
}

export interface Recorder {
  event(type: string, payload?: Record<string, unknown>): void;
  finish(finalScore: number, finalBest: number): void;
  flush(): void;
}

// ─── storage ─────────────────────────────────────────────────────────────────

const INDEX_KEY = 'bm-games-index';
const INDEX_CAP = 200;

function loadIndex(): string[] {
  try { return JSON.parse(localStorage.getItem(INDEX_KEY) ?? '[]'); }
  catch { return []; }
}

function persistGame(record: GameRecord): void {
  localStorage.setItem(`bm-game-${record.game_id}`, JSON.stringify(record));
  const index = loadIndex();
  if (!index.includes(record.game_id)) {
    index.push(record.game_id);
    while (index.length > INDEX_CAP) {
      localStorage.removeItem(`bm-game-${index.shift()!}`);
    }
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  }
}

export function loadGame(id: string): GameRecord | null {
  try {
    const raw = localStorage.getItem(`bm-game-${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function loadAllGames(): GameRecord[] {
  return loadIndex().map(loadGame).filter(Boolean) as GameRecord[];
}

export function deleteGame(id: string): void {
  localStorage.removeItem(`bm-game-${id}`);
  const index = loadIndex().filter(i => i !== id);
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

// ─── export ───────────────────────────────────────────────────────────────────

export function gameToYAML(record: GameRecord): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (key === 'events') {
      lines.push('events:');
      for (const ev of record.events) lines.push('  - ' + yamlFlow(ev));
    } else {
      lines.push(`${key}: ${yamlScalar(value)}`);
    }
  }
  return lines.join('\n') + '\n';
}

export function exportAllJSON(): string {
  return JSON.stringify(loadAllGames(), null, 2);
}

// ─── factory ─────────────────────────────────────────────────────────────────

export const PIECE_POOL_VERSION = 1;

export function createRecorder(mode: string, gridSize: number): Recorder {
  const gameId    = generateULID();
  const startedAt = new Date().toISOString();
  const startMs   = performance.now();
  const seed      = Math.random() * 0xffffffff | 0;

  const record: GameRecord = {
    schema_version:     1,
    game_id:            gameId,
    mode,
    grid_size:          gridSize,
    seed,
    piece_pool_version: PIECE_POOL_VERSION,
    started_at:         startedAt,
    ended_at:           '',
    final_score:        0,
    final_best:         0,
    events:             [],
  };

  let saved = false;

  const rec: Recorder = {
    event(type, payload = {}) {
      record.events.push({ t: Math.round(performance.now() - startMs), type, ...payload });
    },
    finish(finalScore, finalBest) {
      if (saved) return;
      saved = true;
      record.ended_at    = new Date().toISOString();
      record.final_score = finalScore;
      record.final_best  = finalBest;
      rec.event('game_over', { final_score: finalScore, reason: 'no_piece_fits' });
      persistGame(record);
    },
    flush() {
      if (saved || record.events.length === 0) return;
      saved = true;
      record.ended_at = new Date().toISOString();
      persistGame(record);
    },
  };

  return rec;
}
