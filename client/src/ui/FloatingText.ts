// ============================================================
//  SECTION: FLOATING WORLD TEXT
// ============================================================

import Phaser from 'phaser';

const COLOR_MAP: Record<string, string> = {
  '#7cfc00': '#4caf6a',
  '#3ae06f': '#4caf6a',
  '#ffd700': '#e0b03a',
  '#ffc72c': '#e0b03a',
  '#ff3333': '#d45454',
  '#ff5252': '#d45454',
  '#ff9900': '#d4893a',
  '#ff9f43': '#d4893a',
};

export function showFloatingText(
  scene: Phaser.Scene,
  text: string,
  x: number,
  y: number,
  color = '#4caf6a',
): void {
  const themed = COLOR_MAP[color] ?? color;

  const ftext = scene.add.text(x, y, text, {
    fontFamily: 'system-ui, sans-serif',
    fontSize: '12px',
    fontStyle: 'bold',
    color: themed,
    backgroundColor: '#1a1e26',
    padding: { x: 6, y: 3 },
  });
  ftext.setOrigin(0.5);
  ftext.setDepth(2000);

  scene.tweens.add({
    targets: ftext,
    y: y - 28,
    alpha: 0,
    duration: 1200,
    ease: 'Linear',
    onComplete: () => ftext.destroy(),
  });
}
