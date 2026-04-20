
export interface InputBuffer {
  down:   { x: number; y: number } | null;
  move:   { x: number; y: number } | null;
  up:     { x: number; y: number } | null;
  cancel: boolean;
}

export function createInputBuffer(): InputBuffer {
  return { down: null, move: null, up: null, cancel: false };
}

export function clearInputBuffer(buf: InputBuffer): void {
  buf.down   = null;
  buf.move   = null;
  buf.up     = null;
  buf.cancel = false;
}

export function attachInputHandlers(
  canvas: HTMLCanvasElement,
  buf: InputBuffer,
): void {
  let rect = canvas.getBoundingClientRect();

  function cssPos(e: PointerEvent): { x: number; y: number } {
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    rect = canvas.getBoundingClientRect();
    buf.down = cssPos(e);
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    e.preventDefault();
    buf.move = cssPos(e);
  });

  canvas.addEventListener('pointerup', (e) => {
    e.preventDefault();
    buf.up = cssPos(e);
  });

  canvas.addEventListener('pointercancel', () => {
    buf.cancel = true;
  });
}
