// ============================================================
//  SECTION: INVENTORY ITEM TYPES
// ============================================================
export type InventoryItem =
  | BottleType
  | 'bag-adidas'
  | 'backpack-tourist'
  | 'shawarma'
  | 'energy';

export type BottleType = 'water' | 'beer-glass' | 'wine' | 'champagne' | 'bordeaux-1982';

export type ClothingType = 'jacket' | 'sneakers' | 'crown';

export type ShopItemType = InventoryItem | ClothingType;

// ============================================================
//  SECTION: BOTTLE DEFINITIONS
// ============================================================
export interface BottleDef {
  id: BottleType;
  name: string;
  price: number;
  weight: number;      // Вес бутылки в кг
  spawnWeight: number; // Для вероятности спавна
  color: number;       // Резервный цвет
  spriteKey: string;
}

// ============================================================
//  SECTION: INVENTORY LIMITS
// ============================================================
export const INVENTORY_SLOTS = 12; // Сетка инвентаря 3x4 слота

// ============================================================
//  SECTION: FOOD & GEAR WEIGHTS
// ============================================================
export const FOOD_WEIGHTS: Record<'shawarma' | 'energy', number> = {
  shawarma: 0.5,
  energy: 0.3,
};

export const GEAR_WEIGHTS: Record<'bag-adidas' | 'backpack-tourist', number> = {
  'bag-adidas': 0.0,
  'backpack-tourist': 0.0,
};

// ============================================================
//  SECTION: BACKPACK TIERS
// ============================================================
export const BACKPACK_TIERS: Record<number, { name: string; maxWeight: number }> = {
  1: { name: 'Карманы', maxWeight: 2.5 },
  2: { name: 'Сумка Adidas', maxWeight: 15.0 },
  3: { name: 'Рюкзак туриста', maxWeight: 30.0 },
};

export const MAX_INVENTORY_WEIGHT = BACKPACK_TIERS[1].maxWeight; // Устаревшая константа для совместимости

// ============================================================
//  SECTION: BOTTLE DEFINITIONS
// ============================================================
export const BOTTLE_TYPES: Record<BottleType, BottleDef> = {
  'water': {
    id: 'water',
    name: 'Пластиковая вода',
    price: 0.05,
    weight: 0.5,
    spawnWeight: 60,
    color: 0x4da6ff,
    spriteKey: 'bottle-water',
  },
  'beer-glass': {
    id: 'beer-glass',
    name: 'Стекло пиво',
    price: 0.20,
    weight: 1.0,
    spawnWeight: 25,
    color: 0xcc7a00,
    spriteKey: 'bottle-beer-glass',
  },
  'wine': {
    id: 'wine',
    name: 'Вино',
    price: 1.00,
    weight: 1.5,
    spawnWeight: 10,
    color: 0x990033,
    spriteKey: 'bottle-wine',
  },
  'champagne': {
    id: 'champagne',
    name: 'Шампанское',
    price: 5.00,
    weight: 2.0,
    spawnWeight: 4,
    color: 0xffd700,
    spriteKey: 'bottle-champagne',
  },
  'bordeaux-1982': {
    id: 'bordeaux-1982',
    name: 'Bordeaux 1982',
    price: 50.00,
    weight: 3.0,
    spawnWeight: 1,
    color: 0x660022,
    spriteKey: 'bottle-bordeaux-1982',
  }
};

// ============================================================
//  SECTION: SHOP PRICES (server-authoritative)
// ============================================================
export const SHOP_PRICES: Record<ShopItemType, number> = {
  shawarma: 1.5,
  energy: 3.0,
  'bag-adidas': 15.0,
  'backpack-tourist': 45.0,
  jacket: 10.0,
  sneakers: 20.0,
  crown: 100.0,
  // бутылки не продаются в магазине
  water: 0,
  'beer-glass': 0,
  wine: 0,
  champagne: 0,
  'bordeaux-1982': 0,
};

// ============================================================
//  SECTION: JOBS – v2 REAL MINIGAMES
// ============================================================
export type JobType = 'courier' | 'lemonade' | 'trash-sort';

// Новая система: реальные мини-игры, хорошая оплата, школа и лицензии
export const JOB_REWARDS: Record<JobType, { min: number; max: number; cooldownMs: number; baseXp: number }> = {
  // Курьер: сортировка + доставка, требует лицензию из школы
  courier: { min: 8.0, max: 22.0, cooldownMs: 8000, baseXp: 15 },
  // Лимонад: ритм-игра, можно купить стенд как бизнес
  lemonade: { min: 4.5, max: 9.5, cooldownMs: 5000, baseXp: 8 },
  // Сортировка мусора: реальная сортировка по фракциям
  'trash-sort': { min: 5.0, max: 14.0, cooldownMs: 6000, baseXp: 12 },
};

