# 🤖 AGENT NOTES — read this first

> Внутренний файл для AI-агента Arena. Перед каждой сессией с проектом MoneyRoll читай этот файл.

---

## Project identity

- **Name:** MoneyRoll
- **Current version:** `1.4`
- **Repo branch for this session:** `arena/019f46be-moneyroll`
- **Stack:** Vite + TypeScript + Phaser 3 (client), Node.js + Express + `ws` (server), pnpm workspaces.

---

## Critical constants (do not change silently)

| Constant | Value | File |
|---|---|---|
| Map size | `MAP_WIDTH = 20`, `MAP_HEIGHT = 20` | `shared/map.ts` |
| Tile size | `TILE_SIZE = 128` | `shared/map.ts` |
| Inventory slots | `INVENTORY_SLOTS = 12` | `shared/economy.ts` |
| Backpack tiers | `1: Карманы (2.5kg)`, `2: Сумка Adidas (15kg)`, `3: Рюкзак туриста (30kg)` | `shared/economy.ts` |

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
   Do not use `// ───── ... ─────` style anymore.
2. **No magic numbers.** Use constants from `shared/map.ts` and `shared/economy.ts` (`TILE_SIZE_HALF`, `BACKPACK_TIERS`, `PLAYER_SCALE`, etc.).
3. **Shared types.** Inventory items are `InventoryItem` from `shared/economy.ts`. Use it on both client and server.
4. **Version bump ritual.** When the user asks for a new version, update:
   - `package.json` (root)
   - `client/package.json`
   - `server/package.json`
   - `client/src/scenes/BootScene.ts` (`VERSION`)
   - `server/src/index.ts` (`/api/health` → `version`)

---

## Communication defaults

- Speak Russian to the user.
- Keep answers short, show code/screenshots when possible.
- Run `pnpm run typecheck` after significant changes.
- Run `pnpm --filter @moneyroll/client build` before declaring a client release done.
- Only push to `arena/019f46be-moneyroll`; never create or push other branches.
- Use `gh` for pull requests and merges to `main` when the user asks.

---

## Last known state

- Grid is 20×20.
- Collision bug is fixed.
- Code is split into block-commented sections.
- Server starts with an empty 20×20 map if no `map.json` exists or if the saved map size is wrong.
- Build and typecheck pass.
