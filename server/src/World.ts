// ============================================================
//  SECTION: WORLD — server authority
// ============================================================

import type { WebSocket } from 'ws';
import {
  BOTTLE_TYPES,
  HUNGER_MAX,
  HUNGER_DRAIN_PER_SEC,
  HUNGER_CRITICAL,
  HUNGER_STARVING,
  INVENTORY_SLOTS,
  PROPERTIES,
  DEFAULT_JOB_SKILLS,
  DEFAULT_LICENSES,
  DEFAULT_EQUIPMENT,
  type BottleType,
  type InventoryItem,
  type JobType,
  type PropertyType,
  type ServerBottle,
} from '../../shared/economy.js';
import {
  cellKey,
  MAP_WIDTH,
  MAP_HEIGHT,
  TILE_SIZE,
  TILE_SIZE_HALF,
  type MapDocument,
  type MapEntity,
} from '../../shared/map.js';
import {
  handleBuyProperty,
  handleBuyShopItem,
  handleEquipBag,
  handleJobComplete,
  handleJobStart,
  handleTrainingBuy,
  handlePickupBottle,
  handleSellAll,
  handleSellSlot,
  handleUnequipBag,
  handleUpgradeBackpack,
  handleUseItem,
  tickHunger,
  type EconomyContext,
} from './handlers/economyHandlers.js';
import {
  handlePlayerInteraction,
  handleTradeAccept,
  handleTradeDecline,
  type InteractionContext,
} from './handlers/interactionHandlers.js';
import { PlayerStore } from './PlayerStore.js';
import type { Client, DeliveryPoint, JobPoint, PropertyPoint, SchoolPoint, WireMessage } from './types.js';

export type { WireMessage } from './types.js';

export class World {
  private clients = new Map<string, Client>();
  private bottles = new Map<string, ServerBottle>();

  private map: MapDocument | null = null;
  private spawners: MapEntity[] = [];
  private kiosks: MapEntity[] = [];
  private jobPoints: JobPoint[] = [];
  private propertyPoints: PropertyPoint[] = [];
  private schoolPoints: SchoolPoint[] = [];
  private deliveryHouses: DeliveryPoint[] = [];
  private spawnerIntervals: NodeJS.Timeout[] = [];
  private passiveIncomeTimer?: NodeJS.Timeout;
  private hungerTimer?: NodeJS.Timeout;
  private playerStore = new PlayerStore();

  constructor() {
    this.passiveIncomeTimer = setInterval(() => this.tickPassiveIncome(), 15_000);
    this.hungerTimer = setInterval(() => this.tickAllHunger(), 15_000);
  }

  // ============================================================
  //  SECTION: LIFECYCLE
  // ============================================================

  get size(): number { return this.clients.size; }

