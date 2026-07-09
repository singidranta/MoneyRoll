import Phaser from 'phaser';

const VERSION = '1.5';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }

  create(): void {
    console.log(`[MoneyRoll] v${VERSION} — Boot OK`);
    this.events.emit('boot-complete');
    window.dispatchEvent(new Event('phaser-ready'));
    this.scene.start('Preload');
  }
}
