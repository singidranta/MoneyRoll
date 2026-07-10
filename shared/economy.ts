// ============================================================
//  SECTION: CLOTHING TYPES (для визуального отображения на игроке)
// ============================================================
export type HeadSlot = 'cap' | 'beanie';
export type BodySlot = 'hoodie';
export type LegsSlot = 'jeans';
export type FeetSlot = 'boots';

export type EquippableClothing = HeadSlot | BodySlot | LegsSlot | FeetSlot;

// ============================================================
//  SECTION: CLOTHING WEIGHTS & PRICES
// ============================================================
export const CLOTHING_WEIGHTS: Record<EquippableClothing, number> = {
  'cap': 0.15,
  'beanie': 0.12,
  'hoodie': 0.45,
  'jeans': 0.55,
  'boots': 0.8,
};

export const CLOTHING_PRICES: Record<EquippableClothing, number> = {
  'cap': 5.0,
  'beanie': 7.0,
  'hoodie': 25.0,
  'jeans': 18.0,
  'boots': 30.0,
};

export const CLOTHING_NAMES: Record<EquippableClothing, string> = {
  'cap': 'Кепка',
  'beanie': 'Шапка',
  'hoodie': 'Худи',
  'jeans': 'Джинсы',
  'boots': 'Берцы',
};

export const CLOTHING_ICON_PATHS: Record<EquippableClothing, string> = {
  'cap': '/assets/props/flat/clothing/cap.png',
  'beanie': '/assets/props/flat/clothing/beanie.png',
  'hoodie': '/assets/props/flat/clothing/hoodie.png',
  'jeans': '/assets/props/flat/clothing/jeans.png',
  'boots': '/assets/props/flat/clothing/boots.png',
};

// ============================================================
//  SECTION: INVENTORY ITEM TYPES
// ============================================================
export type InventoryItem =
  | BottleType
  | 'bag-adidas'
  | 'backpack-tourist'
  | FoodType
  | 'parcel'
  | HeadSlot
  | BodySlot
  | LegsSlot
  | FeetSlot;

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
//  SECTION: FOOD & GEAR WEIGHTS (реалистичные в кг)
// ============================================================
export const FOOD_WEIGHTS: Record<FoodType, number> = {
  shawarma: 0.65,    // Большой шаурма-ролл ~350-400г
  energy: 0.55,      // Энергетик 0.5л в банке ~500-600г
  hotdog: 0.22,      // Хот-дог ~150-200г (сосиска + булочка)
  sushi: 0.35,       // Комплект суши ~200-300г
  pizza: 0.28,       // Кусок пиццы ~180-250г (целая ~1кг)
  salad: 0.38,       // Порция салата ~250-350г
  ramen: 0.72,       // Большая миска рамена ~600-800г (с лапшой и бульоном)
  steak: 0.42,       // Стейк ~300-350г (без гарнира)
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
  shawarma: '/assets/props/flat/food/shawarma.png',
  energy: '/assets/props/flat/food/energy.png',
  hotdog: '/assets/props/flat/food/hotdog.png',
  sushi: '/assets/props/flat/food/sushi.png',
  pizza: '/assets/props/flat/food/pizza.png',
  salad: '/assets/props/flat/food/salad.png',
  ramen: '/assets/props/flat/food/ramen.png',
  steak: '/assets/props/flat/food/steak.png',
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
  1: { name: 'Карманы', maxWeight: 5.0 },      // Можно носить ~7-8 бутылок воды или 4-5 бутылок вина
  2: { name: 'Сумка Adidas', maxWeight: 15.0 }, // Спортивная сумка - удобно для сбора мусора
  3: { name: 'Рюкзак туриста', maxWeight: 30.0 }, // Большой рюкзак для серьёзной работы
};

export const MAX_INVENTORY_WEIGHT = BACKPACK_TIERS[1].maxWeight;

