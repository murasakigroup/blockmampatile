#!/usr/bin/env node
/**
 * Usage: node scripts/coach-check.mjs <path-to-games.json>
 * Runs analyseGame on every death game and prints verdict/rewind/ms/nodes.
 */
import { readFileSync } from 'fs';
import { analyseGame } from '../src/coach.js';

const [,, gamesPath] = process.argv;
if (!gamesPath) {
  console.error('Usage: node scripts/coach-check.mjs <path-to-games.json>');
  process.exit(1);
}

const games = JSON.parse(readFileSync(gamesPath, 'utf8'));

for (const record of games) {
  const hasGameOver = record.events.some(e => e.type === 'game_over');
  if (!hasGameOver) continue;

  const result = analyseGame(record);
  const shortId = record.game_id.slice(-6);
  const score   = record.final_score;
  const verdict = result.verdict;
  const rewind  = result.rewind ?? '-';
  const ms      = result.elapsedMs;
  const nodes   = result.searchedNodes;

  console.log(`${shortId} (${score}): verdict=${verdict} rewind=${rewind} ms=${ms} nodes=${nodes}`);
}
