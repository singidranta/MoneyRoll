// ============================================================
//  SECTION: PLAYER SAVE PERSISTENCE
// ============================================================

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  DEFAULT_EQUIPMENT,
  DEFAULT_JOB_SKILLS,
  DEFAULT_LICENSES,
  HUNGER_MAX,
  INVENTORY_SLOTS,
  PROPERTIES,
  type InventoryItem,
  type JobSkill,
  type JobSkills,
  type PlayerEquipment,
  type PlayerSave,
  type PropertyType,
} from '../../shared/economy.js';
import { isBag, isBottle, isClothing, isFood } from '../../shared/items.js';
import type { Client } from './types.js';

const PLAYER_SAVE_PATH = path.resolve(process.cwd(), 'data/players.json');
const MAX_SAVE_BYTES = 2 * 1024 * 1024;

export class PlayerStore {
  private saves = loadPlayerSaves();

  get(token: string): PlayerSave | null {
    const save = this.saves.get(token);
    return save ? cloneSave(save) : null;
  }

  saveClient(c: Client): void {
    if (!isValidPlayerToken(c.playerToken)) return;

    const save = sanitizePlayerSave({
      money: c.money,
      inventory: c.inventory,
      backpackTier: c.backpackTier,
      hasJacket: c.hasJacket,
      hasSneakers: c.hasSneakers,
      hasCrown: c.hasCrown,
      hasPhone: c.hasPhone,
      equipment: c.equipment ?? { ...DEFAULT_EQUIPMENT },
      properties: c.properties,
      jobSkills: c.jobSkills,
      licenses: c.licenses,
      trainingCompleted: c.trainingCompleted,
      hunger: c.hunger,
    });

    this.saves.set(c.playerToken, save);
    persistPlayerSaves(this.saves);
  }
}

function isValidPlayerToken(token: unknown): token is string {
  return typeof token === 'string' && token.length >= 12 && token.length <= 128 && /^[a-zA-Z0-9_.:-]+$/.test(token);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function isInventoryItem(value: unknown): value is InventoryItem {
  return typeof value === 'string' && (isBottle(value as InventoryItem) || isBag(value as InventoryItem) || isFood(value as InventoryItem) || isClothing(value as InventoryItem) || value === 'parcel');
}

function sanitizeInventory(value: unknown): (InventoryItem | null)[] {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: INVENTORY_SLOTS }, (_, index) => {
    const item = source[index];
    return item === null || item === undefined ? null : isInventoryItem(item) ? item : null;
  });
}

function sanitizeEquipment(value: unknown): PlayerEquipment {
  if (!isPlainRecord(value)) return { ...DEFAULT_EQUIPMENT };
  const head = value.head === 'cap' || value.head === 'beanie' ? value.head : null;
  const body = value.body === 'hoodie' ? value.body : null;
  const legs = value.legs === 'jeans' ? value.legs : null;
  const feet = value.feet === 'boots' ? value.feet : null;
  return { head, body, legs, feet };
}

function sanitizeJobSkill(value: unknown): JobSkill {
  if (!isPlainRecord(value)) return { level: 0, xp: 0, jobsCompleted: 0 };
  return {
    level: Math.floor(finiteNumber(value.level, 0, 0, 10)),
    xp: Math.floor(finiteNumber(value.xp, 0, 0, 10_000)),
    jobsCompleted: Math.floor(finiteNumber(value.jobsCompleted, 0, 0, 1_000_000)),
  };
}

function sanitizeJobSkills(value: unknown): JobSkills {
  const record = isPlainRecord(value) ? value : {};
  return {
    courier: sanitizeJobSkill(record.courier ?? DEFAULT_JOB_SKILLS.courier),
    'trash-sort': sanitizeJobSkill(record['trash-sort'] ?? DEFAULT_JOB_SKILLS['trash-sort']),
    lemonade: sanitizeJobSkill(record.lemonade ?? DEFAULT_JOB_SKILLS.lemonade),
  };
}

