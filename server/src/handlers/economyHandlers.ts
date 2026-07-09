// ============================================================
//  SECTION: ECONOMY HANDLERS (pickup / sell / shop / bags / jobs)
// ============================================================

import {
  BACKPACK_TIERS,
  BOTTLE_TYPES,
  INVENTORY_SLOTS,
  JOB_REWARDS,
  PROPERTIES,
  SHOP_PRICES,
  type BottleType,
  type InventoryItem,
  type JobType,
  type PropertyType,
  type ServerBottle,
  type ShopItemType,
} from '../../../shared/economy.js';
import {
  calculateInventoryWeight,
  getActiveSlotsCount,
  getMaxWeight,
  isBag,
  isFood,
  tierToBag,
} from '../../../shared/items.js';
import { TILE_SIZE, TILE_SIZE_HALF, type MapEntity } from '../../../shared/map.js';
import type { Client, JobPoint, WireMessage } from '../types.js';

export type EconomyContext = {
  bottles: Map<string, ServerBottle>;
  kiosks: MapEntity[];
  jobPoints: JobPoint[];
  saveClient: (c: Client) => void;
  broadcastAll: (payload: object) => void;
};

const INTERACT_DIST = 180;

function send(c: Client, payload: object): void {
  c.ws.send(JSON.stringify(payload));
}

function nearAnyKiosk(c: Client, kiosks: MapEntity[]): boolean {
  for (const kiosk of kiosks) {
    const kx = kiosk.cellX * TILE_SIZE + TILE_SIZE_HALF;
    const ky = kiosk.cellY * TILE_SIZE + TILE_SIZE_HALF;
    if (Math.hypot(c.x - kx, c.y - ky) < INTERACT_DIST) return true;
  }
  return false;
}

// ============================================================
//  SECTION: PICKUP
// ============================================================

export function handlePickupBottle(c: Client, msg: WireMessage, ctx: EconomyContext): void {
  const bottleId = msg.bottleId;
  if (typeof bottleId !== 'string') return;

  const bottle = ctx.bottles.get(bottleId);
  if (!bottle) {
    send(c, {
      type: 'pickup-failed',
      bottleId,
      reason: 'already-taken',
      message: 'Конкурент оказался быстрее!',
    });
    return;
  }

  const dist = Math.hypot(c.x - bottle.x, c.y - bottle.y);
  if (dist > INTERACT_DIST) {
    send(c, {
      type: 'pickup-failed',
      bottleId,
      reason: 'too-far',
      message: 'Слишком далеко!',
    });
    return;
  }

  const itemDef = BOTTLE_TYPES[bottle.type];
  const currentWeight = calculateInventoryWeight(c.inventory);
  const maxLimit = getMaxWeight(c.backpackTier);

  if (currentWeight + itemDef.weight > maxLimit) {
    send(c, {
      type: 'pickup-failed',
      bottleId,
      reason: 'too-heavy',
      message: `Превышен вес! Максимум: ${maxLimit}кг`,
    });
    return;
  }

  const emptySlotIdx = c.inventory.indexOf(null);
  if (emptySlotIdx === -1) {
    send(c, {
      type: 'pickup-failed',
      bottleId,
      reason: 'inventory-full',
      message: 'Инвентарь полон!',
    });
    return;
  }

  ctx.bottles.delete(bottleId);
  c.inventory[emptySlotIdx] = bottle.type;

  const newWeight = calculateInventoryWeight(c.inventory);
  ctx.saveClient(c);

  send(c, {
    type: 'pickup-success',
    bottleId,
    inventory: c.inventory,
    weight: newWeight,
    message: `Подобрано: ${itemDef.name}`,
  });

  ctx.broadcastAll({
    type: 'bottle-picked-up',
    bottleId,
    pickerId: c.id,
  });
}

// ============================================================
//  SECTION: SELL
// ============================================================

export function handleSellSlot(c: Client, msg: WireMessage, ctx: EconomyContext): void {
  const slotIdx = msg.slotIndex;
  if (typeof slotIdx !== 'number' || slotIdx < 0 || slotIdx >= INVENTORY_SLOTS) return;

  const bottleType = c.inventory[slotIdx];
  if (!bottleType) return;

  if (isBag(bottleType) || isFood(bottleType)) {
    send(c, { type: 'sell-failed', message: 'Автомат принимает только бутылки!' });
    return;
  }

  if (!nearAnyKiosk(c, ctx.kiosks)) {
    send(c, { type: 'sell-failed', message: 'Ты должен стоять рядом с автоматом!' });
    return;
  }

  const price = BOTTLE_TYPES[bottleType as BottleType].price;
  c.money += price;
  c.inventory[slotIdx] = null;

  const newWeight = calculateInventoryWeight(c.inventory);
  ctx.saveClient(c);

  send(c, {
    type: 'sell-success',
    money: c.money,
    inventory: c.inventory,
    weight: newWeight,
    message: `Сдано: ${BOTTLE_TYPES[bottleType as BottleType].name}. Получено: $${price.toFixed(2)}`,
  });
}

