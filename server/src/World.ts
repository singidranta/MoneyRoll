import type { WebSocket } from 'ws';
import { BOTTLE_TYPES, type BottleType, type ServerBottle, type ServerKiosk } from '../../shared/economy.js';

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
  inventory: BottleType[];
};

export type PeerSnapshot = {
  id: string;
  x: number;
  y: number;
};

export class World {
  private clients = new Map<string, Client>();
  private bottles = new Map<string, ServerBottle>();
  private kiosks: ServerKiosk[] = [
    { id: 'kiosk_1', x: 550, y: 450 },
    { id: 'kiosk_2', x: 1800, y: 1200 },
    { id: 'kiosk_3', x: 3500, y: 2500 }
  ];

  private maxBottles = 80;
  private spawnInterval: NodeJS.Timeout;

  constructor() {
    // Начальный спавн бутылок, чтобы мир не был пустым при старте
    for (let i = 0; i < 30; i++) {
      this.spawnBottle(true); // close to start
    }
    for (let i = 0; i < 20; i++) {
      this.spawnBottle(false); // anywhere on map
    }

    // Периодический спавн
    this.spawnInterval = setInterval(() => {
      if (this.bottles.size < this.maxBottles) {
        this.spawnBottle(Math.random() < 0.3); // 30% шанса спавна поближе
      }
    }, 4000);
  }

  get size(): number {
    return this.clients.size;
  }

  add(id: string, ws: WebSocket): void {
    this.clients.set(id, {
      id,
      ws,
      x: 400,
      y: 300,
      money: 5.0, // Стартуем бомжом с $5
      inventory: []
    });
  }

  remove(id: string): void {
    this.clients.delete(id);
  }

  /** Снимок всех позиций — используется в welcome при коннекте нового клиента. */
  snapshot(includeId?: string): PeerSnapshot[] {
    return Array.from(this.clients.values())
      .filter((c) => (includeId ? c.id !== includeId : true))
      .map((c) => ({ id: c.id, x: c.x, y: c.y }));
  }

  /** Получить все текущие бутылки в мире */
  getBottles(): ServerBottle[] {
    return Array.from(this.bottles.values());
  }

  /** Получить список киосков */
  getKiosks(): ServerKiosk[] {
    return this.kiosks;
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

  private spawnBottle(nearStart = false): void {
    const id = `bottle_${Math.random().toString(36).slice(2, 10)}`;
    const type = this.selectRandomBottleType();
    
    let x = 0;
    let y = 0;

    if (nearStart) {
      // Спавним в радиусе 150-1200 пикселей вокруг спавна игрока (400, 300)
      const angle = Math.random() * Math.PI * 2;
      const dist = 150 + Math.random() * 950;
      x = Math.round(400 + Math.cos(angle) * dist);
      y = Math.round(300 + Math.sin(angle) * dist);
      // Ограничиваем границами
      x = Math.max(50, Math.min(12750, x));
      y = Math.max(50, Math.min(12750, y));
    } else {
      // Спавним в любой точке карты
      x = Math.round(100 + Math.random() * 12600);
      y = Math.round(100 + Math.random() * 12600);
    }

    const bottle: ServerBottle = { id, type, x, y };
    this.bottles.set(id, bottle);

    // Оповещаем всех игроков
    this.broadcastAll({ type: 'bottle-spawn', bottle });
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
          // Бутылка не найдена (уже кто-то поднял - Race Condition!)
          c.ws.send(JSON.stringify({
            type: 'pickup-failed',
            bottleId,
            reason: 'already-taken',
            message: 'ЁБНУТЫЙ НЕТКОД: бутылка уже похищена конкурентом!'
          }));
          return;
        }

        // Проверяем расстояние (допустим, лимит 90 пикселей)
        const dist = Math.hypot(c.x - bottle.x, c.y - bottle.y);
        if (dist > 120) {
          c.ws.send(JSON.stringify({
            type: 'pickup-failed',
            bottleId,
            reason: 'too-far',
            message: 'Ты слишком далеко! Пакет потерялся в астрале.'
          }));
          return;
        }

        // Проверяем инвентарь (макс 5 бутылок)
        if (c.inventory.length >= 5) {
          c.ws.send(JSON.stringify({
            type: 'pickup-failed',
            bottleId,
            reason: 'inventory-full',
            message: 'Твои карманы полны стеклотары! Беги к киоску!'
          }));
          return;
        }

        // Успешный подбор!
        this.bottles.delete(bottleId);
        c.inventory.push(bottle.type);

        // Отправляем подтверждение подобравшему
        c.ws.send(JSON.stringify({
          type: 'pickup-success',
          bottleId,
          inventory: c.inventory,
          message: `Подобрано: ${BOTTLE_TYPES[bottle.type].name} (+$${BOTTLE_TYPES[bottle.type].price.toFixed(2)})`
        }));

        // Оповещаем всех остальных, чтобы удалили бутылку со сцены
        this.broadcastAll({
          type: 'bottle-picked-up',
          bottleId,
          pickerId: fromId
        });
        break;
      }

      case 'sell-bottles': {
        const kioskId = msg.kioskId;
        if (typeof kioskId !== 'string') return;

        const kiosk = this.kiosks.find(k => k.id === kioskId);
        if (!kiosk) return;

        // Проверяем дистанцию до киоска
        const dist = Math.hypot(c.x - kiosk.x, c.y - kiosk.y);
        if (dist > 150) {
          c.ws.send(JSON.stringify({
            type: 'sell-failed',
            message: 'Слишком далеко от киоска!'
          }));
          return;
        }

        if (c.inventory.length === 0) {
          c.ws.send(JSON.stringify({
            type: 'sell-failed',
            message: 'У тебя нет бутылок для сдачи!'
          }));
          return;
        }

        // Считаем общую стоимость
        let totalGain = 0;
        for (const type of c.inventory) {
          totalGain += BOTTLE_TYPES[type].price;
        }

        c.money += totalGain;
        const soldCount = c.inventory.length;
        c.inventory = [];

        // Отправляем успех игроку
        c.ws.send(JSON.stringify({
          type: 'sell-success',
          money: c.money,
          inventory: c.inventory,
          message: `Успешно сдано бутылок: ${soldCount} шт. Получено: $${totalGain.toFixed(2)}!`
        }));

        // Broadcast для обновления HUD или визуальных эффектов (опционально)
        break;
      }

      default:
        console.log(`[MoneyRoll][server] unknown msg type: ${msg.type}`);
    }
  }

  /** Broadcast всем клиентам, КРОМЕ excludeId */
  broadcastExcept(excludeId: string, payload: object): void {
    const json = JSON.stringify(payload);
    for (const [id, c] of this.clients) {
      if (id === excludeId) continue;
      if (c.ws.readyState === c.ws.OPEN) c.ws.send(json);
    }
  }

  /** Broadcast ВСЕМ клиентам */
  broadcastAll(payload: object): void {
    const json = JSON.stringify(payload);
    this.broadcastAllRaw(json);
  }

  /** Прямая отправка уже сериализованного JSON всем клиентам */
  broadcastAllRaw(jsonString: string): void {
    for (const c of this.clients.values()) {
      if (c.ws.readyState === c.ws.OPEN) c.ws.send(jsonString);
    }
  }

  destroy(): void {
    clearInterval(this.spawnInterval);
  }
}
