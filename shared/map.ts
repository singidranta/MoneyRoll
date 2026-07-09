/**
 * Общая схема карты для клиента и сервера.
 * Сейчас: два типа тайлов — ground и road.
 */

export const MAP_VERSION = 1;
// ============================================================
//  SECTION: MAP DIMENSIONS
// ============================================================
export const MAP_WIDTH = 20; // Карта мира 20x20 клеток
export const MAP_HEIGHT = 20;
export const TILE_SIZE = 128; // Тайлы 128x128 пикселей

export const TILE_SIZE_HALF = TILE_SIZE / 2;

// ============================================================
//  SECTION: TILE TYPES
// ============================================================
export const TILE_TYPES = [
  'ground-grass',
  'ground-sand',
  'ground-dirt',
  'road-straight',
  'road-corner',
  'road-t-junction',
  'road-crossroad'
] as const;

export type TileType = (typeof TILE_TYPES)[number];

// ============================================================
//  SECTION: POSITION & ENTITY TYPES
// ============================================================
export type CellPos = { x: number; y: number };

export interface MapEntity {
  id: string; // Уникальный ID объекта
  type: 'kiosk' | 'spawner' | 'npc' | 'building' | 'apartment-1' | 'apartment-2' | 'wall' | 'food-cart' | 'clothing-shop';
  cellX: number;
  cellY: number;
  rotation: number; // 0, 90, 180, 270
  properties: {
    spawnInterval?: number; // Интервал появления (сек)
    maxBottles?: number; // Максимум бутылок
    spawnRadius?: number; // Радиус спавна бутылок (в клетках)
    spriteKey?: string; // Кастомный спрайт (для зданий/NPC)
    label?: string; // Описание/Имя
  };
}

// ============================================================
//  SECTION: MAP DOCUMENT
// ============================================================
/**
 * Хранилище карты: разреженный словарь. Ключ — "x,y".
 * Поддерживает вращение в градусах (0, 90, 180, 270) и объекты entities.
 */
export type MapDocument = {
  version: number;
  width: number;
  height: number;
  tileSize: number;
  tiles: Record<string, TileType>;
  rotations?: Record<string, number>; // вращение тайлов
  entities?: Record<string, MapEntity>; // Объекты привязанные к клеткам. Ключ - cellKey(x,y)
};

// ============================================================
//  SECTION: MAP HELPERS
// ============================================================
export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function parseKey(k: string): CellPos | null {
  const parts = k.split(',');
  if (parts.length !== 2) return null;
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  return { x, y };
}

export function emptyMap(): MapDocument {
  return {
    version: MAP_VERSION,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    tileSize: TILE_SIZE,
    tiles: {},
    rotations: {},
    entities: {},
  };
}

/** Цикл "следующий тип" при клике в редакторе. */
export const NEXT_TILE: Record<TileType, TileType> = {
  'ground-grass': 'ground-sand',
  'ground-sand': 'ground-dirt',
  'ground-dirt': 'road-straight',
  'road-straight': 'road-corner',
  'road-corner': 'road-t-junction',
  'road-t-junction': 'road-crossroad',
  'road-crossroad': 'ground-grass',
};
