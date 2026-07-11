// ============================================================
//  SECTION: PLAYER INTERACTION HANDLERS (steal / trade / give)
// ============================================================

import { randomUUID } from 'node:crypto';
import { INVENTORY_SLOTS, type InventoryItem } from '../../../shared/economy.js';
import { calculateInventoryWeight, getActiveSlotsCount, getItemName, getItemWeight, getMaxWeight, isBag } from '../../../shared/items.js';
import type { Client, WireMessage } from '../types.js';

const INTERACT_DIST = 180;
const TRADE_OFFER_TTL_MS = 15_000;

export type PendingTradeOffer = {
  id: string;
  fromId: string;
  toId: string;
  slotIndex: number;
  itemType: InventoryItem;
  expiresAt: number;
};

function send(c: Client, payload: object): void {
  if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(payload));
}

function isFiniteMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidSlot(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < INVENTORY_SLOTS;
}

function isActiveSlot(c: Client, slotIdx: number): boolean {
  return slotIdx >= 0 && slotIdx < getActiveSlotsCount(c.backpackTier);
}

function isClose(a: Client, b: Client): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= INTERACT_DIST;
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

export type InteractionContext = {
  getClient: (id: string) => Client | undefined;
  saveClient: (c: Client) => void;
  createTradeOffer: (offer: Omit<PendingTradeOffer, 'id' | 'expiresAt'>) => PendingTradeOffer;
  consumeTradeOffer: (offerId: string, toId: string) => PendingTradeOffer | null;
  removeTradeOffer: (offerId: string, toId: string) => PendingTradeOffer | null;
};

export function createPendingTradeOffer(offer: Omit<PendingTradeOffer, 'id' | 'expiresAt'>): PendingTradeOffer {
  return {
    ...offer,
    id: randomUUID(),
    expiresAt: Date.now() + TRADE_OFFER_TTL_MS,
  };
}

export function isTradeOfferExpired(offer: PendingTradeOffer): boolean {
  return offer.expiresAt <= Date.now();
}

export function handlePlayerInteraction(
  c: Client,
  msg: WireMessage,
  ctx: InteractionContext,
): void {
  const action = msg.action;
  const targetId = msg.targetId;
  if (typeof action !== 'string' || typeof targetId !== 'string' || targetId === c.id) {
    send(c, { type: 'interaction-failed', message: 'Неверная цель!' });
    return;
  }

  const target = ctx.getClient(targetId);
  if (!target) {
    send(c, { type: 'interaction-failed', message: 'Игрок не найден!' });
    return;
  }

  if (!isClose(c, target)) {
    send(c, { type: 'interaction-failed', message: 'Слишком далеко от игрока!' });
    return;
  }

  if (action === 'steal') {
    handleSteal(c, target, ctx);
  } else if (action === 'give-money') {
    handleGiveMoney(c, target, msg, ctx);
  } else if (action === 'trade-offer') {
    handleTradeOffer(c, target, msg, ctx);
  } else {
    send(c, { type: 'interaction-failed', message: 'Неизвестное действие!' });
  }
}

function handleSteal(c: Client, target: Client, ctx: InteractionContext): void {
  const success = Math.random() < 0.2;
  if (!success) {
    send(c, {
      type: 'steal-result',
      success: false,
      message: 'Кража провалена! Игрок заметил тебя!',
    });
    send(target, {
      type: 'player-notice',
      message: `${c.id} пытался тебя обокрасть, но ты заметил!`,
    });
    return;
  }

  const stealableSlots: number[] = [];
  const targetActiveSlots = getActiveSlotsCount(target.backpackTier);
  for (let i = 0; i < targetActiveSlots; i++) {
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

  const freeSlot = c.inventory.findIndex((item, index) => item === null && index < getActiveSlotsCount(c.backpackTier));
  if (freeSlot === -1) {
    send(c, {
      type: 'steal-result',
      success: false,
      message: 'Инвентарь полон — не унести добычу!',
    });
    return;
  }

  const stealIdx = stealableSlots[Math.floor(Math.random() * stealableSlots.length)];
  const stolenItem = target.inventory[stealIdx];
  if (!stolenItem) return;

  if (calculateInventoryWeight(c.inventory) + getItemWeight(stolenItem) > getMaxWeight(c.backpackTier)) {
    send(c, {
      type: 'steal-result',
      success: false,
      message: 'Слишком тяжело — не унести добычу!',
    });
    return;
  }

  target.inventory[stealIdx] = null;
  c.inventory[freeSlot] = stolenItem;

  const itemName = getItemName(stolenItem);
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
    inventory: target.inventory,
    weight: calculateInventoryWeight(target.inventory),
    message: `Тебя обокрали! Украли: ${itemName}`,
  });
}

