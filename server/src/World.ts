import type { WebSocket } from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import {
  BACKPACK_TIERS,
  BOTTLE_TYPES,
  FOOD_WEIGHTS,
  GEAR_WEIGHTS,
  INVENTORY_SLOTS,
  SHOP_PRICES,
  JOB_REWARDS,
  PROPERTIES,
  type InventoryItem,
  type BottleType,
  type ServerBottle,
  type ShopItemType,
  type JobType,
  type PropertyType,
  type PlayerSave,
  type ClothingType,
} from '../../shared/economy.js';
import { cellKey, MAP_WIDTH, MAP_HEIGHT, TILE_SIZE, TILE_SIZE_HALF, type MapDocument, type MapEntity } from '../../shared/map.js';

export type WireMessage = {
  type: string;
  [key: string]: unknown;
};

// ============================================================
//  SECTION: TYPES
// ============================================================
type Client = {
  id: string;
  ws: WebSocket;
  x: number;
  y: number;
  money: number;
  inventory: (InventoryItem | null)[];
  backpackTier: number;
  hasJacket: boolean;
  hasSneakers: boolean;
  hasCrown: boolean;
  properties: PropertyType[];
  lastJobAt: Record<JobType, number>;
  playerToken: string | null;
};

export type PeerSnapshot = {
  id: string;
  x: number;
  y: number;
};

const PLAYER_SAVE_PATH = path.resolve(process.cwd(), 'server/data/players.json');

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

