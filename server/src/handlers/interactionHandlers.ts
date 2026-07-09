// ============================================================
//  SECTION: PLAYER INTERACTION HANDLERS (steal / trade / give)
// ============================================================

import { INVENTORY_SLOTS, type InventoryItem } from '../../../shared/economy.js';
import { calculateInventoryWeight, getItemName, isBag } from '../../../shared/items.js';
import type { Client, WireMessage } from '../types.js';

const INTERACT_DIST = 180;

function send(c: Client, payload: object): void {
  c.ws.send(JSON.stringify(payload));
}

export type InteractionContext = {
  getClient: (id: string) => Client | undefined;
  saveClient: (c: Client) => void;
};

export function handlePlayerInteraction(
  c: Client,
  msg: WireMessage,
  ctx: InteractionContext,
): void {
  const action = msg.action as string;
  const targetId = msg.targetId as string;
  const target = ctx.getClient(targetId);

  if (!target) {
    send(c, { type: 'interaction-failed', message: 'Игрок не найден!' });
    return;
  }

  const dist = Math.hypot(c.x - target.x, c.y - target.y);
  if (dist > INTERACT_DIST) {
    send(c, { type: 'interaction-failed', message: 'Слишком далеко от игрока!' });
    return;
  }

  if (action === 'steal') {
    handleSteal(c, target, ctx);
  } else if (action === 'give-money') {
    handleGiveMoney(c, target, msg, ctx);
  } else if (action === 'trade-offer') {
    handleTradeOffer(c, target, msg);
  }
}

function handleSteal(c: Client, target: Client, ctx: InteractionContext): void {
  const success = Math.random() < 0.2;
  if (success) {
    const stealableSlots: number[] = [];
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const item = target.inventory[i];
      if (item && !isBag(item)) stealableSlots.push(i);
    }

    if (stealableSlots.length === 0) {
      send(c, {
        type: 'steal-result',
        success: false,
        message: 'У игрока нет ничего ценного для кражи!',
      });
      send(target, {
        type: 'player-notice',
        message: `${c.id} пытался тебя обокрасть, но не нашел ничего!`,
      });
      return;
    }

    const stealIdx = stealableSlots[Math.floor(Math.random() * stealableSlots.length)];
    const stolenItem = target.inventory[stealIdx];

    const freeSlot = c.inventory.indexOf(null);
    if (freeSlot === -1) {
      send(c, {
        type: 'steal-result',
        success: false,
        message: 'Инвентарь полон — не унести добычу!',
      });
      return;
    }

    target.inventory[stealIdx] = null;
    c.inventory[freeSlot] = stolenItem;

    const itemName = getItemName(stolenItem!);
    ctx.saveClient(c);
    ctx.saveClient(target);

    send(c, {
      type: 'steal-result',
      success: true,
      item: stolenItem,
      inventory: c.inventory,
      weight: calculateInventoryWeight(c.inventory),
      message: `Украдено: ${itemName}!`,
    });

    send(target, {
      type: 'player-notice',
      message: `Тебя обокрали! Украли: ${itemName}`,
    });
  } else {
    send(c, {
      type: 'steal-result',
      success: false,
      message: 'Кража провалена! Игрок заметил тебя!',
    });

    send(target, {
      type: 'player-notice',
      message: `${c.id} пытался тебя обокрасть, но ты заметил!`,
    });
  }
}

function handleGiveMoney(
  c: Client,
  target: Client,
  msg: WireMessage,
  ctx: InteractionContext,
): void {
  const amount = msg.amount as number;
  if (typeof amount !== 'number' || amount <= 0 || amount > c.money) {
    send(c, { type: 'interaction-failed', message: 'Неверная сумма!' });
    return;
  }

  c.money -= amount;
  target.money += amount;
  ctx.saveClient(c);
  ctx.saveClient(target);

  send(c, {
    type: 'give-money-result',
    success: true,
    money: c.money,
    message: `Переведено: $${amount.toFixed(2)} игроку`,
  });

  send(target, {
    type: 'player-receive-money',
    amount,
    fromId: c.id,
    money: target.money,
    message: `Тебе переведено: $${amount.toFixed(2)}!`,
  });
}

function handleTradeOffer(c: Client, target: Client, msg: WireMessage): void {
  const slotIdx = msg.slotIndex as number;
  const itemType = msg.itemType as InventoryItem;

  if (typeof slotIdx !== 'number' || !c.inventory[slotIdx]) {
    send(c, { type: 'interaction-failed', message: 'Неверный предмет для обмена!' });
    return;
  }

  send(target, {
    type: 'trade-offer',
    fromId: c.id,
    itemType,
    slotIndex: slotIdx,
    message: `${c.id} предлагает обмен: ${getItemName(itemType)}`,
  });

  send(c, {
    type: 'trade-sent',
    message: 'Предложение обмена отправлено!',
  });
}

export function handleTradeAccept(
  c: Client,
  msg: WireMessage,
  ctx: InteractionContext,
): void {
  const fromId = msg.fromId as string;
  const fromClient = ctx.getClient(fromId);
  if (!fromClient) return;

  const slotIdx = msg.slotIndex as number;
  const item = fromClient.inventory[slotIdx];
  if (!item) return;

  const freeSlot = c.inventory.indexOf(null);
  if (freeSlot === -1) {
    send(c, { type: 'trade-failed', message: 'Инвентарь полон!' });
    return;
  }

  fromClient.inventory[slotIdx] = null;
  c.inventory[freeSlot] = item;
  ctx.saveClient(c);
  ctx.saveClient(fromClient);

  send(c, {
    type: 'trade-complete',
    inventory: c.inventory,
    weight: calculateInventoryWeight(c.inventory),
    message: `Получено: ${getItemName(item)}`,
  });

  send(fromClient, {
    type: 'trade-complete',
    inventory: fromClient.inventory,
    weight: calculateInventoryWeight(fromClient.inventory),
    message: `Обмен завершен! Отдано: ${getItemName(item)}`,
  });
}

export function handleTradeDecline(
  _c: Client,
  msg: WireMessage,
  ctx: InteractionContext,
): void {
  const fromId = msg.fromId as string;
  const fromClient = ctx.getClient(fromId);
  if (!fromClient) return;

  send(fromClient, {
    type: 'trade-declined',
    message: 'Обмен отклонен!',
  });
}
