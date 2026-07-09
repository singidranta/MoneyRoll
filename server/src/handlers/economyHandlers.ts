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
  COURIER_RANKS,
  getCourierRank,
  TRAINING_COURSES,
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
import type { Client, JobPoint, PropertyPoint, SchoolPoint, WireMessage } from '../types.js';

export type EconomyContext = {
  bottles: Map<string, ServerBottle>;
  kiosks: MapEntity[];
  jobPoints: JobPoint[];
  propertyPoints: PropertyPoint[];
  schoolPoints: SchoolPoint[];
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
    send(c, { type: 'job-failed', message: 'Подожди немного! Перезарядка...' });
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

  // --- Проверка лицензий ---
  if (jobType === 'courier' && !c.licenses.courier) {
    send(c, { type: 'job-failed', message: 'Нужна лицензия курьера! Сходи в Школу Курьеров ($25)' });
    return;
  }
  if (jobType === 'trash-sort' && !c.licenses.trashSort) {
    send(c, { type: 'job-failed', message: 'Нужен сертификат сортировщика! Школа экологии ($15)' });
    return;
  }
  if (jobType === 'lemonade' && !c.licenses.lemonadeBusiness) {
    send(c, { type: 'job-failed', message: 'Нужно образование продавца лимонада! Иди в школу.' });
    return;
  }

  // Одна попытка лимонада запускает полный кулдаун даже при промахе.
  c.lastJobAt[jobType] = now;

  // --- Мини-игра: score 0-100 приходит с клиента ---
  // Если клиент не прислал результат, это промах, а не случайная выплата.
  const clientScore = typeof msg.score === 'number' && Number.isFinite(msg.score)
    ? Math.max(0, Math.min(100, msg.score))
    : 0;
  if (jobType === 'lemonade' && clientScore <= 0) {
    ctx.saveClient(c);
    send(c, {
      type: 'job-failed',
      message: '🍋 Промах! Лимонад не продан. Следующая попытка через 60 секунд.',
    });
    return;
  }
  const accuracy = clientScore / 100;

  // Скилл игрока
  const skill = c.jobSkills[jobType] ?? { level: 0, xp: 0, jobsCompleted: 0 };
  const skillBonus = 1 + skill.level * 0.12; // +12% за уровень

  let rankMultiplier = 1;
  let rankName = '';
  if (jobType === 'courier') {
    const rank = getCourierRank(skill.level);
    rankMultiplier = COURIER_RANKS[rank].payMultiplier;
    rankName = COURIER_RANKS[rank].name;
  }

  // База + аккуратность
  const baseReward = job.min + (job.max - job.min) * accuracy;
  let reward = baseReward * skillBonus * rankMultiplier;

  // Бонус за идеал
  if (accuracy >= 0.95) reward *= 1.25;
  // Штраф за плохо
  if (accuracy < 0.6) reward *= 0.7;

  reward = parseFloat(reward.toFixed(2));

  // --- XP и левелап ---
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

  c.money = parseFloat((c.money + reward).toFixed(2));
  ctx.saveClient(c);

  const messages: Record<JobType, string> = {
    courier: `📦 Доставка завершена! ${rankName ? `[${rankName}] ` : ''}Точность: ${clientScore}%`,
    'trash-sort': `♻ Отсортировано! Точность: ${clientScore}%`,
    lemonade: `🍋 Лимонад продан! Ритм: ${clientScore}%`,
  };

  send(c, {
    type: 'job-success',
    jobType,
    reward,
    money: c.money,
    skill,
    leveledUp,
    accuracy: clientScore,
    message: `${messages[jobType]} +$${reward.toFixed(2)}${leveledUp ? ` | 🎉 LVL UP → ${skill.level}!` : ''}`,
  });
}