function savePlayerSaves(map: Map<string, PlayerSave>) {
  try {
    fs.mkdirSync(path.dirname(PLAYER_SAVE_PATH), { recursive: true });
    const obj = Object.fromEntries(map.entries());
    fs.writeFileSync(PLAYER_SAVE_PATH, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.warn('[MoneyRoll] failed to save players:', e);
  }
}

export class World {
  private clients = new Map<string, Client>();
  private bottles = new Map<string, ServerBottle>();
  
  private map: MapDocument | null = null;
  private spawners: MapEntity[] = [];
  private kiosks: MapEntity[] = [];
  private jobPoints: { id: string; jobType: JobType; x: number; y: number }[] = [];
  private propertyPoints: MapEntity[] = [];
  private spawnerIntervals: NodeJS.Timeout[] = [];
  private passiveIncomeTimer?: NodeJS.Timeout;
  private playerSaves = loadPlayerSaves();

  constructor() {
    // Пассивный доход раз в 15 секунд
    this.passiveIncomeTimer = setInterval(() => this.tickPassiveIncome(), 15000);
  }

  // ============================================================
  //  SECTION: LIFECYCLE
  // ============================================================
  get size(): number {
    return this.clients.size;
  }

  setMap(map: MapDocument): void {
    this.map = map;
    
    for (const timer of this.spawnerIntervals) {
      clearInterval(timer);
    }
    this.spawnerIntervals = [];

    this.bottles.clear();
    this.spawners = [];
    this.kiosks = [];
    this.jobPoints = [];
    this.propertyPoints = [];

    if (!map.entities) {
      map.entities = {};
    }

    for (const entity of Object.values(map.entities)) {
      if (entity.type === 'spawner') {
        this.spawners.push(entity);
      } else if (entity.type === 'kiosk') {
        this.kiosks.push(entity);
      } else if (entity.type === 'job-courier' || entity.type === 'job-lemonade' || entity.type === 'job-trash') {
        const jobType = entity.type.replace('job-', '') as JobType;
        this.jobPoints.push({
          id: entity.id,
          jobType,
          x: entity.cellX * TILE_SIZE + TILE_SIZE_HALF,
          y: entity.cellY * TILE_SIZE + TILE_SIZE_HALF,
        });
      } else if (entity.type === 'property') {
        this.propertyPoints.push(entity);
      }
    }

    console.log(
      `[MoneyRoll][World] Карта загружена: спавнеров: ${this.spawners.length}, киосков: ${this.kiosks.length}, работ: ${this.jobPoints.length}, недвижимости: ${this.propertyPoints.length}`
    );

    for (const spawner of this.spawners) {
      const intervalMs = (spawner.properties.spawnInterval ?? 15) * 1000;
      const maxCount = spawner.properties.maxBottles ?? 3;

      this.tickSpawner(spawner, maxCount);

      const timer = setInterval(() => {
        this.tickSpawner(spawner, maxCount);
      }, intervalMs);

      this.spawnerIntervals.push(timer);
    }

    this.broadcastAll({
      type: 'map-reload',
      bottles: this.getBottles(),
      kiosks: this.getKiosks(),
    });
  }

  // ============================================================
  //  SECTION: SPAWNING
  // ============================================================
  private tickSpawner(spawner: MapEntity, maxBottles: number): void {
    const radius = spawner.properties.spawnRadius ?? 3;

    let nearbyCount = 0;
    for (const b of this.bottles.values()) {
      const cellX = Math.floor(b.x / TILE_SIZE);
      const cellY = Math.floor(b.y / TILE_SIZE);
      if (Math.abs(cellX - spawner.cellX) <= radius && Math.abs(cellY - spawner.cellY) <= radius) {
        nearbyCount++;
      }
    }

    if (nearbyCount >= maxBottles) return;

    const dx = Math.floor(Math.random() * (radius * 2 + 1)) - radius;
    const dy = Math.floor(Math.random() * (radius * 2 + 1)) - radius;
    const targetX = spawner.cellX + dx;
    const targetY = spawner.cellY + dy;

    if (targetX < 0 || targetX >= MAP_WIDTH || targetY < 0 || targetY >= MAP_HEIGHT) return;

    const targetKey = cellKey(targetX, targetY);
    if (this.map?.entities?.[targetKey]) return;

    const id = `bottle_${Math.random().toString(36).slice(2, 10)}`;
    const type = this.selectRandomBottleType();

    const pixelX = targetX * TILE_SIZE + TILE_SIZE_HALF;
    const pixelY = targetY * TILE_SIZE + TILE_SIZE_HALF;

    const bottle: ServerBottle = { id, type, x: pixelX, y: pixelY };
    this.bottles.set(id, bottle);

    this.broadcastAll({ type: 'bottle-spawn', bottle });
  }

  private selectRandomBottleType(): BottleType {
    const types = Object.keys(BOTTLE_TYPES) as BottleType[];
    const totalWeight = types.reduce((acc, t) => acc + BOTTLE_TYPES[t].spawnWeight, 0);
    let r = Math.random() * totalWeight;
    for (const t of types) {
      r -= BOTTLE_TYPES[t].spawnWeight;
      if (r <= 0) return t;
    }
    return 'water';
  }

  // ============================================================
  //  SECTION: PASSIVE INCOME
  // ============================================================
  private tickPassiveIncome(): void {
    for (const c of this.clients.values()) {
      if (c.properties.length === 0) continue;
      let incomePerMin = 0;
      for (const p of c.properties) {
        incomePerMin += PROPERTIES[p].incomePerMin;
      }
      // Тик раз в 15 сек = 0.25 мин
      const gain = incomePerMin * 0.25;
      if (gain <= 0) continue;
      c.money = parseFloat((c.money + gain).toFixed(2));
      c.ws.send(JSON.stringify({
        type: 'passive-income',
        amount: gain,
        money: c.money,
        message: `Пассивный доход: +$${gain.toFixed(2)}`
      }));
      this.saveClient(c);
    }
  }

  // ============================================================
  //  SECTION: PLAYER SAVE
  // ============================================================
  private getPlayerSave(token: string): PlayerSave | null {
    return this.playerSaves.get(token) ?? null;
  }

  private saveClient(c: Client) {
    if (!c.playerToken) return;
    const save: PlayerSave = {
      money: c.money,
      inventory: c.inventory,
      backpackTier: c.backpackTier,
      hasJacket: c.hasJacket,
      hasSneakers: c.hasSneakers,
      hasCrown: c.hasCrown,
      properties: c.properties,
    };
    this.playerSaves.set(c.playerToken, save);
    savePlayerSaves(this.playerSaves);
  }

  // ============================================================
  //  SECTION: CLIENT MANAGEMENT
  // ============================================================
  add(id: string, ws: WebSocket, playerToken: string | null = null): void {
    const emptyInventory = Array(INVENTORY_SLOTS).fill(null);
    let save = playerToken ? this.getPlayerSave(playerToken) : null;

    const client: Client = {
      id,
      ws,
      x: 400,
      y: 300,
      money: save?.money ?? 5.0,
      inventory: save?.inventory ? [...save.inventory, ...Array(Math.max(0, INVENTORY_SLOTS - save.inventory.length)).fill(null)].slice(0, INVENTORY_SLOTS) : emptyInventory,
      backpackTier: save?.backpackTier ?? 1,
      hasJacket: save?.hasJacket ?? false,
      hasSneakers: save?.hasSneakers ?? false,
      hasCrown: save?.hasCrown ?? false,
      properties: save?.properties ?? [],
      lastJobAt: { courier: 0, lemonade: 0, 'trash-sort': 0 },
      playerToken,
    };

    this.clients.set(id, client);
  }

  remove(id: string): void {
    const c = this.clients.get(id);
    if (c) this.saveClient(c);
    this.clients.delete(id);
  }

  snapshot(includeId?: string): PeerSnapshot[] {
    return Array.from(this.clients.values())
      .filter((c) => (includeId ? c.id !== includeId : true))
      .map((c) => ({ id: c.id, x: c.x, y: c.y }));
  }

  getBottles(): ServerBottle[] {
    return Array.from(this.bottles.values());
  }

  getKiosks(): MapEntity[] {
    return this.kiosks;
  }

  getClient(id: string) {
    return this.clients.get(id);
  }

  // ============================================================
  //  SECTION: WEIGHT & LIMIT HELPERS
  // ============================================================
  private calculateWeight(inv: (InventoryItem | null)[]): number {
    let total = 0;
    for (const item of inv) {
      if (!item) continue;
      if (item === 'bag-adidas' || item === 'backpack-tourist') {
        total += GEAR_WEIGHTS[item];
      } else if (item === 'shawarma' || item === 'energy') {
        total += FOOD_WEIGHTS[item];
      } else {
        total += BOTTLE_TYPES[item as BottleType].weight;
      }
    }
    return parseFloat(total.toFixed(2));
  }

  private getMaxWeightLimit(tier: number): number {
    return BACKPACK_TIERS[tier]?.maxWeight ?? BACKPACK_TIERS[1].maxWeight;
  }

  private sendFullState(c: Client) {
    c.ws.send(JSON.stringify({
      type: 'state-sync',
      money: c.money,
      inventory: c.inventory,
      backpackTier: c.backpackTier,
      hasJacket: c.hasJacket,
      hasSneakers: c.hasSneakers,
      hasCrown: c.hasCrown,
      properties: c.properties,
      weight: this.calculateWeight(c.inventory),
    }));
  }

  // ============================================================
  //  SECTION: MESSAGE HANDLERS
  // ============================================================
  handle(fromId: string, msg: WireMessage): void {
    const c = this.clients.get(fromId);
    if (!c) return;

    switch (msg.type) {
      case 'auth': {
        const token = typeof msg.token === 'string' ? msg.token : null;
        if (token && token !== c.playerToken) {
          const save = this.getPlayerSave(token);
          if (save) {
            c.money = save.money;
            c.inventory = [...save.inventory, ...Array(Math.max(0, INVENTORY_SLOTS - save.inventory.length)).fill(null)].slice(0, INVENTORY_SLOTS);
            c.backpackTier = save.backpackTier;
            c.hasJacket = save.hasJacket;
            c.hasSneakers = save.hasSneakers;
            c.hasCrown = save.hasCrown;
            c.properties = save.properties ?? [];
          }
          c.playerToken = token;
          this.saveClient(c);
        }
        c.ws.send(JSON.stringify({
          type: 'welcome',
          id: fromId,
          money: c.money,
          inventory: c.inventory,
          backpackTier: c.backpackTier,
          hasJacket: c.hasJacket,
          hasSneakers: c.hasSneakers,
          hasCrown: c.hasCrown,
          properties: c.properties,
          players: this.snapshot(fromId),
          bottles: this.getBottles(),
        }));
        break;
      }

      case 'move': {
        if (typeof msg.x === 'number') c.x = msg.x;
        if (typeof msg.y === 'number') c.y = msg.y;
        this.broadcastExcept(fromId, { type: 'peer', id: fromId, x: c.x, y: c.y });
        break;
      }

      case 'pickup-bottle': {
        const bottleId = msg.bottleId;
        if (typeof bottleId !== 'string') return;

        const bottle = this.bottles.get(bottleId);
        if (!bottle) {
          c.ws.send(JSON.stringify({
            type: 'pickup-failed',
            bottleId,
            reason: 'already-taken',
            message: 'Конкурент оказался быстрее!'
          }));
          return;
        }

        const dist = Math.hypot(c.x - bottle.x, c.y - bottle.y);
        if (dist > 180) {
          c.ws.send(JSON.stringify({
            type: 'pickup-failed',
            bottleId,
            reason: 'too-far',
            message: 'Слишком далеко!'
          }));
          return;
        }

        const itemDef = BOTTLE_TYPES[bottle.type];
        const currentWeight = this.calculateWeight(c.inventory);
        const maxLimit = this.getMaxWeightLimit(c.backpackTier);

        if (currentWeight + itemDef.weight > maxLimit) {
          c.ws.send(JSON.stringify({
            type: 'pickup-failed',
            bottleId,
            reason: 'too-heavy',
            message: `Превышен вес! Максимум: ${maxLimit}кг`
          }));
          return;
        }

        const emptySlotIdx = c.inventory.indexOf(null);
        if (emptySlotIdx === -1) {
          c.ws.send(JSON.stringify({
            type: 'pickup-failed',
            bottleId,
            reason: 'inventory-full',
            message: 'Инвентарь полон!'
          }));
          return;
        }

        this.bottles.delete(bottleId);
        c.inventory[emptySlotIdx] = bottle.type;

        const newWeight = this.calculateWeight(c.inventory);
        this.saveClient(c);

        c.ws.send(JSON.stringify({
          type: 'pickup-success',
          bottleId,
          inventory: c.inventory,
          weight: newWeight,
          message: `Подобрано: ${itemDef.name}`
        }));

        this.broadcastAll({
          type: 'bottle-picked-up',
          bottleId,
          pickerId: fromId
        });
        break;
      }

      case 'sell-slot': {
        const slotIdx = msg.slotIndex;
        if (typeof slotIdx !== 'number' || slotIdx < 0 || slotIdx >= INVENTORY_SLOTS) return;

        const bottleType = c.inventory[slotIdx];
        if (!bottleType) return;

        if (bottleType === 'bag-adidas' || bottleType === 'backpack-tourist' || bottleType === 'shawarma' || bottleType === 'energy') {
          c.ws.send(JSON.stringify({
            type: 'sell-failed',
            message: 'Автомат принимает только бутылки!'
          }));
          return;
        }

        let nearKiosk = false;
        for (const kiosk of this.kiosks) {
          const kx = kiosk.cellX * 128 + 64;
          const ky = kiosk.cellY * 128 + 64;
          if (Math.hypot(c.x - kx, c.y - ky) < 180) {
            nearKiosk = true;
            break;
          }
        }

        if (!nearKiosk) {
          c.ws.send(JSON.stringify({
            type: 'sell-failed',
            message: 'Ты должен стоять рядом с автоматом!'
          }));
          return;
        }

        const price = BOTTLE_TYPES[bottleType as BottleType].price;
        c.money += price;
        c.inventory[slotIdx] = null;

        const newWeight = this.calculateWeight(c.inventory);
        this.saveClient(c);

        c.ws.send(JSON.stringify({
          type: 'sell-success',
          money: c.money,
          inventory: c.inventory,
          weight: newWeight,
          message: `Сдано: ${BOTTLE_TYPES[bottleType as BottleType].name}. Получено: $${price.toFixed(2)}`
        }));
        break;
      }

      case 'sell-all-bottles': {
        let nearKiosk = false;
        for (const kiosk of this.kiosks) {
          const kx = kiosk.cellX * 128 + 64;
          const ky = kiosk.cellY * 128 + 64;
          if (Math.hypot(c.x - kx, c.y - ky) < 180) {
            nearKiosk = true;
            break;
          }
        }

        if (!nearKiosk) {
          c.ws.send(JSON.stringify({
            type: 'sell-failed',
            message: 'Ты должен стоять рядом с автоматом!'
          }));
          return;
        }

        let totalGain = 0;
        let soldCount = 0;

        for (let i = 0; i < INVENTORY_SLOTS; i++) {
          const type = c.inventory[i];
          if (type && type !== 'bag-adidas' && type !== 'backpack-tourist' && type !== 'shawarma' && type !== 'energy') {
            totalGain += BOTTLE_TYPES[type as BottleType].price;
            c.inventory[i] = null;
            soldCount++;
          }
        }

        if (soldCount === 0) {
          c.ws.send(JSON.stringify({
            type: 'sell-failed',
            message: 'У тебя нет бутылок для сдачи!'
          }));
          return;
        }

        c.money += totalGain;
        const newWeight = this.calculateWeight(c.inventory);
        this.saveClient(c);

        c.ws.send(JSON.stringify({
          type: 'sell-success',
          money: c.money,
          inventory: c.inventory,
          weight: newWeight,
          message: `Сдано бутылок: ${soldCount} шт. Получено: $${totalGain.toFixed(2)}!`
        }));
        break;
      }

      // === SHOP BUY (server-authoritative) ===
      case 'buy-shop-item': {
        const itemType = msg.itemType as ShopItemType;
        const cost = SHOP_PRICES[itemType];
        if (!cost) {
          c.ws.send(JSON.stringify({ type: 'shop-failed', message: 'Товар не продаётся' }));
          return;
        }
        if (c.money < cost) {
          c.ws.send(JSON.stringify({ type: 'shop-failed', message: 'Недостаточно денег!' }));
          return;
        }

        // Одежда
        if (itemType === 'jacket' || itemType === 'sneakers' || itemType === 'crown') {
          if (itemType === 'jacket' && c.hasJacket) { c.ws.send(JSON.stringify({ type: 'shop-failed', message: 'Уже куплено' })); return; }
          if (itemType === 'sneakers' && c.hasSneakers) { c.ws.send(JSON.stringify({ type: 'shop-failed', message: 'Уже куплено' })); return; }
          if (itemType === 'crown' && c.hasCrown) { c.ws.send(JSON.stringify({ type: 'shop-failed', message: 'Уже куплено' })); return; }
          c.money -= cost;
          if (itemType === 'jacket') c.hasJacket = true;
          if (itemType === 'sneakers') c.hasSneakers = true;
          if (itemType === 'crown') c.hasCrown = true;
          this.saveClient(c);
          c.ws.send(JSON.stringify({
            type: 'shop-success',
            itemType,
            money: c.money,
            hasJacket: c.hasJacket,
            hasSneakers: c.hasSneakers,
            hasCrown: c.hasCrown,
            message: 'Покупка успешна!'
          }));
          return;
        }

        // Предметы в инвентарь
        const activeSlots = c.backpackTier === 1 ? 4 : c.backpackTier === 2 ? 8 : 12;
        let freeSlot = -1;
        for (let i = 0; i < activeSlots; i++) if (c.inventory[i] === null) { freeSlot = i; break; }
        if (freeSlot === -1) {
          c.ws.send(JSON.stringify({ type: 'shop-failed', message: 'Инвентарь полон!' }));
          return;
        }
        c.money -= cost;
        c.inventory[freeSlot] = itemType as InventoryItem;
        const weight = this.calculateWeight(c.inventory);
        this.saveClient(c);
        c.ws.send(JSON.stringify({
          type: 'shop-success',
          itemType,
          money: c.money,
          inventory: c.inventory,
          weight,
          message: 'Куплено!'
        }));
        break;
      }

      case 'use-item': {
        const slotIdx = msg.slotIndex as number;
        if (typeof slotIdx !== 'number' || slotIdx < 0 || slotIdx >= INVENTORY_SLOTS) return;
        const item = c.inventory[slotIdx];
        if (item !== 'shawarma' && item !== 'energy') return;
        c.inventory[slotIdx] = null;
        this.saveClient(c);
        c.ws.send(JSON.stringify({
          type: 'use-item-success',
          itemType: item,
          inventory: c.inventory,
          weight: this.calculateWeight(c.inventory),
        }));
        break;
      }

      case 'equip-bag': {
        const slotIdx = msg.slotIndex as number;
        if (typeof slotIdx !== 'number') return;
        const item = c.inventory[slotIdx];
        if (item !== 'bag-adidas' && item !== 'backpack-tourist') return;
        const tier = item === 'bag-adidas' ? 2 : 3;
        if (c.backpackTier >= tier) {
          c.ws.send(JSON.stringify({ type: 'equip-failed', message: 'Уже есть лучше' }));
          return;
        }
        c.inventory[slotIdx] = null;
        c.backpackTier = tier;
        this.saveClient(c);
        c.ws.send(JSON.stringify({
          type: 'equip-success',
          backpackTier: tier,
          inventory: c.inventory,
          weight: this.calculateWeight(c.inventory),
          message: 'Сумка экипирована'
        }));
        break;
      }

      case 'unequip-bag': {
        if (c.backpackTier === 1) return;
        // Проверяем вес
        const weight = this.calculateWeight(c.inventory);
        if (weight > BACKPACK_TIERS[1].maxWeight) {
          c.ws.send(JSON.stringify({ type: 'equip-failed', message: 'Разгрузи рюкзак до 2.5кг!' }));
          return;
        }
        // ищем свободный слот среди первых 4
        let freeSlot = -1;
        for (let i = 0; i < 4; i++) if (c.inventory[i] === null) { freeSlot = i; break; }
        if (freeSlot === -1) {
          c.ws.send(JSON.stringify({ type: 'equip-failed', message: 'Освободи карманы!' }));
          return;
        }
        const bagItem: InventoryItem = c.backpackTier === 2 ? 'bag-adidas' : 'backpack-tourist';
        c.inventory[freeSlot] = bagItem;
        c.backpackTier = 1;
        this.saveClient(c);
        c.ws.send(JSON.stringify({
          type: 'equip-success',
          backpackTier: 1,
          inventory: c.inventory,
          weight: this.calculateWeight(c.inventory),
          message: 'Сумка снята'
        }));
        break;
      }

      // === JOBS ===
      case 'job-complete': {
        const jobType = msg.jobType as JobType;
        const job = JOB_REWARDS[jobType];
        if (!job) return;
        const now = Date.now();
        if (now - (c.lastJobAt[jobType] ?? 0) < job.cooldownMs) {
          c.ws.send(JSON.stringify({ type: 'job-failed', message: 'Подожди немного!' }));
          return;
        }
        // Проверяем близость к точке работы
        let near = false;
        for (const jp of this.jobPoints) {
          if (jp.jobType !== jobType) continue;
          if (Math.hypot(c.x - jp.x, c.y - jp.y) < 180) { near = true; break; }
        }
        if (!near) {
          c.ws.send(JSON.stringify({ type: 'job-failed', message: 'Подойди к месту работы!' }));
          return;
        }
        c.lastJobAt[jobType] = now;
        const reward = job.min + Math.random() * (job.max - job.min);
        c.money = parseFloat((c.money + reward).toFixed(2));
        this.saveClient(c);
        c.ws.send(JSON.stringify({
          type: 'job-success',
          jobType,
          reward,
          money: c.money,
          message: `Заработано: $${reward.toFixed(2)}`
        }));
        break;
      }

      // === PROPERTY BUY ===
      case 'buy-property': {
        const propertyType = msg.propertyType as PropertyType;
        const def = PROPERTIES[propertyType];
        if (!def) return;
        if (c.money < def.price) {
          c.ws.send(JSON.stringify({ type: 'property-failed', message: 'Недостаточно денег!' }));
          return;
        }
        if (c.properties.includes(propertyType)) {
          c.ws.send(JSON.stringify({ type: 'property-failed', message: 'Уже куплено!' }));
          return;
        }
        c.money -= def.price;
        c.properties.push(propertyType);
        this.saveClient(c);
        c.ws.send(JSON.stringify({
          type: 'property-success',
          propertyType,
          money: c.money,
          properties: c.properties,
          message: `Куплено: ${def.name}! Пассивный доход +$${def.incomePerMin}/мин`
        }));
        break;
      }

      // Legacy upgrade-backpack (old client)
      case 'upgrade-backpack': {
        const tier = msg.tier;
        if (typeof tier !== 'number' || tier < 1 || tier > 3) return;
        c.backpackTier = tier;
        this.saveClient(c);
        c.ws.send(JSON.stringify({
          type: 'upgrade-success',
          backpackTier: c.backpackTier,
          money: c.money,
          weight: this.calculateWeight(c.inventory),
          message: `Тир рюкзака: ${tier}`
        }));
        break;
      }

      case 'buy-food': {
        // legacy – перенаправляем в shop-buy
        const item = msg.itemType as ShopItemType;
        this.handle(fromId, { type: 'buy-shop-item', itemType: item });
        break;
      }

      case 'player-interaction': {
        const action = msg.action as string;
        const targetId = msg.targetId as string;
        const target = this.clients.get(targetId);

        if (!target) {
          c.ws.send(JSON.stringify({
            type: 'interaction-failed',
            message: 'Игрок не найден!'
          }));
          return;
        }

        const dist = Math.hypot(c.x - target.x, c.y - target.y);
        if (dist > 180) {
          c.ws.send(JSON.stringify({
            type: 'interaction-failed',
            message: 'Слишком далеко от игрока!'
          }));
          return;
        }

        if (action === 'steal') {
          const success = Math.random() < 0.20;
          if (success) {
            const stealableSlots: number[] = [];
            for (let i = 0; i < INVENTORY_SLOTS; i++) {
              const item = target.inventory[i];
              if (item && item !== 'bag-adidas' && item !== 'backpack-tourist') {
                stealableSlots.push(i);
              }
            }

            if (stealableSlots.length === 0) {
              c.ws.send(JSON.stringify({
                type: 'steal-result',
                success: false,
                message: 'У игрока нет ничего ценного для кражи!'
              }));
              target.ws.send(JSON.stringify({
                type: 'player-notice',
                message: `${c.id} пытался тебя обокрасть, но не нашел ничего!`
              }));
              return;
            }

            const stealIdx = stealableSlots[Math.floor(Math.random() * stealableSlots.length)];
            const stolenItem = target.inventory[stealIdx];

            const freeSlot = c.inventory.indexOf(null);
            if (freeSlot === -1) {
              c.ws.send(JSON.stringify({
                type: 'steal-result',
                success: false,
                message: 'Инвентарь полон — не унести добычу!'
              }));
              return;
            }

            target.inventory[stealIdx] = null;
            c.inventory[freeSlot] = stolenItem;

            const itemName = this.getItemName(stolenItem!);
            this.saveClient(c);
            this.saveClient(target);

            c.ws.send(JSON.stringify({
              type: 'steal-result',
              success: true,
              item: stolenItem,
              inventory: c.inventory,
              weight: this.calculateWeight(c.inventory),
              message: `Украдено: ${itemName}!`
            }));

            target.ws.send(JSON.stringify({
              type: 'player-notice',
              message: `Тебя обокрали! Украли: ${itemName}`
            }));
          } else {
            c.ws.send(JSON.stringify({
              type: 'steal-result',
              success: false,
              message: 'Кража провалена! Игрок заметил тебя!'
            }));

            target.ws.send(JSON.stringify({
              type: 'player-notice',
              message: `${c.id} пытался тебя обокрасть, но ты заметил!`
            }));
          }
        } else if (action === 'give-money') {
          const amount = msg.amount as number;
          if (typeof amount !== 'number' || amount <= 0 || amount > c.money) {
            c.ws.send(JSON.stringify({
              type: 'interaction-failed',
              message: 'Неверная сумма!'
            }));
            return;
          }

          c.money -= amount;
          target.money += amount;
          this.saveClient(c);
          this.saveClient(target);

          c.ws.send(JSON.stringify({
            type: 'give-money-result',
            success: true,
            money: c.money,
            message: `Переведено: $${amount.toFixed(2)} игроку`
          }));

          target.ws.send(JSON.stringify({
            type: 'player-receive-money',
            amount,
            fromId: c.id,
            money: target.money,
            message: `Тебе переведено: $${amount.toFixed(2)}!`
          }));
        } else if (action === 'trade-offer') {
          const slotIdx = msg.slotIndex as number;
          const itemType = msg.itemType as InventoryItem;

          if (typeof slotIdx !== 'number' || !c.inventory[slotIdx]) {
            c.ws.send(JSON.stringify({
              type: 'interaction-failed',
              message: 'Неверный предмет для обмена!'
            }));
            return;
          }

          target.ws.send(JSON.stringify({
            type: 'trade-offer',
            fromId: c.id,
            itemType,
            slotIndex: slotIdx,
            message: `${c.id} предлагает обмен: ${this.getItemName(itemType)}`
          }));

          c.ws.send(JSON.stringify({
            type: 'trade-sent',
            message: 'Предложение обмена отправлено!'
          }));
        }
        break;
      }

      case 'trade-accept': {
        const fromId = msg.fromId as string;
        const fromClient = this.clients.get(fromId);
        if (!fromClient) return;

        const slotIdx = msg.slotIndex as number;
        const item = fromClient.inventory[slotIdx];
        if (!item) return;

        const freeSlot = c.inventory.indexOf(null);
        if (freeSlot === -1) {
          c.ws.send(JSON.stringify({
            type: 'trade-failed',
            message: 'Инвентарь полон!'
          }));
          return;
        }

        fromClient.inventory[slotIdx] = null;
        c.inventory[freeSlot] = item;
        this.saveClient(c);
        this.saveClient(fromClient);

        c.ws.send(JSON.stringify({
          type: 'trade-complete',
          inventory: c.inventory,
          weight: this.calculateWeight(c.inventory),
          message: `Получено: ${this.getItemName(item)}`
        }));

        fromClient.ws.send(JSON.stringify({
          type: 'trade-complete',
          inventory: fromClient.inventory,
          weight: this.calculateWeight(fromClient.inventory),
          message: `Обмен завершен! Отдано: ${this.getItemName(item)}`
        }));
        break;
      }

      case 'trade-decline': {
        const fromId = msg.fromId as string;
        const fromClient = this.clients.get(fromId);
        if (!fromClient) return;

        fromClient.ws.send(JSON.stringify({
          type: 'trade-declined',
          message: 'Обмен отклонен!'
        }));
        break;
      }

      default:
        console.log(`[MoneyRoll][server] unknown msg type: ${msg.type}`);
    }
  }

  private getItemName(item: InventoryItem): string {
    if (item === 'bag-adidas') return 'Сумка Adidas';
    if (item === 'backpack-tourist') return 'Рюкзак туриста';
    if (item === 'shawarma') return 'Шаурма';
    if (item === 'energy') return 'Ягуар';
    const def = BOTTLE_TYPES[item as BottleType];
    return def?.name ?? item;
  }

  // ============================================================
  //  SECTION: BROADCAST
  // ============================================================
  broadcastExcept(excludeId: string, payload: object): void {
    const json = JSON.stringify(payload);
    for (const [id, c] of this.clients) {
      if (id === excludeId) continue;
      if (c.ws.readyState === c.ws.OPEN) c.ws.send(json);
    }
  }

  broadcastAll(payload: object): void {
    const json = JSON.stringify(payload);
    this.broadcastAllRaw(json);
  }

  broadcastAllRaw(jsonString: string): void {
    for (const c of this.clients.values()) {
      if (c.ws.readyState === c.ws.OPEN) c.ws.send(jsonString);
    }
  }

  destroy(): void {
    for (const timer of this.spawnerIntervals) {
      clearInterval(timer);
    }
    if (this.passiveIncomeTimer) clearInterval(this.passiveIncomeTimer);
  }
}
