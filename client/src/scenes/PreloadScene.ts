import Phaser from 'phaser';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Preload' });
  }

  preload(): void {
    // В Этапе 0 нет ассетов. В Этапе 5 (AI-пайплайн) сюда добавятся
    // this.load.image('player-head', '/assets/chars/flat/head/base.png') и т.д.
    console.log('[MoneyRoll] Preload OK (no assets yet)');
  }

  create(): void {
    this.scene.start('World');
  }
}
