// ============================================================
//  SECTION: INVENTORY ITEM TYPES
// ============================================================
export type InventoryItem =
  | BottleType
  | 'bag-adidas'
  | 'backpack-tourist'
  | FoodType
  | 'parcel';

export type FoodType = 'shawarma' | 'energy' | 'hotdog' | 'sushi' | 'pizza' | 'salad' | 'ramen' | 'steak';

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
  weight: number;
  spawnWeight: number;
  color: number;
  spriteKey: string;
}

// ============================================================
//  SECTION: INVENTORY LIMITS
// ============================================================
export const INVENTORY_SLOTS = 12;

// ============================================================
//  SECTION: FOOD & GEAR WEIGHTS
// ============================================================
export const FOOD_WEIGHTS: Record<FoodType, number> = {
  shawarma: 0.5,
  energy: 0.3,
  hotdog: 0.4,
  sushi: 0.3,
  pizza: 0.7,
  salad: 0.4,
  ramen: 0.6,
  steak: 0.8,
};

export const FOOD_RESTORE: Record<FoodType, number> = {
  shawarma: 35,
  energy: 5,
  hotdog: 20,
  sushi: 25,
  pizza: 40,
  salad: 15,
  ramen: 30,
  steak: 50,
};

export const FOOD_NAMES: Record<FoodType, string> = {
  shawarma: 'Шаурма',
  energy: 'Энергетик',
  hotdog: 'Хот-дог',
  sushi: 'Суши',
  pizza: 'Пицца',
  salad: 'Салат',
  ramen: 'Рамен',
  steak: 'Стейк',
};

export const FOOD_BUFF_SECS: Record<FoodType, number> = {
  shawarma: 20,
  energy: 30,
  hotdog: 15,
  sushi: 25,
  pizza: 35,
  salad: 10,
  ramen: 28,
  steak: 45,
};

export const FOOD_SPRITES: Record<FoodType, string> = {
  shawarma: 'shawarma',
  energy: 'energy-drink',
  hotdog: 'hotdog',
  sushi: 'sushi',
  pizza: 'pizza',
  salad: 'salad',
  ramen: 'ramen',
  steak: 'steak',
};

export const FOOD_WEBP_PATHS: Record<FoodType, string> = {
  shawarma: '/assets/props/flat/food/shawarma.webp',
  energy: '/assets/props/flat/food/energy-drink.webp',
  hotdog: '/assets/props/flat/food/hotdog.webp',
  sushi: '/assets/props/flat/food/sushi.webp',
  pizza: '/assets/props/flat/food/pizza.webp',
  salad: '/assets/props/flat/food/salad.webp',
  ramen: '/assets/props/flat/food/ramen.webp',
  steak: '/assets/props/flat/food/steak.webp',
};

export const PARCEL_WEIGHT = 1.5;

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

export const MAX_INVENTORY_WEIGHT = BACKPACK_TIERS[1].maxWeight;

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
  hotdog: 2.0,
  sushi: 4.5,
  pizza: 5.0,
  salad: 2.5,
  ramen: 3.5,
  steak: 7.0,
  'bag-adidas': 15.0,
  'backpack-tourist': 45.0,
  jacket: 10.0,
  sneakers: 20.0,
  crown: 100.0,
  water: 0,
  'beer-glass': 0,
  wine: 0,
  champagne: 0,
  'bordeaux-1982': 0,
  parcel: 0,
};

// ============================================================
//  SECTION: JOBS – v2 REAL MINIGAMES
// ============================================================
export type JobType = 'courier' | 'lemonade' | 'trash-sort';

export const JOB_REWARDS: Record<JobType, { min: number; max: number; cooldownMs: number; baseXp: number }> = {
  courier: { min: 8.0, max: 22.0, cooldownMs: 8000, baseXp: 15 },
  lemonade: { min: 4.5, max: 9.5, cooldownMs: 60_000, baseXp: 8 },
  'trash-sort': { min: 5.0, max: 14.0, cooldownMs: 6000, baseXp: 12 },
};

export type CourierRank = 'trainee' | 'junior' | 'pro' | 'master';

export const COURIER_RANKS: Record<CourierRank, { level: number; name: string; payMultiplier: number; speedBonus: number }> = {
  trainee: { level: 0, name: 'Стажёр', payMultiplier: 1.0, speedBonus: 0 },
  junior: { level: 1, name: 'Младший курьер', payMultiplier: 1.35, speedBonus: 10 },
  pro: { level: 2, name: 'Профи', payMultiplier: 1.75, speedBonus: 20 },
  master: { level: 3, name: 'Мастер доставки', payMultiplier: 2.3, speedBonus: 35 },
};

export const COURIER_LICENSE_COST = 25.0;
export const TRASH_CERT_COST = 15.0;