export function handleSellAll(c: Client, ctx: EconomyContext): void {
  if (!nearAnyKiosk(c, ctx.kiosks)) {
    send(c, { type: 'sell-failed', message: 'Ты должен стоять рядом с автоматом!' });
    return;
  }

  let totalGain = 0;
  let soldCount = 0;

  for (let i = 0; i < INVENTORY_SLOTS; i++) {
    const type = c.inventory[i];
    if (type && !isBag(type) && !isFood(type)) {
      totalGain += BOTTLE_TYPES[type as BottleType].price;
      c.inventory[i] = null;
      soldCount++;
    }
  }

  if (soldCount === 0) {
    send(c, { type: 'sell-failed', message: 'У тебя нет бутылок для сдачи!' });
    return;
  }

  c.money += totalGain;
  const newWeight = calculateInventoryWeight(c.inventory);
  ctx.saveClient(c);

  send(c, {
    type: 'sell-success',
    money: c.money,
    inventory: c.inventory,
    weight: newWeight,
    message: `Сдано бутылок: ${soldCount} шт. Получено: $${totalGain.toFixed(2)}!`,
  });
}

// ============================================================
//  SECTION: SHOP
// ============================================================

export function handleBuyShopItem(c: Client, msg: WireMessage, ctx: EconomyContext): void {
  const itemType = msg.itemType as ShopItemType;
  const cost = SHOP_PRICES[itemType];
  if (!cost) {
    send(c, { type: 'shop-failed', message: 'Товар не продаётся' });
    return;
  }
  if (c.money < cost) {
    send(c, { type: 'shop-failed', message: 'Недостаточно денег!' });
    return;
  }

  if (itemType === 'jacket' || itemType === 'sneakers' || itemType === 'crown') {
    if (itemType === 'jacket' && c.hasJacket) {
      send(c, { type: 'shop-failed', message: 'Уже куплено' });
      return;
    }
    if (itemType === 'sneakers' && c.hasSneakers) {
      send(c, { type: 'shop-failed', message: 'Уже куплено' });
      return;
    }
    if (itemType === 'crown' && c.hasCrown) {
      send(c, { type: 'shop-failed', message: 'Уже куплено' });
      return;
    }
    c.money -= cost;
    if (itemType === 'jacket') c.hasJacket = true;
    if (itemType === 'sneakers') c.hasSneakers = true;
    if (itemType === 'crown') c.hasCrown = true;
    ctx.saveClient(c);
    send(c, {
      type: 'shop-success',
      itemType,
      money: c.money,
      hasJacket: c.hasJacket,
      hasSneakers: c.hasSneakers,
      hasCrown: c.hasCrown,
      message: 'Покупка успешна!',
    });
    return;
  }

  const activeSlots = getActiveSlotsCount(c.backpackTier);
  let freeSlot = -1;
  for (let i = 0; i < activeSlots; i++) {
    if (c.inventory[i] === null) {
      freeSlot = i;
      break;
    }
  }
  if (freeSlot === -1) {
    send(c, { type: 'shop-failed', message: 'Инвентарь полон!' });
    return;
  }
  c.money -= cost;
  c.inventory[freeSlot] = itemType as InventoryItem;
  const weight = calculateInventoryWeight(c.inventory);
  ctx.saveClient(c);
  send(c, {
    type: 'shop-success',
    itemType,
    money: c.money,
    inventory: c.inventory,
    weight,
    message: 'Куплено!',
  });
}

export function handleUseItem(c: Client, msg: WireMessage, ctx: EconomyContext): void {
  const slotIdx = msg.slotIndex as number;
  if (typeof slotIdx !== 'number' || slotIdx < 0 || slotIdx >= INVENTORY_SLOTS) return;
  const item = c.inventory[slotIdx];
  if (item !== 'shawarma' && item !== 'energy') return;
  c.inventory[slotIdx] = null;
  ctx.saveClient(c);
  send(c, {
    type: 'use-item-success',
    itemType: item,
    inventory: c.inventory,
    weight: calculateInventoryWeight(c.inventory),
  });
}