  setMap(map: MapDocument): void {
    this.map = map;

    for (const timer of this.spawnerIntervals) clearInterval(timer);
    this.spawnerIntervals = [];

    this.bottles.clear();
    this.spawners = [];
    this.kiosks = [];
    this.jobPoints = [];
    this.propertyPoints = [];
    this.schoolPoints = [];
    this.deliveryHouses = [];

    if (!map.entities) map.entities = {};

    for (const entity of Object.values(map.entities)) {
      const entityType = entity.type as string;
      if (entityType === 'spawner') {
        this.spawners.push(entity);
      } else if (entityType === 'kiosk') {
        this.kiosks.push(entity);
      } else if (entityType === 'school') {
        this.schoolPoints.push({ id: entity.id, x: entity.cellX * TILE_SIZE + TILE_SIZE_HALF, y: entity.cellY * TILE_SIZE + TILE_SIZE_HALF });
      } else if (entityType === 'apartment-1' || entityType === 'apartment-2' || entityType === 'building') {
        this.deliveryHouses.push({
          id: entity.id,
          x: entity.cellX * TILE_SIZE + TILE_SIZE_HALF,
          y: entity.cellY * TILE_SIZE + TILE_SIZE_HALF,
          cellX: entity.cellX,
          cellY: entity.cellY,
        });
      } else if (entityType === 'courier-hub' || entityType === 'lemonade-stand' || entityType === 'trash-sort-station') {
        const jobType: JobType = entityType === 'trash-sort-station' ? 'trash-sort' : entityType === 'courier-hub' ? 'courier' : 'lemonade';
        this.jobPoints.push({ id: entity.id, jobType, x: entity.cellX * TILE_SIZE + TILE_SIZE_HALF, y: entity.cellY * TILE_SIZE + TILE_SIZE_HALF });
      } else if (entityType === 'property') {
        const propertyType = entity.properties.propertyType as PropertyType | undefined;
        if (propertyType && PROPERTIES[propertyType]) {
          this.propertyPoints.push({ id: entity.id, propertyType, x: entity.cellX * TILE_SIZE + TILE_SIZE_HALF, y: entity.cellY * TILE_SIZE + TILE_SIZE_HALF });
        }
      }
    }

    console.log(`[MoneyRoll][World] Карта загружена: спавнеров: ${this.spawners.length}, киосков: ${this.kiosks.length}, работ: ${this.jobPoints.length}, недвижимости: ${this.propertyPoints.length}, домов для доставки: ${this.deliveryHouses.length}`);

    for (const spawner of this.spawners) {
      const intervalMs = (spawner.properties.spawnInterval ?? 15) * 1000;
      const maxCount = spawner.properties.maxBottles ?? 3;
      this.tickSpawner(spawner, maxCount);
      const timer = setInterval(() => this.tickSpawner(spawner, maxCount), intervalMs);
      this.spawnerIntervals.push(timer);
    }

    this.broadcastAll({ type: 'map-reload', bottles: this.getBottles(), kiosks: this.getKiosks() });
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
      if (Math.abs(cellX - spawner.cellX) <= radius && Math.abs(cellY - spawner.cellY) <= radius) nearbyCount++;
    }
    if (nearbyCount >= maxBottles) return;

