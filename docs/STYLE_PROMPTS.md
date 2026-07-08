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

---

## ⬛ Tile (тайлы карты) — БОЛЬШОЙ ПРОМПТ для AI

Используется в `EditorScene` (`pnpm dev:editor`): 200×200 клеточек, тайл **64×64 px**.
Это **тайлсет** — одна текстура повторяется по всему полю, поэтому все стыки между
тайлами ДОЛЖНЫ быть **seamless** (невидимыми при повторении).

### 🎯 Сцена и настроение (что мы делаем)

Вид сверху на деревню / маленький городок (как The Sims, Habbo, Stardew Valley).
Стиль — **минималистичные наклейки** в духе Among Us. Никакого фотореализма.
Цвета спокойные, не кислотные. Контраст ровный, без теней.

Палитра игры (запомни — она уже согласована с `MapSystem.TILE_COLORS`):
```
земля/трава:      #6a8a4e  приглушённый травяной
земля/грязь:       #8a6f4d  тауп-коричневый
дорога/асфальт:   #4a4a55  серый асфальт
разметка/белая:    #f4f4f0  почти белый
разметка/жёлтая:   #d4a847  янтарно-жёлтый
контур:            #000000  чёрный 2px
```

### 📐 Технические параметры SD (общие для всех тайлов)

| Параметр | Значение |
|---|---|
| Model | **SDXL Base 1.0** (рекомендуется; SD1.5 тоже ок, меньше деталей) |
| Steps | **30–40** (больше — дольше, без пользы) |
| CFG Scale | **7–8** (выше — жёстче следует промпту, могут быть артефакты; ниже — больше «творчества») |
| Sampler | **DPM++ 2M Karras** |
| Image size | **1024×1024** (генерим большое, потом ресайз до 64×64) |
| Seed | Зафиксируй **один seed на сессию** (например `12345`) — стиль будет одинаковый между ground и road |
| LoRA | `flat-stickers.safetensors`, weight 0.7–0.8 (если есть) |

**Главное правило seamless:** после генерации открой результат в редакторе, увеличь
до 1024×1024 и поставь рядом 4 копии (2×2 сетку). Если стыки видны — сегодня не повезло,
перегенерируй с тем же seed (или другим, если плохо несколько раз подряд).

### 🚫 Negative prompt (обязательный для ОБОИХ тайлов)

```
photorealistic, photographic, gradient, gradient shading, soft shading,
shadows, cast shadow, ambient occlusion, vignette, color noise,
film grain, painterly, watercolor, sketches,
isometric perspective, 3d render, depth, depth of field,
blur, blurry, low contrast, busy cluttered,
text, letters, numbers, watermark, signature,
large border, frame, hard edges at tile seams, visible grid lines,
perspective distortion, fish eye, curved camera, tilt-shift, ray tracing
```

SDXL обычно игнорирует negative prompts длиннее ~77 токенов — этот в пределах.

### 🟩 Вариация 1 — Ground (земля / трава)

**Полный промпт (copy-paste):**

```
flat 2D top-down game tile, 64x64 seamless tileable tile,
top-down view straight down orthographic 90 degrees,
bold black 2px outline, solid flat colors only,
no gradients no shadows no lighting,
minimalist sticker art style, vector clean shapes,
transparent background, single tile only,
game tile for top-down RPG city map, ground terrain tile,
natural muted palette: sage green grass, moss, brown earth, beige,
grass and soil: clean sage-green grass field with a few small
scattered pebbles and stones, two small dirt patches
(one tan-brown, one eggshell-beige), 4-6 tiny pebbles in cool gray,
very slight color variation across tile,
soft rounded corners on all elements,
EDGES MUST BE SEAMLESS WHEN TILE REPEATS IN 2x2 GRID
(no rim, no border mark on edges, no center mark, no visible grid lines),
no characters no objects no buildings
```

**Тонкая настройка:**

- Хочешь более «вырезанный» вид — добавь: `, sticker style, flat illustration, paper cutout aesthetic`
- Хочешь детский / уютный — добавь: `, friendly cartoon style, soft rounded shapes`
- Если ИИ рисует слишком много деталей — добавь: `, minimal detail, simple`
- Если слишком однотонно — добавь: `, slight grass-blade variation, micro pebble detail`

### ⬛ Вариация 2 — Road (асфальт / дорога)

**Полный промпт:**

```
flat 2D top-down game tile, 64x64 seamless tileable tile,
top-down view straight down orthographic 90 degrees,
bold black 2px outline, solid flat colors only,
no gradients no shadows no lighting,
minimalist sticker art style, vector clean shapes,
transparent background, single tile only,
game tile for top-down RPG city map, road tile (asphalt street segment),
muted gray asphalt palette: slate gray asphalt, soft white lane markings,
faded amber yellow,
asphalt road surface: even slate-gray asphalt color field
with one short dashed white line down the center
(single short centerline dash, like a city street marker),
tiny subtle crack suggestion as a few thin black strokes
(max 3 small cracks total, flat-style),
edges of asphalt should meet a grass tile cleanly (no overlap),
EDGES MUST BE SEAMLESS WHEN TILE REPEATS IN 2x2 GRID
(no rim, no border mark on edges, no center mark outside the line,
no visible grid lines),
no cars no pedestrians no buildings no signs no characters
```

**Тонкая настройка:**