// --- Курьерская система ---
export type CourierRank = 'trainee' | 'junior' | 'pro' | 'master';

export const COURIER_RANKS: Record<CourierRank, { level: number; name: string; payMultiplier: number; speedBonus: number }> = {
  trainee: { level: 0, name: 'Стажёр', payMultiplier: 1.0, speedBonus: 0 },
  junior: { level: 1, name: 'Младший курьер', payMultiplier: 1.35, speedBonus: 10 },
  pro: { level: 2, name: 'Профи', payMultiplier: 1.75, speedBonus: 20 },
  master: { level: 3, name: 'Мастер доставки', payMultiplier: 2.3, speedBonus: 35 },
};

export const COURIER_LICENSE_COST = 25.0; // обучение в школе курьеров
export const TRASH_CERT_COST = 15.0; // сертификат сортировщика

export interface JobSkill {
  level: number; // 0-10
  xp: number;
  jobsCompleted: number;
}

export interface JobSkills {
  courier: JobSkill;
  'trash-sort': JobSkill;
  lemonade: JobSkill;
}

export const DEFAULT_JOB_SKILLS: JobSkills = {
  courier: { level: 0, xp: 0, jobsCompleted: 0 },
  'trash-sort': { level: 0, xp: 0, jobsCompleted: 0 },
  lemonade: { level: 0, xp: 0, jobsCompleted: 0 },
};

export function getCourierRank(skillLevel: number): CourierRank {
  if (skillLevel >= 7) return 'master';
  if (skillLevel >= 4) return 'pro';
  if (skillLevel >= 2) return 'junior';
  return 'trainee';
}

// Доставка: районы и адреса
export const COURIER_DISTRICTS = [
  { id: 'center', name: 'Центр', bonus: 1.2 },
  { id: 'industrial', name: 'Промзона', bonus: 1.0 },
  { id: 'residential', name: 'Спальный', bonus: 1.1 },
  { id: 'business', name: 'Бизнес-квартал', bonus: 1.5 },
] as const;

export type CourierDistrictId = typeof COURIER_DISTRICTS[number]['id'];

// Сортировка мусора: фракции
export const TRASH_FRACTIONS = [
  { id: 'plastic', name: 'Пластик', color: '#facc15', emoji: '♳' },
  { id: 'glass', name: 'Стекло', color: '#22c55e', emoji: '🍾' },
  { id: 'paper', name: 'Бумага', color: '#3b82f6', emoji: '📄' },
  { id: 'metal', name: 'Металл', color: '#a1a1aa', emoji: '🥫' },
  { id: 'organic', name: 'Органика', color: '#a16207', emoji: '🍌' },
  { id: 'ewaste', name: 'Электроника', color: '#ef4444', emoji: '🔋' },
] as const;

export type TrashFractionId = typeof TRASH_FRACTIONS[number]['id'];

export const TRASH_SORT_ITEMS: { name: string; fraction: TrashFractionId; emoji: string }[] = [
  { name: 'ПЭТ бутылка', fraction: 'plastic', emoji: '🧴' },
  { name: 'Пивная бутылка', fraction: 'glass', emoji: '🍺' },
  { name: 'Газета', fraction: 'paper', emoji: '📰' },
  { name: 'Банка колы', fraction: 'metal', emoji: '🥤' },
  { name: 'Огрызок', fraction: 'organic', emoji: '🍎' },
  { name: 'Батарейка', fraction: 'ewaste', emoji: '🔋' },
  { name: 'Пакет', fraction: 'plastic', emoji: '🛍️' },
  { name: 'Винная бутылка', fraction: 'glass', emoji: '🍷' },
  { name: 'Коробка', fraction: 'paper', emoji: '📦' },
  { name: 'Консервная банка', fraction: 'metal', emoji: '🥫' },
  { name: 'Банановая кожура', fraction: 'organic', emoji: '🍌' },
  { name: 'Старый телефон', fraction: 'ewaste', emoji: '📱' },
];

// Лимонад-бизнес
export interface LemonadeRecipe {
  id: string;
  name: string;
  cost: number;
  sellPrice: number;
  difficulty: number;
}

