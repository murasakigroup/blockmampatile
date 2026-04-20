
export type PowerupKind = 'rocket' | 'bomb' | 'colourBurst';

export interface Cell {
  colour:  string;
  powerup?: PowerupKind;
}

export type Grid = (Cell | null)[][];

export function createGrid(): Grid {
  return Array.from({ length: 8 }, () => Array(8).fill(null));
}

export function createDemoGrid(): Grid {
  const g = createGrid();

  // Scattered blocks using jewel tones to show variety
  const placements: [number, number, string][] = [
    // Bottom-left cluster (emerald L-shape)
    [6, 0, '#1db85c'], [7, 0, '#1db85c'], [7, 1, '#1db85c'],
    // Bottom-right cluster (sapphire 2×2)
    [6, 6, '#2457c5'], [6, 7, '#2457c5'], [7, 6, '#2457c5'], [7, 7, '#2457c5'],
    // Mid-left vertical bar (amethyst 1×3)
    [3, 1, '#8b3fc8'], [4, 1, '#8b3fc8'], [5, 1, '#8b3fc8'],
    // Mid-right T-shape (amber)
    [3, 5, '#d4820a'], [3, 6, '#d4820a'], [3, 7, '#d4820a'], [4, 6, '#d4820a'],
    // Top-left horizontal (ruby 1×4)
    [0, 0, '#c0152f'], [0, 1, '#c0152f'], [0, 2, '#c0152f'], [0, 3, '#c0152f'],
    // Top-right dot (teal)
    [1, 7, '#0d9488'],
    // Centre-ish plus (gold)
    [3, 3, '#c8993f'], [2, 3, '#c8993f'], [4, 3, '#c8993f'],
    [3, 2, '#c8993f'], [3, 4, '#c8993f'],
    // Row 5 partial (deep rose)
    [5, 4, '#b8215a'], [5, 5, '#b8215a'],
  ];

  for (const [r, c, colour] of placements) {
    g[r][c] = { colour };
  }

  return g;
}
