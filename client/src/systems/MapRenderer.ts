// ============================================================
//  SECTION: MAP TILE + ENTITY RENDERING
// ============================================================

import Phaser from 'phaser';
import { parseKey, TILE_SIZE, TILE_SIZE_HALF, type MapDocument, type MapEntity } from '../../../shared/map';
import { KIOSK_SCALE, OBSTACLE_SCALE } from '../config/WorldConstants';

export class MapRenderer {
  private staticTileImages: Phaser.GameObjects.Image[] = [];
  private kioskSprites = new Map<string, Phaser.GameObjects.GameObject>();
  private npcSprites: Phaser.GameObjects.GameObject[] = [];
  private obstaclesGroup?: Phaser.Physics.Arcade.StaticGroup;
  private obstaclesCollider?: Phaser.Physics.Arcade.Collider;

  constructor(private readonly scene: Phaser.Scene) {}

  get obstacles(): Phaser.Physics.Arcade.StaticGroup | undefined {
    return this.obstaclesGroup;
  }

  get kiosks(): Map<string, Phaser.GameObjects.GameObject> {
    return this.kioskSprites;
  }

  renderTiles(map: MapDocument): void {
    for (const img of this.staticTileImages) img.destroy();
    this.staticTileImages = [];

    for (const [key, type] of Object.entries(map.tiles)) {
      const pos = parseKey(key);
      if (!pos) continue;
      if (type === 'ground-grass') continue;

      const rotation = map.rotations?.[key] ?? 0;
      const px = pos.x * TILE_SIZE + TILE_SIZE_HALF;
      const py = pos.y * TILE_SIZE + TILE_SIZE_HALF;
      const img = this.scene.add.image(px, py, `tile-${type}`);
      img.setDepth(1);
      img.setAngle(rotation);
      this.staticTileImages.push(img);
    }
  }

  renderEntities(map: MapDocument, player: Phaser.GameObjects.Sprite): void {
    if (!map.entities) map.entities = {};

    for (const k of this.kioskSprites.values()) k.destroy();
    this.kioskSprites.clear();

    for (const sprite of this.npcSprites) sprite.destroy();
    this.npcSprites = [];

    if (this.obstaclesCollider) this.obstaclesCollider.destroy();
    if (this.obstaclesGroup) this.obstaclesGroup.destroy(true);

    this.obstaclesGroup = this.scene.physics.add.staticGroup();
    this.obstaclesCollider = this.scene.physics.add.collider(player, this.obstaclesGroup);

    for (const entity of Object.values(map.entities)) {
      const px = entity.cellX * TILE_SIZE + TILE_SIZE_HALF;
      const py = entity.cellY * TILE_SIZE + TILE_SIZE_HALF;

      switch (entity.type) {
        case 'kiosk':
          this.renderKiosk(entity, px, py);
          break;
        case 'food-cart':
          this.renderFoodCart(entity, px, py);
          break;
        case 'clothing-shop':
          this.renderClothingShop(entity, px, py);
          break;
        case 'apartment-1':
        case 'apartment-2':
        case 'wall':
        case 'building':
          this.renderObstacle(entity, px, py);
          break;
        case 'npc':
          this.renderNpc(entity, px, py);
          break;
      }
    }
  }

  private renderKiosk(entity: MapEntity, px: number, py: number): void {
    const sprite = this.scene.add.image(px, py, 'recycle-machine');
    sprite.setScale(KIOSK_SCALE);
    sprite.setDepth(100);
    sprite.setAngle(entity.rotation);
    this.kioskSprites.set(entity.id, sprite);
  }

  private renderFoodCart(entity: MapEntity, px: number, py: number): void {
    const sprite = this.scene.add.image(px, py, 'food-cart');
    sprite.setScale(OBSTACLE_SCALE);
    sprite.setDepth(100);
    sprite.setAngle(entity.rotation);
    this.kioskSprites.set(entity.id, sprite);
  }

  private renderClothingShop(entity: MapEntity, px: number, py: number): void {
    const sprite = this.scene.add.image(px, py, 'clothing-shop');
    sprite.setScale(OBSTACLE_SCALE);
    sprite.setDepth(100);
    sprite.setAngle(entity.rotation);
    this.kioskSprites.set(entity.id, sprite);
  }

  // ============================================================
  //  SECTION: OBSTACLE COLLISION
  // ============================================================
  // Static bodies in Phaser do not account for the game object's origin automatically.
  // displayWidth/height already include the scale, so the body exactly matches the sprite.
  private renderObstacle(entity: MapEntity, px: number, py: number): void {
    if (!this.obstaclesGroup) return;
    const spriteKey = this.scene.textures.exists(entity.type) ? entity.type : 'apartment-1';
    const obstacle = this.scene.physics.add.staticImage(px, py, spriteKey);
    obstacle.setScale(OBSTACLE_SCALE);
    obstacle.setAngle(entity.rotation);
    obstacle.setDepth(90);

    const body = obstacle.body as Phaser.Physics.Arcade.StaticBody;
    body.setSize(obstacle.displayWidth, obstacle.displayHeight);
    body.setOffset(0, 0);
    obstacle.refreshBody();

    this.obstaclesGroup.add(obstacle);
  }

  private renderNpc(entity: MapEntity, px: number, py: number): void {
    const container = this.scene.add.container(px, py);
    container.setDepth(101);

    const body = this.scene.add.rectangle(0, 0, 24, 24, 0x00ccff);
    body.setStrokeStyle(1, 0xffffff);

    const label = this.scene.add
      .text(0, -20, entity.properties.label || 'NPC', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#00ccff',
        backgroundColor: '#000000aa',
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5);

    container.add([body, label]);
    this.npcSprites.push(container);
  }

  destroy(): void {
    for (const img of this.staticTileImages) img.destroy();
    this.staticTileImages = [];
    for (const k of this.kioskSprites.values()) k.destroy();
    this.kioskSprites.clear();
    for (const s of this.npcSprites) s.destroy();
    this.npcSprites = [];
    if (this.obstaclesCollider) this.obstaclesCollider.destroy();
    if (this.obstaclesGroup) this.obstaclesGroup.destroy(true);
  }
}
