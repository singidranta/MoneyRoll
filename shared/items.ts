// ============================================================
//  SECTION: SHARED ITEM HELPERS
// ============================================================
// Единые хелперы для клиента и сервера — без дублирования.

import {
  BACKPACK_TIERS,
  BOTTLE_TYPES,
  FOOD_WEIGHTS,
  GEAR_WEIGHTS,
  type BottleType,
  type InventoryItem,
} from './economy.js';

// ============================================================
//  SECTION: TYPE GUARDS
// ============================================================

export function isBag(item: InventoryItem): item is 'bag-adidas' | 'backpack-tourist' {
  return item === 'bag-adidas' || item === 'backpack-tourist';
}

export function isFood(item: InventoryItem): item is 'shawarma' | 'energy' {
  return item === 'shawarma' || item === 'energy';
}

export function isBottle(item: InventoryItem): item is BottleType {
  return item in BOTTLE_TYPES;
}

// ============================================================
//  SECTION: ITEM META
// ============================================================

export function getItemName(item: InventoryItem): string {
  if (item === 'bag-adidas') return 'Сумка Adidas';
  if (item === 'backpack-tourist') return 'Рюкзак туриста';
  if (item === 'shawarma') return 'Шаурма';
  if (item === 'energy') return 'Ягуар';
  return BOTTLE_TYPES[item as BottleType]?.name ?? item;
}

export function getItemWeight(item: InventoryItem): number {
  if (isBag(item)) return GEAR_WEIGHTS[item];
  if (isFood(item)) return FOOD_WEIGHTS[item];
  return BOTTLE_TYPES[item as BottleType]?.weight ?? 0;
}

export function calculateInventoryWeight(inv: readonly (InventoryItem | null)[]): number {
  let total = 0;
  for (const item of inv) {
    if (item) total += getItemWeight(item);
  }
  return parseFloat(total.toFixed(2));
}

/** Сколько слотов доступно при данном тире рюкзака. */
export function getActiveSlotsCount(backpackTier: number): number {
  if (backpackTier === 1) return 4;
  if (backpackTier === 2) return 8;
  return 12;
}

export function getMaxWeight(backpackTier: number): number {
  return BACKPACK_TIERS[backpackTier]?.maxWeight ?? BACKPACK_TIERS[1].maxWeight;
}

export function getBackpackName(backpackTier: number): string {
  return BACKPACK_TIERS[backpackTier]?.name ?? BACKPACK_TIERS[1].name;
}

/** Путь к webp-иконке предмета (для HTML UI). */
export function getItemWebpPath(item: InventoryItem): string {
  if (isBag(item)) return `/assets/props/flat/bags/${item}.webp`;
  if (item === 'shawarma') return '/assets/props/flat/food/shawarma.webp';
  if (item === 'energy') return '/assets/props/flat/food/energy-drink.webp';
  return `/assets/props/flat/bottles/${item}.webp`;
}

/** Phaser texture key для дропнутого/спавненного предмета. */
export function getItemSpriteKey(item: InventoryItem): string {
  if (isBag(item)) return item;
  if (item === 'shawarma') return 'shawarma';
  if (item === 'energy') return 'energy-drink';
  return BOTTLE_TYPES[item as BottleType]?.spriteKey ?? 'bottle-water';
}

/** Тир рюкзака по типу сумки. */
export function bagToTier(bag: 'bag-adidas' | 'backpack-tourist'): 2 | 3 {
  return bag === 'bag-adidas' ? 2 : 3;
}

/** Сумка, соответствующая тиру (2 → adidas, 3 → tourist). */
export function tierToBag(tier: number): 'bag-adidas' | 'backpack-tourist' | null {
  if (tier === 2) return 'bag-adidas';
  if (tier === 3) return 'backpack-tourist';
  return null;
}