export const LEMONADE_RECIPES: LemonadeRecipe[] = [
  { id: 'classic', name: 'Классический', cost: 0.3, sellPrice: 1.5, difficulty: 1 },
  { id: 'mint', name: 'Мятный фреш', cost: 0.5, sellPrice: 2.5, difficulty: 2 },
  { id: 'berry', name: 'Ягодный бум', cost: 0.8, sellPrice: 3.8, difficulty: 3 },
  { id: 'premium', name: 'VIP Detox', cost: 1.2, sellPrice: 6.0, difficulty: 4 },
];

// Школа курьеров
export interface TrainingCourse {
  id: string;
  name: string;
  description: string;
  cost: number;
  requiredLevel: number;
  unlocks: string[];
  skillBoost: Partial<Record<JobType, number>>;
}

export const TRAINING_COURSES: TrainingCourse[] = [
  {
    id: 'courier_basic',
    name: 'Курьер-стажёр',
    description: 'Базовая лицензия. Открывает доступ к доставке.',
    cost: COURIER_LICENSE_COST,
    requiredLevel: 0,
    unlocks: ['courier_license'],
    skillBoost: { courier: 1 },
  },
  {
    id: 'courier_pro',
    name: 'Скоростная доставка',
    description: '+25% к оплате, открывает бизнес-район',
    cost: 65,
    requiredLevel: 2,
    unlocks: ['business_district', 'express_delivery'],
    skillBoost: { courier: 2 },
  },
  {
    id: 'courier_master',
    name: 'Мастер-логист',
    description: '+55% к оплате, приоритетные заказы',
    cost: 140,
    requiredLevel: 5,
    unlocks: ['priority_orders', 'vip_clients'],
    skillBoost: { courier: 3 },
  },
  {
    id: 'trash_basic',
    name: 'Сортировщик',
    description: 'Сертификат эко-сортировки',
    cost: TRASH_CERT_COST,
    requiredLevel: 0,
    unlocks: ['trash_cert'],
    skillBoost: { 'trash-sort': 1 },
  },
  {
    id: 'trash_expert',
    name: 'Эко-инженер',
    description: 'Опасные отходы +40% оплата',
    cost: 55,
    requiredLevel: 3,
    unlocks: ['hazmat', 'ewaste_bonus'],
    skillBoost: { 'trash-sort': 2 },
  },
  {
    id: 'lemonade_business',
    name: 'Бизнес лимонада',
    description: 'Открывает покупку собственного стенда',
    cost: 80,
    requiredLevel: 1,
    unlocks: ['lemonade_stand_purchase'],
    skillBoost: { lemonade: 1 },
  },
];

// ============================================================
//  SECTION: PASSIVE INCOME – PROPERTIES
// ============================================================
export type PropertyType = 'shack' | 'apartment-small' | 'apartment-big' | 'lemonade-stand';

export interface PropertyDef {
  id: PropertyType;
  name: string;
  price: number;
  incomePerMin: number;
  description?: string;
}

export const PROPERTIES: Record<PropertyType, PropertyDef> = {
  shack: { id: 'shack', name: 'Сарай с бомжами', price: 120, incomePerMin: 3.0, description: 'Старт пассивного дохода' },
  'apartment-small': { id: 'apartment-small', name: 'Хрущёвка', price: 450, incomePerMin: 12.0, description: 'Классика' },
  'apartment-big': { id: 'apartment-big', name: 'Пентхаус', price: 1500, incomePerMin: 45.0, description: 'Элита' },
  // Лимонад как отдельный бизнес-стенд
  'lemonade-stand': { 
    id: 'lemonade-stand', 
    name: 'Лимонад-стенд', 
    price: 320, 
    incomePerMin: 8.5,
    description: 'Свой киоск лимонада – капает круглосуточно!'
  },
};

// ============================================================
//  SECTION: SERVER-SIDE ENTITIES
// ============================================================
// Динамические бутылки, находящиеся на карте в данный момент
export interface ServerBottle {
  id: string;
  type: BottleType;
  x: number;
  y: number;
}

export interface JobLicense {
  courier: boolean;
  trashSort: boolean;
  lemonadeBusiness: boolean;
}

export const DEFAULT_LICENSES: JobLicense = {
  courier: false,
  trashSort: false,
  lemonadeBusiness: false,
};

export interface PlayerSave {
  money: number;
  inventory: (InventoryItem | null)[];
  backpackTier: number;
  hasJacket: boolean;
  hasSneakers: boolean;
  hasCrown: boolean;
  properties: PropertyType[];
  // NEW v2
  jobSkills?: JobSkills;
  licenses?: JobLicense;
  trainingCompleted?: string[];
}
