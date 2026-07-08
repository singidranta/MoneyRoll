import Phaser from 'phaser';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Preload' });
  }

  preload(): void {
    console.log('[MoneyRoll] Preloading webp assets...');
    this.load.image('tile-ground', '/assets/tiles/flat/ground.webp');
    this.load.image('tile-road', '/assets/tiles/flat/road.webp');
    this.load.image('bottle-water', '/assets/props/flat/bottles/water.webp');
    this.load.image('bottle-beer-glass', '/assets/props/flat/bottles/beer-glass.webp');
    this.load.image('bottle-wine', '/assets/props/flat/bottles/wine.webp');
    this.load.image('bottle-champagne', '/assets/props/flat/bottles/champagne.webp');
    this.load.image('bottle-bordeaux-1982', '/assets/props/flat/bottles/bordeaux-1982.webp');
    this.load.image('recycle-machine', '/assets/props/flat/kiosk/recycle-machine.webp');
  }

  create(): void {
    this.scene.start('World');
  }
}
