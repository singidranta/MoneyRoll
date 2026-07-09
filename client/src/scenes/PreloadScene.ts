import Phaser from 'phaser';

function isEditorMode(): boolean {
  try {
    return new URL(window.location.href).searchParams.get('mode') === 'editor';
  } catch {
    return false;
  }
}

function setLoadingProgress(value: number, label?: string): void {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  const bar = document.getElementById('loading-bar-fill');
  const text = document.getElementById('loading-pct');
  if (bar) bar.style.width = `${pct}%`;
  if (text) text.textContent = label ? `${label} · ${pct}%` : `${pct}%`;
}

function hideLoading(): void {
  const loading = document.getElementById('loading');
  if (!loading || loading.classList.contains('hidden')) return;
  loading.classList.add('hidden');
  // remove from DOM after fade so it never blocks clicks
  window.setTimeout(() => loading.remove(), 300);
}

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Preload' });
  }

  preload(): void {
    console.log('[MoneyRoll] Preloading assets...');
    setLoadingProgress(0, 'ассеты');

    this.load.on('progress', (value: number) => {
      setLoadingProgress(value, 'ассеты');
    });

    this.load.on('complete', () => {
      setLoadingProgress(1, 'готово');
    });

    // 128x128 тайлы дорог и ландшафта
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

    // Спрайт игрока и UI
    this.load.spritesheet('player-sprites', '/assets/chars/player-spritesheet.webp', {
      frameWidth: 128,
      frameHeight: 128,
    });
    this.load.image('icon-coin', '/assets/icons/coin.webp');

    // Здания / объекты
    this.load.image('apartment-1', '/assets/props/flat/buildings/apartment-1.webp');
    this.load.image('apartment-2', '/assets/props/flat/buildings/apartment-2.webp');
    this.load.image('clothing-shop', '/assets/props/flat/buildings/clothing-shop.webp');
    this.load.image('wall', '/assets/props/flat/walls/wall.webp');
    this.load.image('food-cart', '/assets/props/flat/kiosk/food-cart.webp');

    // Инвентарь
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
    // Hide only when world/editor actually starts, so no black flash
    this.scene.start(next);
    // small delay: let World create() run, then fade loading out
    window.setTimeout(() => hideLoading(), 80);
  }
}
