
import { createInitialState } from './state.js';
import { createInputBuffer, attachInputHandlers } from './input.js';
import { processInput, update } from './game.js';
import { renderGame } from './renderer.js';
import { computeLayout } from './layout.js';

function sizeCanvas(canvas: HTMLCanvasElement): void {
  const dpr = window.devicePixelRatio || 1;
  const w   = window.innerWidth;
  const h   = window.innerHeight;
  canvas.width        = Math.floor(w * dpr);
  canvas.height       = Math.floor(h * dpr);
  canvas.style.width  = `${w}px`;
  canvas.style.height = `${h}px`;
}

function main(): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  if (!canvas) throw new Error('#game canvas not found');

  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  if (!ctx) throw new Error('No 2D context');

  sizeCanvas(canvas);

  const state = createInitialState();
  const input = createInputBuffer();

  attachInputHandlers(canvas, input);

  window.addEventListener('resize', () => sizeCanvas(canvas));

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
