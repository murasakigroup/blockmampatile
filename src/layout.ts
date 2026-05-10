
export const SCORE_BAR_H = 48;
export const MARGIN       = 16;
export const CELL_GAP     = 2;
export const RADIUS_FRAC  = 0.18;

export interface MenuButton {
  x:      number;
  y:      number;
  width:  number;
  height: number;
}

export interface Layout {
  cellSize:        number;
  gridLeft:        number;
  gridTop:         number;
  trayTop:         number;
  trayHeight:      number;
  restartX:        number;
  restartY:        number;
  restartSize:     number;
  exitBtnX:        number;
  exitBtnY:        number;
  exitBtnSize:     number;
  menuClassicBtn:  MenuButton;
  menuPowerUpBtn:  MenuButton;
  menuSize8Btn:    MenuButton;
  menuSize10Btn:   MenuButton;
  goRetryBtn:      MenuButton;
  goMenuBtn:       MenuButton;
}

export function computeLayout(w: number, h: number, gridSize = 8): Layout {
  const availW     = w - MARGIN * 2;
  const availH     = h - SCORE_BAR_H - MARGIN * 3;
  const traySlot   = Math.min(h * 0.18, 120);
  const gridSide   = Math.min(availW, availH - traySlot);
  const cellSize   = Math.max(1, Math.floor(gridSide / gridSize));
  const actualGrid = cellSize * gridSize;
  const gridLeft   = Math.floor((w - actualGrid) / 2);
  const gridTop    = SCORE_BAR_H + MARGIN;
  const trayTop    = gridTop + actualGrid + MARGIN;
  const trayHeight = h - trayTop - MARGIN;
  // Restart button: centred in score bar
  const restartSize = 32;
  const restartX    = Math.floor(w / 2 - restartSize / 2);
  const restartY    = Math.floor(SCORE_BAR_H / 2 - restartSize / 2);

  // Exit/menu button: left-aligned in score bar, same size as restart
  const exitBtnSize = restartSize;
  const exitBtnX    = MARGIN;
  const exitBtnY    = Math.floor(SCORE_BAR_H / 2 - exitBtnSize / 2);

  // Menu buttons: two stacked vertically, centred in the lower half of the screen
  const btnW        = Math.min(260, w - MARGIN * 4);
  const btnH        = 52;
  const btnGap      = 18;
  const btnX        = Math.floor((w - btnW) / 2);
  const totalBtns   = btnH * 2 + btnGap;
  const btnBaseY    = Math.floor(h * 0.62 - totalBtns / 2);

  const menuClassicBtn: MenuButton = { x: btnX, y: btnBaseY,                width: btnW, height: btnH };
  const menuPowerUpBtn: MenuButton = { x: btnX, y: btnBaseY + btnH + btnGap, width: btnW, height: btnH };

  // Size toggle pills: ( 8×8 ) ( 10×10 ) below mode buttons
  const pillW      = 72;
  const pillH      = 34;
  const pillGap    = 10;
  const pillBaseX  = Math.floor((w - (pillW * 2 + pillGap)) / 2);
  const pillY      = btnBaseY + btnH * 2 + btnGap + 20;
  const menuSize8Btn:  MenuButton = { x: pillBaseX,              y: pillY, width: pillW, height: pillH };
  const menuSize10Btn: MenuButton = { x: pillBaseX + pillW + pillGap, y: pillY, width: pillW, height: pillH };

  // Game-over buttons: two stacked, centred
  const goBtnW   = Math.min(220, w - MARGIN * 4);
  const goBtnH   = 48;
  const goBtnGap = 14;
  const goBtnX   = Math.floor((w - goBtnW) / 2);
  const goBaseY  = Math.floor(h * 0.68);
  const goRetryBtn: MenuButton = { x: goBtnX, y: goBaseY,                  width: goBtnW, height: goBtnH };
  const goMenuBtn:  MenuButton = { x: goBtnX, y: goBaseY + goBtnH + goBtnGap, width: goBtnW, height: goBtnH };

  return {
    cellSize, gridLeft, gridTop, trayTop, trayHeight,
    restartX, restartY, restartSize,
    exitBtnX, exitBtnY, exitBtnSize,
    menuClassicBtn, menuPowerUpBtn,
    menuSize8Btn, menuSize10Btn,
    goRetryBtn, goMenuBtn,
  };
}
