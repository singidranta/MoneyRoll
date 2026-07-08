import type { WebSocket } from 'ws';

export type WireMessage = {
  type: string;
  [key: string]: unknown;
};

type Client = {
  id: string;
  ws: WebSocket;
  x: number;
  y: number;
};

/**
 * Минимальная модель состояния мира.
 * Сейчас хранит: id клиента + позицию.
 * Будет расширяться: бутылки, инвентарь, деньги, NPC.
 */
export type PeerSnapshot = {
  id: string;
  x: number;
  y: number;
};

export class World {
  private clients = new Map<string, Client>();

  get size(): number {
    return this.clients.size;
  }

  add(id: string, ws: WebSocket): void {
    this.clients.set(id, { id, ws, x: 400, y: 300 });
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
      default:
        console.log(`[MoneyRoll][server] unknown msg type: ${msg.type}`);
    }
  }

  /** Broadcast всем клиентам, КРОМЕ excludeId (например, mover не должен получать свой peer-echo). */
  broadcastExcept(excludeId: string, payload: object): void {
    const json = JSON.stringify(payload);
    for (const [id, c] of this.clients) {
      if (id === excludeId) continue;
      if (c.ws.readyState === c.ws.OPEN) c.ws.send(json);
    }
  }

  /** Broadcast ВСЕМ клиентам (например, leave при дисконнекте). */
  broadcastAll(payload: object): void {
    const json = JSON.stringify(payload);
    this.broadcastAllRaw(json);
  }

  /** Прямая отправка уже сериализованного JSON всем клиентам (без JSON.stringify). */
  broadcastAllRaw(jsonString: string): void {
    for (const c of this.clients.values()) {
      if (c.ws.readyState === c.ws.OPEN) c.ws.send(jsonString);
    }
  }
}