export interface JobSkill {
  level: number;
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

export const COURIER_DISTRICTS = [
  { id: 'center', name: 'Центр', bonus: 1.2 },
  { id: 'industrial', name: 'Промзона', bonus: 1.0 },
  { id: 'residential', name: 'Спальный', bonus: 1.1 },
  { id: 'business', name: 'Бизнес-квартал', bonus: 1.5 },
] as const;

export type CourierDistrictId = typeof COURIER_DISTRICTS[number]['id'];

export const TRASH_FRACTIONS = [
  { id: 'plastic', name: 'Пластик', color: '#facc15', icon: 'plastic' },
  { id: 'glass', name: 'Стекло', color: '#22c55e', icon: 'glass' },
  { id: 'paper', name: 'Бумага', color: '#3b82f6', icon: 'paper' },
  { id: 'metal', name: 'Металл', color: '#a1a1aa', icon: 'metal' },
  { id: 'organic', name: 'Органика', color: '#a16207', icon: 'organic' },
  { id: 'ewaste', name: 'Электроника', color: '#ef4444', icon: 'ewaste' },
] as const;

export type TrashFractionId = typeof TRASH_FRACTIONS[number]['id'];

export const TRASH_SORT_ITEMS: { name: string; fraction: TrashFractionId; icon: string }[] = [
  { name: 'ПЭТ бутылка', fraction: 'plastic', icon: 'bottle-water' },
  { name: 'Пивная бутылка', fraction: 'glass', icon: 'bottle-beer-glass' },
  { name: 'Газета', fraction: 'paper', icon: 'newspaper' },
  { name: 'Банка колы', fraction: 'metal', icon: 'can' },
  { name: 'Огрызок', fraction: 'organic', icon: 'apple-core' },
  { name: 'Батарейка', fraction: 'ewaste', icon: 'battery' },
  { name: 'Пакет', fraction: 'plastic', icon: 'bag-plastic' },
  { name: 'Винная бутылка', fraction: 'glass', icon: 'bottle-wine' },
  { name: 'Коробка', fraction: 'paper', icon: 'box' },
  { name: 'Консервная банка', fraction: 'metal', icon: 'can-food' },
  { name: 'Банановая кожура', fraction: 'organic', icon: 'banana' },
  { name: 'Старый телефон', fraction: 'ewaste', icon: 'phone-old' },
];

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
    name: 'Лимонадный мастер',
    description: 'Образование продавца лимонада.',
    cost: 80,
    requiredLevel: 0,
    unlocks: ['lemonade_license', 'lemonade_stand_purchase'],
    skillBoost: { lemonade: 1 },
  },
];

// ============================================================
//  SECTION: PASSIVE INCOME – PROPERTIES (v2 — multi-purchase)
// ============================================================
export type PropertyType = 'shack' | 'apartment-small' | 'apartment-big' | 'lemonade-stand';

export interface PropertyDef {
  id: PropertyType;
  name: string;
  price: number;
  incomePerMin: number;
  description?: string;
  iconKey: string;
}

export const PROPERTIES: Record<PropertyType, PropertyDef> = {
  shack: { id: 'shack', name: 'Сарай с бомжами', price: 120, incomePerMin: 3.0, description: 'Старт пассивного дохода', iconKey: 'shack' },
  'apartment-small': { id: 'apartment-small', name: 'Хрущёвка', price: 450, incomePerMin: 12.0, description: 'Классика', iconKey: 'apartment-1' },
  'apartment-big': { id: 'apartment-big', name: 'Пентхаус', price: 1500, incomePerMin: 45.0, description: 'Элита', iconKey: 'apartment-2' },
  'lemonade-stand': { 
    id: 'lemonade-stand', 
    name: 'Лимонад-стенд', 
    price: 320, 
    incomePerMin: 8.5,
    description: 'Свой киоск лимонада',
    iconKey: 'lemonade-stand'
  },
};

// ============================================================
//  SECTION: HUNGER SYSTEM
// ============================================================
export const HUNGER_MAX = 100;
export const HUNGER_DRAIN_PER_SEC = 1.5; // голод каждые ~67 секунд
export const HUNGER_CRITICAL = 20; // ниже этого — штраф скорости
export const HUNGER_STARVING = 5; // ниже этого — игрок не может бежать

// ============================================================
//  SECTION: SERVER-SIDE ENTITIES
// ============================================================
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

// v2 property ownership — with unique IDs so you can buy multiple of the same type
export interface OwnedProperty {
  id: string;       // unique ID for this purchase
  type: PropertyType;
  boughtAt: number; // timestamp
}

export interface PlayerSave {
  money: number;
  inventory: (InventoryItem | null)[];
  backpackTier: number;
  hasJacket: boolean;
  hasSneakers: boolean;
  hasCrown: boolean;
  properties: OwnedProperty[];
  jobSkills?: JobSkills;
  licenses?: JobLicense;
  trainingCompleted?: string[];
  hunger?: number;
}
