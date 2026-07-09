import Phaser from 'phaser';
import { connectNetcode, type NetcodeClient, type NetcodeMessage } from '../systems/Netcode';
import { loadMap } from '../systems/MapSystem';
import {
  BACKPACK_TIERS,
  BOTTLE_TYPES,
  INVENTORY_SLOTS,
  type InventoryItem,
  type BottleType,
  type ServerBottle,
} from '../../../shared/economy';
import { MAP_WIDTH, MAP_HEIGHT, TILE_SIZE, TILE_SIZE_HALF, type MapDocument } from '../../../shared/map';
import { SoundEffects } from '../systems/SoundEffects';

// ============================================================
//  SECTION: WORLD CONSTANTS
// ============================================================
const MAP_PIXEL_W = MAP_WIDTH * TILE_SIZE;
const MAP_PIXEL_H = MAP_HEIGHT * TILE_SIZE;
const SEND_INTERVAL_MS = 50;
const SNAPSHOT_INTERP_DELAY_MS = 100;
const REMOTE_TINT = 0xffaacc;
const DEFAULT_SPAWN = { x: 400, y: 300 };

const BASE_WALK_SPEED = 130;
const BASE_SPRINT_SPEED = 200;

const PLAYER_SCALE = 0.42;
const PLAYER_BODY_SIZE = 24;
const PLAYER_BODY_OFFSET_X = 20;
const PLAYER_BODY_OFFSET_Y = 40;

const OBSTACLE_SCALE = 0.5;
const BOTTLE_PICKUP_RADIUS = 30;
const INTERACT_RADIUS = 90;
const PROMPT_OFFSET_Y = 60;

// ============================================================
//  SECTION: NETCODE TYPES
// ============================================================
type PeerSnapshot = { id: string; x: number; y: number };
type SnapshotEntry = {
  localT: number;
  players: Map<string, { x: number; y: number }>;
};

export class WorldScene extends Phaser.Scene {
  // ============================================================
  //  SECTION: INPUT
  // ============================================================
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyI!: Phaser.Input.Keyboard.Key;
  private keyTab!: Phaser.Input.Keyboard.Key;

  // ============================================================
  //  SECTION: PLAYER STATE
  // ============================================================
  private player!: Phaser.GameObjects.Sprite;
  private localMoney = 5.0;
  private localInventory: (InventoryItem | null)[] = Array(INVENTORY_SLOTS).fill(null);
  private currentWeight = 0.0;
  private backpackTier = 1;
  private equippedBag: 'bag-adidas' | 'backpack-tourist' | null = null;
  private hasJacket = false;
  private hasSneakers = false;
  private hasCrown = false;
  private stamina = 100.0;
  private isExhausted = false;
  private energyDrinkBuffTimer = 0.0;
  private shawarmaBuffTimer = 0.0;
  private footstepTimer = 0;

  // ============================================================
  //  SECTION: NETCODE
  // ============================================================
  private netcode?: NetcodeClient;
  private lastSentAt = 0;
  private myId: string | null = null;
  private remotePlayers = new Map<string, Phaser.GameObjects.Sprite>();
  private snapshotBuffer: SnapshotEntry[] = [];
  private simulatedLagMs = 0;

  // ============================================================
  //  SECTION: MAP & ENTITIES
  // ============================================================
  private mapJson: MapDocument | null = null;
  private groundTileSprite?: Phaser.GameObjects.TileSprite;
  private bottlesMap = new Map<string, Phaser.GameObjects.Image>();
  private kiosksSpritesMap = new Map<string, Phaser.GameObjects.GameObject>();
  private npcSpritesList: Phaser.GameObjects.GameObject[] = [];
  private staticTileImages: Phaser.GameObjects.Image[] = [];

  // ============================================================
  //  SECTION: PHYSICS
  // ============================================================
  private obstaclesGroup!: Phaser.Physics.Arcade.StaticGroup;
  private obstaclesCollider!: Phaser.Physics.Arcade.Collider;

