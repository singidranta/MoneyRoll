import type { MapDocument, TileType } from '../../../shared/map';

const ENDPOINT = '/api/map';

export const TILE_COLORS: Record<TileType, number> = {
  ground: 0x6a8a4e,  // muted grassy green-brown
  road: 0x4a4a55,    // asphalt gray
};

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';
let saveState: SaveState = 'idle';
let lastSavedAt = 0;
export function getSaveStatus(): { state: SaveState; lastSavedAt: number } {
  return { state: saveState, lastSavedAt };
}

export async function loadMap(): Promise<MapDocument> {
  try {
    const res = await fetch(ENDPOINT);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as MapDocument;
    console.log(`[MoneyRoll][map] loaded ${Object.keys(data.tiles).length} tiles from server`);
    return data;
  } catch (err) {
    console.warn('[MoneyRoll][map] failed to load, empty:', err);
    return {
      version: 1,
      width: 200,
      height: 200,
      tileSize: 64,
      tiles: {},
    };
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
export function saveMapDebounced(map: MapDocument, delayMs = 800): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveState = 'saving';
  saveTimer = setTimeout(() => {
    void saveMapNow(map);
  }, delayMs);
}

export async function saveMapNow(map: MapDocument): Promise<boolean> {
  saveState = 'saving';
  try {
    const res = await fetch(ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(map),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    saveState = 'saved';
    lastSavedAt = Date.now();
    console.log(`[MoneyRoll][map] saved ${Object.keys(map.tiles).length} tiles`);
    return true;
  } catch (err) {
    saveState = 'error';
    console.warn('[MoneyRoll][map] save failed:', err);
    return false;
  }
}