    const dx = Math.floor(Math.random() * (radius * 2 + 1)) - radius;
    const dy = Math.floor(Math.random() * (radius * 2 + 1)) - radius;
    const targetX = spawner.cellX + dx;
    const targetY = spawner.cellY + dy;
    if (targetX < 0 || targetX >= MAP_WIDTH || targetY < 0 || targetY >= MAP_HEIGHT) return;
    if (this.map?.entities?.[cellKey(targetX, targetY)]) return;

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
        incomePerMin += PROPERTIES[p.type].incomePerMin;
      }
      const gain = incomePerMin * 0.25;
      if (gain <= 0) continue;
      c.money = parseFloat((c.money + gain).toFixed(2));
      c.ws.send(JSON.stringify({
        type: 'passive-income',
        amount: gain,
        money: c.money,
        message: `Пассивный доход: +$${gain.toFixed(2)}`,
      }));
      this.playerStore.saveClient(c);
    }
  }

  // ============================================================
  //  SECTION: HUNGER
  // ============================================================

  private tickAllHunger(): void {
    for (const c of this.clients.values()) {
      const wasHungry = c.hunger <= HUNGER_CRITICAL;
      tickHunger(c, this.economyCtx());
      const nowHungry = c.hunger <= HUNGER_CRITICAL;

      if (c.hunger <= HUNGER_STARVING && !(c.hunger + HUNGER_DRAIN_PER_SEC * 0.25 > HUNGER_STARVING)) {
        c.ws.send(JSON.stringify({
          type: 'hunger-alert',
          hunger: c.hunger,
          message: 'Ты голоден! HP снижен, скорость упала. Купи еду!',
        }));
      } else if (wasHungry && !nowHungry) {
        c.ws.send(JSON.stringify({
          type: 'hunger-update',
          hunger: c.hunger,
          message: 'Сытость восстановлена!',
        }));
      } else {
        c.ws.send(JSON.stringify({
          type: 'hunger-update',
          hunger: c.hunger,
        }));
      }
    }
  }

  // ============================================================
  //  SECTION: CLIENT MANAGEMENT
  // ============================================================

  add(id: string, ws: WebSocket, playerToken: string | null = null): void {
    const emptyInventory = Array(INVENTORY_SLOTS).fill(null) as (InventoryItem | null)[];
    const save = playerToken ? this.playerStore.get(playerToken) : null;

    const client: Client = {
      id, ws,
      x: 400, y: 300,
      money: save?.money ?? 5.0,
      inventory: save?.inventory
        ? [...save.inventory, ...Array(Math.max(0, INVENTORY_SLOTS - save.inventory.length)).fill(null)].slice(0, INVENTORY_SLOTS)
        : emptyInventory,
      backpackTier: save?.backpackTier ?? 1,
      hasJacket: save?.hasJacket ?? false,
      hasSneakers: save?.hasSneakers ?? false,
      hasCrown: save?.hasCrown ?? false,
      equipment: save?.equipment ?? { ...DEFAULT_EQUIPMENT },
      properties: save?.properties ?? [],
      lastJobAt: { courier: 0, lemonade: 0, 'trash-sort': 0 },
      playerToken,
      jobSkills: save?.jobSkills ? { ...DEFAULT_JOB_SKILLS, ...save.jobSkills } : JSON.parse(JSON.stringify(DEFAULT_JOB_SKILLS)),
      licenses: save?.licenses ? { ...DEFAULT_LICENSES, ...save.licenses } : { ...DEFAULT_LICENSES },
      trainingCompleted: save?.trainingCompleted ?? [],
      activeJob: null,
      hunger: save?.hunger ?? HUNGER_MAX,
    };

    this.clients.set(id, client);
  }

  remove(id: string): void {
    const c = this.clients.get(id);
    if (c) this.playerStore.saveClient(c);
    this.clients.delete(id);
  }

  snapshot(includeId?: string): { id: string; x: number; y: number }[] {
    return Array.from(this.clients.values())
      .filter((c) => (includeId ? c.id !== includeId : true))
      .map((c) => ({ id: c.id, x: c.x, y: c.y }));
  }

  getBottles(): ServerBottle[] { return Array.from(this.bottles.values()); }
  getKiosks(): MapEntity[] { return this.kiosks; }
  getClient(id: string): Client | undefined { return this.clients.get(id); }

  private economyCtx(): EconomyContext {
    return {
      bottles: this.bottles,
      kiosks: this.kiosks,
      jobPoints: this.jobPoints,
      propertyPoints: this.propertyPoints,
      schoolPoints: this.schoolPoints,
      deliveryHouses: this.deliveryHouses,
      saveClient: (c) => this.playerStore.saveClient(c),
      broadcastAll: (p) => this.broadcastAll(p),
    };
  }

  private interactionCtx(): InteractionContext {
    return { getClient: (id) => this.clients.get(id), saveClient: (c) => this.playerStore.saveClient(c) };
  }

  // ============================================================
  //  SECTION: MESSAGE HANDLERS
  // ============================================================

  handle(fromId: string, msg: WireMessage): void {
    const c = this.clients.get(fromId);
    if (!c) return;

    const eco = this.economyCtx();
    const inter = this.interactionCtx();

    switch (msg.type) {
      case 'auth': {
        const token = typeof msg.token === 'string' ? msg.token : null;
        if (token && token !== c.playerToken) {
          const save = this.playerStore.get(token);
          if (save) {
            c.money = save.money;
            c.inventory = [...save.inventory, ...Array(Math.max(0, INVENTORY_SLOTS - save.inventory.length)).fill(null)].slice(0, INVENTORY_SLOTS);
            c.backpackTier = save.backpackTier;
            c.hasJacket = save.hasJacket;
            c.hasSneakers = save.hasSneakers;
            c.hasCrown = save.hasCrown;
            c.equipment = save.equipment ?? { ...DEFAULT_EQUIPMENT };
            c.properties = save.properties ?? [];
            if (save.jobSkills) c.jobSkills = { ...DEFAULT_JOB_SKILLS, ...save.jobSkills };
            if (save.licenses) c.licenses = { ...DEFAULT_LICENSES, ...save.licenses };
            c.trainingCompleted = save.trainingCompleted ?? [];
            c.hunger = save.hunger ?? HUNGER_MAX;
          }
          c.playerToken = token;
          this.playerStore.saveClient(c);
        }
        c.ws.send(JSON.stringify({
          type: 'welcome', id: fromId, money: c.money, inventory: c.inventory, backpackTier: c.backpackTier,
          hasJacket: c.hasJacket, hasSneakers: c.hasSneakers, hasCrown: c.hasCrown,
          equipment: c.equipment,
          properties: c.properties, jobSkills: c.jobSkills, licenses: c.licenses,
          trainingCompleted: c.trainingCompleted, hunger: c.hunger,
          players: this.snapshot(fromId), bottles: this.getBottles(),
        }));
        break;
      }
      case 'move': {
        if (typeof msg.x === 'number') c.x = msg.x;
        if (typeof msg.y === 'number') c.y = msg.y;
        this.broadcastExcept(fromId, { type: 'peer', id: fromId, x: c.x, y: c.y });
        break;
      }
      case 'pickup-bottle': handlePickupBottle(c, msg, eco); break;
      case 'sell-slot': handleSellSlot(c, msg, eco); break;
      case 'sell-all-bottles': handleSellAll(c, eco); break;
      case 'buy-shop-item': handleBuyShopItem(c, msg, eco); break;
      case 'use-item': handleUseItem(c, msg, eco); break;
      case 'equip-bag': handleEquipBag(c, msg, eco); break;
      case 'unequip-bag': handleUnequipBag(c, eco); break;
      case 'job-start': handleJobStart(c, msg, eco); break;
      case 'job-complete':
      case 'job-submit': handleJobComplete(c, msg, eco); break;
      case 'training-buy': handleTrainingBuy(c, msg, eco); break;
      case 'buy-property': handleBuyProperty(c, msg, eco); break;
      case 'upgrade-backpack': handleUpgradeBackpack(c, msg, eco); break;
      case 'buy-food':
        this.handle(fromId, { type: 'buy-shop-item', itemType: msg.itemType });
        break;
      case 'player-interaction': handlePlayerInteraction(c, msg, inter); break;
      case 'trade-accept': handleTradeAccept(c, msg, inter); break;
      case 'trade-decline': handleTradeDecline(c, msg, inter); break;
      default: console.log(`[MoneyRoll][server] unknown msg type: ${msg.type}`);
    }
  }

  // ============================================================
  //  SECTION: BROADCAST
  // ============================================================

  broadcastExcept(excludeId: string, payload: object): void {
    const json = JSON.stringify(payload);
    for (const [id, client] of this.clients) {
      if (id === excludeId) continue;
      if (client.ws.readyState === client.ws.OPEN) client.ws.send(json);
    }
  }

  broadcastAll(payload: object): void { this.broadcastAllRaw(JSON.stringify(payload)); }

  broadcastAllRaw(jsonString: string): void {
    for (const c of this.clients.values()) {
      if (c.ws.readyState === c.ws.OPEN) c.ws.send(jsonString);
    }
  }

  destroy(): void {
    for (const timer of this.spawnerIntervals) clearInterval(timer);
    if (this.passiveIncomeTimer) clearInterval(this.passiveIncomeTimer);
    if (this.hungerTimer) clearInterval(this.hungerTimer);
  }
}
