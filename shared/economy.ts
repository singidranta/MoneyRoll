// ============================================================
//  SECTION: INVENTORY ITEM TYPES
// ============================================================
export type InventoryItem =
  | BottleType
  | 'bag-adidas'
  | 'backpack-tourist'
  | 'shawarma'
  | 'energy';

export type BottleType = 'water' | 'beer-glass' | 'wine' | 'champagne' | 'bordeaux-1982';

// ============================================================
//  SECTION: BOTTLE DEFINITIONS
// ============================================================
export interface BottleDef {
  id: BottleType;
  name: string;
  price: number;
  weight: number;      // Вес бутылки в кг
  spawnWeight: number; // Для вероятности спавна
  color: number;       // Резервный цвет
  spriteKey: string;
}

// ============================================================
//  SECTION: INVENTORY LIMITS
// ============================================================
export const INVENTORY_SLOTS = 12; // Сетка инвентаря 3x4 слота

// ============================================================
//  SECTION: FOOD & GEAR WEIGHTS
// ============================================================
export const FOOD_WEIGHTS: Record<'shawarma' | 'energy', number> = {
  shawarma: 0.5,
  energy: 0.3,
};

export const GEAR_WEIGHTS: Record<'bag-adidas' | 'backpack-tourist', number> = {
  'bag-adidas': 0.0,
  'backpack-tourist': 0.0,
};

// ============================================================
//  SECTION: BACKPACK TIERS
// ============================================================
export const BACKPACK_TIERS: Record<number, { name: string; maxWeight: number }> = {
  1: { name: 'Карманы', maxWeight: 2.5 },
  2: { name: 'Сумка Adidas', maxWeight: 15.0 },
  3: { name: 'Рюкзак туриста', maxWeight: 30.0 },
};

export const MAX_INVENTORY_WEIGHT = BACKPACK_TIERS[1].maxWeight; // Устаревшая константа для совместимости

// ============================================================
//  SECTION: BOTTLE DEFINITIONS
// ============================================================
export const BOTTLE_TYPES: Record<BottleType, BottleDef> = {
  'water': {
    id: 'water',
    name: 'Пластиковая вода',
    price: 0.05,
    weight: 0.5,
    spawnWeight: 60,
    color: 0x4da6ff,
    spriteKey: 'bottle-water',
  },
  'beer-glass': {
    id: 'beer-glass',
    name: 'Стекло пиво',
    price: 0.20,
    weight: 1.0,
    spawnWeight: 25,
    color: 0xcc7a00,
    spriteKey: 'bottle-beer-glass',
  },
  'wine': {
    id: 'wine',
    name: 'Вино',
    price: 1.00,
    weight: 1.5,
    spawnWeight: 10,
    color: 0x990033,
    spriteKey: 'bottle-wine',
  },
  'champagne': {
    id: 'champagne',
    name: 'Шампанское',
    price: 5.00,
    weight: 2.0,
    spawnWeight: 4,
    color: 0xffd700,
    spriteKey: 'bottle-champagne',
  },
  'bordeaux-1982': {
    id: 'bordeaux-1982',
    name: 'Bordeaux 1982',
    price: 50.00,
    weight: 3.0,
    spawnWeight: 1,
    color: 0x660022,
    spriteKey: 'bottle-bordeaux-1982',
  }
};

// ============================================================
//  SECTION: SERVER-SIDE ENTITIES
// ============================================================
// Динамические бутылки, находящиеся на карте в данный момент
export interface ServerBottle {
  id: string;
  type: BottleType;
  x: number;
  y: number;
}
