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

    // Спрайт игрока, анимационный атлас и UI иконки
    this.load.spritesheet('player-sprites', '/assets/chars/player-spritesheet.webp', { frameWidth: 128, frameHeight: 128 });
    this.load.image('icon-coin', '/assets/icons/coin.webp');

    // Квартиры, стены, ларёк с шаурмой и магазин одежды
    this.load.image('apartment-1', '/assets/props/flat/buildings/apartment-1.webp');
    this.load.image('apartment-2', '/assets/props/flat/buildings/apartment-2.webp');
    this.load.image('clothing-shop', '/assets/props/flat/buildings/clothing-shop.webp');
    this.load.image('wall', '/assets/props/flat/walls/wall.webp');
    this.load.image('food-cart', '/assets/props/flat/kiosk/food-cart.webp');

    // Текстуры еды, сумок и одежды для инвентаря
    this.load.image('item-bag-adidas', '/assets/props/flat/bags/bag-adidas.webp');
    this.load.image('item-backpack-tourist', '/assets/props/flat/bags/backpack-tourist.webp');
    this.load.image('item-shawarma', '/assets/props/flat/food/shawarma.webp');
    this.load.image('item-energy-drink', '/assets/props/flat/food/energy-drink.webp');
    this.load.image('item-adidas-jacket', '/assets/props/flat/clothing/adidas-jacket.webp');
    this.load.image('item-sneakers', '/assets/props/flat/clothing/sneakers.webp');
    this.load.image('item-crown', '/assets/props/flat/clothing/crown.webp');
  }

  create(): void {
    const next = isEditorMode() ? 'Editor' : 'World';
    console.log(`[MoneyRoll] Preload → ${next}`);
    this.scene.start(next);
  }
}