// --- НОВОЕ: Школа / Training ---
export function handleTrainingBuy(c: Client, msg: WireMessage, ctx: EconomyContext): void {
  const atSchool = ctx.schoolPoints.some(
    (school) => Math.hypot(c.x - school.x, c.y - school.y) < INTERACT_DIST,
  );
  if (!atSchool) {
    send(c, { type: 'training-failed', message: 'Подойди к зданию школы профессий.' });
    return;
  }

  const courseId = msg.courseId as string;
  const course = TRAINING_COURSES.find(tc => tc.id === courseId);
  if (!course) {
    send(c, { type: 'training-failed', message: 'Курс не найден' });
    return;
  }
  if (c.trainingCompleted.includes(courseId)) {
    send(c, { type: 'training-failed', message: 'Курс уже пройден' });
    return;
  }
  if (c.money < course.cost) {
    send(c, { type: 'training-failed', message: `Нужно $${course.cost}, у тебя $${c.money.toFixed(2)}` });
    return;
  }
  // Проверка уровня (берём максимальный скилл среди указанных)
  let meetsLevel = true;
  for (const [jt] of Object.entries(course.skillBoost)) {
    const s = c.jobSkills[jt as JobType];
    if (s && s.level < course.requiredLevel) meetsLevel = false;
  }
  if (!meetsLevel) {
    send(c, { type: 'training-failed', message: `Нужен уровень ${course.requiredLevel} для этого курса` });
    return;
  }

  c.money -= course.cost;
  c.trainingCompleted.push(courseId);

  // Выдаём лицензии / навыки
  if (course.unlocks.includes('courier_license')) c.licenses.courier = true;
  if (course.unlocks.includes('trash_cert')) c.licenses.trashSort = true;
  if (course.unlocks.includes('lemonade_stand_purchase')) c.licenses.lemonadeBusiness = true;

  // Буст скилла
  for (const [jt, boost] of Object.entries(course.skillBoost)) {
    const sk = c.jobSkills[jt as JobType];
    if (sk) {
      sk.level = Math.min(10, sk.level + (boost as number));
      sk.xp = 0;
    }
  }

  ctx.saveClient(c);
  send(c, {
    type: 'training-success',
    courseId,
    money: c.money,
    jobSkills: c.jobSkills,
    licenses: c.licenses,
    trainingCompleted: c.trainingCompleted,
    message: `🎓 Обучение завершено: ${course.name}!`,
  });
}

// job-start: выдаёт задание клиенту
export function handleJobStart(c: Client, msg: WireMessage, _ctx: EconomyContext): void {
  const jobType = msg.jobType as JobType;
  if (!JOB_REWARDS[jobType]) return;

  // проверка лицензии
  if (jobType === 'courier' && !c.licenses.courier) {
    send(c, { type: 'job-failed', message: 'Сначала получи лицензию в Школе Курьеров!' });
    return;
  }
  if (jobType === 'trash-sort' && !c.licenses.trashSort) {
    send(c, { type: 'job-failed', message: 'Нужен сертификат сортировщика!' });
    return;
  }
  if (jobType === 'lemonade' && !c.licenses.lemonadeBusiness) {
    send(c, { type: 'job-failed', message: 'Нужно образование продавца лимонада! Иди в школу.' });
    return;
  }

  // генерируем данные мини-игры
  let taskData: any = {};
  if (jobType === 'trash-sort') {
    // 8 случайных предметов для сортировки
    const { TRASH_SORT_ITEMS } = require('../../../shared/economy.js');
    const shuffled = [...TRASH_SORT_ITEMS].sort(() => Math.random() - 0.5).slice(0, 8);
    taskData = { items: shuffled, timeLimit: 25 };
  } else if (jobType === 'courier') {
    const districts = ['center', 'industrial', 'residential', 'business'];
    const packages = Array.from({ length: 5 }, (_, i) => ({
      id: i,
      address: `${Math.floor(Math.random()*99)+1} ул. ${['Ленина','Мира','Победы','Гагарина'][Math.floor(Math.random()*4)]}`,
      district: districts[Math.floor(Math.random()*districts.length)],
      fragile: Math.random() > 0.7,
    }));
    taskData = { packages, deliveries: 3 };
  } else if (jobType === 'lemonade') {
    taskData = { beats: 12, bpm: 110 + Math.floor(Math.random()*30), recipe: 'classic' };
  }

  c.activeJob = { type: jobType, startedAt: Date.now(), data: taskData };
  send(c, { type: 'job-started', jobType, taskData, skill: c.jobSkills[jobType] });
}

export function handleBuyProperty(c: Client, msg: WireMessage, ctx: EconomyContext): void {
  const propertyType = msg.propertyType as PropertyType;
  const def = PROPERTIES[propertyType];
  if (!def) return;

  const isNearPropertyPoint = ctx.propertyPoints.some(
    (point) =>
      point.propertyType === propertyType &&
      Math.hypot(c.x - point.x, c.y - point.y) < INTERACT_DIST,
  );
  if (!isNearPropertyPoint) {
    send(c, { type: 'property-failed', message: 'Подойди к точке покупки недвижимости!' });
    return;
  }

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

