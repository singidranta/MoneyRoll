/**
 * Общая схема карты для клиента и сервера.
 * Сейчас: два типа тайлов — ground и road.
 */

export const MAP_VERSION = 1;
export const MAP_WIDTH = 30; // Карта мира 30х30 клеток
export const MAP_HEIGHT = 30;
export const TILE_SIZE = 128; // Тайлы 128х128 пикселей
export const TILE_TYPES = ['ground', 'road'] as const;

export type TileType = (typeof TILE_TYPES)[number];

export type CellPos = { x: number; y: number };

export interface MapEntity {
  id: string; // Уникальный ID объекта
  type: 'kiosk' | 'spawner' | 'npc' | 'building';
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
  ground: 'road',
  road: 'ground',
};
