import type { WebSocket } from 'ws';
import { BOTTLE_TYPES, INVENTORY_SLOTS, type BottleType, type ServerBottle } from '../../shared/economy.js';
import { cellKey, MAP_WIDTH, MAP_HEIGHT, type MapDocument, type MapEntity } from '../../shared/map.js';

export type WireMessage = {
  type: string;
  [key: string]: unknown;
};

type Client = {
  id: string;
  ws: WebSocket;
  x: number;
  y: number;
  money: number;
  inventory: (BottleType | null)[]; // 12 слотов инвентаря
  backpackTier: number; // 1 = Пакет (8кг), 2 = Сумка (15кг), 3 = Рюкзак (30кг)
};

export type PeerSnapshot = {
  id: string;
  x: number;
  y: number;
};

export class World {
  private clients = new Map<string, Client>();
  private bottles = new Map<string, ServerBottle>();
  
  private map: MapDocument | null = null;
  private spawners: MapEntity[] = [];
  private kiosks: MapEntity[] = [];
  private spawnerIntervals: NodeJS.Timeout[] = [];

  constructor() {
    // Вся инициализация спавнов происходит через setMap()!
  }

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

    if (!map.entities) {
      map.entities = {};
    }

    for (const entity of Object.values(map.entities)) {
      if (entity.type === 'spawner') {
        this.spawners.push(entity);
      } else if (entity.type === 'kiosk') {
        this.kiosks.push(entity);
      }
    }

    console.log(
      `[MoneyRoll][World] Карта загружена: объектов-спавнеров: ${this.spawners.length}, киосков: ${this.kiosks.length}`
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

  private tickSpawner(spawner: MapEntity, maxBottles: number): void {
    const radius = spawner.properties.spawnRadius ?? 3; // Получаем настраиваемый радиус спавна (в клетках)

    // Считаем сколько динамических бутылок сейчас находится рядом со спавнером (в радиусе спавна)
    let nearbyCount = 0;
    for (const b of this.bottles.values()) {
      const cellX = Math.floor(b.x / 128);
      const cellY = Math.floor(b.y / 128);
      if (Math.abs(cellX - spawner.cellX) <= radius && Math.abs(cellY - spawner.cellY) <= radius) {
        nearbyCount++;
      }
    }

    if (nearbyCount >= maxBottles) return;

    // Спавним 1 бутылку в свободной соседней клетке (в радиусе спавна)
    const dx = Math.floor(Math.random() * (radius * 2 + 1)) - radius; // -radius..radius
    const dy = Math.floor(Math.random() * (radius * 2 + 1)) - radius; // -radius..radius
    const targetX = spawner.cellX + dx;
    const targetY = spawner.cellY + dy;

    if (targetX < 0 || targetX >= MAP_WIDTH || targetY < 0 || targetY >= MAP_HEIGHT) return;

    const targetKey = cellKey(targetX, targetY);
    if (this.map?.entities?.[targetKey]) return; // уже занята другим объектом

    const id = `bottle_${Math.random().toString(36).slice(2, 10)}`;
    const type = this.selectRandomBottleType();

    const pixelX = targetX * 128 + 64;
    const pixelY = targetY * 128 + 64;

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

  add(id: string, ws: WebSocket): void {
    const emptyInventory = Array(INVENTORY_SLOTS).fill(null);

    this.clients.set(id, {
      id,
      ws,
      x: 400,
      y: 300,
      money: 5.0, // Стартуем бомжом с $5
      inventory: emptyInventory,
      backpackTier: 1 // По умолчанию пакет
    });
  }

  remove(id: string): void {
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

  private calculateWeight(inv: (BottleType | null)[]): number {
    let total = 0;
    for (const item of inv) {
      if (item) {
        total += BOTTLE_TYPES[item].weight;
      }
    }
    return parseFloat(total.toFixed(2));
  }

  private getMaxWeightLimit(tier: number): number {
    return tier === 1 ? 8.0 : tier === 2 ? 15.0 : 30.0;
  }

  handle(fromId: string, msg: WireMessage): void {
    const c = this.clients.get(fromId);
    if (!c) return;

    switch (msg.type) {
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

        const price = BOTTLE_TYPES[bottleType].price;
        c.money += price;
        c.inventory[slotIdx] = null;

        const newWeight = this.calculateWeight(c.inventory);

        c.ws.send(JSON.stringify({
          type: 'sell-success',
          money: c.money,
          inventory: c.inventory,
          weight: newWeight,
          message: `Сдано: ${BOTTLE_TYPES[bottleType].name}. Получено: $${price.toFixed(2)}`
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
          if (type) {
            totalGain += BOTTLE_TYPES[type].price;
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

        c.ws.send(JSON.stringify({
          type: 'sell-success',
          money: c.money,
          inventory: c.inventory,
          weight: newWeight,
          message: `Сдано бутылок: ${soldCount} шт. Получено: $${totalGain.toFixed(2)}!`
        }));
        break;
      }

      case 'upgrade-backpack': {
        const tier = msg.tier;
        if (typeof tier !== 'number' || tier < 1 || tier > 3) return;

        const cost = tier === 2 ? 15.0 : tier === 3 ? 45.0 : 0;
        if (c.money < cost) {
          c.ws.send(JSON.stringify({
            type: 'upgrade-failed',
            message: `Недостаточно денег! Нужно $${cost.toFixed(2)}`
          }));
          return;
        }

        if (c.backpackTier >= tier) {
          c.ws.send(JSON.stringify({
            type: 'upgrade-failed',
            message: `У тебя уже есть рюкзак лучше!`
          }));
          return;
        }

        c.money -= cost;
        c.backpackTier = tier;

        const weight = this.calculateWeight(c.inventory);

        c.ws.send(JSON.stringify({
          type: 'upgrade-success',
          backpackTier: c.backpackTier,
          money: c.money,
          weight: weight,
          message: `Куплено улучшение: ${tier === 2 ? 'Спортивная сумка (15кг)' : 'Рюкзак туриста (30кг)'}!`
        }));
        break;
      }

      case 'buy-food': {
        const item = msg.itemType;
        const cost = item === 'shawarma' ? 1.50 : item === 'energy' ? 3.00 : 0.0;

        if (c.money < cost) {
          c.ws.send(JSON.stringify({
            type: 'buy-food-failed',
            message: 'Недостаточно денег!'
          }));
          return;
        }

        c.money -= cost;

        c.ws.send(JSON.stringify({
          type: 'buy-food-success',
          itemType: item,
          money: c.money,
          message: item === 'shawarma' 
            ? 'Сытная Шаурма! Восстановлено 100% энергии + бафф бега!' 
            : 'Энергетик Ягуар! Даёт бешеную суперскорость!'
        }));
        break;
      }

      default:
        console.log(`[MoneyRoll][server] unknown msg type: ${msg.type}`);
    }
  }

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
  }
}
