// ============================================================
//  SECTION: ECONOMY HANDLERS (server authoritative)
// ============================================================

import {
  BACKPACK_TIERS,
  BOTTLE_TYPES,
  COURIER_RANKS,
  FOOD_BUFF_SECS,
  FOOD_NAMES,
  FOOD_RESTORE,
  HUNGER_DRAIN_PER_SEC,
  HUNGER_MAX,
  INVENTORY_SLOTS,
  JOB_REWARDS,
  PROPERTIES,
  PROPERTY_MAX_LEVEL,
  SHOP_PRICES,
  TRAINING_COURSES,
  TRASH_SORT_ITEMS,
  calculatePropertiesIncomePerMin,
  getCourierRank,
  getPropertyIncomePerMin,
  getPropertyUpgradeCost,
  type InventoryItem,
  type JobType,
  type OwnedProperty,
  type PropertyType,
  type ServerBottle,
  type ShopItemType,
} from '../../../shared/economy.js';
import {
  calculateInventoryWeight,
  getActiveSlotsCount,
  getMaxWeight,
  isBag,
  isBottle,
  isClothing,
  isFood,
  tierToBag,
} from '../../../shared/items.js';
import { TILE_SIZE, TILE_SIZE_HALF, type MapEntity } from '../../../shared/map.js';
import type { Client, DeliveryPoint, ElectronicsShopPoint, JobPoint, PropertyPoint, SchoolPoint, WireMessage } from '../types.js';

export type EconomyContext = {
  bottles: Map<string, ServerBottle>;
  kiosks: MapEntity[];
  foodCarts: MapEntity[];
  clothingShops: MapEntity[];
  jobPoints: JobPoint[];
  propertyPoints: PropertyPoint[];
  schoolPoints: SchoolPoint[];
  electronicsShops: ElectronicsShopPoint[];
  deliveryHouses: DeliveryPoint[];
  saveClient: (c: Client) => void;
  broadcastAll: (payload: object) => void;
};

const INTERACT_DIST = 180;
const MAX_ACTIVE_JOB_MS = 10 * 60_000;

function send(c: Client, payload: object): void {
  if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(payload));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidSlot(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < INVENTORY_SLOTS;
}

