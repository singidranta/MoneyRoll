// ============================================================
//  SECTION: LOCAL SAVE SYSTEM
// ============================================================
// Сохраняем ТОЛЬКО позицию. Деньги/инвентарь — на сервере (анти-чит).

import { DEFAULT_SPAWN, PLAYER_TOKEN_KEY, SAVE_KEY } from '../config/WorldConstants';

export type PositionSave = {
  version: 2;
  x: number;
  y: number;
  savedAt: number;
};

export function getOrCreatePlayerToken(): string {
  try {
    let token = localStorage.getItem(PLAYER_TOKEN_KEY);
    if (!token) {
      token = 'mr_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(PLAYER_TOKEN_KEY, token);
    }
    return token;
  } catch {
    return 'mr_guest_' + Math.random().toString(36).slice(2);
  }
}

export function savePosition(x: number, y: number): void {
  const saveData: PositionSave = {
    version: 2,
    x,
    y,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
  } catch (e) {
    console.warn('[MoneyRoll] Ошибка сохранения:', e);
  }
}

/** Возвращает сохранённую позицию или null. */
export function loadPosition(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<PositionSave>;
    if (typeof data.x === 'number' && typeof data.y === 'number') {
      return { x: data.x, y: data.y };
    }
    return null;
  } catch (e) {
    console.warn('[MoneyRoll] Ошибка загрузки:', e);
    return null;
  }
}

export function getDefaultSpawn(): { x: number; y: number } {
  return { ...DEFAULT_SPAWN };
}
