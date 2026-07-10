// ============================================================
//  SECTION: PLAYER SAVE PERSISTENCE
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import type { PlayerSave } from '../../shared/economy.js';
import type { Client } from './types.js';

const PLAYER_SAVE_PATH = path.resolve(process.cwd(), 'data/players.json');

export class PlayerStore {
  private saves = loadPlayerSaves();

  get(token: string): PlayerSave | null {
    return this.saves.get(token) ?? null;
  }

  saveClient(c: Client): void {
    if (!c.playerToken) return;
    const save: PlayerSave = {
      money: c.money,
      inventory: c.inventory,
      backpackTier: c.backpackTier,
      hasJacket: c.hasJacket,
      hasSneakers: c.hasSneakers,
      hasCrown: c.hasCrown,
      properties: c.properties,
      jobSkills: c.jobSkills,
      licenses: c.licenses,
      trainingCompleted: c.trainingCompleted,
      hunger: c.hunger,
    };
    this.saves.set(c.playerToken, save);
    persistPlayerSaves(this.saves);
  }
}

function loadPlayerSaves(): Map<string, PlayerSave> {
  try {
    if (!fs.existsSync(PLAYER_SAVE_PATH)) return new Map();
    const raw = fs.readFileSync(PLAYER_SAVE_PATH, 'utf8');
    const obj = JSON.parse(raw) as Record<string, PlayerSave>;
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

function persistPlayerSaves(map: Map<string, PlayerSave>): void {
  try {
    fs.mkdirSync(path.dirname(PLAYER_SAVE_PATH), { recursive: true });
    const obj = Object.fromEntries(map.entries());
    fs.writeFileSync(PLAYER_SAVE_PATH, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.warn('[MoneyRoll] failed to save players:', e);
  }
}