function isActiveSlot(c: Client, slotIdx: number): boolean {
  return slotIdx >= 0 && slotIdx < getActiveSlotsCount(c.backpackTier);
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

function distanceToEntity(c: Client, entity: MapEntity): number {
  const x = entity.cellX * TILE_SIZE + TILE_SIZE_HALF;
  const y = entity.cellY * TILE_SIZE + TILE_SIZE_HALF;
  return Math.hypot(c.x - x, c.y - y);
}

function nearAnyEntity(c: Client, entities: readonly MapEntity[]): boolean {
  return entities.some((entity) => distanceToEntity(c, entity) < INTERACT_DIST);
}

function nearAnyElectronicsShop(c: Client, shops: readonly ElectronicsShopPoint[]): boolean {
  return shops.some((shop) => Math.hypot(c.x - shop.x, c.y - shop.y) < INTERACT_DIST);
}

function nearJobPoint(c: Client, ctx: EconomyContext, jobType: JobType): boolean {
  return ctx.jobPoints.some((point) => point.jobType === jobType && Math.hypot(c.x - point.x, c.y - point.y) < INTERACT_DIST);
}

function findFreeActiveSlot(c: Client): number {
  const activeSlots = getActiveSlotsCount(c.backpackTier);
  for (let i = 0; i < activeSlots; i++) {
    if (c.inventory[i] === null) return i;
  }
  return -1;
}

function normalizeScore(value: unknown): number {
  if (!isFiniteNumber(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function isShopItem(value: unknown): value is ShopItemType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SHOP_PRICES, value);
}

function assertShopLocation(c: Client, itemType: ShopItemType, ctx: EconomyContext): string | null {
  if (itemType === 'phone') {
    return nearAnyElectronicsShop(c, ctx.electronicsShops) ? null : 'Подойди к магазину электроники!';
  }

  if (isFood(itemType as InventoryItem)) {
    return nearAnyEntity(c, ctx.foodCarts) ? null : 'Подойди к фуд-карту!';
  }

  if (itemType === 'bag-adidas' || itemType === 'backpack-tourist' || isClothing(itemType as InventoryItem) || itemType === 'jacket' || itemType === 'sneakers' || itemType === 'crown') {
    return nearAnyEntity(c, ctx.clothingShops) ? null : 'Подойди к магазину одежды!';
  }

  return 'Этот предмет нельзя купить.';
}

function ensureActiveJob(c: Client, jobType: JobType): boolean {
  if (!c.activeJob || c.activeJob.type !== jobType) return false;
  const age = Date.now() - c.activeJob.startedAt;
  return age >= 0 && age <= MAX_ACTIVE_JOB_MS;
}

function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ============================================================
//  SECTION: PICKUP
// ============================================================

export function handlePickupBottle(c: Client, msg: WireMessage, ctx: EconomyContext): void {
  const bottleId = msg.bottleId;
  if (typeof bottleId !== 'string') return;

  const bottle = ctx.bottles.get(bottleId);
  if (!bottle) {
    send(c, { type: 'pickup-failed', bottleId, reason: 'already-taken', message: 'Конкурент оказался быстрее!' });
    return;
  }

  if (Math.hypot(c.x - bottle.x, c.y - bottle.y) > INTERACT_DIST) {
    send(c, { type: 'pickup-failed', bottleId, reason: 'too-far', message: 'Слишком далеко!' });
    return;
  }

  const itemDef = BOTTLE_TYPES[bottle.type];
  const currentWeight = calculateInventoryWeight(c.inventory);
  const maxLimit = getMaxWeight(c.backpackTier);

  if (currentWeight + itemDef.weight > maxLimit) {
    send(c, { type: 'pickup-failed', bottleId, reason: 'too-heavy', message: `Превышен вес! Максимум: ${maxLimit}кг` });
    return;
  }

  const emptySlotIdx = findFreeActiveSlot(c);
  if (emptySlotIdx === -1) {
    send(c, { type: 'pickup-failed', bottleId, reason: 'inventory-full', message: 'Инвентарь полон!' });
    return;
  }

  ctx.bottles.delete(bottleId);
  c.inventory[emptySlotIdx] = bottle.type;

  const newWeight = calculateInventoryWeight(c.inventory);
  ctx.saveClient(c);

  send(c, { type: 'pickup-success', bottleId, inventory: c.inventory, weight: newWeight, message: `Подобрано: ${itemDef.name}` });
  ctx.broadcastAll({ type: 'bottle-picked-up', bottleId, pickerId: c.id });
}

// ============================================================
//  SECTION: SELL / INVENTORY
// ============================================================

export function handleSellSlot(c: Client, msg: WireMessage, ctx: EconomyContext): void {
  const slotIdx = msg.slotIndex;
  if (!isValidSlot(slotIdx) || !isActiveSlot(c, slotIdx)) return;

  const item = c.inventory[slotIdx];
  if (!item) return;

  if (!isBottle(item)) {
    send(c, { type: 'sell-failed', message: 'Автомат принимает только бутылки!' });
    return;
  }

  if (!nearAnyEntity(c, ctx.kiosks)) {
    send(c, { type: 'sell-failed', message: 'Ты должен стоять рядом с автоматом!' });
    return;
  }

  const price = BOTTLE_TYPES[item].price;
  c.money = roundMoney(c.money + price);
  c.inventory[slotIdx] = null;
  const newWeight = calculateInventoryWeight(c.inventory);
  ctx.saveClient(c);
  send(c, { type: 'sell-success', money: c.money, inventory: c.inventory, weight: newWeight, message: `Сдано: ${BOTTLE_TYPES[item].name}. Получено: $${price.toFixed(2)}` });
}

export function handleSellAll(c: Client, ctx: EconomyContext): void {
  if (!nearAnyEntity(c, ctx.kiosks)) {
    send(c, { type: 'sell-failed', message: 'Ты должен стоять рядом с автоматом!' });
    return;
  }

  let totalGain = 0;
  let soldCount = 0;
  const activeSlots = getActiveSlotsCount(c.backpackTier);
  for (let i = 0; i < activeSlots; i++) {
    const item = c.inventory[i];
    if (item && isBottle(item)) {
      totalGain += BOTTLE_TYPES[item].price;
      c.inventory[i] = null;
      soldCount++;
    }
  }

  if (soldCount === 0) {
    send(c, { type: 'sell-failed', message: 'У тебя нет бутылок для сдачи!' });
    return;
  }

  c.money = roundMoney(c.money + totalGain);
  const newWeight = calculateInventoryWeight(c.inventory);
  ctx.saveClient(c);
  send(c, { type: 'sell-success', money: c.money, inventory: c.inventory, weight: newWeight, message: `Сдано бутылок: ${soldCount} шт. Получено: $${totalGain.toFixed(2)}!` });
}

export function handleInventorySwap(c: Client, msg: WireMessage, ctx: EconomyContext): void {
  const from = msg.from;
  const to = msg.to;
  if (!isValidSlot(from) || !isValidSlot(to) || from === to) return;
  if (!isActiveSlot(c, from) || !isActiveSlot(c, to)) return;

  [c.inventory[from], c.inventory[to]] = [c.inventory[to], c.inventory[from]];
  const weight = calculateInventoryWeight(c.inventory);
  ctx.saveClient(c);
  send(c, { type: 'inventory-sync', inventory: c.inventory, weight });
}

export function handleDropItem(c: Client, msg: WireMessage, ctx: EconomyContext): void {
  const slotIdx = msg.slotIndex;
  if (!isValidSlot(slotIdx) || !isActiveSlot(c, slotIdx)) return;

  const item = c.inventory[slotIdx];
  if (!item) return;
  c.inventory[slotIdx] = null;

  if (item === 'parcel' && c.activeJob?.type === 'courier') c.activeJob = null;

  const weight = calculateInventoryWeight(c.inventory);
  ctx.saveClient(c);
  send(c, { type: 'drop-success', slotIndex: slotIdx, itemType: item, inventory: c.inventory, weight });
}

// ============================================================
//  SECTION: SHOP / FOOD / BAGS
// ============================================================

export function handleBuyShopItem(c: Client, msg: WireMessage, ctx: EconomyContext): void {
  if (!isShopItem(msg.itemType)) {
    send(c, { type: 'shop-failed', message: 'Товар не продаётся' });
    return;
  }

  const itemType = msg.itemType;
  const cost = SHOP_PRICES[itemType];
  if (!isFiniteNumber(cost) || cost <= 0) {
    send(c, { type: 'shop-failed', message: 'Этот предмет нельзя купить.' });
    return;
  }

  const locationError = assertShopLocation(c, itemType, ctx);
  if (locationError) {
    send(c, { type: 'shop-failed', message: locationError });
    return;
  }

  if (c.money < cost) {
    send(c, { type: 'shop-failed', message: 'Недостаточно денег!' });
    return;
  }

  if (itemType === 'phone') {
    if (c.hasPhone) { send(c, { type: 'shop-failed', message: 'Телефон уже куплен' }); return; }
    c.money = roundMoney(c.money - cost);
    c.hasPhone = true;
    ctx.saveClient(c);
    send(c, { type: 'shop-success', itemType, money: c.money, hasPhone: c.hasPhone, message: 'Телефон куплен! Кнопка появилась рядом с инвентарём.' });
    return;
  }

  if (itemType === 'jacket' || itemType === 'sneakers' || itemType === 'crown') {
    if (itemType === 'jacket' && c.hasJacket) { send(c, { type: 'shop-failed', message: 'Уже куплено' }); return; }
    if (itemType === 'sneakers' && c.hasSneakers) { send(c, { type: 'shop-failed', message: 'Уже куплено' }); return; }
    if (itemType === 'crown' && c.hasCrown) { send(c, { type: 'shop-failed', message: 'Уже куплено' }); return; }
    c.money = roundMoney(c.money - cost);
    if (itemType === 'jacket') c.hasJacket = true;
    if (itemType === 'sneakers') c.hasSneakers = true;
    if (itemType === 'crown') c.hasCrown = true;
    ctx.saveClient(c);
    send(c, { type: 'shop-success', itemType, money: c.money, hasJacket: c.hasJacket, hasSneakers: c.hasSneakers, hasCrown: c.hasCrown, message: 'Покупка успешна!' });
    return;
  }

  const freeSlot = findFreeActiveSlot(c);
  if (freeSlot === -1) { send(c, { type: 'shop-failed', message: 'Инвентарь полон!' }); return; }

  const itemWeight = isFood(itemType as InventoryItem) || isBag(itemType as InventoryItem) || isClothing(itemType as InventoryItem)
    ? calculateInventoryWeight([itemType as InventoryItem])
    : 0;
  if (calculateInventoryWeight(c.inventory) + itemWeight > getMaxWeight(c.backpackTier)) {
    send(c, { type: 'shop-failed', message: `Превышен вес! Максимум: ${getMaxWeight(c.backpackTier)}кг` });
    return;
  }

  c.money = roundMoney(c.money - cost);
  c.inventory[freeSlot] = itemType as InventoryItem;
  const weight = calculateInventoryWeight(c.inventory);
  ctx.saveClient(c);
  send(c, { type: 'shop-success', itemType, money: c.money, inventory: c.inventory, weight, message: 'Куплено!' });
}

export function handleUseItem(c: Client, msg: WireMessage, ctx: EconomyContext): void {
  const slotIdx = msg.slotIndex;
  if (!isValidSlot(slotIdx) || !isActiveSlot(c, slotIdx)) return;
  const item = c.inventory[slotIdx];
  if (!item || !isFood(item)) return;

  const restore = FOOD_RESTORE[item] ?? 20;
  c.hunger = Math.min(HUNGER_MAX, c.hunger + restore);
  c.inventory[slotIdx] = null;

  ctx.saveClient(c);
  send(c, {
    type: 'use-item-success',
    itemType: item,
    inventory: c.inventory,
    weight: calculateInventoryWeight(c.inventory),
    hunger: c.hunger,
    buffDuration: FOOD_BUFF_SECS[item] ?? 20,
    message: `Съедено: ${FOOD_NAMES[item]}! Восстановлено: +${restore} сытости`,
  });
}

export function handleEquipBag(c: Client, msg: WireMessage, ctx: EconomyContext): void {
  const slotIdx = msg.slotIndex;
  if (!isValidSlot(slotIdx) || !isActiveSlot(c, slotIdx)) return;
  const item = c.inventory[slotIdx];
  if (item !== 'bag-adidas' && item !== 'backpack-tourist') return;

  const tier = item === 'bag-adidas' ? 2 : 3;
  if (c.backpackTier >= tier) { send(c, { type: 'equip-failed', message: 'Уже есть лучше' }); return; }

  c.inventory[slotIdx] = null;
  c.backpackTier = tier;
  ctx.saveClient(c);
  send(c, { type: 'equip-success', backpackTier: tier, inventory: c.inventory, weight: calculateInventoryWeight(c.inventory), message: 'Сумка экипирована' });
}

export function handleUnequipBag(c: Client, ctx: EconomyContext): void {
  if (c.backpackTier === 1) return;
  const weight = calculateInventoryWeight(c.inventory);
  if (weight > BACKPACK_TIERS[1].maxWeight) { send(c, { type: 'equip-failed', message: 'Разгрузи рюкзак до 5кг!' }); return; }

  let freeSlot = -1;
  for (let i = 0; i < getActiveSlotsCount(1); i++) { if (c.inventory[i] === null) { freeSlot = i; break; } }
  if (freeSlot === -1) { send(c, { type: 'equip-failed', message: 'Освободи карманы!' }); return; }

  const bagItem = tierToBag(c.backpackTier);
  if (!bagItem) return;
  c.inventory[freeSlot] = bagItem;
  c.backpackTier = 1;
  ctx.saveClient(c);
  send(c, { type: 'equip-success', backpackTier: 1, inventory: c.inventory, weight: calculateInventoryWeight(c.inventory), message: 'Сумка снята' });
}

export function handleUpgradeBackpack(c: Client): void {
  send(c, { type: 'upgrade-failed', message: 'Прямой апгрейд рюкзака запрещён. Используй предмет сумки.' });
}

// ============================================================
//  SECTION: JOBS & TRAINING
// ============================================================

export function handleJobStart(c: Client, msg: WireMessage, ctx: EconomyContext): void {
  const jobType = msg.jobType as JobType;
  if (!JOB_REWARDS[jobType]) return;

  if (c.activeJob) {
    send(c, { type: 'job-failed', message: 'Сначала заверши текущую работу!' });
    return;
  }

  if (!nearJobPoint(c, ctx, jobType)) {
    send(c, { type: 'job-failed', message: 'Подойди к месту работы!' });
    return;
  }

  if (jobType === 'courier' && !c.licenses.courier) { send(c, { type: 'job-failed', message: 'Сначала получи лицензию в Школе Курьеров!' }); return; }
  if (jobType === 'trash-sort' && !c.licenses.trashSort) { send(c, { type: 'job-failed', message: 'Нужен сертификат сортировщика!' }); return; }
  if (jobType === 'lemonade' && !c.licenses.lemonadeBusiness) { send(c, { type: 'job-failed', message: 'Нужно образование продавца лимонада! Иди в школу.' }); return; }

  let taskData: Record<string, unknown> = {};
  if (jobType === 'trash-sort') {
    taskData = { items: shuffle(TRASH_SORT_ITEMS).slice(0, 8), timeLimit: 25 };
  } else if (jobType === 'courier') {
    if (ctx.deliveryHouses.length === 0) {
      send(c, { type: 'job-failed', message: 'Нет домов для доставки на карте!' });
      return;
    }
    // Check inventory space and give parcel (server-authoritative)
    const freeSlot = findFreeActiveSlot(c);
    if (freeSlot === -1) {
      send(c, { type: 'job-failed', message: 'Инвентарь полон! Освободи место для посылки.' });
      return;
    }
    const currentWeight = calculateInventoryWeight(c.inventory);
    if (currentWeight + 1.5 > getMaxWeight(c.backpackTier)) {
      send(c, { type: 'job-failed', message: 'Слишком тяжело! Разгрузи инвентарь.' });
      return;
    }
    const target = ctx.deliveryHouses[Math.floor(Math.random() * ctx.deliveryHouses.length)];
    taskData = { target: { id: target.id, x: target.x, y: target.y, cellX: target.cellX, cellY: target.cellY }, deliveries: 1 };
    // Give parcel item
    c.inventory[freeSlot] = 'parcel';
  } else if (jobType === 'lemonade') {
    taskData = { beats: 12, bpm: 110 + Math.floor(Math.random() * 30), recipe: 'classic' };
  }

  c.activeJob = { type: jobType, startedAt: Date.now(), data: taskData };
  ctx.saveClient(c);
  send(c, { 
    type: 'job-started', 
    jobType, 
    taskData, 
    skill: c.jobSkills[jobType],
    inventory: c.inventory,
    weight: calculateInventoryWeight(c.inventory)
  });
}

export function handleJobComplete(c: Client, msg: WireMessage, ctx: EconomyContext): void {
  const jobType = msg.jobType as JobType;
  const job = JOB_REWARDS[jobType];
  if (!job) return;

  const now = Date.now();
  if (now - (c.lastJobAt[jobType] ?? 0) < job.cooldownMs) {
    send(c, { type: 'job-failed', message: 'Подожди немного! Перезарядка...' });
    return;
  }

  if (!ensureActiveJob(c, jobType)) {
    c.activeJob = null;
    send(c, { type: 'job-failed', message: 'Работа не начата или устарела.' });
    return;
  }

  let near = false;
  if (jobType === 'courier') {
    near = ctx.deliveryHouses.some((house) => Math.hypot(c.x - house.x, c.y - house.y) < INTERACT_DIST);
  } else {
    near = nearJobPoint(c, ctx, jobType);
  }

  if (!near) {
    send(c, { type: 'job-failed', message: 'Подойди к месту работы!' });
    return;
  }

  if (jobType === 'courier' && !c.licenses.courier) { send(c, { type: 'job-failed', message: 'Нужна лицензия курьера! Сходи в Школу Курьеров ($25)' }); return; }
  if (jobType === 'trash-sort' && !c.licenses.trashSort) { send(c, { type: 'job-failed', message: 'Нужен сертификат сортировщика! Школа экологии ($15)' }); return; }
  if (jobType === 'lemonade' && !c.licenses.lemonadeBusiness) { send(c, { type: 'job-failed', message: 'Нужно образование продавца лимонада! Иди в школу.' }); return; }

  c.lastJobAt[jobType] = now;
  const clientScore = normalizeScore(msg.score);

  if (jobType === 'lemonade' && clientScore <= 0) {
    c.activeJob = null;
    ctx.saveClient(c);
    send(c, { type: 'job-failed', message: 'Промах! Лимонад не продан. Следующая попытка через 60 секунд.' });
    return;
  }

  const accuracy = clientScore / 100;
  const skill = c.jobSkills[jobType] ?? { level: 0, xp: 0, jobsCompleted: 0 };
  const skillBonus = 1 + skill.level * 0.12;

  let rankMultiplier = 1;
  let rankName = '';
  if (jobType === 'courier') {
    const rank = getCourierRank(skill.level);
    rankMultiplier = COURIER_RANKS[rank].payMultiplier;
    rankName = COURIER_RANKS[rank].name;
  }

  const baseReward = job.min + (job.max - job.min) * accuracy;
  let reward = baseReward * skillBonus * rankMultiplier;
  if (accuracy >= 0.95) reward *= 1.25;
  if (accuracy < 0.6) reward *= 0.7;
  reward = roundMoney(reward);

  const xpGain = Math.round(job.baseXp * (0.5 + accuracy));
  skill.xp += xpGain;
  skill.jobsCompleted += 1;
  let leveledUp = false;
  const xpNeeded = 50 + skill.level * 25;
  if (skill.xp >= xpNeeded && skill.level < 10) {
    skill.level += 1;
    skill.xp = 0;
    leveledUp = true;
  }
  c.jobSkills[jobType] = skill;

  c.money = roundMoney(c.money + reward);

  // Remove parcel on courier completion (server-authoritative)
  if (jobType === 'courier') {
    const parcelIdx = c.inventory.findIndex(i => i === 'parcel');
    if (parcelIdx !== -1) {
      c.inventory[parcelIdx] = null;
    }
  }

  c.activeJob = null;
  ctx.saveClient(c);

  const messages: Record<JobType, string> = {
    courier: `Доставка завершена! ${rankName ? `[${rankName}] ` : ''}Точность: ${clientScore}%`,
    'trash-sort': `Отсортировано! Точность: ${clientScore}%`,
    lemonade: `Лимонад продан! Ритм: ${clientScore}%`,
  };

  send(c, {
    type: 'job-success', jobType, reward, money: c.money, skill, leveledUp, accuracy: clientScore,
    inventory: c.inventory,
    weight: calculateInventoryWeight(c.inventory),
    message: `${messages[jobType]} +$${reward.toFixed(2)}${leveledUp ? ` | LVL UP -> ${skill.level}!` : ''}`,
  });
}

export function handleTrainingBuy(c: Client, msg: WireMessage, ctx: EconomyContext): void {
  const atSchool = ctx.schoolPoints.some((school) => Math.hypot(c.x - school.x, c.y - school.y) < INTERACT_DIST);
  if (!atSchool) { send(c, { type: 'training-failed', message: 'Подойди к зданию школы профессий.' }); return; }

  const courseId = msg.courseId;
  if (typeof courseId !== 'string') { send(c, { type: 'training-failed', message: 'Курс не найден' }); return; }
  const course = TRAINING_COURSES.find((candidate) => candidate.id === courseId);
  if (!course) { send(c, { type: 'training-failed', message: 'Курс не найден' }); return; }
  if (c.trainingCompleted.includes(courseId)) { send(c, { type: 'training-failed', message: 'Курс уже пройден' }); return; }
  if (c.money < course.cost) { send(c, { type: 'training-failed', message: `Нужно $${course.cost}, у тебя $${c.money.toFixed(2)}` }); return; }

  const meetsLevel = Object.keys(course.skillBoost).every((jt) => {
    const s = c.jobSkills[jt as JobType];
    return !s || s.level >= course.requiredLevel;
  });
  if (!meetsLevel) { send(c, { type: 'training-failed', message: `Нужен уровень ${course.requiredLevel} для этого курса` }); return; }

  c.money = roundMoney(c.money - course.cost);
  c.trainingCompleted.push(courseId);
  if (course.unlocks.includes('courier_license')) c.licenses.courier = true;
  if (course.unlocks.includes('trash_cert')) c.licenses.trashSort = true;
  if (course.unlocks.includes('lemonade_stand_purchase') || course.unlocks.includes('lemonade_license')) c.licenses.lemonadeBusiness = true;

  for (const [jt, boost] of Object.entries(course.skillBoost)) {
    const sk = c.jobSkills[jt as JobType];
    if (sk) { sk.level = Math.min(10, sk.level + boost); sk.xp = 0; }
  }

  ctx.saveClient(c);
  send(c, {
    type: 'training-success', courseId, money: c.money, jobSkills: c.jobSkills, licenses: c.licenses,
    trainingCompleted: c.trainingCompleted,
    message: `Обучение завершено: ${course.name}!`,
  });
}

// ============================================================
//  SECTION: PROPERTY
// ============================================================

export function handleBuyProperty(c: Client, msg: WireMessage, ctx: EconomyContext): void {
  const propertyType = msg.propertyType as PropertyType;
  const propertyPointId = typeof msg.propertyPointId === 'string' ? msg.propertyPointId : undefined;
  const def = PROPERTIES[propertyType];
  if (!def) return;

  const point = ctx.propertyPoints.find((candidate) => {
    if (candidate.propertyType !== propertyType) return false;
    if (propertyPointId && candidate.id !== propertyPointId) return false;
    return Math.hypot(c.x - candidate.x, c.y - candidate.y) < INTERACT_DIST;
  });
  if (!point) { send(c, { type: 'property-failed', message: 'Подойди к нужной точке покупки недвижимости!' }); return; }

  const alreadyOwned = c.properties.some((property) => property.propertyPointId === point.id || property.id === point.id);
  if (alreadyOwned) {
    send(c, { type: 'property-failed', message: 'Этот бизнес в этом месте уже куплен. Найди другую точку на карте.' });
    return;
  }

  if (c.money < def.price) { send(c, { type: 'property-failed', message: 'Недостаточно денег!' }); return; }

  c.money = roundMoney(c.money - def.price);
  const owned: OwnedProperty = {
    id: point.id,
    type: propertyType,
    boughtAt: Date.now(),
    level: 1,
    propertyPointId: point.id,
  };
  c.properties.push(owned);
  ctx.saveClient(c);

  const totalIncome = calculatePropertiesIncomePerMin(c.properties);
  send(c, {
    type: 'property-success', propertyType, propertyPointId: point.id, money: c.money, properties: c.properties,
    message: `Куплено: ${def.name}! LVL 1/${PROPERTY_MAX_LEVEL}. Пассивный доход: +$${totalIncome.toFixed(2)}/мин`,
  });
}

export function handleUpgradeProperty(c: Client, msg: WireMessage, ctx: EconomyContext): void {
  const propertyId = msg.propertyId;
  if (typeof propertyId !== 'string') return;

  const property = c.properties.find((candidate) => candidate.id === propertyId || candidate.propertyPointId === propertyId);
  if (!property) { send(c, { type: 'property-upgrade-failed', message: 'Бизнес не найден!' }); return; }

  property.level = property.level ?? 1;
  if (property.level >= PROPERTY_MAX_LEVEL) { send(c, { type: 'property-upgrade-failed', message: 'У бизнеса уже максимальный уровень!' }); return; }

  const cost = getPropertyUpgradeCost(property);
  if (c.money < cost) { send(c, { type: 'property-upgrade-failed', message: `Нужно $${cost}, у тебя $${c.money.toFixed(2)}` }); return; }

  c.money = roundMoney(c.money - cost);
  property.level += 1;
  ctx.saveClient(c);

  const def = PROPERTIES[property.type];
  const income = getPropertyIncomePerMin(property);
  const totalIncome = calculatePropertiesIncomePerMin(c.properties);
  send(c, {
    type: 'property-upgrade-success',
    propertyId: property.id,
    money: c.money,
    properties: c.properties,
    message: `${def.name} прокачан до LVL ${property.level}/${PROPERTY_MAX_LEVEL}! Доход: $${income.toFixed(2)}/мин, всего: $${totalIncome.toFixed(2)}/мин`,
  });
}

// ============================================================
//  SECTION: HUNGER TICK (called from World)
// ============================================================

export function tickHunger(c: Client, _ctx: EconomyContext): void {
  if (c.hunger > 0) {
    c.hunger = Math.max(0, Number((c.hunger - HUNGER_DRAIN_PER_SEC * 0.25).toFixed(1)));
  }
}
