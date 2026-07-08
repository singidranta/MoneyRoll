export type BottleType = 'water' | 'beer-glass' | 'wine' | 'champagne' | 'bordeaux-1982';

export interface BottleDef {
  id: BottleType;
  name: string;
  price: number;
  weight: number;      // Вес бутылки в кг
  spawnWeight: number; // Для вероятности спавна
  color: number;       // Резервный цвет
  spriteKey: string;
}

export const MAX_INVENTORY_WEIGHT = 8.0; // Максимальный переносимый вес (кг)
export const INVENTORY_SLOTS = 12;       // Сетка инвентаря 3x4 слота

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

// Динамические бутылки, находящиеся на карте в данный момент
export interface ServerBottle {
  id: string;
  type: BottleType;
  x: number;
  y: number;
}