- Двухполосная дорога (две линии) — добавь: `, two short dashed white lines, one on each side of center`
- Брусчатка вместо асфальта — замени `asphalt` на `cobblestone, gray stone bricks`,
  добавь: `, irregular stone pattern, slightly uneven`
- Жёлтая разметка вместо белой — замени `dashed white line` на `dashed yellow line`

### 🔁 Проверка tileability (бесшовности)

После генерации, **до** сохранения:

1. Открой PNG в редакторе (Paint.NET / GIMP / Photoshop).
2. Создай canvas **256×256** (4× тайл) и скопируй тайл 4 раза (2×2 сетка).
3. Сохрани и посмотри:
   - Контур тайла **не должен быть виден** в местах стыка.
   - Любой узор (если есть) должен «перетекать» через границу.
   - Нет «полосы» между тайлами.
4. Если стыки видны — генерируй заново. Через 3–4 попытки стык обычно «сходится».

### ⚙️ Постобработка после генерации

1. **rembg** для фона:
   ```bash
   # Установить один раз: pip install rembg[gpu]  (или без [gpu] для CPU)
   rembg i input.png output.png
   ```
   Или онлайн: [remove.bg](https://remove.bg).

2. **Ресайз до 64×64** строго. Phaser рендерит тайлы 64×64 — иначе при тайлинге
   изображение становится размытым:
   - **Photoshop**: Image → Image Size → 64×64, Resample: **Nearest Neighbor (Hard edges)**.
   - **GIMP**: Image → Scale Image → 64×64, Interpolation: **None**.
   - **CLI (ImageMagick)**: `convert input.png -resize 64x64! -filter point output.png`

3. **Опционально**: чуть размыть края (Gaussian Blur 0.5–1px) — убирает
   остатки стыков-артефактов при тайлинге. Применяй **только** на внешние 2px кромки.

### 📁 Куда сохранять (paths)

Игровой билд читает файлы из `client/public/assets/tiles/flat/`:

```
client/public/assets/tiles/flat/
├── ground.png    ← ground tile (земля / трава)
└── road.png      ← road tile (асфальт / дорога)
```

**Имена строго:** `ground.png`, `road.png`, lowercase, без пробелов и кириллицы.
Vite раздаёт их через `/assets/tiles/flat/ground.png` автоматически (папка `public/`
доступна из корня).

Если у тебя уже есть иконка `client/public/favicon.ico` или другие файлы — не удаляй,
просто положи два PNG рядом.

### 🔌 Как игра это подхватит

**Сейчас** (на момент написания этого промпта) `client/src/systems/MapSystem.ts`
использует **плейсхолдер-цвета** (прямоугольники одного цвета). Это нормально для
прототипа, но AI-текстуры будут выглядеть **в разы** лучше.

**Когда AI-картинки будут готовы**, чтобы игра их подхватила, скажи мне —
я сделаю отдельный микро-PR:

1. В `client/src/scenes/PreloadScene.ts` (в `preload()`):
   ```ts
   this.load.image('tile-ground', '/assets/tiles/flat/ground.png');
   this.load.image('tile-road',   '/assets/tiles/flat/road.png');
   ```
2. В `client/src/systems/MapSystem.ts` — заменить `TILE_COLORS` на
   `TILE_KEYS = { ground: 'tile-ground', road: 'tile-road' }`.
3. В `EditorScene.renderAll` и в click-handler — заменить `layer.fillRect(...)` на
   `this.add.image(x*TILE_SIZE, y*TILE_SIZE, TILE_KEYS[type]).setOrigin(0,0)`.
4. Добавить тот же рендер в `WorldScene` чтобы фон карты был виден в play-режиме.

### ✅ Чеклист качества (copy-paste в свой workflow)

- [ ] Размер **64×64** строго
- [ ] Прозрачный фон (видишь белый клетчатый шаблон в превью)
- [ ] Все элементы **внутри** квадрата (ничего не обрезано по краям)
- [ ] Контур чёрный, замкнутый, **толщина ~2px** (не толще)
- [ ] Цветов ≤4 (плюс чёрный контур)
- [ ] При копировании 2×2 (256×256) — стыки НЕ видны
- [ ] Узнаваемо как 64×64 — даже в маленьком размере понимаешь, что это
- [ ] Стилистически соответствует соседнему тайлу (тот же seed, та же палитра)
- [ ] Нет текста, цифр, водяных знаков
- [ ] Нет реалистичных теней / градиентов
- [ ] Имя файла = `ground.png` или `road.png` (lowercase)

### 🎨 Альтернативные LoRA (если `flat-stickers` нет)

Если не нашёл `flat-stickers.safetensors`, попробуй:
- `pixel-art-flat` (Civitai) — для более пиксельного вида
- `paper-cutout` (HuggingFace) — для вырезанного «из бумаги» стиля, очень похоже на Among Us
- Обучи свою: возьми 30 референсов (Google Images: `flat illustration game tile`), обучи LoRA за 30–60 минут на 8GB+ VRAM.

### 💡 Советы по cost-time

- Генерация 1024×1024 на RTX 3060 (12GB) — ~10 секунд за семпл.
- Один готовый тайл = 1-2 минуты (с перегенерациями на tileability).
- Два тайла (ground + road) с одним seed — **~5 минут** вместе. Не торопись — пересмотр стоит дешевле, чем чинить контраст потом.
