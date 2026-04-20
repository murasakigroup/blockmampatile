
export interface PieceDefinition {
  name: string;
  offsets: [number, number][]; // [row, col] offsets from origin
  colour: string;
}

// Jewel-tone colour palette keyed by piece family
const C = {
  dot:     '#0d9488', // teal
  line2:   '#2457c5', // sapphire
  line3:   '#8b3fc8', // amethyst
  line4:   '#c0152f', // ruby
  line5:   '#1db85c', // emerald
  sq2:     '#d4820a', // amber
  sq3:     '#b8215a', // deep rose
  lSmall:  '#c8993f', // gold
  lLarge:  '#6b3fa0', // violet
  tShape:  '#1a6b5c', // forest
  sShape:  '#b84c15', // burnt orange
  zShape:  '#1565a8', // cobalt
  plus:    '#c83f8b', // magenta
} as const;

export const PIECES: PieceDefinition[] = [
  // --- 1×1 ---
  { name: 'dot', colour: C.dot, offsets: [[0,0]] },

  // --- 1×2 / 2×1 ---
  { name: 'line-v2', colour: C.line2, offsets: [[0,0],[1,0]] },
  { name: 'line-h2', colour: C.line2, offsets: [[0,0],[0,1]] },

  // --- 1×3 / 3×1 ---
  { name: 'line-v3', colour: C.line3, offsets: [[0,0],[1,0],[2,0]] },
  { name: 'line-h3', colour: C.line3, offsets: [[0,0],[0,1],[0,2]] },

  // --- 1×4 / 4×1 ---
  { name: 'line-v4', colour: C.line4, offsets: [[0,0],[1,0],[2,0],[3,0]] },
  { name: 'line-h4', colour: C.line4, offsets: [[0,0],[0,1],[0,2],[0,3]] },

  // --- 1×5 / 5×1 ---
  { name: 'line-v5', colour: C.line5, offsets: [[0,0],[1,0],[2,0],[3,0],[4,0]] },
  { name: 'line-h5', colour: C.line5, offsets: [[0,0],[0,1],[0,2],[0,3],[0,4]] },

  // --- 2×2 square ---
  { name: 'sq2', colour: C.sq2, offsets: [[0,0],[0,1],[1,0],[1,1]] },

  // --- 3×3 square ---
  {
    name: 'sq3', colour: C.sq3,
    offsets: [
      [0,0],[0,1],[0,2],
      [1,0],[1,1],[1,2],
      [2,0],[2,1],[2,2],
    ],
  },

  // --- Small L-shapes (2×2 bounding, 3 cells, all 4 rotations) ---
  // L  (corner top-left)
  { name: 'l-small-0', colour: C.lSmall, offsets: [[0,0],[1,0],[1,1]] },
  // L rotated 90° CW
  { name: 'l-small-1', colour: C.lSmall, offsets: [[0,0],[0,1],[1,0]] },
  // L rotated 180°
  { name: 'l-small-2', colour: C.lSmall, offsets: [[0,0],[0,1],[1,1]] },
  // L rotated 270°
  { name: 'l-small-3', colour: C.lSmall, offsets: [[0,1],[1,0],[1,1]] },

  // --- Large L-shapes (3×3 bounding, 5 cells, all 4 rotations) ---
  // L standard
  { name: 'l-large-0', colour: C.lLarge, offsets: [[0,0],[1,0],[2,0],[2,1],[2,2]] },
  // L rotated 90° CW
  { name: 'l-large-1', colour: C.lLarge, offsets: [[0,0],[0,1],[0,2],[1,0],[2,0]] },
  // L rotated 180°
  { name: 'l-large-2', colour: C.lLarge, offsets: [[0,0],[0,1],[0,2],[2,2],[1,2]] },
  // L rotated 270°
  { name: 'l-large-3', colour: C.lLarge, offsets: [[0,2],[1,2],[2,0],[2,1],[2,2]] },

  // --- T-shapes (4 cells, all 4 rotations) ---
  { name: 't-0', colour: C.tShape, offsets: [[0,0],[0,1],[0,2],[1,1]] },
  { name: 't-1', colour: C.tShape, offsets: [[0,0],[1,0],[2,0],[1,1]] },
  { name: 't-2', colour: C.tShape, offsets: [[0,1],[1,0],[1,1],[1,2]] },
  { name: 't-3', colour: C.tShape, offsets: [[0,0],[1,0],[2,0],[1,-1]] },

  // --- S-shape (4 cells) ---
  { name: 's-h', colour: C.sShape, offsets: [[0,1],[0,2],[1,0],[1,1]] },
  { name: 's-v', colour: C.sShape, offsets: [[0,0],[1,0],[1,1],[2,1]] },

  // --- Z-shape (4 cells) ---
  { name: 'z-h', colour: C.zShape, offsets: [[0,0],[0,1],[1,1],[1,2]] },
  { name: 'z-v', colour: C.zShape, offsets: [[0,1],[1,0],[1,1],[2,0]] },

  // --- Plus / cross (5 cells) ---
  { name: 'plus', colour: C.plus, offsets: [[0,1],[1,0],[1,1],[1,2],[2,1]] },
];

export function getRandomPiece(): PieceDefinition {
  return PIECES[Math.floor(Math.random() * PIECES.length)];
}