function handleGiveMoney(
  c: Client,
  target: Client,
  msg: WireMessage,
  ctx: InteractionContext,
): void {
  const amount = msg.amount;
  if (!isFiniteMoney(amount) || amount <= 0) {
    send(c, { type: 'interaction-failed', message: 'Неверная сумма!' });
    return;
  }

  const normalizedAmount = roundMoney(amount);
  if (normalizedAmount <= 0 || normalizedAmount > c.money) {
    send(c, { type: 'interaction-failed', message: 'Неверная сумма!' });
    return;
  }

  c.money = roundMoney(c.money - normalizedAmount);
  target.money = roundMoney(target.money + normalizedAmount);
  ctx.saveClient(c);
  ctx.saveClient(target);

  send(c, {
    type: 'give-money-result',
    success: true,
    money: c.money,
    message: `Переведено: $${normalizedAmount.toFixed(2)} игроку`,
  });

  send(target, {
    type: 'player-receive-money',
    amount: normalizedAmount,
    fromId: c.id,
    money: target.money,
    message: `Тебе переведено: $${normalizedAmount.toFixed(2)}!`,
  });
}

function handleTradeOffer(
  c: Client,
  target: Client,
  msg: WireMessage,
  ctx: InteractionContext,
): void {
  const slotIdx = msg.slotIndex;
  if (!isValidSlot(slotIdx) || !isActiveSlot(c, slotIdx)) {
    send(c, { type: 'interaction-failed', message: 'Неверный предмет для обмена!' });
    return;
  }

  const item = c.inventory[slotIdx];
  if (!item) {
    send(c, { type: 'interaction-failed', message: 'Неверный предмет для обмена!' });
    return;
  }

  const offer = ctx.createTradeOffer({
    fromId: c.id,
    toId: target.id,
    slotIndex: slotIdx,
    itemType: item,
  });

  send(target, {
    type: 'trade-offer',
    offerId: offer.id,
    fromId: c.id,
    itemType: item,
    slotIndex: slotIdx,
    expiresAt: offer.expiresAt,
    message: `${c.id} предлагает обмен: ${getItemName(item)}`,
  });

  send(c, {
    type: 'trade-sent',
    offerId: offer.id,
    message: 'Предложение обмена отправлено!',
  });
}

export function handleTradeAccept(
  c: Client,
  msg: WireMessage,
  ctx: InteractionContext,
): void {
  const offerId = msg.offerId;
  if (typeof offerId !== 'string') {
    send(c, { type: 'trade-failed', message: 'Предложение устарело.' });
    return;
  }

  const offer = ctx.consumeTradeOffer(offerId, c.id);
  if (!offer) {
    send(c, { type: 'trade-failed', message: 'Предложение устарело.' });
    return;
  }

  const fromClient = ctx.getClient(offer.fromId);
  if (!fromClient || !isClose(c, fromClient)) {
    send(c, { type: 'trade-failed', message: 'Игрок слишком далеко или вышел.' });
    return;
  }

  const item = fromClient.inventory[offer.slotIndex];
  if (item !== offer.itemType) {
    send(c, { type: 'trade-failed', message: 'Предмет уже недоступен.' });
    send(fromClient, { type: 'trade-failed', message: 'Предмет уже недоступен.' });
    return;
  }

  const freeSlot = c.inventory.findIndex((candidate, index) => candidate === null && index < getActiveSlotsCount(c.backpackTier));
  if (freeSlot === -1) {
    send(c, { type: 'trade-failed', message: 'Инвентарь полон!' });
    return;
  }

  if (calculateInventoryWeight(c.inventory) + getItemWeight(item) > getMaxWeight(c.backpackTier)) {
    send(c, { type: 'trade-failed', message: 'Слишком тяжело для твоей сумки!' });
    return;
  }

  fromClient.inventory[offer.slotIndex] = null;
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
  c: Client,
  msg: WireMessage,
  ctx: InteractionContext,
): void {
  const offerId = msg.offerId;
  if (typeof offerId !== 'string') return;

  const offer = ctx.removeTradeOffer(offerId, c.id);
  if (!offer) return;

  const fromClient = ctx.getClient(offer.fromId);
  if (!fromClient) return;

  send(fromClient, {
    type: 'trade-declined',
    message: 'Обмен отклонен!',
  });
}
