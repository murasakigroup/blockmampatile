
import { PieceDefinition, getRandomPiece } from './pieces.js';

export type Tray = (PieceDefinition | null)[];

export function newTray(): Tray {
  return [getRandomPiece(), getRandomPiece(), getRandomPiece()];
}
