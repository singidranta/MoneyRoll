import Phaser from 'phaser';
import { connectNetcode, type NetcodeClient, type NetcodeMessage } from '../systems/Netcode';
import { loadMap } from '../systems/MapSystem';
import {
  BACKPACK_TIERS,
  BOTTLE_TYPES,
  INVENTORY_SLOTS,
  PROPERTIES,
  type InventoryItem,
  type BottleType,
  type ServerBottle,
  type JobType,
  type PropertyType,
  type ShopItemType,
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
  // keyQ зарезервирован для быстрого дропа в будущем

  // ============================================================
  //  SECTION: PLAYER STATE
  // ============================================================
  private player!: Phaser.GameObjects.Sprite;
  private localMoney = 5.0;
  private localInventory: (InventoryItem | null)[] = Array(INVENTORY_SLOTS).fill(null);
  private currentWeight = 0.0;
  private backpackTier = 1;
  private hasJacket = false;
  private hasSneakers = false;
  private hasCrown = false;
  private properties: PropertyType[] = [];
  // deprecated, для совместимости UI
  private equippedBag: 'bag-adidas' | 'backpack-tourist' | null = null;
  private stamina = 100.0;
  private isExhausted = false;
  private energyDrinkBuffTimer = 0.0;
  private shawarmaBuffTimer = 0.0;
  private footstepTimer = 0;

  // ============================================================
  //  SECTION: SAVE SYSTEM
  // ============================================================
  private readonly SAVE_KEY = 'moneyroll_save_v2';
  private readonly PLAYER_TOKEN_KEY = 'moneyroll_player_token';
  private playerToken: string = '';
  private saveAutosaveTimer = 0;
  private readonly AUTOSAVE_INTERVAL_MS = 30000; // Автосохранение позиции

  // ============================================================
  //  SECTION: DRAG & DROP
  // ============================================================
  private dragState: {
    active: boolean;
    fromSlot: number;
    item: InventoryItem | null;
    ghostEl: HTMLDivElement | null;
    startX: number;
    startY: number;
  } = { active: false, fromSlot: -1, item: null, ghostEl: null, startX: 0, startY: 0 };

  // ============================================================
  //  SECTION: PLAYER INTERACTION
  // ============================================================
  private nearPlayerId: string | null = null;
  private playerInteractionMenuEl: HTMLDivElement | null = null;
  private tradeTargetId: string | null = null;

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
    // keyQ зарезервирован для быстрого дропа в будущем

    // ---------- Background (fills entire camera — no black void past map edge) ----------
    this.groundTileSprite = this.add.tileSprite(
      0,
      0,
      this.scale.width,
      this.scale.height,
      'tile-ground-grass'
    );
    this.groundTileSprite.setOrigin(0, 0);
    this.groundTileSprite.setScrollFactor(0);
    this.groundTileSprite.setDepth(0);

    this.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
      this.groundTileSprite?.setSize(gameSize.width, gameSize.height);
      // Keep camera padding large enough for any viewport
      const pad = Math.max(gameSize.width, gameSize.height);
      this.cameras.main.setBounds(-pad, -pad, MAP_PIXEL_W + pad * 2, MAP_PIXEL_H + pad * 2);
    });

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
    this.usePrompt = this.add.text(0, 0, '[E]', {
      fontFamily: 'system-ui, monospace',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#e8eaed',
      backgroundColor: '#1a1e26',
      padding: { x: 8, y: 4 },
    });
    this.usePrompt.setOrigin(0.5);
    this.usePrompt.setDepth(1000);
    this.usePrompt.setVisible(false);

    // ---------- Camera ----------
    // Padding around the map so the camera can show grass past the edge
    // instead of clamping hard and leaving a black strip on ultrawide / map edge.
    const camPad = Math.max(this.scale.width, this.scale.height);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    this.cameras.main.setBackgroundColor('#5a7a42');
    this.cameras.main.setBounds(
      -camPad,
      -camPad,
      MAP_PIXEL_W + camPad * 2,
      MAP_PIXEL_H + camPad * 2
    );

    // ---------- World bounds for physics (playable area only) ----------
    this.physics.world.setBounds(0, 0, MAP_PIXEL_W, MAP_PIXEL_H);

    // ---------- Netcode ----------
    this.netcode = connectNetcode((msg) => this.handleServerMessage(msg));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.saveGame();
      this.netcode?.close();
      this.destroyHTMLOverlays();
    });

    kb.on('keydown-L', () => {
      this.cycleSimulatedLag();
    });

    // ---------- UI ----------
    this.createHTMLHUD();

    // ---------- Load saved game ----------
    this.loadGame();

    // ---------- Map data ----------
    void this.loadMapData();

    console.log('[MoneyRoll] World ready. I — инвентарь, E — автомат сдачи/игроки, L — пинг, Q — дроп предмета.');
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

      case 'steal-result': {
        const success = msg.success as boolean;
        const text = msg.message as string;
        const inv = msg.inventory as (InventoryItem | null)[];
        const weight = msg.weight as number;

        if (success && inv) {
          this.localInventory = inv;
          this.currentWeight = weight;
          this.updateHUDUI();
          this.updateDashboard();
          SoundEffects.playPopSound();
          this.showFloatingText(text, this.player.x, this.player.y - 20, '#7cfc00');
        } else {
          this.showFloatingText(text, this.player.x, this.player.y - 20, '#ff3333');
        }
        break;
      }

      case 'give-money-result': {
        const money = msg.money as number;
        const text = msg.message as string;
        this.localMoney = money;
        this.updateHUDUI();
        SoundEffects.playCoinSound();
        this.showFloatingText(text, this.player.x, this.player.y - 20, '#ffd700');
        break;
      }

      case 'player-receive-money': {
        const money = msg.message as string;
        this.localMoney = msg.money as number;
        this.updateHUDUI();
        SoundEffects.playCoinSound();
        this.showFloatingText(money, this.player.x, this.player.y - 20, '#ffd700');
        break;
      }

      case 'player-notice': {
        const text = msg.message as string;
        this.showFloatingText(`⚠️ ${text}`, this.player.x, this.player.y - 30, '#ff9900');
        break;
      }

      case 'trade-offer': {
        const fromId = msg.fromId as string;
        const itemType = msg.itemType as InventoryItem;
        this.showTradeOffer(fromId, itemType);
        break;
      }

      case 'trade-sent': {
        const text = msg.message as string;
        this.showFloatingText(text, this.player.x, this.player.y - 20, '#4aa8c8');
        break;
      }

      case 'trade-complete': {
        const inv = msg.inventory as (InventoryItem | null)[];
        const weight = msg.weight as number;
        const text = msg.message as string;
        this.localInventory = inv;
        this.currentWeight = weight;
        this.updateHUDUI();
        this.updateDashboard();
        SoundEffects.playUpgradeSound();
        this.showFloatingText(text, this.player.x, this.player.y - 20, '#7cfc00');
        break;
      }

      case 'trade-failed': {
        const text = msg.message as string;
        this.showFloatingText(text, this.player.x, this.player.y - 20, '#ff3333');
        break;
      }

      case 'trade-declined': {
        const text = msg.message as string;
        this.showFloatingText(text, this.player.x, this.player.y - 20, '#ff9900');
        break;
      }

      case 'interaction-failed': {
        const text = msg.message as string;
        this.showFloatingText(text, this.player.x, this.player.y - 20, '#ff3333');
        break;
      }

      default:
        console.log('[MoneyRoll] ws ←', msg);
    }
  }

  private showTradeOffer(fromId: string, itemType: InventoryItem): void {
    // Create trade offer popup
    const popup = document.createElement('div');
    popup.className = 'trade-offer-popup';
    popup.innerHTML = `
      <div class="trade-offer-header">
        <span>🤝 Предложение обмена</span>
      </div>
      <div class="trade-offer-body">
        <p>Игрок <strong>${fromId}</strong> предлагает:</p>
        <div class="trade-offer-item">
          <img src="${this.getItemWebpPath(itemType)}" alt="" />
          <span>${this.getItemName(itemType)}</span>
        </div>
      </div>
      <div class="trade-offer-actions">
        <button class="dash-btn dash-btn-primary" id="trade-accept">Принять</button>
        <button class="dash-btn dash-btn-danger" id="trade-decline">Отклонить</button>
      </div>
    `;
    document.body.appendChild(popup);

    popup.querySelector('#trade-accept')?.addEventListener('click', () => {
      this.sendGameMessage({ type: 'trade-accept', fromId, slotIndex: -1 });
      popup.remove();
    });
    popup.querySelector('#trade-decline')?.addEventListener('click', () => {
      this.sendGameMessage({ type: 'trade-decline', fromId });
      popup.remove();
    });

    // Auto-remove after 15 seconds
    setTimeout(() => popup.remove(), 15000);
  }

  private getItemWebpPath(item: InventoryItem): string {
    if (item === 'bag-adidas' || item === 'backpack-tourist') {
      return `/assets/props/flat/bags/${item}.webp`;
    } else if (item === 'shawarma') {
      return '/assets/props/flat/food/shawarma.webp';
    } else if (item === 'energy') {
      return '/assets/props/flat/food/energy-drink.webp';
    }
    return `/assets/props/flat/bottles/${item}.webp`;
  }

  // ============================================================
  //  SECTION: MOVEMENT & INTERACTION
  // ============================================================

  update(_time: number, delta: number): void {
    const now = performance.now();
    const dt = Math.min(delta, 100) / 1000;

    // Keep infinite grass aligned with camera scroll
    if (this.groundTileSprite) {
      this.groundTileSprite.tilePositionX = this.cameras.main.scrollX;
      this.groundTileSprite.tilePositionY = this.cameras.main.scrollY;
    }

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

    // Player interaction detection
    this.detectNearbyPlayer();

    // Show/hide interaction prompt
    const nearAnyShop = this.nearKioskId || this.nearFoodCartEntity || this.nearClothingShopEntity;
    const nearPlayer = this.nearPlayerId !== null;

    if (nearAnyShop || nearPlayer) {
      this.usePrompt.setPosition(targetX, targetY - PROMPT_OFFSET_Y);
      this.usePrompt.setVisible(true);

      if (Phaser.Input.Keyboard.JustDown(this.keyE)) {
        if (nearPlayer && !nearAnyShop) {
          this.showPlayerInteractionMenu();
        } else {
          this.toggleInventory(true); // Открывает Dashboard с магазинами или автоматом!
        }
      }
    } else {
      this.usePrompt.setVisible(false);
      this.hidePlayerInteractionMenu();
    }

    // Autosave
    this.saveAutosaveTimer += delta;
    if (this.saveAutosaveTimer >= this.AUTOSAVE_INTERVAL_MS) {
      this.saveAutosaveTimer = 0;
      this.saveGame();
    }

    this.renderRemoteInterpolated(now);
  }

  // ============================================================
  //  SECTION: SAVE SYSTEM
  // ============================================================
  private getOrCreatePlayerToken(): string {
    try {
      let token = localStorage.getItem(this.PLAYER_TOKEN_KEY);
      if (!token) {
        token = 'mr_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(this.PLAYER_TOKEN_KEY, token);
      }
      return token;
    } catch {
      return 'mr_guest_' + Math.random().toString(36).slice(2);
    }
  }

  // Сохраняем ТОЛЬКО позицию. Деньги/инвентарь — на сервере, иначе читы.
  private saveGame(): void {
    if (!this.player) return;
    const saveData = {
      version: 2,
      x: this.player.x,
      y: this.player.y,
      savedAt: Date.now(),
    };
    try {
      localStorage.setItem(this.SAVE_KEY, JSON.stringify(saveData));
    } catch (e) {
      console.warn('[MoneyRoll] Ошибка сохранения:', e);
    }
  }

  private loadGame(): boolean {
    this.playerToken = this.getOrCreatePlayerToken();
    try {
      const raw = localStorage.getItem(this.SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (typeof data.x === 'number' && typeof data.y === 'number') {
        this.player.setPosition(data.x, data.y);
        return true;
      }
      return false;
    } catch (e) {
      console.warn('[MoneyRoll] Ошибка загрузки:', e);
      return false;
    }
  }

  // ============================================================
  //  SECTION: PLAYER INTERACTION (STEAL / TRADE / GIVE)
  // ============================================================
  private detectNearbyPlayer(): void {
    this.nearPlayerId = null;
    if (!this.myId) return;

    let closestId: string | null = null;
    let closestDist = INTERACT_RADIUS;

    for (const [id, sprite] of this.remotePlayers.entries()) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, sprite.x, sprite.y);
      if (dist < closestDist) {
        closestDist = dist;
        closestId = id;
      }
    }

    if (closestId) {
      this.nearPlayerId = closestId;
    }
  }

  private showPlayerInteractionMenu(): void {
    this.hidePlayerInteractionMenu();

    const menu = document.createElement('div');
    menu.id = 'player-interaction-menu';
    menu.className = 'player-interaction-menu';

    menu.innerHTML = `
      <div class="pi-menu-header">
        <span class="pi-menu-title">Действия с игроком</span>
        <button class="pi-menu-close" title="Закрыть">&times;</button>
      </div>
      <button class="pi-action-btn" data-action="steal">
        <span class="pi-action-icon">🥷</span>
        <span class="pi-action-text">
          <strong>Украсть предмет</strong>
          <small>Шанс: 20% — если провалишься, игрок узнает!</small>
        </span>
      </button>
      <button class="pi-action-btn" data-action="trade">
        <span class="pi-action-icon">🤝</span>
        <span class="pi-action-text">
          <strong>Предложить обмен</strong>
          <small>Выбери предмет из инвентаря для обмена</small>
        </span>
      </button>
      <button class="pi-action-btn" data-action="give">
        <span class="pi-action-icon">💰</span>
        <span class="pi-action-text">
          <strong>Дать денег</strong>
          <small>Перевести деньги другому игроку</small>
        </span>
      </button>
    `;

    document.body.appendChild(menu);
    this.playerInteractionMenuEl = menu;

    // Close button
    menu.querySelector('.pi-menu-close')?.addEventListener('click', () => {
      this.hidePlayerInteractionMenu();
    });

    // Action buttons
    menu.querySelectorAll('.pi-action-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const action = (e.currentTarget as HTMLElement).dataset.action;
        if (action === 'steal') this.attemptSteal();
        else if (action === 'trade') this.initiateTrade();
        else if (action === 'give') this.initiateGiveMoney();
      });
    });
  }

  private hidePlayerInteractionMenu(): void {
    if (this.playerInteractionMenuEl) {
      this.playerInteractionMenuEl.remove();
      this.playerInteractionMenuEl = null;
    }
  }

  private attemptSteal(): void {
    if (!this.nearPlayerId) return;
    this.hidePlayerInteractionMenu();
    this.sendGameMessage({ type: 'player-interaction', action: 'steal', targetId: this.nearPlayerId });
    this.showFloatingText('Пытаемся украсть…', this.player.x, this.player.y - 30, '#ff9900');
  }

  private initiateTrade(): void {
    if (!this.nearPlayerId) return;
    this.hidePlayerInteractionMenu();
    this.showFloatingText('Открой инвентарь и выбери предмет для обмена', this.player.x, this.player.y - 30, '#4aa8c8');
    this.tradeTargetId = this.nearPlayerId;
    this.toggleInventory(true);
  }

  private initiateGiveMoney(): void {
    if (!this.nearPlayerId) return;
    this.hidePlayerInteractionMenu();

    const amountStr = prompt(`Сколько денег дать? (у тебя $${this.localMoney.toFixed(2)})`, '1.00');
    if (!amountStr) return;
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0 || amount > this.localMoney) {
      this.showFloatingText('Неверная сумма!', this.player.x, this.player.y - 20, '#ff3333');
      return;
    }

    this.sendGameMessage({ type: 'player-interaction', action: 'give-money', targetId: this.nearPlayerId, amount });
    this.showFloatingText(`Отправлено: $${amount.toFixed(2)}`, this.player.x, this.player.y - 30, '#ffd700');
  }

  /** Вызывается когда игрок кликает по предмету в инвентаре в режиме трейда */
  private handleTradeClick(slotIdx: number): void {
    if (!this.tradeTargetId) return;
    const item = this.localInventory[slotIdx];
    if (!item) return;

    this.sendGameMessage({
      type: 'player-interaction',
      action: 'trade-offer',
      targetId: this.tradeTargetId,
      slotIndex: slotIdx,
      itemType: item,
    });
    this.tradeTargetId = null;
    this.showFloatingText('Предложение обмена отправлено!', this.player.x, this.player.y - 30, '#4aa8c8');
  }

  // ============================================================
  //  SECTION: DROP ITEMS
  // ============================================================
  private dropItem(slotIdx: number): void {
    const item = this.localInventory[slotIdx];
    if (!item) return;

    // Нельзя дропнуть экипированную сумку — сначала снять
    if ((item === 'bag-adidas' || item === 'backpack-tourist') && this.equippedBag === item) {
      this.showFloatingText('Сначала сними сумку!', this.player.x, this.player.y - 20, '#ff9900');
      return;
    }

    this.localInventory[slotIdx] = null;

    // Считаем вес заново
    this.currentWeight = this.calculateLocalWeight();

    // Спавним бутылку/предмет на земле
    const dropOffset = 40;
    const dropX = this.player.x + (Math.random() - 0.5) * dropOffset;
    const dropY = this.player.y + 20;
    this.spawnDroppedItemOnGround(item, dropX, dropY);

    SoundEffects.playPopSound();
    this.updateHUDUI();
    this.updateDashboard();
    this.showFloatingText(`Выброшено: ${this.getItemName(item)}`, this.player.x, this.player.y - 30, '#ff9900');

    // Сохраняем после дропа
    this.saveGame();
  }

  private spawnDroppedItemOnGround(item: InventoryItem, x: number, y: number): void {
    let spriteKey = '';
    if (item === 'bag-adidas' || item === 'backpack-tourist') {
      spriteKey = item;
    } else if (item === 'shawarma') {
      spriteKey = 'shawarma';
    } else if (item === 'energy') {
      spriteKey = 'energy-drink';
    } else {
      const def = BOTTLE_TYPES[item as BottleType];
      spriteKey = def?.spriteKey ?? 'bottle-water';
    }

    const img = this.add.image(x, y, spriteKey);
    img.setScale(0.35);
    img.setDepth(80);

    this.tweens.add({
      targets: img,
      y: y - 3,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Добавляем возможность поднять
    const dropId = `drop_${Math.random().toString(36).slice(2, 10)}`;
    img.setData('dropId', dropId);
    img.setData('dropItem', item);
    this.bottlesMap.set(dropId, img);
  }

  private calculateLocalWeight(): number {
    let total = 0;
    for (const item of this.localInventory) {
      if (!item) continue;
      if (item === 'bag-adidas' || item === 'backpack-tourist') {
        total += 0;
      } else if (item === 'shawarma' || item === 'energy') {
        total += item === 'shawarma' ? 0.5 : 0.3;
      } else {
        total += BOTTLE_TYPES[item as BottleType]?.weight ?? 0;
      }
    }
    return parseFloat(total.toFixed(2));
  }

  private getItemName(item: InventoryItem): string {
    if (item === 'bag-adidas') return 'Сумка Adidas';
    if (item === 'backpack-tourist') return 'Рюкзак туриста';
    if (item === 'shawarma') return 'Шаурма';
    if (item === 'energy') return 'Ягуар';
    const def = BOTTLE_TYPES[item as BottleType];
    return def?.name ?? item;
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

    // 1. Balance (top-right)
    const moneyPanel = document.createElement('div');
    moneyPanel.id = 'hud-money-panel';
    moneyPanel.innerHTML = `$<span id="hud-money-val">5.00</span>`;
    hud.appendChild(moneyPanel);

    // 2. Weight & stamina (bottom-left)
    const statsPanel = document.createElement('div');
    statsPanel.id = 'hud-stats-panel';
    statsPanel.innerHTML = `
      <div class="hud-stat-label" id="hud-weight">Пакет · 0.0 / 8.0 кг</div>
      <div class="hud-bar">
        <div id="hud-weight-bar" class="hud-bar-fill" style="width:0%; background:#4caf6a;"></div>
      </div>
      <div class="hud-stat-hint">Энергия · Shift — бег</div>
      <div class="hud-bar">
        <div id="hud-stamina-bar" class="hud-bar-fill" style="width:100%; background:#e0b03a;"></div>
      </div>
    `;
    hud.appendChild(statsPanel);

    // 3. Inventory button (bottom-right)
    const btnBackpack = document.createElement('button');
    btnBackpack.id = 'btn-toggle-backpack';
    btnBackpack.title = 'Инвентарь (I)';
    btnBackpack.innerHTML =
      '<img src="/assets/props/flat/bags/backpack-tourist.webp" alt="Инвентарь" width="28" height="28" />';
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
    panel.className = 'dashboard-panel kiosk shop-panel-large';
    panel.innerHTML = `
      <h3><img src="/assets/props/flat/kiosk/recycle-machine.webp" alt="" />Автомат сдачи</h3>
      <p>Кликни бутылку в инвентаре справа, чтобы сдать поштучно, или используй кнопку ниже для массовой сдачи.</p>
      <div class="kiosk-prices">
        <div class="kiosk-price-row"><img src="/assets/props/flat/bottles/water.webp" /><span>Пластиковая вода</span><span class="kiosk-price">$0.05</span></div>
        <div class="kiosk-price-row"><img src="/assets/props/flat/bottles/beer-glass.webp" /><span>Стекло пиво</span><span class="kiosk-price">$0.20</span></div>
        <div class="kiosk-price-row"><img src="/assets/props/flat/bottles/wine.webp" /><span>Вино</span><span class="kiosk-price">$1.00</span></div>
        <div class="kiosk-price-row"><img src="/assets/props/flat/bottles/champagne.webp" /><span>Шампанское</span><span class="kiosk-price">$5.00</span></div>
        <div class="kiosk-price-row"><img src="/assets/props/flat/bottles/bordeaux-1982.webp" /><span>Bordeaux 1982</span><span class="kiosk-price">$50.00</span></div>
      </div>
      <button id="btn-recycle-all" class="dash-btn dash-btn-primary">Сдать все бутылки</button>
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
    panel.className = 'dashboard-panel food shop-panel-large';
    panel.innerHTML = `
      <h3><img src="/assets/props/flat/kiosk/food-cart.webp" alt="" />Ларёк у Ашота</h3>
      <p>Еда попадает в инвентарь. Кликни по ней, чтобы съесть.</p>
      <div class="shop-grid">
        <div class="shop-card" id="btn-buy-shawa">
          <div class="shop-card-img"><img src="/assets/props/flat/food/shawarma.webp" alt="Шаурма" /></div>
          <div class="shop-card-info">
            <span class="shop-card-name">Шаурма</span>
            <span class="shop-card-desc">Восстанавливает 100% энергии + бафф бега</span>
          </div>
          <div class="shop-card-price">$1.50</div>
        </div>
        <div class="shop-card" id="btn-buy-energy">
          <div class="shop-card-img"><img src="/assets/props/flat/food/energy-drink.webp" alt="Ягуар" /></div>
          <div class="shop-card-info">
            <span class="shop-card-name">Энергетик «Ягуар»</span>
            <span class="shop-card-desc">Бешеная скорость на 30 сек</span>
          </div>
          <div class="shop-card-price">$3.00</div>
        </div>
      </div>
      <button id="btn-close-dashboard" class="dash-btn dash-btn-danger">Закрыть</button>
    `;
    panel.querySelector('#btn-buy-shawa')?.addEventListener('click', () => {
      this.buyItemToInventory('shawarma', 1.5);
    });
    panel.querySelector('#btn-buy-energy')?.addEventListener('click', () => {
      this.buyItemToInventory('energy', 3.0);
    });
    panel.querySelector('#btn-close-dashboard')?.addEventListener('click', () => {
      this.toggleInventory(false);
    });
    return panel;
  }

  private createClothingPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'dashboard-panel clothing shop-panel-large';
    panel.innerHTML = `
      <h3><img src="/assets/props/flat/buildings/clothing-shop.webp" alt="" />Магазин одежды</h3>
      <div class="shop-section-title">Сумки</div>
      <div class="shop-grid">
        <div class="shop-card" id="btn-buy-bag-adidas">
          <div class="shop-card-img"><img src="/assets/props/flat/bags/bag-adidas.webp" alt="Сумка Adidas" /></div>
          <div class="shop-card-info">
            <span class="shop-card-name">Сумка Adidas</span>
            <span class="shop-card-desc">До 15 кг</span>
          </div>
          <div class="shop-card-price">$15.00</div>
        </div>
        <div class="shop-card" id="btn-buy-backpack-tourist">
          <div class="shop-card-img"><img src="/assets/props/flat/bags/backpack-tourist.webp" alt="Рюкзак туриста" /></div>
          <div class="shop-card-info">
            <span class="shop-card-name">Рюкзак туриста</span>
            <span class="shop-card-desc">До 30 кг</span>
          </div>
          <div class="shop-card-price">$45.00</div>
        </div>
      </div>
      <div class="shop-section-title">Экипировка</div>
      <div class="shop-grid">
        <div class="shop-card" id="btn-buy-jacket">
          <div class="shop-card-img"><img src="/assets/props/flat/clothing/adidas-jacket.webp" alt="Свитшот Adidas" /></div>
          <div class="shop-card-info">
            <span class="shop-card-name">Свитшот Adidas</span>
            <span class="shop-card-desc">+50% регенерация выносливости</span>
          </div>
          <div class="shop-card-price">$10.00</div>
        </div>
        <div class="shop-card" id="btn-buy-sneakers">
          <div class="shop-card-img"><img src="/assets/props/flat/clothing/sneakers.webp" alt="Кроссовки Nike" /></div>
          <div class="shop-card-info">
            <span class="shop-card-name">Кроссовки Nike</span>
            <span class="shop-card-desc">+30% скорость бега</span>
          </div>
          <div class="shop-card-price">$20.00</div>
        </div>
        <div class="shop-card" id="btn-buy-crown">
          <div class="shop-card-img"><img src="/assets/props/flat/clothing/crown.webp" alt="Корона" /></div>
          <div class="shop-card-info">
            <span class="shop-card-name">Золотая корона</span>
            <span class="shop-card-desc">Статус короля улиц</span>
          </div>
          <div class="shop-card-price">$100.00</div>
        </div>
      </div>
      <button id="btn-close-dashboard" class="dash-btn dash-btn-danger">Закрыть</button>
    `;
    panel.querySelector('#btn-buy-bag-adidas')?.addEventListener('click', () => {
      this.buyItemToInventory('bag-adidas', 15.0);
    });
    panel.querySelector('#btn-buy-backpack-tourist')?.addEventListener('click', () => {
      this.buyItemToInventory('backpack-tourist', 45.0);
    });
    panel.querySelector('#btn-buy-jacket')?.addEventListener('click', () => {
      this.buyClothingItem('jacket', 10.0);
    });
    panel.querySelector('#btn-buy-sneakers')?.addEventListener('click', () => {
      this.buyClothingItem('sneakers', 20.0);
    });
    panel.querySelector('#btn-buy-crown')?.addEventListener('click', () => {
      this.buyClothingItem('crown', 100.0);
    });
    panel.querySelector('#btn-close-dashboard')?.addEventListener('click', () => {
      this.toggleInventory(false);
    });
    return panel;
  }

  private createInventoryPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.id = 'dashboard-inventory-panel';
    panel.className = 'dashboard-panel inventory-panel-large';
    panel.innerHTML = `
      <div class="inventory-header">
        <span class="inventory-title">
          <img src="/assets/props/flat/bags/backpack-tourist.webp" alt="" />
          Рюкзак
        </span>
        <div class="header-actions">
          <button id="btn-save-game" class="dash-btn-save" title="Сохранить игру">💾</button>
          <button id="btn-close-dashboard-x" class="dash-btn-close" title="Закрыть (I)">&times;</button>
        </div>
      </div>
      <div class="bag-slot-row">
        <div id="equip-bag-slot" class="bag-slot empty"></div>
        <div style="font-size:12px; line-height:1.4;">
          <strong style="color:#e8eaed; display:block; font-size:12px;">Слот сумки</strong>
          <span id="equip-bag-desc" style="color:#8a919e;">Без сумки · 4 кармана</span>
        </div>
      </div>
      <div id="inventory-grid" class="inventory-grid-large"></div>
      <div class="dashboard-footer">
        <span id="inv-guide-text">Кликни предмет · ПКМ — выбросить · Перетаскивай между слотами</span>
        <span id="inv-weight-status">Вес: 0.0 / ${BACKPACK_TIERS[1].maxWeight} кг</span>
      </div>
    `;
    panel.querySelector('#btn-close-dashboard-x')?.addEventListener('click', () => {
      this.toggleInventory(false);
    });
    panel.querySelector('#btn-save-game')?.addEventListener('click', () => {
      this.saveGame();
      this.showFloatingText('Игра сохранена!', this.player.x, this.player.y - 30, '#7cfc00');
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
    if (weightEl) {
      weightEl.textContent = `${bagName} · ${this.currentWeight.toFixed(1)} / ${maxLimit} кг`;
    }

    const weightBar = this.hudOverlayEl.querySelector('#hud-weight-bar') as HTMLDivElement;
    if (weightBar) {
      const pct = Math.min((this.currentWeight / maxLimit) * 100, 100);
      const color = pct > 85 ? '#d45454' : pct > 60 ? '#e0b03a' : '#4caf6a';
      weightBar.style.width = `${pct}%`;
      weightBar.style.background = color;
    }

    const staminaBar = this.hudOverlayEl.querySelector('#hud-stamina-bar') as HTMLDivElement;
    if (staminaBar) {
      const pct = Math.min(this.stamina, 100);
      const color =
        this.energyDrinkBuffTimer > 0
          ? '#4aa8c8'
          : this.shawarmaBuffTimer > 0
            ? '#d4893a'
            : this.isExhausted
              ? '#d45454'
              : '#e0b03a';
      staminaBar.style.width = `${pct}%`;
      staminaBar.style.background = color;
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
      equipSlot.innerHTML = `<img src="${bagPath}" alt="" />`;
      equipDesc.innerHTML =
        this.equippedBag === 'bag-adidas'
          ? 'Сумка Adidas · 15 кг<br/><span style="color:#8a919e;font-size:11px;">Кликни, чтобы снять</span>'
          : 'Рюкзак туриста · 30 кг<br/><span style="color:#8a919e;font-size:11px;">Кликни, чтобы снять</span>';
    } else {
      equipSlot.classList.add('empty');
      equipSlot.innerHTML = `<span style="font-size:18px;color:#5a6270;">+</span>`;
      equipDesc.innerHTML =
        'Без сумки · 4 кармана<br/><span style="color:#8a919e;font-size:11px;">Купи сумку в магазине</span>';
    }

    // Render inventory slots
    const activeSlotsCount = this.getActiveSlotsCount();

    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const item = this.localInventory[i];
      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      slot.dataset.slotIndex = String(i);

      if (i >= activeSlotsCount) {
        slot.classList.add('locked');
        slot.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" style="opacity:0.35;fill:none;stroke:#4a5261;stroke-width:2.5;"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 1 1 8 0v4"/></svg>`;
        grid.appendChild(slot);
        continue;
      }

      if (item) {
        slot.classList.add('has-item');

        let webpPath = `/assets/props/flat/bottles/${item}.webp`;
        let label = '';

        if (item === 'bag-adidas' || item === 'backpack-tourist') {
          webpPath = `/assets/props/flat/bags/${item}.webp`;
          label = '<span class="inv-slot-label">сумка</span>';
        } else if (item === 'shawarma') {
          webpPath = '/assets/props/flat/food/shawarma.webp';
          label = '<span class="inv-slot-label">еда</span>';
        } else if (item === 'energy') {
          webpPath = '/assets/props/flat/food/energy-drink.webp';
          label = '<span class="inv-slot-label">еда</span>';
        } else {
          const weight = BOTTLE_TYPES[item as BottleType]?.weight ?? 1.0;
          label = `<span class="inv-slot-label">${weight} кг</span>`;
        }

        slot.innerHTML = `<img src="${webpPath}" />${label}`;

        // Drag & Drop events
        slot.addEventListener('mousedown', (e) => {
          if (e.button === 0) { // Left click - start drag
            this.startDrag(e, i, item);
          }
        });

        // Right click to drop
        slot.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.dropItem(i);
        });

        // Left click to use
        slot.addEventListener('click', () => {
          if (this.tradeTargetId) {
            this.handleTradeClick(i);
            return;
          }
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
        slot.innerHTML = `<span style="font-size:11px;color:#4a5260;font-weight:600;">${i + 1}</span>`;
      }

      // Drop target events
      slot.addEventListener('dragover', (e) => {
        e.preventDefault();
        slot.classList.add('drag-over');
      });
      slot.addEventListener('dragleave', () => {
        slot.classList.remove('drag-over');
      });
      slot.addEventListener('mouseup', (e) => {
        e.preventDefault();
        if (this.dragState.active && this.dragState.fromSlot !== i) {
          this.finishDrag(i);
        }
        this.cancelDrag();
      });

      grid.appendChild(slot);
    }

    const maxLimit = (BACKPACK_TIERS[this.backpackTier] ?? BACKPACK_TIERS[1]).maxWeight;
    const weightStatus = this.dashboardPanelEl.querySelector('#inv-weight-status');
    if (weightStatus) {
      weightStatus.textContent = `Вес: ${this.currentWeight.toFixed(1)} / ${maxLimit} кг`;
    }

    const guideText = this.dashboardPanelEl.querySelector('#inv-guide-text') as HTMLSpanElement;
    if (guideText) {
      if (this.tradeTargetId) {
        guideText.textContent = 'Выбери предмет для обмена с игроком';
      } else {
        guideText.textContent = this.nearKioskId
          ? 'Кликни на бутылку, чтобы сдать! · ПКМ — выбросить'
          : 'Кликни предмет · ПКМ — выбросить · Перетаскивай между слотами';
      }
    }
  }

  // ============================================================
  //  SECTION: DRAG & DROP IMPLEMENTATION
  // ============================================================
  private startDrag(e: MouseEvent, slotIdx: number, item: InventoryItem): void {
    this.dragState = {
      active: true,
      fromSlot: slotIdx,
      item,
      ghostEl: null,
      startX: e.clientX,
      startY: e.clientY,
    };

    // Create ghost element
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    let webpPath = `/assets/props/flat/bottles/${item}.webp`;
    if (item === 'bag-adidas' || item === 'backpack-tourist') {
      webpPath = `/assets/props/flat/bags/${item}.webp`;
    } else if (item === 'shawarma') {
      webpPath = '/assets/props/flat/food/shawarma.webp';
    } else if (item === 'energy') {
      webpPath = '/assets/props/flat/food/energy-drink.webp';
    }
    ghost.innerHTML = `<img src="${webpPath}" />`;
    ghost.style.left = `${e.clientX - 24}px`;
    ghost.style.top = `${e.clientY - 24}px`;
    document.body.appendChild(ghost);
    this.dragState.ghostEl = ghost;

    // Add global mousemove/mouseup listeners
    const onMove = (ev: MouseEvent) => {
      if (this.dragState.ghostEl) {
        this.dragState.ghostEl.style.left = `${ev.clientX - 24}px`;
        this.dragState.ghostEl.style.top = `${ev.clientY - 24}px`;
      }
      // Highlight target slot
      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      const slot = target?.closest('.inv-slot') as HTMLElement;
      if (slot && slot.dataset.slotIndex) {
        const targetIdx = parseInt(slot.dataset.slotIndex);
        if (targetIdx !== this.dragState.fromSlot && targetIdx < this.getActiveSlotsCount()) {
          slot.classList.add('drag-over');
        }
      }
    };

    const onUp = (ev: MouseEvent) => {
      // Find drop target
      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      const slot = target?.closest('.inv-slot') as HTMLElement;
      if (slot && slot.dataset.slotIndex) {
        const targetIdx = parseInt(slot.dataset.slotIndex);
        if (targetIdx !== this.dragState.fromSlot && targetIdx < this.getActiveSlotsCount()) {
          this.finishDrag(targetIdx);
        }
      }
      this.cancelDrag();
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  private finishDrag(toSlot: number): void {
    const fromSlot = this.dragState.fromSlot;
    if (fromSlot === toSlot) return;

    // Swap items
    const temp = this.localInventory[fromSlot];
    this.localInventory[fromSlot] = this.localInventory[toSlot];
    this.localInventory[toSlot] = temp;

    this.currentWeight = this.calculateLocalWeight();
    this.updateHUDUI();
    this.updateDashboard();
  }

  private cancelDrag(): void {
    if (this.dragState.ghostEl) {
      this.dragState.ghostEl.remove();
    }
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    this.dragState = { active: false, fromSlot: -1, item: null, ghostEl: null, startX: 0, startY: 0 };
  }

  private destroyHTMLOverlays(): void {
    this.removeHTMLHUD();
    this.removeDashboardPanel();
    this.hidePlayerInteractionMenu();

    // Remove any trade offer popups
    document.querySelectorAll('.trade-offer-popup').forEach(el => el.remove());

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

  private showFloatingText(text: string, x: number, y: number, color = '#4caf6a'): void {
    const colorMap: Record<string, string> = {
      '#7cfc00': '#4caf6a',
      '#3ae06f': '#4caf6a',
      '#ffd700': '#e0b03a',
      '#ffc72c': '#e0b03a',
      '#ff3333': '#d45454',
      '#ff5252': '#d45454',
      '#ff9900': '#d4893a',
      '#ff9f43': '#d4893a',
    };
    const themed = colorMap[color] ?? color;

    const ftext = this.add.text(x, y, text, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '12px',
      fontStyle: 'bold',
      color: themed,
      backgroundColor: '#1a1e26',
      padding: { x: 6, y: 3 },
    });
    ftext.setOrigin(0.5);
    ftext.setDepth(2000);

    this.tweens.add({
      targets: ftext,
      y: y - 28,
      alpha: 0,
      duration: 1200,
      ease: 'Linear',
      onComplete: () => ftext.destroy(),
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
