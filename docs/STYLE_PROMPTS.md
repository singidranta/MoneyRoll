# 🎨 Промпты для генерации картинок MoneyRoll

> Этот файл — главный помощник для создания спрайтов через Stable Diffusion / Midjourney / DALL-E.
> Я даю конкретные промпты → ты вставляешь в генератор → сохраняешь в нужную папку.

---

## Главный стиль MoneyRoll

Игра в стиле **Hybrid**:

- **Flat 2D (стикер-стиль)** — для персонажей, NPC, объектов мира
- **Monoline (тонкие контуры)** — для UI и иконок

Что объединяет оба стиля:

- ✅ Только **сплошные плоские цвета** (без градиентов и теней)
- ✅ Чёрный контур ~3px у Flat, ~2px у Monoline
- ✅ **Минимум деталей** — узнаваемость важнее реализма
- ✅ **Прозрачный фон** — белый клетчатый шаблон после rembg
- ✅ Стилистическая согласованность между всеми ассетами

---

## Универсальная база промпта (копируй в каждый)

```
flat 2D game sprite, bold black outline 3px, solid colors only,
no gradient, no shading, minimalist, transparent background,
centered, vector style, web game asset
```

### Negative prompt (обязательный, без него стиль «плывёт»)

```
photo, photorealistic, gradient, shading, watermark, signature,
3d render, isometric perspective, blurry, low contrast, busy background,
text, letters, numbers, frame, border
```

---

## Промпты по типам ассетов

### 🧑 Голова (paper-doll слой)

```
[BASE], front view, only head and neck, T-pose style,
medium-sized head, slightly stylized, suitable for top-down 2D RPG,
friendly proportions
```

### 💇 Причёска (отдельная шапка)

```
[BASE], single hairstyle accessory, only the hair mass,
no face underneath, front view, centered, paper-doll overlay
```

### 👕 Верх одежды

```
[BASE], only upper body clothing item (torso),
shirt OR hoodie OR jacket, NO body underneath, transparent around edges,
perfectly fitted on invisible torso mannequin, front view
```

### 👖 Низ одежды

```
[BASE], only lower body clothing, pants OR shorts OR skirt,
NO body underneath, transparent above waist, front view
```

### 🧴 Аксессуар (шапка, очки, цепь)

```
[BASE], single wearable accessory item, no head or body,
isolated on transparent, front view, centered
```

### 🍾 Бутылка (game prop)

```
[BASE], single bottle object, top-down 2D game prop,
small upright item, full bottle visible, no pedestal,
white-bordered transparent background
```

### 🧍 NPC (полный персонаж)

```
[BASE], full body character, standing, front view, T-pose,
paper-doll proportional head, friendly pose, simple silhouette
```

### 🛒 Киоск / объект мира

```
[BASE], single game world prop, full object visible,
top-down friendly view, isolated, no characters
```

### 🖼️ Иконки UI (monoline)

```
monoline icon style, single continuous black line, 2px stroke,
no fill, simple, minimalist, monochrome, transparent background,
game UI icon style, [ICON SUBJECT HERE]
```

Примеры `ICON SUBJECT`: `coin`, `backpack`, `cracked-bottle`, `stopwatch`, `crosshair`.

---

## Параметры генерации (Stable Diffusion)

| Параметр | Значение |
|---|---|
| Model | SDXL Base или аналог |
| Negative prompt | (см. выше) |
| Steps | 30–40 |
| CFG Scale | 7–8 |
| Sampler | DPM++ 2M Karras |
| Image size | 1024×1024 (далее ресайз до 64×64) |
| Seed | фиксированный для партий (стилистическая согласованность) |

### Рекомендованная LoRA

**`flat-stickers.safetensors`** (weight 0.7–0.8) — обучена на плоских стикерах.
Без LoRA результаты нестабильные: один ассет получается, другой «убегает» в реализм.

### Где взять LoRA

- Hugging Face: поиск `flat sticker style lora sdxl`
- Civitai: то же
- Или обучить самостоятельно (нужно ~30 референсных картинок в нужном стиле)

---

## Постобработка ассетов

1. **Удалить фон** через `rembg` или [remove.bg](https://remove.bg)
2. **Ресайз** сохраняя пропорции:
   - Персонажи: 128×128 (для paper-doll слоёв ниже 256×256)
   - Бутылки: 64×64
   - Иконки: 64×64
   - Тайлы: 64×64 каждый
3. **Сохранить** в `public/assets/` по правильному пути (см. ниже)

Скрипт для batch: `ai-pipeline/generate.py` (запускается один раз на весь набор).

---

## Куда сохранять (структура папок)

```
public/assets/
├── chars/flat/
│   ├── head/      ← base, male-A, female-A, kid и т.д.
│   ├── hair/      ← short-blonde, long-black, bald и т.д.
│   ├── torso/     ← hoodie-red, tshirt-blue, suit-black
│   ├── legs/      ← pants-black, jeans, shorts, gold-pants
│   └── accessory/ ← none, cap-red, glasses-round, gold-chain
├── props/flat/
│   ├── bottles/   ← water, beer-glass, wine-red, champagne, bordeaux
│   ├── kiosk/     ← recycle-machine
│   └── npc/       ← bartender, wino, businesswoman
├── icons/monoline/
│   └── (UI icons)
└── tiles/flat/
    └── (город: дороги, тротуары, здания)
```

**Именование:** строго `kebab-case-en.png`. Никаких пробелов, кириллицы, заглавных.

---

## Чеклист качества (проверять перед коммитом)

- [ ] Фон прозрачный (видишь белый клетчатый шаблон в превью)
- [ ] Все элементы внутри квадрата (ничего не обрезано по краям)
- [ ] Контур чёрный, замкнутый, толщина ≈3px
- [ ] Цветов ≤3-4 (плюс чёрный контур)
- [ ] Узнаваемо как 64×64 даже в маленьком размере
- [ ] Стилистически соответствует соседним ассетам того же типа
- [ ] Имя файла совпадает со схемой в `ROADMAP.md`

---

## Примеры готовых промптов (copy-paste)

Водная бутылка:
```
flat 2D game sprite, bold black outline 3px, solid colors only, no gradient,
no shading, minimalist, transparent background, centered, vector style,
web game asset. single bottle object, top-down 2D game prop,
small upright item, full bottle visible, plastic water bottle,
blue label, simple silhouette
```
Negative: `photo, photorealistic, gradient, shading, watermark, signature,
3d render, isometric perspective, blurry, low contrast, busy background`

Вино:
```
flat 2D game sprite, bold black outline 3px, solid colors only, no gradient,
no shading, minimalist, transparent background, centered, vector style,
web game asset. dark red wine bottle, fancy cork, premium feel,
golden label, simple silhouette, top-down 2D game prop
```

Бордо 1982 (легендарка):
```
flat 2D game sprite, bold black outline 3px, solid colors only, no gradient,
no shading, minimalist, transparent background, centered, vector style,
web game asset. ornate vintage wine bottle, golden label, dusty appearance,
mysterious, exclusive item, aura of rarity, top-down 2D game prop
```

Иконка «монеты»:
```
monoline icon style, single continuous black line, 2px stroke, no fill,
simple, minimalist, monochrome, transparent background, game UI icon style,
golden coin with $ symbol in center, simple shape
```

Каждый новый ассет — сначала сгенери 4-6 вариантов, выбери **лучший по стилю**, не по «красоте». Стилистическая согласованность важнее детализации.
