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

export type ClothingType = 'jacket' | 'sneakers' | 'crown';

export type ShopItemType = InventoryItem | ClothingType;

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
//  SECTION: SHOP PRICES (server-authoritative)
// ============================================================
export const SHOP_PRICES: Record<ShopItemType, number> = {
  shawarma: 1.5,
  energy: 3.0,
  'bag-adidas': 15.0,
  'backpack-tourist': 45.0,
  jacket: 10.0,
  sneakers: 20.0,
  crown: 100.0,
  // бутылки не продаются в магазине
  water: 0,
  'beer-glass': 0,
  wine: 0,
  champagne: 0,
  'bordeaux-1982': 0,
};

// ============================================================
//  SECTION: JOBS
// ============================================================
export type JobType = 'courier' | 'lemonade' | 'trash-sort';

export const JOB_REWARDS: Record<JobType, { min: number; max: number; cooldownMs: number }> = {
  courier: { min: 2.5, max: 4.0, cooldownMs: 4000 },
  lemonade: { min: 1.5, max: 2.5, cooldownMs: 3000 },
  'trash-sort': { min: 1.0, max: 2.0, cooldownMs: 2500 },
};

// ============================================================
//  SECTION: PASSIVE INCOME – PROPERTIES
// ============================================================
export type PropertyType = 'shack' | 'apartment-small' | 'apartment-big';

export interface PropertyDef {
  id: PropertyType;
  name: string;
  price: number;
  incomePerMin: number;
}

export const PROPERTIES: Record<PropertyType, PropertyDef> = {
  shack: { id: 'shack', name: 'Сарай с бомжами', price: 120, incomePerMin: 3.0 },
  'apartment-small': { id: 'apartment-small', name: 'Хрущёвка', price: 450, incomePerMin: 12.0 },
  'apartment-big': { id: 'apartment-big', name: 'Пентхаус', price: 1500, incomePerMin: 45.0 },
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

export interface PlayerSave {
  money: number;
  inventory: (InventoryItem | null)[];
  backpackTier: number;
  hasJacket: boolean;
  hasSneakers: boolean;
  hasCrown: boolean;
  properties: PropertyType[];
}