function sanitizeLicenses(value: unknown): PlayerSave['licenses'] {
  const record = isPlainRecord(value) ? value : {};
  return {
    courier: booleanValue(record.courier ?? DEFAULT_LICENSES.courier),
    trashSort: booleanValue(record.trashSort ?? DEFAULT_LICENSES.trashSort),
    lemonadeBusiness: booleanValue(record.lemonadeBusiness ?? DEFAULT_LICENSES.lemonadeBusiness),
  };
}

function sanitizeProperties(value: unknown): PlayerSave['properties'] {
  if (!Array.isArray(value)) return [];
  const out: PlayerSave['properties'] = [];
  const seen = new Set<string>();

  for (const raw of value) {
    if (!isPlainRecord(raw)) continue;
    const type = raw.type;
    if (typeof type !== 'string' || !Object.prototype.hasOwnProperty.call(PROPERTIES, type)) continue;
    const id = typeof raw.id === 'string' && raw.id.length <= 128 ? raw.id : undefined;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const propertyPointId = typeof raw.propertyPointId === 'string' && raw.propertyPointId.length <= 128 ? raw.propertyPointId : undefined;
    out.push({
      id,
      type: type as PropertyType,
      boughtAt: finiteNumber(raw.boughtAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
      level: Math.floor(finiteNumber(raw.level, 1, 1, 15)),
      propertyPointId,
    });
  }

  return out;
}

function sanitizeTrainingCompleted(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length <= 64))].slice(0, 64);
}

function sanitizePlayerSave(value: unknown): PlayerSave {
  const record = isPlainRecord(value) ? value : {};
  return {
    money: Number(finiteNumber(record.money, 5, 0, 1_000_000_000).toFixed(2)),
    inventory: sanitizeInventory(record.inventory),
    backpackTier: Math.floor(finiteNumber(record.backpackTier, 1, 1, 3)),
    hasJacket: booleanValue(record.hasJacket),
    hasSneakers: booleanValue(record.hasSneakers),
    hasCrown: booleanValue(record.hasCrown),
    hasPhone: booleanValue(record.hasPhone),
    equipment: sanitizeEquipment(record.equipment),
    properties: sanitizeProperties(record.properties),
    jobSkills: sanitizeJobSkills(record.jobSkills),
    licenses: sanitizeLicenses(record.licenses),
    trainingCompleted: sanitizeTrainingCompleted(record.trainingCompleted),
    hunger: Number(finiteNumber(record.hunger, HUNGER_MAX, 0, HUNGER_MAX).toFixed(1)),
  };
}

function loadPlayerSaves(): Map<string, PlayerSave> {
  try {
    if (!fs.existsSync(PLAYER_SAVE_PATH)) return new Map();
    const stat = fs.statSync(PLAYER_SAVE_PATH);
    if (stat.size > MAX_SAVE_BYTES) {
      console.warn('[MoneyRoll] players.json is too large, ignoring for safety');
      return new Map();
    }
    const raw = fs.readFileSync(PLAYER_SAVE_PATH, 'utf8');
    const obj = JSON.parse(raw) as unknown;
    if (!isPlainRecord(obj)) return new Map();

    const saves = new Map<string, PlayerSave>();
    for (const [token, save] of Object.entries(obj)) {
      if (!isValidPlayerToken(token)) continue;
      saves.set(token, sanitizePlayerSave(save));
    }
    return saves;
  } catch (error) {
    console.warn('[MoneyRoll] failed to load players:', error);
    return new Map();
  }
}

function persistPlayerSaves(map: Map<string, PlayerSave>): void {
  try {
    fs.mkdirSync(path.dirname(PLAYER_SAVE_PATH), { recursive: true });
    const obj: Record<string, PlayerSave> = Object.create(null) as Record<string, PlayerSave>;
    for (const [token, save] of map.entries()) {
      if (isValidPlayerToken(token)) obj[token] = sanitizePlayerSave(save);
    }
    const payload = JSON.stringify(obj, null, 2);
    const tempPath = `${PLAYER_SAVE_PATH}.tmp`;
    fs.writeFileSync(tempPath, payload, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempPath, PLAYER_SAVE_PATH);
  } catch (e) {
    console.warn('[MoneyRoll] failed to save players:', e);
  }
}

function cloneSave(save: PlayerSave): PlayerSave {
  return sanitizePlayerSave(JSON.parse(JSON.stringify(save)) as unknown);
}