// ============================================================
//  SECTION: BOTTLE DEFINITIONS (реалистичные веса в кг)
// ============================================================
export const BOTTLE_TYPES: Record<BottleType, BottleDef> = {
  'water': {
    id: 'water',
    name: 'Пластиковая вода',
    price: 0.05,
    weight: 0.55,     // 0.5л бутылка ~500-550г (пустая 15-20г + жидкость)
    spawnWeight: 60,
    color: 0x4da6ff,
    spriteKey: 'bottle-water',
  },
  'beer-glass': {
    id: 'beer-glass',
    name: 'Стекло пиво',
    price: 0.20,
    weight: 0.85,     // 0.5л стеклобутылка ~350г пустая + 500г жидкость ≈ 850г
    spawnWeight: 25,
    color: 0xcc7a00,
    spriteKey: 'bottle-beer-glass',
  },
  'wine': {
    id: 'wine',
    name: 'Вино',
    price: 1.00,
    weight: 1.65,     // 0.75л стеклобутылка ~600г пустая + 750г жидкость ≈ 1.35кг, но тяжелее бутылка
    spawnWeight: 10,
    color: 0x990033,
    spriteKey: 'bottle-wine',
  },
  'champagne': {
    id: 'champagne',
    name: 'Шампанское',
    price: 5.00,
    weight: 2.2,      // 0.75л толстое стекло под давлением ~900г + 750г = 1.65кг + пробка/этикетка
    spawnWeight: 4,
    color: 0xffd700,
    spriteKey: 'bottle-champagne',
  },
  'bordeaux-1982': {
    id: 'bordeaux-1982',
    name: 'Bordeaux 1982',
    price: 50.00,
    weight: 2.8,      // 0.75л премиум бутылка ~700-800г (толстое антикварное стекло) + жидкость
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
  // Новая одежда
  'cap': 5.0,
  'beanie': 7.0,
  'hoodie': 25.0,
  'jeans': 18.0,
  'boots': 30.0,
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

// Упрощённая сортировка - только 4 понятных категории с картинками
export const TRASH_FRACTIONS = [
  { id: 'plastic', name: 'Пластик', color: '#facc15', icon: 'sort-plastic', iconPath: '/assets/icons/sort-plastic.png' },
  { id: 'glass', name: 'Стекло', color: '#22c55e', icon: 'sort-glass', iconPath: '/assets/icons/sort-glass.png' },
  { id: 'paper', name: 'Бумага', color: '#3b82f6', icon: 'sort-paper', iconPath: '/assets/icons/sort-paper.png' },
  { id: 'metal', name: 'Металл', color: '#a1a1aa', icon: 'sort-metal', iconPath: '/assets/icons/sort-metal.png' },
] as const;

export type TrashFractionId = typeof TRASH_FRACTIONS[number]['id'];

// Простые предметы для сортировки - по 3 на категорию, всего 12 штук
export const TRASH_SORT_ITEMS: { name: string; fraction: TrashFractionId; icon: string; iconPath: string }[] = [
  // Пластик
  { name: 'ПЭТ бутылка', fraction: 'plastic', icon: 'bottle-water', iconPath: '/assets/props/flat/bottles/water.png' },
  { name: 'Пакет', fraction: 'plastic', icon: 'bag-plastic', iconPath: '/assets/props/flat/trash/bag-plastic.png' },
  { name: 'Контейнер', fraction: 'plastic', icon: 'container', iconPath: '/assets/props/flat/trash/container.png' },
  // Стекло
  { name: 'Пивная бутылка', fraction: 'glass', icon: 'bottle-beer', iconPath: '/assets/props/flat/bottles/beer-glass.png' },
  { name: 'Винная бутылка', fraction: 'glass', icon: 'bottle-wine', iconPath: '/assets/props/flat/bottles/wine.png' },
  { name: 'Банка стеклянная', fraction: 'glass', icon: 'jar', iconPath: '/assets/props/flat/trash/jar.png' },
  // Бумага
  { name: 'Газета', fraction: 'paper', icon: 'newspaper', iconPath: '/assets/props/flat/trash/newspaper.png' },
  { name: 'Картонная коробка', fraction: 'paper', icon: 'box', iconPath: '/assets/props/flat/trash/box.png' },
  { name: 'Бумажный пакет', fraction: 'paper', icon: 'paper-bag', iconPath: '/assets/props/flat/trash/paper-bag.png' },
  // Металл
  { name: 'Алюминиевая банка', fraction: 'metal', icon: 'can', iconPath: '/assets/props/flat/trash/can.png' },
  { name: 'Консервная банка', fraction: 'metal', icon: 'can-food', iconPath: '/assets/props/flat/trash/can-food.png' },
  { name: 'Металлическая пробка', fraction: 'metal', icon: 'cap', iconPath: '/assets/props/flat/trash/cap.png' },
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

// Система экипировки - 4 слота для отображения одежды на игроке
export interface PlayerEquipment {
  head: EquippableClothing | null;   // Головной убор (cap, beanie)
  body: EquippableClothing | null;   // Тело (hoodie)
  legs: EquippableClothing | null;   // Штаны (jeans)
  feet: EquippableClothing | null;   // Обувь (boots)
}

export const DEFAULT_EQUIPMENT: PlayerEquipment = {
  head: null,
  body: null,
  legs: null,
  feet: null,
};

export interface PlayerSave {
  money: number;
  inventory: (InventoryItem | null)[];
  backpackTier: number;
  hasJacket: boolean;
  hasSneakers: boolean;
  hasCrown: boolean;
  equipment: PlayerEquipment;  // Экипировка для отображения
  properties: OwnedProperty[];
  jobSkills?: JobSkills;
  licenses?: JobLicense;
  trainingCompleted?: string[];
  hunger?: number;
}