  // ============================================================
  //  SECTION: UI
  // ============================================================
  private hudOverlayEl?: HTMLDivElement;
  private dashboardPanelEl?: HTMLDivElement;
  private isInventoryOpen = false;
  private nearKioskId: string | null = null;
  private nearFoodCartEntity: any = null;
  private nearClothingShopEntity: any = null;
  private usePrompt!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'World' });
  }

  create(): void {
    const kb = this.input.keyboard;
    if (!kb) {
      console.error('[MoneyRoll] клавиатура недоступна');
      return;
    }

    // ---------- Input ----------
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
    this.keyE = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyI = kb.addKey(Phaser.Input.Keyboard.KeyCodes.I);
    this.keyTab = kb.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);

    // ---------- Background ----------
    this.groundTileSprite = this.add.tileSprite(
      MAP_PIXEL_W / 2,
      MAP_PIXEL_H / 2,
      MAP_PIXEL_W,
      MAP_PIXEL_H,
      'tile-ground-grass'
    );
    this.groundTileSprite.setDepth(0);

    // ---------- Player sprite & animations ----------
    this.player = this.add.sprite(DEFAULT_SPAWN.x, DEFAULT_SPAWN.y, 'player-sprites', 0);
    this.player.setScale(PLAYER_SCALE);
    this.player.setDepth(500);

    this.createPlayerAnimations();

    // ---------- Player physics ----------
    this.physics.add.existing(this.player);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);
    body.setSize(PLAYER_BODY_SIZE, PLAYER_BODY_SIZE);
    body.setOffset(PLAYER_BODY_OFFSET_X, PLAYER_BODY_OFFSET_Y);

    // ---------- Obstacles physics ----------
    this.obstaclesGroup = this.physics.add.staticGroup();
    this.obstaclesCollider = this.physics.add.collider(this.player, this.obstaclesGroup);

    // ---------- Interaction prompt ----------
    this.usePrompt = this.add.text(0, 0, '  [ E ]  ', {
      fontFamily: 'Rubik, monospace',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#ffc72c',
      backgroundColor: '#10141cee',
      padding: { x: 12, y: 7 }
    });
    this.usePrompt.setStroke('#ffc72c', 2);
    this.usePrompt.setShadow(0, 4, '#000000', 12, true, true);
    this.usePrompt.setOrigin(0.5);
    this.usePrompt.setDepth(1000);
    this.usePrompt.setVisible(false);

    this.tweens.add({
      targets: this.usePrompt,
      scale: 1.15,
      yoyo: true,
      repeat: -1,
      duration: 600,
      ease: 'Sine.easeInOut'
    });

    // ---------- Camera ----------
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    this.cameras.main.setBackgroundColor('#07090d');
    this.cameras.main.setBounds(0, 0, MAP_PIXEL_W, MAP_PIXEL_H);

    // ---------- World bounds for physics ----------
    this.physics.world.setBounds(0, 0, MAP_PIXEL_W, MAP_PIXEL_H);

    // ---------- Netcode ----------
    this.netcode = connectNetcode((msg) => this.handleServerMessage(msg));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.netcode?.close();
      this.destroyHTMLOverlays();
    });

    kb.on('keydown-L', () => {
      this.cycleSimulatedLag();
    });

    // ---------- UI ----------
    this.createHTMLHUD();

    // ---------- Map data ----------
    void this.loadMapData();

    console.log('[MoneyRoll] World ready. I — инвентарь, E — автомат сдачи, L — пинг.');
  }

  // ============================================================
  //  SECTION: PLAYER ANIMATIONS
  // ============================================================
  private createPlayerAnimations(): void {
    if (this.anims.exists('walk-down')) return;

    const dirs = ['down', 'left', 'right', 'up'] as const;
    for (let i = 0; i < dirs.length; i++) {
      this.anims.create({
        key: `walk-${dirs[i]}`,
        frames: this.anims.generateFrameNumbers('player-sprites', { start: i * 4, end: i * 4 + 3 }),
        frameRate: 10,
        repeat: -1
      });
    }
  }

  // ============================================================
  //  SECTION: NETCODE SIMULATION
  // ============================================================
  private cycleSimulatedLag(): void {
    if (this.simulatedLagMs === 0) {
      this.simulatedLagMs = 150;
    } else if (this.simulatedLagMs === 150) {
      this.simulatedLagMs = 350;
    } else {
      this.simulatedLagMs = 0;
    }
    this.showFloatingText(
      `Неткод: симулируемый лаг = ${this.simulatedLagMs}мс`,
      this.player.x,
      this.player.y - 40,
      '#ff9900'
    );
  }

  // ============================================================
  //  SECTION: MAP LOADING
  // ============================================================
  private async loadMapData(): Promise<void> {
    try {
      this.mapJson = await loadMap();
      this.renderMapTiles();
      this.renderMapEntities();
    } catch (err) {
      console.warn('[MoneyRoll] failed to load map tiles:', err);
    }
  }

  // ============================================================
  //  SECTION: MAP TILE RENDERING
  // ============================================================
  private renderMapTiles(): void {
    if (!this.mapJson) return;

    // Cleanup old tiles
    for (const img of this.staticTileImages) {
      img.destroy();
    }
    this.staticTileImages = [];

    // Draw non-grass tiles over the background
    for (const [key, type] of Object.entries(this.mapJson.tiles)) {
      const pos = this.parseCellKey(key);
      if (!pos) continue;
      if (type === 'ground-grass') continue;

      const rotation = this.mapJson.rotations?.[key] ?? 0;
      const px = pos.x * TILE_SIZE + TILE_SIZE_HALF;
      const py = pos.y * TILE_SIZE + TILE_SIZE_HALF;
      const img = this.add.image(px, py, `tile-${type}`);
      img.setDepth(1);
      img.setAngle(rotation);
      this.staticTileImages.push(img);
    }
  }

  private parseCellKey(key: string): { x: number; y: number } | null {
    const parts = key.split(',');
    if (parts.length !== 2) return null;
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
    return { x, y };
  }

  // ============================================================
  //  SECTION: MAP ENTITY RENDERING
  // ============================================================
  private renderMapEntities(): void {
    if (!this.mapJson) return;
    if (!this.mapJson.entities) this.mapJson.entities = {};

    // Cleanup old sprites
    for (const k of this.kiosksSpritesMap.values()) {
      k.destroy();
    }
    this.kiosksSpritesMap.clear();

    for (const sprite of this.npcSpritesList) {
      sprite.destroy();
    }
    this.npcSpritesList = [];

    // Recreate the obstacle physics group
    if (this.obstaclesCollider) {
      this.obstaclesCollider.destroy();
    }
    if (this.obstaclesGroup) {
      this.obstaclesGroup.destroy(true);
    }
    this.obstaclesGroup = this.physics.add.staticGroup();
    this.obstaclesCollider = this.physics.add.collider(this.player, this.obstaclesGroup);

    for (const entity of Object.values(this.mapJson.entities)) {
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

  private renderKiosk(entity: any, px: number, py: number): void {
    const sprite = this.add.image(px, py, 'recycle-machine');
    sprite.setScale(0.58);
    sprite.setDepth(100);
    sprite.setAngle(entity.rotation);

    const glow = this.add.graphics();
    glow.fillStyle(0x00ff66, 0.08);
    glow.fillCircle(px, py, 70);
    glow.setDepth(10);

    this.kiosksSpritesMap.set(entity.id, sprite);
  }

  private renderFoodCart(entity: any, px: number, py: number): void {
    const sprite = this.add.image(px, py, 'food-cart');
    sprite.setScale(OBSTACLE_SCALE);
    sprite.setDepth(100);
    sprite.setAngle(entity.rotation);
    this.kiosksSpritesMap.set(entity.id, sprite);
  }

  private renderClothingShop(entity: any, px: number, py: number): void {
    const sprite = this.add.image(px, py, 'clothing-shop');
    sprite.setScale(OBSTACLE_SCALE);
    sprite.setDepth(100);
    sprite.setAngle(entity.rotation);
    this.kiosksSpritesMap.set(entity.id, sprite);
  }

  // ============================================================
  //  SECTION: OBSTACLE COLLISION FIX
  // ============================================================
  private renderObstacle(entity: any, px: number, py: number): void {
    const spriteKey = this.textures.exists(entity.type) ? entity.type : 'apartment-1';
    const obstacle = this.physics.add.staticImage(px, py, spriteKey);
    obstacle.setScale(OBSTACLE_SCALE);
    obstacle.setAngle(entity.rotation);
    obstacle.setDepth(90);

    const body = obstacle.body as Phaser.Physics.Arcade.StaticBody;
    // Static bodies in Phaser do not account for the game object's origin automatically.
    // displayWidth/height already include the scale, so the body exactly matches the sprite.
    body.setSize(obstacle.displayWidth, obstacle.displayHeight);
    body.setOffset(0, 0);
    obstacle.refreshBody();

    this.obstaclesGroup.add(obstacle);
  }

  private renderNpc(entity: any, px: number, py: number): void {
    const container = this.add.container(px, py);
    container.setDepth(101);

    const body = this.add.rectangle(0, 0, 24, 24, 0x00ccff);
    body.setStrokeStyle(1, 0xffffff);

    const label = this.add.text(0, -20, entity.properties.label || 'NPC', {
      fontFamily: 'monospace',
      fontSize: '9px',
      color: '#00ccff',
      backgroundColor: '#000000aa',
      padding: { x: 3, y: 1 }
    }).setOrigin(0.5);

    container.add([body, label]);
    this.npcSpritesList.push(container);
  }

  // ============================================================
  //  SECTION: NETCODE MESSAGE HANDLERS
  // ============================================================

  private handleServerMessage(msg: NetcodeMessage): void {
    if (this.simulatedLagMs > 0) {
      setTimeout(() => this.processServerMessage(msg), this.simulatedLagMs);
    } else {
      this.processServerMessage(msg);
    }
  }

  private processServerMessage(msg: NetcodeMessage): void {
    switch (msg.type) {
      case 'welcome': {
        if (typeof msg.id === 'string') {
          this.myId = msg.id;
          console.log('[MoneyRoll] welcome: my id =', msg.id);
          this.snapshotBuffer = [];
          
          this.localMoney = msg.money as number;
          this.localInventory = msg.inventory as (BottleType | null)[];
          this.backpackTier = (msg.backpackTier as number) || 1;
          this.updateHUDUI();
          this.updateDashboard();

          if (Array.isArray(msg.players)) {
            const initial = new Map<string, { x: number; y: number }>();
            for (const p of msg.players) {
              if (this.isPeerSnapshot(p)) {
                initial.set(p.id, { x: p.x, y: p.y });
                if (p.id !== this.myId) this.ensureRemote(p.id, p.x, p.y);
              }
            }
            this.snapshotBuffer.push({ localT: performance.now(), players: initial });
          }

          if (Array.isArray(msg.bottles)) {
            for (const b of msg.bottles) {
              this.spawnBottleClient(b as ServerBottle);
            }
          }
        }
        break;
      }

      case 'map-reload': {
        void this.loadMapData();
        for (const img of this.bottlesMap.values()) {
          img.destroy();
        }
        this.bottlesMap.clear();

        if (Array.isArray(msg.bottles)) {
          for (const b of msg.bottles) {
            this.spawnBottleClient(b as ServerBottle);
          }
        }
        break;
      }

      case 'peer-join': {
        if (typeof msg.id === 'string' && msg.id !== this.myId) {
          this.ensureRemote(msg.id, DEFAULT_SPAWN.x, DEFAULT_SPAWN.y);
        }
        break;
      }

      case 'peer': {
        if (
          typeof msg.id === 'string' &&
          msg.id !== this.myId &&
          typeof msg.x === 'number' &&
          typeof msg.y === 'number'
        ) {
          this.ensureRemote(msg.id, msg.x, msg.y);
        }
        break;
      }

      case 'snapshot': {
        if (Array.isArray(msg.players)) {
          const players = new Map<string, { x: number; y: number }>();
          for (const p of msg.players) {
            if (typeof p.id === 'string' && this.isPeerSnapshot(p) && p.id !== this.myId) {
              players.set(p.id, { x: p.x, y: p.y });
            }
          }
          this.snapshotBuffer.push({ localT: performance.now(), players });
          while (this.snapshotBuffer.length > 30) {
            this.snapshotBuffer.shift();
          }
        }
        break;
      }

      case 'leave': {
        if (typeof msg.id === 'string') {
          this.removeRemote(msg.id);
        }
        break;
      }

      case 'bottle-spawn': {
        const b = msg.bottle as ServerBottle;
        if (b) this.spawnBottleClient(b);
        break;
      }

      case 'bottle-picked-up': {
        const bottleId = msg.bottleId as string;
        const pickerId = msg.pickerId as string;
        if (pickerId !== this.myId) {
          this.removeBottleClient(bottleId);
          const p = this.remotePlayers.get(pickerId);
          if (p) {
            this.showFloatingText('Подобрал!', p.x, p.y - 25, '#ff3333');
          }
        }
        break;
      }

      case 'pickup-success': {
        const bottleId = msg.bottleId as string;
        const inv = msg.inventory as (BottleType | null)[];
        const weight = msg.weight as number;
        const text = msg.message as string;

        this.localInventory = inv;
        this.currentWeight = weight;
        
        this.removeBottleClient(bottleId);
        this.updateHUDUI();
        this.updateDashboard();

        // Воспроизводим ретро-звук подбора бутылки!
        SoundEffects.playPopSound();

        this.showFloatingText(text, this.player.x, this.player.y - 20, '#7cfc00');
        break;
      }

      case 'pickup-failed': {
        const bottleId = msg.bottleId as string;
        const reason = msg.reason as string;
        const text = msg.message as string;

        if (reason === 'already-taken') {
          this.removeBottleClient(bottleId);
          this.showFloatingText('ОПЕРЕДИЛИ!', this.player.x, this.player.y - 20, '#ff3333');
        } else {
          const img = this.bottlesMap.get(bottleId);
          if (img) img.setVisible(true);
          this.showFloatingText(text, this.player.x, this.player.y - 20, '#ff9900');
        }
        break;
      }

      case 'sell-success': {
        const money = msg.money as number;
        const inv = msg.inventory as (BottleType | null)[];
        const weight = msg.weight as number;
        const text = msg.message as string;

        this.localMoney = money;
        this.localInventory = inv;
        this.currentWeight = weight;

        this.updateHUDUI();
        this.updateDashboard();
        
        // Звук получения монет!
        SoundEffects.playCoinSound();

        this.showFloatingText(text, this.player.x, this.player.y - 20, '#ffd700');
        this.cameras.main.shake(150, 0.005);
        break;
      }

      case 'sell-failed': {
        const text = msg.message as string;
        this.showFloatingText(text, this.player.x, this.player.y - 20, '#ff3333');
        break;
      }

      case 'upgrade-success': {
        const tier = msg.backpackTier as number;
        const money = msg.money as number;
        const text = msg.message as string;

        this.backpackTier = tier;
        this.localMoney = money;

        this.updateHUDUI();
        this.updateDashboard();

        // Воспроизводим ретро-звук апгрейда сумки!
        SoundEffects.playUpgradeSound();

        this.showFloatingText(text, this.player.x, this.player.y - 30, '#ffd700');
        this.cameras.main.shake(200, 0.008);
        break;
      }

      case 'upgrade-failed': {
        const text = msg.message as string;
        this.showFloatingText(text, this.player.x, this.player.y - 20, '#ff3333');
        break;
      }

      case 'buy-food-success': {
        const item = msg.itemType as string;
        const money = msg.money as number;
        const text = msg.message as string;

        this.localMoney = money;
        this.updateHUDUI();

        if (item === 'shawarma') {
          this.stamina = 100.0;
          this.isExhausted = false;
          this.shawarmaBuffTimer = 20.0;
          // Звук поедания шаурмы!
          SoundEffects.playEatSound();
        } else if (item === 'energy') {
          this.energyDrinkBuffTimer = 30.0;
          // Звук выпивания энергетика!
          SoundEffects.playDrinkSound();
        }

        this.showFloatingText(text, this.player.x, this.player.y - 30, '#7cfc00');
        break;
      }

      case 'buy-food-failed': {
        const text = msg.message as string;
        this.showFloatingText(text, this.player.x, this.player.y - 20, '#ff3333');
        break;
      }

      default:
        console.log('[MoneyRoll] ws ←', msg);
    }
  }

  // ============================================================
  //  SECTION: MOVEMENT & INTERACTION
  // ============================================================

  update(_time: number, delta: number): void {
    const now = performance.now();
    const dt = Math.min(delta, 100) / 1000;

    if (this.energyDrinkBuffTimer > 0) this.energyDrinkBuffTimer -= dt;
    if (this.shawarmaBuffTimer > 0) this.shawarmaBuffTimer -= dt;

    let vx = 0;
    let vy = 0;
    if (this.cursors.left?.isDown || this.wasd.A?.isDown) vx -= 1;
    if (this.cursors.right?.isDown || this.wasd.D?.isDown) vx += 1;
    if (this.cursors.up?.isDown || this.wasd.W?.isDown) vy -= 1;
    if (this.cursors.down?.isDown || this.wasd.S?.isDown) vy += 1;

    if (vx !== 0 && vy !== 0) {
      const inv = 1 / Math.hypot(vx, vy);
      vx *= inv;
      vy *= inv;
    }

    const isSprinting = this.input.keyboard!.addKey('SHIFT').isDown && (vx !== 0 || vy !== 0) && !this.isExhausted;
    
    // Рассчитываем скорость игрока с учетом кроссовок (+25% к бегу!) и баффов
    let moveSpeedLimit = this.hasSneakers ? BASE_WALK_SPEED + 40 : BASE_WALK_SPEED;
    let sprintSpeedLimit = this.hasSneakers ? BASE_SPRINT_SPEED + 70 : BASE_SPRINT_SPEED;

    let currentSpeed = moveSpeedLimit;
    if (this.energyDrinkBuffTimer > 0) {
      currentSpeed = sprintSpeedLimit + 100; // Ягуар дает безумный бафф
    } else if (isSprinting) {
      currentSpeed = sprintSpeedLimit;
    }

    // Логика выносливости (Куртка Adidas дает +50% регенерации выносливости!)
    if (isSprinting && this.shawarmaBuffTimer <= 0) {
      const maxLimit = (BACKPACK_TIERS[this.backpackTier] ?? BACKPACK_TIERS[1]).maxWeight;
      const drainRate = 18 * (1 + this.currentWeight / maxLimit);
      this.stamina = Math.max(0, this.stamina - drainRate * dt);
      if (this.stamina === 0) {
        this.isExhausted = true;
        this.showFloatingText('УСТАЛ! Передохни!', this.player.x, this.player.y - 20, '#ff3333');
      }
    } else {
      const regenRate = this.hasJacket ? 18.0 : 12.0; // С курткой регенерируем в 1.5 раза быстрее!
      this.stamina = Math.min(100, this.stamina + regenRate * dt);
      if (this.isExhausted && this.stamina >= 20) {
        this.isExhausted = false;
      }
    }

    // Движение
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(vx * currentSpeed, vy * currentSpeed);

    // Воспроизводим ретро-звуки шагов игрока при беге/ходьбе!
    if (vx !== 0 || vy !== 0) {
      this.footstepTimer += delta;
      const stepInterval = isSprinting ? 220 : 350;
      if (this.footstepTimer > stepInterval) {
        this.footstepTimer = 0;
        SoundEffects.playWalkSound();
      }
    }

    if (vx < 0) {
      this.player.play('walk-left', true);
    } else if (vx > 0) {
      this.player.play('walk-right', true);
    } else if (vy < 0) {
      this.player.play('walk-up', true);
    } else if (vy > 0) {
      this.player.play('walk-down', true);
    } else {
      this.player.stop();
      this.player.setFrame(0);
    }

    if ((vx !== 0 || vy !== 0) && this.netcode) {
      this.sendMoveThrottled();
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyI) || Phaser.Input.Keyboard.JustDown(this.keyTab)) {
      this.toggleInventory();
    }

    this.updateHUDUI();

    // Bottle pickup
    for (const [id, img] of this.bottlesMap.entries()) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, img.x, img.y);
      if (dist < BOTTLE_PICKUP_RADIUS && img.visible) {
        img.setVisible(false);
        this.sendGameMessage({ type: 'pickup-bottle', bottleId: id });
      }
    }

    // Interaction detection
    let activeKioskId: string | null = null;
    let activeFoodCartEntity: any = null;
    let activeClothingShopEntity: any = null;
    let targetX = 0;
    let targetY = 0;

    if (this.mapJson && this.mapJson.entities) {
      for (const entity of Object.values(this.mapJson.entities)) {
        const kx = entity.cellX * TILE_SIZE + TILE_SIZE_HALF;
        const ky = entity.cellY * TILE_SIZE + TILE_SIZE_HALF;
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, kx, ky);

        if (dist < INTERACT_RADIUS) {
          if (entity.type === 'kiosk') {
            activeKioskId = entity.id;
          } else if (entity.type === 'food-cart') {
            activeFoodCartEntity = entity;
          } else if (entity.type === 'clothing-shop') {
            activeClothingShopEntity = entity;
          }
          targetX = kx;
          targetY = ky;
          break;
        }
      }
    }

    this.nearKioskId = activeKioskId;
    this.nearFoodCartEntity = activeFoodCartEntity;
    this.nearClothingShopEntity = activeClothingShopEntity;

    // Show/hide interaction prompt
    if (this.nearKioskId || this.nearFoodCartEntity || this.nearClothingShopEntity) {
      this.usePrompt.setPosition(targetX, targetY - PROMPT_OFFSET_Y);
      this.usePrompt.setVisible(true);

      if (Phaser.Input.Keyboard.JustDown(this.keyE)) {
        this.toggleInventory(true); // Открывает Dashboard с магазинами или автоматом!
      }
    } else {
      this.usePrompt.setVisible(false);
      // Inventory stays open even when walking away from shops
    }

    this.renderRemoteInterpolated(now);
  }

  private sendMoveThrottled(): void {
    const now = performance.now();
    if (now - this.lastSentAt < SEND_INTERVAL_MS) return;
    this.lastSentAt = now;
    this.sendGameMessage({ type: 'move', x: this.player.x, y: this.player.y });
  }

  private sendGameMessage(msg: { type: string; [key: string]: unknown }): void {
    if (!this.netcode) return;
    if (this.simulatedLagMs > 0) {
      setTimeout(() => {
        this.netcode?.send(msg);
      }, this.simulatedLagMs);
    } else {
      this.netcode.send(msg);
    }
  }

  // ============================================================
  //  SECTION: HTML UI OVERLAYS
  // ============================================================



  private createHTMLHUD(): void {
    this.removeHTMLHUD();

    const hud = document.createElement('div');
    hud.id = 'game-hud-overlay';
    document.body.appendChild(hud);
    this.hudOverlayEl = hud;

    // 1. Balance panel (top-right)
    const moneyPanel = document.createElement('div');
    moneyPanel.id = 'hud-money-panel';
    moneyPanel.innerHTML = `<img src="/assets/icons/coin.webp" alt="" style="width:30px;height:30px;filter:drop-shadow(0 0 8px rgba(255,199,44,0.6));" /> $<span id="hud-money-val">5.00</span>`;
    hud.appendChild(moneyPanel);

    // 2. Weight & stamina panel (bottom-left)
    const statsPanel = document.createElement('div');
    statsPanel.id = 'hud-stats-panel';
    statsPanel.innerHTML = `
      <div id="hud-weight" style="display:flex;align-items:center;gap:6px;">🎒 Пакет (0.0 / 8.0 кг)</div>
      <div class="hud-bar">
        <div id="hud-weight-bar" class="hud-bar-fill" style="width:0%; background:#3ae06f; color:#3ae06f;"></div>
      </div>
      <div style="font-size:11px; color:#8b93a3; margin-bottom:2px; font-weight:600; letter-spacing:1px; text-transform:uppercase;">⚡ Энергия <span style="opacity:0.6;">(Shift — спринт)</span></div>
      <div class="hud-bar" style="margin-bottom:2px;">
        <div id="hud-stamina-bar" class="hud-bar-fill" style="width:100%; background:#ffc72c; color:#ffc72c;"></div>
      </div>
    `;
    hud.appendChild(statsPanel);

    // 3. Backpack toggle button (bottom-right)
    const btnBackpack = document.createElement('button');
    btnBackpack.id = 'btn-toggle-backpack';
    btnBackpack.innerHTML = '🎒';
    btnBackpack.addEventListener('click', () => this.toggleInventory());
    hud.appendChild(btnBackpack);
  }

  private toggleInventory(force?: boolean): void {
    this.isInventoryOpen = force !== undefined ? force : !this.isInventoryOpen;
    this.updateDashboard();
  }

  /**
   * ЕДИНЫЙ ДАШБОРД (Dashboard):
   * Объединяет окно действия (если рядом магазин) и инвентарь.
   * Инвентарь теперь можно открыть в любой точке мира.
   */
  private updateDashboard(): void {
    this.removeDashboardPanel();

    if (!this.isInventoryOpen) return;

    const dashboard = document.createElement('div');
    dashboard.id = 'game-dashboard-container';
    document.body.appendChild(dashboard);
    this.dashboardPanelEl = dashboard;

    // Left action panel (only when near a shop/kiosk)
    if (this.nearKioskId) {
      dashboard.appendChild(this.createKioskPanel());
    } else if (this.nearFoodCartEntity) {
      dashboard.appendChild(this.createFoodPanel());
    } else if (this.nearClothingShopEntity) {
      dashboard.appendChild(this.createClothingPanel());
    }

    // Right inventory panel
    const inventoryPanel = this.createInventoryPanel();
    dashboard.appendChild(inventoryPanel);

    const equipSlot = inventoryPanel.querySelector('#equip-bag-slot') as HTMLDivElement;
    equipSlot.addEventListener('click', () => this.unequipBag());

    this.updateInventoryUI();
  }

  private createKioskPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'dashboard-panel kiosk';
    panel.innerHTML = `
      <h3>🏪 АВТОМАТ СДАЧИ</h3>
      <p style="font-size:13px; color:#8b93a3; line-height:1.55; margin:0 0 16px; text-align:center;">
        Сдавай стеклотару. Кликни по бутылке в инвентаре справа для поштучной сдачи или сдай всё сразу:
      </p>
      <button id="btn-recycle-all" class="dash-btn dash-btn-primary">♻️ СДАТЬ ВСЕ БУТЫЛКИ</button>
      <button id="btn-close-dashboard" class="dash-btn dash-btn-danger">Закрыть</button>
    `;
    panel.querySelector('#btn-recycle-all')?.addEventListener('click', () => {
      this.sendGameMessage({ type: 'sell-all-bottles' });
    });
    panel.querySelector('#btn-close-dashboard')?.addEventListener('click', () => {
      this.toggleInventory(false);
    });
    return panel;
  }

  private createFoodPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'dashboard-panel food';
    panel.innerHTML = `
      <h3>🌯 ЛАРЁК У АШОТА</h3>
      <div class="dash-category">🍕 ПИТАНИЕ (в инвентарь)</div>
      <button id="btn-buy-shawa" class="dash-btn dash-btn-buy">
        <span>🌯 Сытная Шаурма</span>
        <span>$1.50</span>
      </button>
      <button id="btn-buy-energy" class="dash-btn dash-btn-buy">
        <span>⚡ Энергетик "Ягуар"</span>
        <span>$3.00</span>
      </button>
      <p style="font-size:11px; color:#8b93a3; line-height:1.5; margin:10px 0; text-align:center;">
        Купленная еда падает в инвентарь. Кликни на неё, чтобы съесть/выпить.
      </p>
      <button id="btn-close-dashboard" class="dash-btn dash-btn-danger">Закрыть</button>
    `;
    panel.querySelector('#btn-buy-shawa')?.addEventListener('click', () => {
      this.buyItemToInventory('shawarma', 1.50);
    });
    panel.querySelector('#btn-buy-energy')?.addEventListener('click', () => {
      this.buyItemToInventory('energy', 3.00);
    });
    panel.querySelector('#btn-close-dashboard')?.addEventListener('click', () => {
      this.toggleInventory(false);
    });
    return panel;
  }

  private createClothingPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'dashboard-panel clothing';
    panel.innerHTML = `
      <h3>👕 МАГАЗИН ОДЕЖДЫ</h3>
      <div class="dash-category">👜 СУМКИ</div>
      <button id="btn-buy-bag-adidas" class="dash-btn dash-btn-buy">
        <span>👜 Сумка Adidas (15кг)</span>
        <span>$15.00</span>
      </button>
      <button id="btn-buy-backpack-tourist" class="dash-btn dash-btn-buy">
        <span>🎒 Рюкзак туриста (30кг)</span>
        <span>$45.00</span>
      </button>
      <div class="dash-category" style="margin-top:12px;">👕 ЭКИПИРОВКА</div>
      <button id="btn-buy-jacket" class="dash-btn dash-btn-buy">
        <span>👕 Свитшот Adidas (+реген)</span>
        <span>$10.00</span>
      </button>
      <button id="btn-buy-sneakers" class="dash-btn dash-btn-buy">
        <span>👟 Кроссовки Nike (+скорость)</span>
        <span>$20.00</span>
      </button>
      <button id="btn-buy-crown" class="dash-btn dash-btn-buy">
        <span>👑 Королевская Корона</span>
        <span>$100.00</span>
      </button>
      <button id="btn-close-dashboard" class="dash-btn dash-btn-danger" style="margin-top:10px;">Закрыть</button>
    `;
    panel.querySelector('#btn-buy-bag-adidas')?.addEventListener('click', () => {
      this.buyItemToInventory('bag-adidas', 15.00);
    });
    panel.querySelector('#btn-buy-backpack-tourist')?.addEventListener('click', () => {
      this.buyItemToInventory('backpack-tourist', 45.00);
    });
    panel.querySelector('#btn-buy-jacket')?.addEventListener('click', () => {
      this.buyClothingItem('jacket', 10.00);
    });
    panel.querySelector('#btn-buy-sneakers')?.addEventListener('click', () => {
      this.buyClothingItem('sneakers', 20.00);
    });
    panel.querySelector('#btn-buy-crown')?.addEventListener('click', () => {
      this.buyClothingItem('crown', 100.00);
    });
    panel.querySelector('#btn-close-dashboard')?.addEventListener('click', () => {
      this.toggleInventory(false);
    });
    return panel;
  }

  private createInventoryPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.id = 'dashboard-inventory-panel';
    panel.className = 'dashboard-panel';
    panel.innerHTML = `
      <div class="inventory-header">
        <span class="inventory-title">🎒 МОЙ РЮКЗАК</span>
        <button id="btn-close-dashboard-x" class="dash-btn-close" title="Закрыть (I)">✕</button>
      </div>
      <div class="bag-slot-row">
        <div id="equip-bag-slot" class="bag-slot empty">
          <!-- equipped bag icon goes here -->
        </div>
        <div style="font-size:12px; line-height:1.45;">
          <strong style="color:#3ae06f; display:block; letter-spacing:1px; font-size:11px; text-transform:uppercase;">Слот для сумки</strong>
          <span id="equip-bag-desc" style="color:#8b93a3;">Без сумки (доступно только 4 кармана)</span>
        </div>
      </div>
      <div id="inventory-grid">
        <!-- slots go here -->
      </div>
      <div class="dashboard-footer">
        <span id="inv-guide-text">Сдача бутылок кликом в автомате</span>
        <span id="inv-weight-status">Вес: 0.0 / ${BACKPACK_TIERS[1].maxWeight} кг</span>
      </div>
    `;
    panel.querySelector('#btn-close-dashboard-x')?.addEventListener('click', () => {
      this.toggleInventory(false);
    });
    return panel;
  }

  /** Покупка расходников или сумок в инвентарь */
  private buyItemToInventory(itemKey: string, cost: number): void {
    if (this.localMoney < cost) {
      this.showFloatingText('Недостаточно денег!', this.player.x, this.player.y - 30, '#ff3333');
      return;
    }

    // Find a free slot respecting the current backpack tier
    const activeSlotsCount = this.getActiveSlotsCount();
    let freeSlotIdx = -1;
    for (let i = 0; i < activeSlotsCount; i++) {
      if (this.localInventory[i] === null) {
        freeSlotIdx = i;
        break;
      }
    }

    if (freeSlotIdx === -1) {
      this.showFloatingText('Инвентарь полон! Освободи слоты.', this.player.x, this.player.y - 30, '#ff3333');
      return;
    }

    this.localMoney -= cost;
    this.localInventory[freeSlotIdx] = itemKey as any; // Ложим вещь в слот как специальный предмет!
    
    // Звук монетки!
    SoundEffects.playCoinSound();

    this.updateHUDUI();
    this.updateDashboard();
    this.showFloatingText(`Куплено: ${itemKey === 'shawarma' ? 'Шаурма' : itemKey === 'energy' ? 'Ягуар' : 'Сумка'}!`, this.player.x, this.player.y - 30, '#7cfc00');
  }

  /** Покупка одежды в магазине одежды (одевается сразу!) */
  private buyClothingItem(type: 'jacket' | 'sneakers' | 'crown', cost: number): void {
    if (this.localMoney < cost) {
      this.showFloatingText('Недостаточно денег!', this.player.x, this.player.y - 30, '#ff3333');
      return;
    }

    if (type === 'jacket' && this.hasJacket) return;
    if (type === 'sneakers' && this.hasSneakers) return;
    if (type === 'crown' && this.hasCrown) return;

    this.localMoney -= cost;
    
    if (type === 'jacket') {
      this.hasJacket = true;
      this.showFloatingText('Одета Куртка Adidas! Энергия копится на 50% быстрее!', this.player.x, this.player.y - 30, '#7cfc00');
    } else if (type === 'sneakers') {
      this.hasSneakers = true;
      this.showFloatingText('Одеты Кроссовки Nike! Твоя скорость выросла на 30%!', this.player.x, this.player.y - 30, '#7cfc00');
    } else if (type === 'crown') {
      this.hasCrown = true;
      this.player.setTint(0xffd700); // Окрашиваем персонажа золотом!
      this.showFloatingText('Ты надел Золотую Корону! Король улиц!', this.player.x, this.player.y - 30, '#ffd700');
    }

    SoundEffects.playUpgradeSound();

    this.updateHUDUI();
    this.updateDashboard();
  }

  /** Экипировать сумку из инвентаря рюкзака */
  private equipBagFromInventory(slotIdx: number, itemType: 'bag-adidas' | 'backpack-tourist'): void {
    if (this.equippedBag) {
      this.showFloatingText('Сначала сними старую сумку!', this.player.x, this.player.y - 30, '#ff9900');
      return;
    }

    this.localInventory[slotIdx] = null;
    this.equippedBag = itemType;
    this.backpackTier = itemType === 'bag-adidas' ? 2 : 3;

    // Шлем на сервер информацию об апгрейде тира рюкзака!
    this.sendGameMessage({ type: 'upgrade-backpack', tier: this.backpackTier });

    SoundEffects.playUpgradeSound();
    this.updateHUDUI();
    this.updateDashboard();

    this.showFloatingText(`Экипировано: ${itemType === 'bag-adidas' ? 'Сумка Adidas (15кг)' : 'Рюкзак туриста (30кг)'}!`, this.player.x, this.player.y - 30, '#7cfc00');
  }

  /** Снять сумку */
  private unequipBag(): void {
    if (!this.equippedBag) return;

    // Проверяем, есть ли свободный слот в инвентаре для снятой сумки (среди первых 4 слотов, которые останутся!)
    let freeSlotIdx = -1;
    for (let i = 0; i < 4; i++) {
      if (this.localInventory[i] === null) {
        freeSlotIdx = i;
        break;
      }
    }

    if (freeSlotIdx === -1) {
      this.showFloatingText('Освободи карманы (первые 4 слота), чтобы снять сумку!', this.player.x, this.player.y - 30, '#ff3333');
      return;
    }

    // Check whether inventory fits into the base pocket limit after unequipping
    if (this.currentWeight > BACKPACK_TIERS[1].maxWeight) {
      this.showFloatingText('Разгрузи рюкзак до 2.5кг, чтобы снять сумку!', this.player.x, this.player.y - 30, '#ff3333');
      return;
    }

    const removedBag = this.equippedBag;
    this.equippedBag = null;
    this.backpackTier = 1;
    this.localInventory[freeSlotIdx] = removedBag as any;

    this.sendGameMessage({ type: 'upgrade-backpack', tier: 1 });

    SoundEffects.playUpgradeSound();
    this.updateHUDUI();
    this.updateDashboard();

    this.showFloatingText('Сумка снята и убрана в карман!', this.player.x, this.player.y - 30, '#ff9900');
  }

  /** Использование еды прямо из слота инвентаря */
  private useFoodFromInventory(slotIdx: number, itemType: 'shawarma' | 'energy'): void {
    this.localInventory[slotIdx] = null;

    if (itemType === 'shawarma') {
      this.stamina = 100.0;
      this.isExhausted = false;
      this.shawarmaBuffTimer = 20.0; // 20 сек бесконечного спринта!
      SoundEffects.playEatSound();
      this.showFloatingText('Ты съел сытную шаурму! Выносливость восстановлена на 100%!', this.player.x, this.player.y - 30, '#ffd700');
    } else if (itemType === 'energy') {
      this.energyDrinkBuffTimer = 30.0; // 30 сек бешеного бега!
      SoundEffects.playDrinkSound();
      this.showFloatingText('Выпит Ягуар! Ты получил заряд бешеной скорости!', this.player.x, this.player.y - 30, '#ffd700');
    }

    this.updateHUDUI();
    this.updateDashboard();
  }

  private updateHUDUI(): void {
    if (!this.hudOverlayEl) return;

    const tierInfo = BACKPACK_TIERS[this.backpackTier] ?? BACKPACK_TIERS[1];
    const maxLimit = tierInfo.maxWeight;
    const bagName = tierInfo.name;

    const moneyVal = this.hudOverlayEl.querySelector('#hud-money-val');
    if (moneyVal) moneyVal.textContent = this.localMoney.toFixed(2);

    const weightEl = this.hudOverlayEl.querySelector('#hud-weight');
    if (weightEl) weightEl.innerHTML = `🎒 ${bagName} (${this.currentWeight.toFixed(1)} / ${maxLimit} кг)`;

    const weightBar = this.hudOverlayEl.querySelector('#hud-weight-bar') as HTMLDivElement;
    if (weightBar) {
      const pct = Math.min((this.currentWeight / maxLimit) * 100, 100);
      const color = pct > 85 ? '#ff5252' : pct > 60 ? '#ffc72c' : '#3ae06f';
      weightBar.style.width = `${pct}%`;
      weightBar.style.background = color;
      weightBar.style.color = color; // glow via currentColor
    }

    const staminaBar = this.hudOverlayEl.querySelector('#hud-stamina-bar') as HTMLDivElement;
    if (staminaBar) {
      const pct = Math.min(this.stamina, 100);
      const color = this.energyDrinkBuffTimer > 0
        ? '#35c8ff'
        : this.shawarmaBuffTimer > 0
        ? '#ff9f43'
        : this.isExhausted
        ? '#ff5252'
        : '#ffc72c';
      staminaBar.style.width = `${pct}%`;
      staminaBar.style.background = color;
      staminaBar.style.color = color; // glow via currentColor
    }

    const playersEl = this.hudOverlayEl.querySelector('#hud-players');
    if (playersEl) playersEl.textContent = `${this.remotePlayers.size + 1}`;
  }

  private updateInventoryUI(): void {
    if (!this.dashboardPanelEl) return;

    const grid = this.dashboardPanelEl.querySelector('#inventory-grid');
    if (!grid) return;

    grid.innerHTML = '';

    // Update equipped bag slot
    const equipSlot = this.dashboardPanelEl.querySelector('#equip-bag-slot') as HTMLDivElement;
    const equipDesc = this.dashboardPanelEl.querySelector('#equip-bag-desc') as HTMLSpanElement;

    equipSlot.className = 'bag-slot';
    if (this.equippedBag) {
      const bagPath = `/assets/props/flat/bags/${this.equippedBag}.webp`;
      equipSlot.classList.add('equipped');
      equipSlot.innerHTML = `<img src="${bagPath}" />`;
      equipDesc.innerHTML = `<strong style="color:#3ae06f;">${this.equippedBag === 'bag-adidas' ? 'Сумка Adidas (15кг)' : 'Рюкзак туриста (30кг)'}</strong><br/><span style="color:#8b93a3; font-size:11px;">Кликни, чтобы снять в карман</span>`;
    } else {
      equipSlot.classList.add('empty');
      equipSlot.innerHTML = `<span style="font-size:20px; color:#4a5261;">＋</span>`;
      equipDesc.innerHTML = `<strong style="color:#ff5252;">Без сумки</strong><br/><span style="color:#8b93a3; font-size:11px;">Доступно только 4 кармана</span>`;
    }

    // Render inventory slots
    const activeSlotsCount = this.getActiveSlotsCount();

    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const item = this.localInventory[i];
      const slot = document.createElement('div');
      slot.className = 'inv-slot';

      if (i >= activeSlotsCount) {
        slot.classList.add('locked');
        slot.innerHTML = `<span style="font-size:18px; opacity:0.35;">🔒</span>`;
        grid.appendChild(slot);
        continue;
      }

      if (item) {
        slot.classList.add('has-item');

        let webpPath = `/assets/props/flat/bottles/${item}.webp`;
        let label = '';

        if (item === 'bag-adidas' || item === 'backpack-tourist') {
          webpPath = `/assets/props/flat/bags/${item}.webp`;
          label = '<span class="inv-slot-label" style="color:#ffc72c; border-color:rgba(255,199,44,0.4);">СУМКА</span>';
        } else if (item === 'shawarma' || item === 'energy') {
          webpPath = `/assets/props/flat/food/${item}.webp`;
          label = '<span class="inv-slot-label" style="color:#ff9f43; border-color:rgba(255,159,67,0.4);">ЕДА</span>';
        } else {
          const weight = BOTTLE_TYPES[item as BottleType]?.weight ?? 1.0;
          label = `<span class="inv-slot-label">${weight}кг</span>`;
        }

        slot.innerHTML = `<img src="${webpPath}" />${label}`;

        slot.addEventListener('click', () => {
          if (item === 'bag-adidas' || item === 'backpack-tourist') {
            this.equipBagFromInventory(i, item as any);
          } else if (item === 'shawarma' || item === 'energy') {
            this.useFoodFromInventory(i, item as any);
          } else if (this.nearKioskId) {
            this.sendGameMessage({ type: 'sell-slot', slotIndex: i });
          } else {
            this.showFloatingText('Используй автомат, чтобы сдать!', this.player.x, this.player.y - 20, '#ff9900');
          }
        });
      } else {
        slot.innerHTML = `<span style="font-size:11px; color:#3a4150; font-weight:700;">${i + 1}</span>`;
      }

      grid.appendChild(slot);
    }

    const maxLimit = (BACKPACK_TIERS[this.backpackTier] ?? BACKPACK_TIERS[1]).maxWeight;
    const weightStatus = this.dashboardPanelEl.querySelector('#inv-weight-status');
    if (weightStatus) {
      weightStatus.textContent = `Вес: ${this.currentWeight.toFixed(1)} / ${maxLimit} кг`;
    }

    const guideText = this.dashboardPanelEl.querySelector('#inv-guide-text') as HTMLSpanElement;
    if (guideText) {
      guideText.textContent = this.nearKioskId
        ? 'Кликни на бутылку, чтобы сдать!'
        : 'Кликни на еду, чтобы использовать';
    }
  }

  private destroyHTMLOverlays(): void {
    this.removeHTMLHUD();
    this.removeDashboardPanel();

    const pulseStyle = document.getElementById('hud-pulse-style');
    if (pulseStyle) pulseStyle.remove();
  }

  private removeHTMLHUD(): void {
    const existing = document.getElementById('game-hud-overlay');
    if (existing) existing.remove();
    this.hudOverlayEl = undefined;
  }

  private removeDashboardPanel(): void {
    const existing = document.getElementById('game-dashboard-container');
    if (existing) existing.remove();
    this.dashboardPanelEl = undefined;
  }

  private isPeerSnapshot(v: unknown): v is PeerSnapshot {
    if (!v || typeof v !== 'object') return false;
    const p = v as Partial<PeerSnapshot>;
    return typeof p.id === 'string' && typeof p.x === 'number' && typeof p.y === 'number';
  }

  private spawnBottleClient(b: ServerBottle): void {
    if (this.bottlesMap.has(b.id)) return;

    const def = BOTTLE_TYPES[b.type];
    if (!def) return;

    const img = this.add.image(b.x, b.y, def.spriteKey);
    img.setScale(PLAYER_SCALE);
    img.setDepth(100);

    this.tweens.add({
      targets: img,
      y: b.y - 4,
      duration: 1200 + Math.random() * 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    this.bottlesMap.set(b.id, img);
  }

  private removeBottleClient(id: string): void {
    const img = this.bottlesMap.get(id);
    if (img) {
      this.tweens.add({
        targets: img,
        scale: 0.05,
        alpha: 0,
        angle: 180,
        duration: 200,
        onComplete: () => {
          img.destroy();
        }
      });
      this.bottlesMap.delete(id);
    }
  }

  private showFloatingText(text: string, x: number, y: number, color = '#3ae06f'): void {
    // Приводим старые цвета к новой палитре
    const colorMap: Record<string, string> = {
      '#7cfc00': '#3ae06f',
      '#ffd700': '#ffc72c',
      '#ff3333': '#ff5252',
      '#ff9900': '#ff9f43',
    };
    const themed = colorMap[color] ?? color;

    const ftext = this.add.text(x, y, text, {
      fontFamily: 'Rubik, monospace',
      fontSize: '12px',
      fontStyle: 'bold',
      color: themed,
      backgroundColor: '#10141cee',
      padding: { x: 8, y: 5 }
    });
    ftext.setOrigin(0.5);
    ftext.setDepth(2000);
    ftext.setScale(0.6);
    ftext.setShadow(0, 3, '#000000', 8, true, true);

    this.tweens.add({
      targets: ftext,
      scale: 1,
      duration: 180,
      ease: 'Back.easeOut'
    });
    this.tweens.add({
      targets: ftext,
      y: y - 34,
      alpha: 0,
      duration: 1600,
      delay: 220,
      onComplete: () => ftext.destroy()
    });
  }

  // ============================================================
  //  SECTION: HELPERS
  // ============================================================
  private getActiveSlotsCount(): number {
    return this.backpackTier === 1 ? 4 : this.backpackTier === 2 ? 8 : 12;
  }

  private ensureRemote(id: string, x: number, y: number): void {
    let rect = this.remotePlayers.get(id);
    if (!rect) {
      rect = this.add.sprite(x, y, 'player-sprites', 0);
      rect.setScale(PLAYER_SCALE);
      rect.setTint(REMOTE_TINT);
      rect.setDepth(500);
      this.remotePlayers.set(id, rect);
      this.updateHUDUI();
    }
    rect.x = x;
    rect.y = y;
  }

  private removeRemote(id: string): void {
    const rect = this.remotePlayers.get(id);
    if (rect) {
      rect.destroy();
      this.remotePlayers.delete(id);
      this.updateHUDUI();
    }
  }

  private renderRemoteInterpolated(now: number): void {
    if (this.snapshotBuffer.length === 0) return;
    const renderTime = now - SNAPSHOT_INTERP_DELAY_MS;

    let A: SnapshotEntry | undefined;
    let B: SnapshotEntry | undefined;
    for (let i = this.snapshotBuffer.length - 1; i >= 0; i--) {
      const entry = this.snapshotBuffer[i];
      if (entry.localT <= renderTime) {
        A = entry;
        B = this.snapshotBuffer[i + 1];
        break;
      }
    }
    if (!A) return;

    let t = 1;
    if (B && B.localT > A.localT) {
      t = (renderTime - A.localT) / (B.localT - A.localT);
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
    }

    const seen = new Set<string>();
    const source = B ?? A;
    for (const [id, pos] of source.players) {
      seen.add(id);
      const a = A.players.get(id) ?? pos;
      let px: number;
      let py: number;
      if (B) {
        const b = B.players.get(id) ?? pos;
        px = a.x + (b.x - a.x) * t;
        py = a.y + (b.y - a.y) * t;
      } else {
        px = a.x;
        py = a.y;
      }
      this.ensureRemote(id, px, py);
    }

    for (const id of Array.from(this.remotePlayers.keys())) {
      if (!seen.has(id)) {
        this.removeRemote(id);
      }
    }
  }
}
