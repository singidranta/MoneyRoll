import Phaser from 'phaser';

function isEditorMode(): boolean {
  try {
    return new URL(window.location.href).searchParams.get('mode') === 'editor';
  } catch {
    return false;
  }
}

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Preload' });
  }

  preload(): void {
    console.log('[MoneyRoll] Preloading webp assets...');
    
    // Новые 128х128 тайлы дорог и ландшафта
    this.load.image('tile-ground-grass', '/assets/tiles/flat/ground-grass.webp');
    this.load.image('tile-ground-sand', '/assets/tiles/flat/ground-sand.webp');
    this.load.image('tile-ground-dirt', '/assets/tiles/flat/ground-dirt.webp');
    this.load.image('tile-road-straight', '/assets/tiles/flat/road-straight.webp');
    this.load.image('tile-road-corner', '/assets/tiles/flat/road-corner.webp');
    this.load.image('tile-road-t-junction', '/assets/tiles/flat/road-t-junction.webp');
    this.load.image('tile-road-crossroad', '/assets/tiles/flat/road-crossroad.webp');

    // Предметы и интерактивные автоматы
    this.load.image('bottle-water', '/assets/props/flat/bottles/water.webp');
    this.load.image('bottle-beer-glass', '/assets/props/flat/bottles/beer-glass.webp');
    this.load.image('bottle-wine', '/assets/props/flat/bottles/wine.webp');
    this.load.image('bottle-champagne', '/assets/props/flat/bottles/champagne.webp');
    this.load.image('bottle-bordeaux-1982', '/assets/props/flat/bottles/bordeaux-1982.webp');
    this.load.image('recycle-machine', '/assets/props/flat/kiosk/recycle-machine.webp');

    // Спрайт игрока и UI иконки
    this.load.image('player', '/assets/chars/player.webp');
    this.load.image('icon-coin', '/assets/icons/coin.webp');
  }

  create(): void {
    const next = isEditorMode() ? 'Editor' : 'World';
    console.log(`[MoneyRoll] Preload → ${next}`);
    this.scene.start(next);
  }
}
