// ============================================================
//  SECTION: MAP TILE + ENTITY RENDERING
// ============================================================

import Phaser from 'phaser';
import { PROPERTIES } from '../../../shared/economy';
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
        case 'school':
          this.renderBuildingSprite(entity, px, py, 'school', 1.0);
          break;
        case 'courier-hub':
        case 'job-courier':
          this.renderBuildingSprite(entity, px, py, 'courier-hub', 0.9);
          this.renderActionMarker(px, py - 70, '🚲', 'КУРЬЕР PRO', '$8–22', 0x3b82f6);
          break;
        case 'trash-sort-station':
        case 'job-trash-sort':
        case 'job-trash':
          this.renderBuildingSprite(entity, px, py, 'trash-sort-station', 0.9);
          this.renderActionMarker(px, py - 70, '♻', 'СОРТИРОВКА', '$5–14', 0x22c55e);
          break;
        case 'lemonade-stand':
        case 'job-lemonade':
          this.renderBuildingSprite(entity, px, py, 'lemonade-stand', 0.9);
          this.renderActionMarker(px, py - 70, '🍋', 'ЛИМОНАД', '$4.5–9.5', 0xfacc15);
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
        case 'property': {
          const property = PROPERTIES[entity.properties.propertyType ?? 'shack'];
          this.renderActionMarker(
            px,
            py,
            '⌂',
            property.name.toUpperCase(),
            `$${property.price} · +$${property.incomePerMin}/мин`,
            0xa855f7,
          );
          break;
        }
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

  private renderActionMarker(
    px: number,
    py: number,
    icon: string,
    title: string,
    subtitle: string,
    color: number,
  ): void {
    const marker = this.scene.add.container(px, py);
    marker.setDepth(102);

    const body = this.scene.add.rectangle(0, 0, 112, 82, color, 0.92);
    body.setStrokeStyle(3, 0xffffff, 0.9);

    const iconText = this.scene.add
      .text(-39, 0, icon, { fontFamily: 'system-ui, sans-serif', fontSize: '30px' })
      .setOrigin(0.5);
    const titleText = this.scene.add
      .text(10, -13, title, {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#ffffff',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: 72 },
      })
      .setOrigin(0.5);
    const subtitleText = this.scene.add
      .text(10, 20, subtitle, {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#f8fafc',
        align: 'center',
        wordWrap: { width: 72 },
      })
      .setOrigin(0.5);

    marker.add([body, iconText, titleText, subtitleText]);
    this.npcSprites.push(marker);
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

  private renderBuildingSprite(entity: MapEntity, px: number, py: number, spriteKey: string, scale = 1.0): void {
    if (!this.scene.textures.exists(spriteKey)) return;
    const img = this.scene.add.image(px, py, spriteKey);
    img.setScale(scale);
    img.setDepth(95);
    img.setAngle(entity.rotation);
    this.npcSprites.push(img);

    // collision
    if (this.obstaclesGroup) {
      const obs = this.scene.physics.add.staticImage(px, py, spriteKey);
      obs.setScale(scale * 0.9);
      obs.setVisible(false);
      obs.refreshBody();
      this.obstaclesGroup.add(obs);
    }
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
