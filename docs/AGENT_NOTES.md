# AGENT NOTES — read this first

> Внутренний файл для AI-агента Arena. Перед каждой сессией с проектом MoneyRoll читай этот файл.

---

## Project identity

- **Name:** MoneyRoll
- **Current version:** `1.6`
- **Repo branch for this session:** `arena/019f4bec-moneyroll`
- **Stack:** Vite + TypeScript + Phaser 3 (client), Node.js + Express + `ws` (server), pnpm workspaces.

---

## Critical constants (do not change silently)

| Constant | Value | File |
|---|---|---|
| Map size | `MAP_WIDTH = 20`, `MAP_HEIGHT = 20` | `shared/map.ts` |
| Tile size | `TILE_SIZE = 128` | `shared/map.ts` |
| Inventory slots | `INVENTORY_SLOTS = 12` | `shared/economy.ts` |
| Backpack tiers | `1: Карманы (2.5kg)`, `2: Сумка Adidas (15kg)`, `3: Рюкзак туриста (30kg)` | `shared/economy.ts` |
| Hunger max | `HUNGER_MAX = 100` | `shared/economy.ts` |
| Hunger drain | `HUNGER_DRAIN_PER_SEC = 1.5` | `shared/economy.ts` |

Server automatically resets old `map.json` files whose size differs from these constants.

---

## Collision system

Obstacles (apartments, walls, buildings) in `WorldScene` are created with:

```ts
const obstacle = this.physics.add.staticImage(px, py, spriteKey);
obstacle.setScale(OBSTACLE_SCALE); // 0.5
const body = obstacle.body as Phaser.Physics.Arcade.StaticBody;
body.setSize(obstacle.displayWidth, obstacle.displayHeight);
body.setOffset(0, 0);
obstacle.refreshBody();
```

**Why this works:** Phaser `StaticBody` does not auto-center using the game object's origin. `staticImage` creates a physics-enabled image; `setSize` to its scaled display size and `refreshBody()` aligns the hitbox exactly with the sprite. Do not use `updateFromGameObject()` on static bodies and do not use `setOffset(32, 32)`.

---

## Code style rules

1. **Block comments.** Every major section must be marked with:
   ```ts
   // ============================================================
   //  SECTION: NAME
   // ============================================================
   ```
2. **No magic numbers.** Use constants from `shared/map.ts` and `shared/economy.ts`.
3. **Shared types.** Inventory items are `InventoryItem` from `shared/economy.ts`. Use it on both client and server.
4. **Version bump ritual.** When the user asks for a new version, update:
   - `package.json` (root)
   - `client/package.json`
   - `server/package.json`
   - `client/src/scenes/BootScene.ts` (`VERSION`)
   - `server/src/index.ts` (`/api/health` version)

---

## Communication defaults

- Speak Russian to the user.
- Keep answers short, show code/screenshots when possible.
- Run `pnpm run typecheck` after significant changes.
- Only push to `arena/019f4bec-moneyroll`; never create or push other branches.
- Use `gh` for pull requests and merges to `main` when the user asks.

---

## Architecture after refactor (v1.6+)

### Key data types

```ts
// OwnedProperty — allows buying multiple of same type at different points
interface OwnedProperty {
  id: string;       // unique purchase ID
  type: PropertyType;
  boughtAt: number;
}

// Hunger system
HUNGER_MAX = 100
HUNGER_DRAIN_PER_SEC = 1.5   // drains over time
HUNGER_CRITICAL = 20          // below this = speed penalty
HUNGER_STARVING = 5           // below this = can't sprint

FoodType = 'shawarma' | 'energy' | 'hotdog' | 'sushi' | 'pizza' | 'salad' | 'ramen' | 'steak'
```

### Courier delivery fix (v1.6)

The courier delivery bug was: server checked distance to courier hub for delivery completion, not the delivery house.

**Fix:** Server now collects `deliveryHouses: DeliveryPoint[]` from map entities (`apartment-1`, `apartment-2`, `building`) and accepts job-submit for courier if player is near EITHER a courier hub OR any apartment.

### Property system fix (v1.6)

Previously `properties` was `PropertyType[]` which prevented buying the same type twice.

**Fix:** Properties are now `OwnedProperty[]` with unique IDs. The same property type can be bought multiple times at different map points. Passive income sums all owned properties.

### Hunger system (v1.6)

Server ticks hunger every 15 seconds. Client shows hunger bar in HUD. Food restores hunger (different amounts per food type). Low hunger = speed penalty. Starving = can't sprint.

### Style

- **NO emojis anywhere** — replaced with monoline SVG icons or webp sprites
- Consistent flat dark theme throughout all UI
- SVG icons in `client/public/assets/icons/` and `client/public/assets/icons/trash/`

---

## Last known state

- Grid is 20x20.
- Collision bug is fixed.
- Courier delivery now works at apartment buildings, not just courier hub.
- Properties can be bought multiple times (same type, different locations).
- Hunger system: eat or suffer penalties.
- 8 food types available at food cart.
- All emojis replaced with icons.
- Typecheck and build should pass.
