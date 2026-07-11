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
    this.load.image('shack', '/assets/props/flat/buildings/shack.png');
    this.load.image('clothing-shop', '/assets/props/flat/buildings/clothing-shop.webp');
    this.load.image('electronics-shop', '/assets/props/flat/buildings/electronics-shop.svg');
    this.load.image('school', '/assets/props/flat/buildings/school.webp');
    this.load.image('wall', '/assets/props/flat/walls/wall.webp');
    this.load.image('food-cart', '/assets/props/flat/kiosk/food-cart.webp');
    // v2 jobs
    this.load.image('courier-hub', '/assets/props/flat/kiosk/courier-hub.webp');
    this.load.image('trash-sort-station', '/assets/props/flat/kiosk/trash-sort-station.webp');
    this.load.image('lemonade-stand', '/assets/props/flat/kiosk/lemonade-stand.webp');

    // Инвентарь и предметы (правильные ключи для getItemSpriteKey)
    this.load.image('bag-adidas', '/assets/props/flat/bags/bag-adidas.webp');
    this.load.image('backpack-tourist', '/assets/props/flat/bags/backpack-tourist.webp');
    this.load.image('shawarma', '/assets/props/flat/food/shawarma.webp');
    this.load.image('energy-drink', '/assets/props/flat/food/energy-drink.webp');
    this.load.image('hotdog', '/assets/props/flat/food/hotdog.webp');
    this.load.image('sushi', '/assets/props/flat/food/sushi.webp');
    this.load.image('pizza', '/assets/props/flat/food/pizza.webp');
    this.load.image('salad', '/assets/props/flat/food/salad.webp');
    this.load.image('ramen', '/assets/props/flat/food/ramen.webp');
    this.load.image('steak', '/assets/props/flat/food/steak.webp');
    this.load.image('jacket', '/assets/props/flat/clothing/jacket.webp');
    this.load.image('sneakers', '/assets/props/flat/clothing/sneakers.webp');
    this.load.image('crown', '/assets/props/flat/clothing/crown.webp');
    this.load.image('parcel', '/assets/props/flat/parcel.png');
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
