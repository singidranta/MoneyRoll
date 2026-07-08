export type BottleType = 'water' | 'beer-glass' | 'wine' | 'champagne' | 'bordeaux-1982';

export interface BottleDef {
  id: BottleType;
  name: string;
  price: number;
  spawnWeight: number; // For probability
  color: number;       // Fallback color for drawing
  spriteKey: string;
}

export const BOTTLE_TYPES: Record<BottleType, BottleDef> = {
  'water': {
    id: 'water',
    name: 'Пластиковая вода',
    price: 0.05,
    spawnWeight: 60,
    color: 0x4da6ff,
    spriteKey: 'bottle-water',
  },
  'beer-glass': {
    id: 'beer-glass',
    name: 'Стекло пиво',
    price: 0.20,
    spawnWeight: 25,
    color: 0xcc7a00,
    spriteKey: 'bottle-beer-glass',
  },
  'wine': {
    id: 'wine',
    name: 'Вино',
    price: 1.00,
    spawnWeight: 10,
    color: 0x990033,
    spriteKey: 'bottle-wine',
  },
  'champagne': {
    id: 'champagne',
    name: 'Шампанское',
    price: 5.00,
    spawnWeight: 4,
    color: 0xffd700,
    spriteKey: 'bottle-champagne',
  },
  'bordeaux-1982': {
    id: 'bordeaux-1982',
    name: 'Bordeaux 1982',
    price: 50.00,
    spawnWeight: 1,
    color: 0x660022,
    spriteKey: 'bottle-bordeaux-1982',
  }
};

export interface ServerBottle {
  id: string;
  type: BottleType;
  x: number;
  y: number;
}

export interface ServerKiosk {
  id: string;
  x: number;
  y: number;
}