// ============================================================
//  SECTION: BAG EQUIP
// ============================================================

export function handleEquipBag(c: Client, msg: WireMessage, ctx: EconomyContext): void {
  const slotIdx = msg.slotIndex as number;
  if (typeof slotIdx !== 'number') return;
  const item = c.inventory[slotIdx];
  if (item !== 'bag-adidas' && item !== 'backpack-tourist') return;
  const tier = item === 'bag-adidas' ? 2 : 3;
  if (c.backpackTier >= tier) {
    send(c, { type: 'equip-failed', message: 'Уже есть лучше' });
    return;
  }
  c.inventory[slotIdx] = null;
  c.backpackTier = tier;
  ctx.saveClient(c);
  send(c, {
    type: 'equip-success',
    backpackTier: tier,
    inventory: c.inventory,
    weight: calculateInventoryWeight(c.inventory),
    message: 'Сумка экипирована',
  });
}

export function handleUnequipBag(c: Client, ctx: EconomyContext): void {
  if (c.backpackTier === 1) return;
  const weight = calculateInventoryWeight(c.inventory);
  if (weight > BACKPACK_TIERS[1].maxWeight) {
    send(c, { type: 'equip-failed', message: 'Разгрузи рюкзак до 2.5кг!' });
    return;
  }
  let freeSlot = -1;
  for (let i = 0; i < 4; i++) {
    if (c.inventory[i] === null) {
      freeSlot = i;
      break;
    }
  }
  if (freeSlot === -1) {
    send(c, { type: 'equip-failed', message: 'Освободи карманы!' });
    return;
  }
  const bagItem = tierToBag(c.backpackTier);
  if (!bagItem) return;
  c.inventory[freeSlot] = bagItem;
  c.backpackTier = 1;
  ctx.saveClient(c);
  send(c, {
    type: 'equip-success',
    backpackTier: 1,
    inventory: c.inventory,
    weight: calculateInventoryWeight(c.inventory),
    message: 'Сумка снята',
  });
}

// ============================================================
//  SECTION: JOBS & PROPERTY
// ============================================================

export function handleJobComplete(c: Client, msg: WireMessage, ctx: EconomyContext): void {
  const jobType = msg.jobType as JobType;
  const job = JOB_REWARDS[jobType];
  if (!job) return;
  const now = Date.now();
  if (now - (c.lastJobAt[jobType] ?? 0) < job.cooldownMs) {
    send(c, { type: 'job-failed', message: 'Подожди немного!' });
    return;
  }
  let near = false;
  for (const jp of ctx.jobPoints) {
    if (jp.jobType !== jobType) continue;
    if (Math.hypot(c.x - jp.x, c.y - jp.y) < INTERACT_DIST) {
      near = true;
      break;
    }
  }
  if (!near) {
    send(c, { type: 'job-failed', message: 'Подойди к месту работы!' });
    return;
  }
  c.lastJobAt[jobType] = now;
  const reward = job.min + Math.random() * (job.max - job.min);
  c.money = parseFloat((c.money + reward).toFixed(2));
  ctx.saveClient(c);
  send(c, {
    type: 'job-success',
    jobType,
    reward,
    money: c.money,
    message: `Заработано: $${reward.toFixed(2)}`,
  });
}

export function handleBuyProperty(c: Client, msg: WireMessage, ctx: EconomyContext): void {
  const propertyType = msg.propertyType as PropertyType;
  const def = PROPERTIES[propertyType];
  if (!def) return;
  if (c.money < def.price) {
    send(c, { type: 'property-failed', message: 'Недостаточно денег!' });
    return;
  }
  if (c.properties.includes(propertyType)) {
    send(c, { type: 'property-failed', message: 'Уже куплено!' });
    return;
  }
  c.money -= def.price;
  c.properties.push(propertyType);
  ctx.saveClient(c);
  send(c, {
    type: 'property-success',
    propertyType,
    money: c.money,
    properties: c.properties,
    message: `Куплено: ${def.name}! Пассивный доход +$${def.incomePerMin}/мин`,
  });
}

export function handleUpgradeBackpack(c: Client, msg: WireMessage, ctx: EconomyContext): void {
  const tier = msg.tier;
  if (typeof tier !== 'number' || tier < 1 || tier > 3) return;
  c.backpackTier = tier;
  ctx.saveClient(c);
  send(c, {
    type: 'upgrade-success',
    backpackTier: c.backpackTier,
    money: c.money,
    weight: calculateInventoryWeight(c.inventory),
    message: `Тир рюкзака: ${tier}`,
  });
}

