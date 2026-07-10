// ============================================================
//  SECTION: SHARED ITEM HELPERS
// ============================================================

import {
  BACKPACK_TIERS,
  BOTTLE_TYPES,
  FOOD_WEIGHTS,
  FOOD_NAMES,
  FOOD_WEBP_PATHS,
  FOOD_SPRITES,
  GEAR_WEIGHTS,
  type BottleType,
  type FoodType,
  type InventoryItem,
} from './economy.js';

// ============================================================
//  SECTION: TYPE GUARDS
// ============================================================

export function isBag(item: InventoryItem): item is 'bag-adidas' | 'backpack-tourist' {
  return item === 'bag-adidas' || item === 'backpack-tourist';
}

export function isFood(item: InventoryItem): item is FoodType {
  return item in FOOD_WEIGHTS;
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
  if (isFood(item)) return FOOD_NAMES[item];
  if (item === 'parcel') return 'Посылка';
  return BOTTLE_TYPES[item as BottleType]?.name ?? item;
}

export function getItemWeight(item: InventoryItem): number {
  if (isBag(item)) return GEAR_WEIGHTS[item];
  if (isFood(item)) return FOOD_WEIGHTS[item];
  if (item === 'parcel') return 1.5;
  return BOTTLE_TYPES[item as BottleType]?.weight ?? 0;
}

export function calculateInventoryWeight(inv: readonly (InventoryItem | null)[]): number {
  let total = 0;
  for (const item of inv) {
    if (item) total += getItemWeight(item);
  }
  return parseFloat(total.toFixed(2));
}

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

/** Путь к webp/png-иконке предмета (для HTML UI). */
export function getItemWebpPath(item: InventoryItem): string {
  if (isBag(item)) return `/assets/props/flat/bags/${item}.webp`;
  if (isFood(item)) return FOOD_WEBP_PATHS[item];
  if (item === 'parcel') return '/assets/props/flat/parcel.png';
  return `/assets/props/flat/bottles/${item}.webp`;
}

/** Phaser texture key для дропнутого/спавненного предмета. */
export function getItemSpriteKey(item: InventoryItem): string {
  if (isBag(item)) return item;
  if (isFood(item)) return FOOD_SPRITES[item];
  if (item === 'parcel') return 'parcel';
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
