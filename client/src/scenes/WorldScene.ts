import Phaser from 'phaser';
import { connectNetcode, type NetcodeClient, type NetcodeMessage } from '../systems/Netcode';
import { loadMap } from '../systems/MapSystem';
import {
  BACKPACK_TIERS,
  BOTTLE_TYPES,
  INVENTORY_SLOTS,
  PROPERTIES,
  DEFAULT_JOB_SKILLS,
  DEFAULT_LICENSES,
  type InventoryItem,
  type JobType,
  type PropertyType,
  type ServerBottle,
  type JobSkills,
  type JobLicense,
} from '../../../shared/economy';
import {
  bagToTier,
  calculateInventoryWeight,
  getActiveSlotsCount,
  getItemName,
  getItemSpriteKey,
  isBag,
  isFood,
} from '../../../shared/items';
import { TILE_SIZE, TILE_SIZE_HALF, type MapDocument, type MapEntity } from '../../../shared/map';
import { SoundEffects } from '../systems/SoundEffects';
import {
  AUTOSAVE_INTERVAL_MS,
  BASE_SPRINT_SPEED,
  BASE_WALK_SPEED,
  BOTTLE_PICKUP_RADIUS,
  DEFAULT_SPAWN,
  DROP_ITEM_SCALE,
  ENERGY_BUFF_SEC,
  ENERGY_SPEED_BONUS,
  FOOTSTEP_SPRINT_MS,
  FOOTSTEP_WALK_MS,
  INTERACT_RADIUS,
  MAP_PIXEL_H,
  MAP_PIXEL_W,
  PLAYER_BODY_OFFSET_X,
  PLAYER_BODY_OFFSET_Y,
  PLAYER_BODY_SIZE,
  PLAYER_SCALE,
  PROMPT_OFFSET_Y,
  SEND_INTERVAL_MS,
  SHAWARMA_BUFF_SEC,
  SNEAKERS_SPRINT_BONUS,
  SNEAKERS_WALK_BONUS,
  STAMINA_DRAIN_BASE,
  STAMINA_EXHAUST_RECOVER,
  STAMINA_MAX,
  STAMINA_REGEN_BASE,
  STAMINA_REGEN_JACKET,
} from '../config/WorldConstants';
import { MapRenderer } from '../systems/MapRenderer';
import { isPeerSnapshot, RemotePlayers } from '../systems/RemotePlayers';
import { getOrCreatePlayerToken, loadPosition, savePosition } from '../systems/SaveSystem';
import { DashboardUI, type DashboardCallbacks, type DashboardContext } from '../ui/DashboardUI';
import { DragDropController } from '../ui/DragDrop';
import { showFloatingText } from '../ui/FloatingText';
import { HudUI } from '../ui/HudUI';
import { JobMinigameUI } from '../ui/JobMinigameUI';
import {
  PlayerInteractionUI,
  removeAllTradePopups,
  showTradeOfferPopup,
} from '../ui/PlayerInteractionUI';

// ============================================================
//  SECTION: WORLD SCENE
// ============================================================

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
  private hasJacket = false;
  private hasSneakers = false;
  private hasCrown = false;
  // deprecated, для совместимости UI
  private equippedBag: 'bag-adidas' | 'backpack-tourist' | null = null;
  private stamina = STAMINA_MAX;
  private isExhausted = false;
  private energyDrinkBuffTimer = 0.0;
  private shawarmaBuffTimer = 0.0;
  private footstepTimer = 0;
  private saveAutosaveTimer = 0;

  // ============================================================
  //  SECTION: SYSTEMS
  // ============================================================
  private netcode?: NetcodeClient;
  private lastSentAt = 0;
  private myId: string | null = null;
  private simulatedLagMs = 0;
  private remotes = new RemotePlayers(this);
  private mapRenderer = new MapRenderer(this);
  private mapJson: MapDocument | null = null;
  private bottlesMap = new Map<string, Phaser.GameObjects.Image>();
  private groundTileSprite?: Phaser.GameObjects.TileSprite;

  // ============================================================
  //  SECTION: INTERACTION STATE
  // ============================================================
  private nearKioskId: string | null = null;
  private nearFoodCartEntity: MapEntity | null = null;
  private nearClothingShopEntity: MapEntity | null = null;
  private nearJobEntity: MapEntity | null = null;
  private nearPropertyEntity: MapEntity | null = null;
  private nearPlayerId: string | null = null;
  private tradeTargetId: string | null = null;
  private properties: PropertyType[] = [];
  private hasAuthenticated = false;
  private isInventoryOpen = false;
  private usePrompt!: Phaser.GameObjects.Text;
  // v2 job system
  private jobSkills: JobSkills = JSON.parse(JSON.stringify(DEFAULT_JOB_SKILLS));
  private licenses: JobLicense = JSON.parse(JSON.stringify(DEFAULT_LICENSES));
  private trainingCompleted: string[] = [];
  private nearSchoolEntity: MapEntity | null = null;

  // ============================================================
  //  SECTION: UI
  // ============================================================
  private hud = new HudUI();
  private dashboard = new DashboardUI();
  private playerMenu = new PlayerInteractionUI();
  private dragDrop = new DragDropController();
  private jobUI = new JobMinigameUI();

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
      0,
      0,
      this.scale.width,
      this.scale.height,
      'tile-ground-grass',
    );
    this.groundTileSprite.setOrigin(0, 0);
    this.groundTileSprite.setScrollFactor(0);
    this.groundTileSprite.setDepth(0);

    this.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
      this.groundTileSprite?.setSize(gameSize.width, gameSize.height);
      const pad = Math.max(gameSize.width, gameSize.height);
      this.cameras.main.setBounds(-pad, -pad, MAP_PIXEL_W + pad * 2, MAP_PIXEL_H + pad * 2);
    });

    // ---------- Player ----------
    this.player = this.add.sprite(DEFAULT_SPAWN.x, DEFAULT_SPAWN.y, 'player-sprites', 0);
    this.player.setScale(PLAYER_SCALE);
    this.player.setDepth(500);
    this.createPlayerAnimations();

    this.physics.add.existing(this.player);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);
    body.setSize(PLAYER_BODY_SIZE, PLAYER_BODY_SIZE);
    body.setOffset(PLAYER_BODY_OFFSET_X, PLAYER_BODY_OFFSET_Y);

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
    const camPad = Math.max(this.scale.width, this.scale.height);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    this.cameras.main.setBackgroundColor('#5a7a42');
    this.cameras.main.setBounds(-camPad, -camPad, MAP_PIXEL_W + camPad * 2, MAP_PIXEL_H + camPad * 2);
    this.physics.world.setBounds(0, 0, MAP_PIXEL_W, MAP_PIXEL_H);

    // ---------- Netcode ----------
    this.netcode = connectNetcode((msg) => this.handleServerMessage(msg));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.saveGame();
      this.netcode?.close();
      this.destroyHTMLOverlays();
    });

    kb.on('keydown-L', () => this.cycleSimulatedLag());

    // ---------- UI + Save + Map ----------
    this.hud.create(() => this.toggleInventory());
    this.loadGame();
    void this.loadMapData();

    console.log(
      '[MoneyRoll] World ready. I — инвентарь, E — автомат сдачи/игроки, L — пинг, Q — дроп предмета.',
    );
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
        repeat: -1,
      });
    }
  }

  // ============================================================
  //  SECTION: NETCODE SIMULATION
  // ============================================================

  private cycleSimulatedLag(): void {
    if (this.simulatedLagMs === 0) this.simulatedLagMs = 150;
    else if (this.simulatedLagMs === 150) this.simulatedLagMs = 350;
    else this.simulatedLagMs = 0;
    this.float(`Неткод: симулируемый лаг = ${this.simulatedLagMs}мс`, this.player.x, this.player.y - 40, '#ff9900');
  }

  // ============================================================
  //  SECTION: MAP LOADING
  // ============================================================

  private async loadMapData(): Promise<void> {
    try {
      this.mapJson = await loadMap();
      this.mapRenderer.renderTiles(this.mapJson);
      this.mapRenderer.renderEntities(this.mapJson, this.player);
    } catch (err) {
      console.warn('[MoneyRoll] failed to load map tiles:', err);
    }
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
        if (typeof msg.id !== 'string') break;
        this.myId = msg.id;
        console.log('[MoneyRoll] welcome: my id =', msg.id);
        this.remotes.clearBuffer();

        this.localMoney = typeof msg.money === 'number' ? msg.money : 5.0;
        this.localInventory = Array.isArray(msg.inventory)
          ? msg.inventory as (InventoryItem | null)[]
          : Array(INVENTORY_SLOTS).fill(null);
        this.backpackTier = typeof msg.backpackTier === 'number' ? msg.backpackTier : 1;
        this.hasJacket = msg.hasJacket === true;
        this.hasSneakers = msg.hasSneakers === true;
        this.hasCrown = msg.hasCrown === true;
        this.properties = Array.isArray(msg.properties)
          ? msg.properties.filter(
              (property): property is PropertyType =>
                typeof property === 'string' && property in PROPERTIES,
            )
          : [];
        // v2
        if (msg.jobSkills) this.jobSkills = msg.jobSkills as JobSkills;
        if (msg.licenses) this.licenses = msg.licenses as JobLicense;
        if (Array.isArray(msg.trainingCompleted)) this.trainingCompleted = msg.trainingCompleted as string[];
        this.currentWeight = calculateInventoryWeight(this.localInventory);
        this.refreshUI();

        // Первый welcome приходит до авторизации. Второй, после auth, уже несёт сохранение игрока.
        if (!this.hasAuthenticated) {
          this.hasAuthenticated = true;
          this.sendGameMessage({ type: 'auth', token: getOrCreatePlayerToken() });
        }

        if (Array.isArray(msg.players)) {
          const initial = new Map<string, { x: number; y: number }>();
          for (const p of msg.players) {
            if (isPeerSnapshot(p)) {
              initial.set(p.id, { x: p.x, y: p.y });
              if (p.id !== this.myId) this.remotes.ensure(p.id, p.x, p.y);
            }
          }
          this.remotes.pushSnapshot(initial);
        }

        if (Array.isArray(msg.bottles)) {
          for (const b of msg.bottles) this.spawnBottleClient(b as ServerBottle);
        }
        break;
      }

      case 'map-reload': {
        void this.loadMapData();
        for (const img of this.bottlesMap.values()) img.destroy();
        this.bottlesMap.clear();
        if (Array.isArray(msg.bottles)) {
          for (const b of msg.bottles) this.spawnBottleClient(b as ServerBottle);
        }
        break;
      }

      case 'peer-join': {
        if (typeof msg.id === 'string' && msg.id !== this.myId) {
          this.remotes.ensure(msg.id, DEFAULT_SPAWN.x, DEFAULT_SPAWN.y);
          this.updateHud();
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
          this.remotes.ensure(msg.id, msg.x, msg.y);
        }
        break;
      }

      case 'snapshot': {
        if (!Array.isArray(msg.players)) break;
        const players = new Map<string, { x: number; y: number }>();
        for (const p of msg.players) {
          if (typeof p.id === 'string' && isPeerSnapshot(p) && p.id !== this.myId) {
            players.set(p.id, { x: p.x, y: p.y });
          }
        }
        this.remotes.pushSnapshot(players);
        break;
      }

      case 'leave': {
        if (typeof msg.id === 'string') {
          this.remotes.remove(msg.id);
          this.updateHud();
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
          const p = this.remotes.sprites.get(pickerId);
          if (p) this.float('Подобрал!', p.x, p.y - 25, '#ff3333');
        }
        break;
      }

      case 'pickup-success': {
        this.localInventory = msg.inventory as (InventoryItem | null)[];
        this.currentWeight = msg.weight as number;
        this.removeBottleClient(msg.bottleId as string);
        this.refreshUI();
        SoundEffects.playPopSound();
        this.float(msg.message as string, this.player.x, this.player.y - 20, '#7cfc00');
        break;
      }

      case 'pickup-failed': {
        const bottleId = msg.bottleId as string;
        if ((msg.reason as string) === 'already-taken') {
          this.removeBottleClient(bottleId);
          this.float('ОПЕРЕДИЛИ!', this.player.x, this.player.y - 20, '#ff3333');
        } else {
          const img = this.bottlesMap.get(bottleId);
          if (img) img.setVisible(true);
          this.float(msg.message as string, this.player.x, this.player.y - 20, '#ff9900');
        }
        break;
      }

      case 'sell-success': {
        this.localMoney = msg.money as number;
        this.localInventory = msg.inventory as (InventoryItem | null)[];
        this.currentWeight = msg.weight as number;
        this.refreshUI();
        SoundEffects.playCoinSound();
        this.float(msg.message as string, this.player.x, this.player.y - 20, '#ffd700');
        this.cameras.main.shake(150, 0.005);
        break;
      }

      case 'sell-failed':
        this.float(msg.message as string, this.player.x, this.player.y - 20, '#ff3333');
        break;

      case 'job-success': {
        if (typeof msg.money === 'number') this.localMoney = msg.money;
        // update skill if provided
        if (msg.skill && msg.jobType) {
          const jt = msg.jobType as JobType;
          (this.jobSkills as any)[jt] = msg.skill;
        }
        this.updateHud();
        SoundEffects.playCoinSound();
        this.float(msg.message as string, this.player.x, this.player.y - 30, '#7cfc00');
        if (msg.leveledUp) {
          this.cameras.main.flash(200, 120, 255, 120);
          SoundEffects.playUpgradeSound();
        }
        break;
      }

      case 'job-failed':
        this.float(msg.message as string, this.player.x, this.player.y - 20, '#ff9900');
        break;

      case 'job-started':
        this.float(`Старт: ${msg.jobType}`, this.player.x, this.player.y - 25, '#4aa8ff');
        break;

      case 'training-success': {
        if (typeof msg.money === 'number') this.localMoney = msg.money;
        if (msg.jobSkills) this.jobSkills = msg.jobSkills as JobSkills;
        if (msg.licenses) this.licenses = msg.licenses as JobLicense;
        if (Array.isArray(msg.trainingCompleted)) this.trainingCompleted = msg.trainingCompleted as string[];
        this.updateHud();
        SoundEffects.playUpgradeSound();
        this.float(msg.message as string, this.player.x, this.player.y - 35, '#7cfc00');
        break;
      }
      case 'training-failed':
        this.float(msg.message as string, this.player.x, this.player.y - 20, '#ff5555');
        break;

      case 'property-success': {
        if (typeof msg.money === 'number') this.localMoney = msg.money;
        if (Array.isArray(msg.properties)) {
          this.properties = msg.properties.filter(
            (property): property is PropertyType =>
              typeof property === 'string' && property in PROPERTIES,
          );
        }
        this.updateHud();
        SoundEffects.playUpgradeSound();
        this.float(msg.message as string, this.player.x, this.player.y - 30, '#d8b4fe');
        break;
      }

      case 'property-failed':
        this.float(msg.message as string, this.player.x, this.player.y - 20, '#ff9900');
        break;

      case 'passive-income': {
        if (typeof msg.money === 'number') this.localMoney = msg.money;
        this.updateHud();
        SoundEffects.playCoinSound();
        this.float(msg.message as string, this.player.x, this.player.y - 35, '#d8b4fe');
        break;
      }

      case 'upgrade-success': {
        this.backpackTier = msg.backpackTier as number;
        this.localMoney = msg.money as number;
        this.refreshUI();
        SoundEffects.playUpgradeSound();
        this.float(msg.message as string, this.player.x, this.player.y - 30, '#ffd700');
        this.cameras.main.shake(200, 0.008);
        break;
      }

      case 'upgrade-failed':
        this.float(msg.message as string, this.player.x, this.player.y - 20, '#ff3333');
        break;

      case 'buy-food-success': {
        this.localMoney = msg.money as number;
        this.updateHud();
        const item = msg.itemType as string;
        if (item === 'shawarma') {
          this.stamina = STAMINA_MAX;
          this.isExhausted = false;
          this.shawarmaBuffTimer = SHAWARMA_BUFF_SEC;
          SoundEffects.playEatSound();
        } else if (item === 'energy') {
          this.energyDrinkBuffTimer = ENERGY_BUFF_SEC;
          SoundEffects.playDrinkSound();
        }
        this.float(msg.message as string, this.player.x, this.player.y - 30, '#7cfc00');
        break;
      }

      case 'buy-food-failed':
        this.float(msg.message as string, this.player.x, this.player.y - 20, '#ff3333');
        break;

      case 'steal-result': {
        if (msg.success && msg.inventory) {
          this.localInventory = msg.inventory as (InventoryItem | null)[];
          this.currentWeight = msg.weight as number;
          this.refreshUI();
          SoundEffects.playPopSound();
          this.float(msg.message as string, this.player.x, this.player.y - 20, '#7cfc00');
        } else {
          this.float(msg.message as string, this.player.x, this.player.y - 20, '#ff3333');
        }
        break;
      }

      case 'give-money-result': {
        this.localMoney = msg.money as number;
        this.updateHud();
        SoundEffects.playCoinSound();
        this.float(msg.message as string, this.player.x, this.player.y - 20, '#ffd700');
        break;
      }

      case 'player-receive-money': {
        this.localMoney = msg.money as number;
        this.updateHud();
        SoundEffects.playCoinSound();
        this.float(msg.message as string, this.player.x, this.player.y - 20, '#ffd700');
        break;
      }

      case 'player-notice':
        this.float(`⚠️ ${msg.message as string}`, this.player.x, this.player.y - 30, '#ff9900');
        break;

      case 'trade-offer':
        showTradeOfferPopup(
          msg.fromId as string,
          msg.itemType as InventoryItem,
          () => this.sendGameMessage({ type: 'trade-accept', fromId: msg.fromId, slotIndex: -1 }),
          () => this.sendGameMessage({ type: 'trade-decline', fromId: msg.fromId }),
        );
        break;

      case 'trade-sent':
        this.float(msg.message as string, this.player.x, this.player.y - 20, '#4aa8c8');
        break;

      case 'trade-complete': {
        this.localInventory = msg.inventory as (InventoryItem | null)[];
        this.currentWeight = msg.weight as number;
        this.refreshUI();
        SoundEffects.playUpgradeSound();
        this.float(msg.message as string, this.player.x, this.player.y - 20, '#7cfc00');
        break;
      }

      case 'trade-failed':
        this.float(msg.message as string, this.player.x, this.player.y - 20, '#ff3333');
        break;

      case 'trade-declined':
        this.float(msg.message as string, this.player.x, this.player.y - 20, '#ff9900');
        break;

      case 'interaction-failed':
        this.float(msg.message as string, this.player.x, this.player.y - 20, '#ff3333');
        break;

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

    const isSprinting =
      this.input.keyboard!.addKey('SHIFT').isDown && (vx !== 0 || vy !== 0) && !this.isExhausted;

    let moveSpeedLimit = this.hasSneakers ? BASE_WALK_SPEED + SNEAKERS_WALK_BONUS : BASE_WALK_SPEED;
    let sprintSpeedLimit = this.hasSneakers
      ? BASE_SPRINT_SPEED + SNEAKERS_SPRINT_BONUS
      : BASE_SPRINT_SPEED;

    let currentSpeed = moveSpeedLimit;
    if (this.energyDrinkBuffTimer > 0) {
      currentSpeed = sprintSpeedLimit + ENERGY_SPEED_BONUS;
    } else if (isSprinting) {
      currentSpeed = sprintSpeedLimit;
    }

    if (isSprinting && this.shawarmaBuffTimer <= 0) {
      const maxLimit = (BACKPACK_TIERS[this.backpackTier] ?? BACKPACK_TIERS[1]).maxWeight;
      const drainRate = STAMINA_DRAIN_BASE * (1 + this.currentWeight / maxLimit);
      this.stamina = Math.max(0, this.stamina - drainRate * dt);
      if (this.stamina === 0) {
        this.isExhausted = true;
        this.float('УСТАЛ! Передохни!', this.player.x, this.player.y - 20, '#ff3333');
      }
    } else {
      const regenRate = this.hasJacket ? STAMINA_REGEN_JACKET : STAMINA_REGEN_BASE;
      this.stamina = Math.min(STAMINA_MAX, this.stamina + regenRate * dt);
      if (this.isExhausted && this.stamina >= STAMINA_EXHAUST_RECOVER) {
        this.isExhausted = false;
      }
    }

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(vx * currentSpeed, vy * currentSpeed);

    if (vx !== 0 || vy !== 0) {
      this.footstepTimer += delta;
      const stepInterval = isSprinting ? FOOTSTEP_SPRINT_MS : FOOTSTEP_WALK_MS;
      if (this.footstepTimer > stepInterval) {
        this.footstepTimer = 0;
        SoundEffects.playWalkSound();
      }
    }

    if (vx < 0) this.player.play('walk-left', true);
    else if (vx > 0) this.player.play('walk-right', true);
    else if (vy < 0) this.player.play('walk-up', true);
    else if (vy > 0) this.player.play('walk-down', true);
    else {
      this.player.stop();
      this.player.setFrame(0);
    }

    if ((vx !== 0 || vy !== 0) && this.netcode) this.sendMoveThrottled();

    if (Phaser.Input.Keyboard.JustDown(this.keyI) || Phaser.Input.Keyboard.JustDown(this.keyTab)) {
      this.toggleInventory();
    }

    this.updateHud();

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
    let activeFoodCartEntity: MapEntity | null = null;
    let activeClothingShopEntity: MapEntity | null = null;
    let activeJobEntity: MapEntity | null = null;
    let activePropertyEntity: MapEntity | null = null;
    let activeSchoolEntity: MapEntity | null = null;
    let nearestEntityDistance = INTERACT_RADIUS;
    let targetX = this.player.x;
    let targetY = this.player.y;

    if (this.mapJson?.entities) {
      for (const entity of Object.values(this.mapJson.entities)) {
        if (!this.isInteractiveEntity(entity)) continue;

        const kx = entity.cellX * TILE_SIZE + TILE_SIZE_HALF;
        const ky = entity.cellY * TILE_SIZE + TILE_SIZE_HALF;
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, kx, ky);
        if (dist >= nearestEntityDistance) continue;

        nearestEntityDistance = dist;
        targetX = kx;
        targetY = ky;
        activeKioskId = entity.type === 'kiosk' ? entity.id : null;
        activeFoodCartEntity = entity.type === 'food-cart' ? entity : null;
        activeClothingShopEntity = entity.type === 'clothing-shop' ? entity : null;
        activeJobEntity = this.jobTypeForEntity(entity) ? entity : null;
        activePropertyEntity = entity.type === 'property' ? entity : null;
        activeSchoolEntity = entity.type === 'school' ? entity : null;
      }
    }

    this.nearKioskId = activeKioskId;
    this.nearFoodCartEntity = activeFoodCartEntity;
    this.nearClothingShopEntity = activeClothingShopEntity;
    this.nearJobEntity = activeJobEntity;
    this.nearPropertyEntity = activePropertyEntity;
    this.nearSchoolEntity = activeSchoolEntity;
    this.detectNearbyPlayer();

    const nearAnyWorldInteraction =
      this.nearKioskId ||
      this.nearFoodCartEntity ||
      this.nearClothingShopEntity ||
      this.nearJobEntity ||
      this.nearPropertyEntity ||
      this.nearSchoolEntity;
    const nearPlayer = this.nearPlayerId !== null;

    if (nearAnyWorldInteraction || nearPlayer) {
      this.usePrompt.setPosition(targetX, targetY - PROMPT_OFFSET_Y);
      this.usePrompt.setText(this.interactionPrompt());
      this.usePrompt.setVisible(true);

      if (Phaser.Input.Keyboard.JustDown(this.keyE)) {
        if (this.nearSchoolEntity) this.openSchool();
        else if (this.nearJobEntity) this.completeNearbyJob();
        else if (this.nearPropertyEntity) this.buyNearbyProperty();
        else if (nearPlayer && !nearAnyWorldInteraction) this.showPlayerInteractionMenu();
        else this.toggleInventory(true);
      }
    } else {
      this.usePrompt.setVisible(false);
      this.playerMenu.hide();
    }

    this.saveAutosaveTimer += delta;
    if (this.saveAutosaveTimer >= AUTOSAVE_INTERVAL_MS) {
      this.saveAutosaveTimer = 0;
      this.saveGame();
    }

    this.remotes.renderInterpolated(now, this.myId);
  }

  // ============================================================
  //  SECTION: SAVE SYSTEM
  // ============================================================

  private saveGame(): void {
    if (!this.player) return;
    savePosition(this.player.x, this.player.y);
  }

  private loadGame(): boolean {
    // Token is created for future server-auth; keep localStorage seeded.
    void getOrCreatePlayerToken();
    const pos = loadPosition();
    if (pos) {
      this.player.setPosition(pos.x, pos.y);
      return true;
    }
    return false;
  }

  // ============================================================
  //  SECTION: JOBS & PROPERTY INTERACTION
  // ============================================================

  private isInteractiveEntity(entity: MapEntity): boolean {
    return (
      entity.type === 'kiosk' ||
      entity.type === 'food-cart' ||
      entity.type === 'clothing-shop' ||
      entity.type === 'school' ||
      this.jobTypeForEntity(entity) !== null ||
      entity.type === 'property'
    );
  }

  private jobTypeForEntity(entity: MapEntity): JobType | null {
    if (entity.type === 'job-courier' || entity.type === 'courier-hub') return 'courier';
    if (entity.type === 'job-lemonade' || entity.type === 'lemonade-stand') return 'lemonade';
    if (
      entity.type === 'job-trash-sort' ||
      entity.type === 'job-trash' ||
      entity.type === 'trash-sort-station'
    ) return 'trash-sort';
    return null;
  }

  private propertyTypeForEntity(entity: MapEntity): PropertyType | null {
    const propertyType = entity.properties.propertyType;
    if (propertyType && propertyType in PROPERTIES) return propertyType;
    return null;
  }

  private interactionPrompt(): string {
    if (this.nearSchoolEntity) return '[E] Войти в школу профессий';

    const jobType = this.nearJobEntity ? this.jobTypeForEntity(this.nearJobEntity) : null;
    if (jobType === 'courier') {
      return this.licenses.courier
        ? '[E] Работать курьером'
        : '[E] Нужно образование курьера — иди в школу';
    }
    if (jobType === 'lemonade') {
      return this.licenses.lemonadeBusiness
        ? '[E] Продавать лимонад'
        : '[E] Нужно образование продавца — иди в школу';
    }
    if (jobType === 'trash-sort') {
      return this.licenses.trashSort
        ? '[E] Сортировать мусор'
        : '[E] Нужно образование сортировщика — иди в школу';
    }

    if (this.nearPropertyEntity) {
      const propertyType = this.propertyTypeForEntity(this.nearPropertyEntity);
      if (propertyType) {
        const property = PROPERTIES[propertyType];
        return this.properties.includes(propertyType)
          ? `[E] ${property.name}: куплено`
          : `[E] Купить ${property.name}: $${property.price}`;
      }
    }

    if (this.nearKioskId) return '[E] Сдать бутылки';
    if (this.nearFoodCartEntity) return '[E] Купить еду';
    if (this.nearClothingShopEntity) return '[E] Магазин одежды';
    return '[E] Игрок';
  }

  private completeNearbyJob(): void {
    if (!this.nearJobEntity) return;
    const jobType = this.jobTypeForEntity(this.nearJobEntity);
    if (!jobType) return;

    // Проверка лицензий
    if (jobType === 'courier' && !this.licenses.courier) {
      this.float('Нужно образование курьера. Найди здание школы 🎓', this.player.x, this.player.y - 30, '#ff9900');
      return;
    }
    if (jobType === 'trash-sort' && !this.licenses.trashSort) {
      this.float('Нужно образование сортировщика. Найди здание школы 🎓', this.player.x, this.player.y - 30, '#ff9900');
      return;
    }
    if (jobType === 'lemonade' && !this.licenses.lemonadeBusiness) {
      this.float('Нужно образование продавца лимонада. Найди здание школы 🎓', this.player.x, this.player.y - 30, '#ff9900');
      return;
    }

    // Запуск реальной мини-игры
    const finish = (score: number) => {
      this.sendGameMessage({ type: 'job-submit', jobType, score });
    };
    if (jobType === 'trash-sort') {
      this.jobUI.showTrashSort(finish, ()=>{});
    } else if (jobType === 'courier') {
      this.jobUI.showCourier(finish, ()=>{});
    } else if (jobType === 'lemonade') {
      this.jobUI.showLemonade(finish, ()=>{});
    }
  }

  private openSchool(): void {
    this.jobUI.showSchool(
      this.localMoney,
      this.jobSkills,
      this.licenses,
      this.trainingCompleted,
      (courseId) => {
        this.sendGameMessage({ type: 'training-buy', courseId });
        this.jobUI.destroy();
        setTimeout(()=>this.openSchool(), 600);
      },
      ()=>{}
    );
  }

  private buyNearbyProperty(): void {
    if (!this.nearPropertyEntity) return;
    const propertyType = this.propertyTypeForEntity(this.nearPropertyEntity);
    if (!propertyType) {
      this.float('У этой точки не задан тип недвижимости.', this.player.x, this.player.y - 20, '#ff3333');
      return;
    }
    if (this.properties.includes(propertyType)) {
      this.float('Эта недвижимость уже куплена.', this.player.x, this.player.y - 20, '#d8b4fe');
      return;
    }
    this.sendGameMessage({ type: 'buy-property', propertyType });
  }

  // ============================================================
  //  SECTION: PLAYER INTERACTION
  // ============================================================

  private detectNearbyPlayer(): void {
    this.nearPlayerId = null;
    if (!this.myId) return;

    let closestId: string | null = null;
    let closestDist = INTERACT_RADIUS;

    for (const [id, sprite] of this.remotes.sprites.entries()) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, sprite.x, sprite.y);
      if (dist < closestDist) {
        closestDist = dist;
        closestId = id;
      }
    }
    if (closestId) this.nearPlayerId = closestId;
  }

  private showPlayerInteractionMenu(): void {
    this.playerMenu.show(
      (action) => {
        if (action === 'steal') this.attemptSteal();
        else if (action === 'trade') this.initiateTrade();
        else if (action === 'give') this.initiateGiveMoney();
      },
      () => this.playerMenu.hide(),
    );
  }

  private attemptSteal(): void {
    if (!this.nearPlayerId) return;
    this.playerMenu.hide();
    this.sendGameMessage({ type: 'player-interaction', action: 'steal', targetId: this.nearPlayerId });
    this.float('Пытаемся украсть…', this.player.x, this.player.y - 30, '#ff9900');
  }

  private initiateTrade(): void {
    if (!this.nearPlayerId) return;
    this.playerMenu.hide();
    this.float('Открой инвентарь и выбери предмет для обмена', this.player.x, this.player.y - 30, '#4aa8c8');
    this.tradeTargetId = this.nearPlayerId;
    this.toggleInventory(true);
  }

  private initiateGiveMoney(): void {
    if (!this.nearPlayerId) return;
    this.playerMenu.hide();

    const amountStr = prompt(`Сколько денег дать? (у тебя $${this.localMoney.toFixed(2)})`, '1.00');
    if (!amountStr) return;
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0 || amount > this.localMoney) {
      this.float('Неверная сумма!', this.player.x, this.player.y - 20, '#ff3333');
      return;
    }

    this.sendGameMessage({
      type: 'player-interaction',
      action: 'give-money',
      targetId: this.nearPlayerId,
      amount,
    });
    this.float(`Отправлено: $${amount.toFixed(2)}`, this.player.x, this.player.y - 30, '#ffd700');
  }

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
    this.float('Предложение обмена отправлено!', this.player.x, this.player.y - 30, '#4aa8c8');
  }

  // ============================================================
  //  SECTION: DROP ITEMS
  // ============================================================

  private dropItem(slotIdx: number): void {
    const item = this.localInventory[slotIdx];
    if (!item) return;

    if (isBag(item) && this.equippedBag === item) {
      this.float('Сначала сними сумку!', this.player.x, this.player.y - 20, '#ff9900');
      return;
    }

    this.localInventory[slotIdx] = null;
    this.currentWeight = calculateInventoryWeight(this.localInventory);

    const dropOffset = 40;
    const dropX = this.player.x + (Math.random() - 0.5) * dropOffset;
    const dropY = this.player.y + 20;
    this.spawnDroppedItemOnGround(item, dropX, dropY);

    SoundEffects.playPopSound();
    this.refreshUI();
    this.float(`Выброшено: ${getItemName(item)}`, this.player.x, this.player.y - 30, '#ff9900');
    this.saveGame();
  }

  private spawnDroppedItemOnGround(item: InventoryItem, x: number, y: number): void {
    const spriteKey = getItemSpriteKey(item);
    const img = this.add.image(x, y, spriteKey);
    img.setScale(DROP_ITEM_SCALE);
    img.setDepth(80);

    this.tweens.add({
      targets: img,
      y: y - 3,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const dropId = `drop_${Math.random().toString(36).slice(2, 10)}`;
    img.setData('dropId', dropId);
    img.setData('dropItem', item);
    this.bottlesMap.set(dropId, img);
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
      setTimeout(() => this.netcode?.send(msg), this.simulatedLagMs);
    } else {
      this.netcode.send(msg);
    }
  }

  // ============================================================
  //  SECTION: HTML UI
  // ============================================================

  private toggleInventory(force?: boolean): void {
    this.isInventoryOpen = force !== undefined ? force : !this.isInventoryOpen;
    this.updateDashboard();
  }

  private updateDashboard(): void {
    if (!this.isInventoryOpen) {
      this.dashboard.destroy();
      return;
    }

    const ctx = this.dashboardContext();
    const cb = this.dashboardCallbacks();
    this.dashboard.show(ctx, cb);
  }

  private dashboardContext(): DashboardContext {
    return {
      nearKiosk: !!this.nearKioskId,
      nearFoodCart: !!this.nearFoodCartEntity,
      nearClothingShop: !!this.nearClothingShopEntity,
      inventory: this.localInventory,
      backpackTier: this.backpackTier,
      equippedBag: this.equippedBag,
      currentWeight: this.currentWeight,
      tradeMode: !!this.tradeTargetId,
    };
  }

  private dashboardCallbacks(): DashboardCallbacks {
    return {
      onClose: () => this.toggleInventory(false),
      onSave: () => {
        this.saveGame();
        this.float('Игра сохранена!', this.player.x, this.player.y - 30, '#7cfc00');
      },
      onSellAll: () => this.sendGameMessage({ type: 'sell-all-bottles' }),
      onBuyItem: (itemKey, cost) => this.buyItemToInventory(itemKey, cost),
      onBuyClothing: (type, cost) => this.buyClothingItem(type, cost),
      onUnequipBag: () => this.unequipBag(),
      onUseSlot: (slotIdx, item) => {
        if (this.tradeTargetId) {
          this.handleTradeClick(slotIdx);
          return;
        }
        if (isBag(item)) this.equipBagFromInventory(slotIdx, item);
        else if (isFood(item)) this.useFoodFromInventory(slotIdx, item);
        else if (this.nearKioskId) this.sendGameMessage({ type: 'sell-slot', slotIndex: slotIdx });
        else this.float('Используй автомат, чтобы сдать!', this.player.x, this.player.y - 20, '#ff9900');
      },
      onDropSlot: (slotIdx) => this.dropItem(slotIdx),
      onStartDrag: (e, slotIdx, item) => {
        this.dragDrop.start(
          e,
          slotIdx,
          item,
          () => getActiveSlotsCount(this.backpackTier),
          (to) => this.finishDrag(to),
        );
      },
      onFinishDrag: (to) => this.finishDrag(to),
      onCancelDrag: () => this.dragDrop.cancel(),
      isDragActive: () => this.dragDrop.state.active,
      getDragFromSlot: () => this.dragDrop.state.fromSlot,
    };
  }

  private buyItemToInventory(itemKey: string, cost: number): void {
    if (this.localMoney < cost) {
      this.float('Недостаточно денег!', this.player.x, this.player.y - 30, '#ff3333');
      return;
    }

    const activeSlotsCount = getActiveSlotsCount(this.backpackTier);
    let freeSlotIdx = -1;
    for (let i = 0; i < activeSlotsCount; i++) {
      if (this.localInventory[i] === null) {
        freeSlotIdx = i;
        break;
      }
    }

    if (freeSlotIdx === -1) {
      this.float('Инвентарь полон! Освободи слоты.', this.player.x, this.player.y - 30, '#ff3333');
      return;
    }

    this.localMoney -= cost;
    this.localInventory[freeSlotIdx] = itemKey as InventoryItem;
    SoundEffects.playCoinSound();
    this.refreshUI();
    this.float(
      `Куплено: ${itemKey === 'shawarma' ? 'Шаурма' : itemKey === 'energy' ? 'Ягуар' : 'Сумка'}!`,
      this.player.x,
      this.player.y - 30,
      '#7cfc00',
    );
  }

  private buyClothingItem(type: 'jacket' | 'sneakers' | 'crown', cost: number): void {
    if (this.localMoney < cost) {
      this.float('Недостаточно денег!', this.player.x, this.player.y - 30, '#ff3333');
      return;
    }

    if (type === 'jacket' && this.hasJacket) return;
    if (type === 'sneakers' && this.hasSneakers) return;
    if (type === 'crown' && this.hasCrown) return;

    this.localMoney -= cost;

    if (type === 'jacket') {
      this.hasJacket = true;
      this.float(
        'Одета Куртка Adidas! Энергия копится на 50% быстрее!',
        this.player.x,
        this.player.y - 30,
        '#7cfc00',
      );
    } else if (type === 'sneakers') {
      this.hasSneakers = true;
      this.float(
        'Одеты Кроссовки Nike! Твоя скорость выросла на 30%!',
        this.player.x,
        this.player.y - 30,
        '#7cfc00',
      );
    } else if (type === 'crown') {
      this.hasCrown = true;
      this.player.setTint(0xffd700);
      this.float('Ты надел Золотую Корону! Король улиц!', this.player.x, this.player.y - 30, '#ffd700');
    }

    SoundEffects.playUpgradeSound();
    this.refreshUI();
  }

  private equipBagFromInventory(slotIdx: number, itemType: 'bag-adidas' | 'backpack-tourist'): void {
    if (this.equippedBag) {
      this.float('Сначала сними старую сумку!', this.player.x, this.player.y - 30, '#ff9900');
      return;
    }

    this.localInventory[slotIdx] = null;
    this.equippedBag = itemType;
    this.backpackTier = bagToTier(itemType);

    this.sendGameMessage({ type: 'upgrade-backpack', tier: this.backpackTier });
    SoundEffects.playUpgradeSound();
    this.refreshUI();
    this.float(
      `Экипировано: ${itemType === 'bag-adidas' ? 'Сумка Adidas (15кг)' : 'Рюкзак туриста (30кг)'}!`,
      this.player.x,
      this.player.y - 30,
      '#7cfc00',
    );
  }

  private unequipBag(): void {
    if (!this.equippedBag) return;

    let freeSlotIdx = -1;
    for (let i = 0; i < 4; i++) {
      if (this.localInventory[i] === null) {
        freeSlotIdx = i;
        break;
      }
    }

    if (freeSlotIdx === -1) {
      this.float(
        'Освободи карманы (первые 4 слота), чтобы снять сумку!',
        this.player.x,
        this.player.y - 30,
        '#ff3333',
      );
      return;
    }

    if (this.currentWeight > BACKPACK_TIERS[1].maxWeight) {
      this.float('Разгрузи рюкзак до 2.5кг, чтобы снять сумку!', this.player.x, this.player.y - 30, '#ff3333');
      return;
    }

    const removedBag = this.equippedBag;
    this.equippedBag = null;
    this.backpackTier = 1;
    this.localInventory[freeSlotIdx] = removedBag;

    this.sendGameMessage({ type: 'upgrade-backpack', tier: 1 });
    SoundEffects.playUpgradeSound();
    this.refreshUI();
    this.float('Сумка снята и убрана в карман!', this.player.x, this.player.y - 30, '#ff9900');
  }

  private useFoodFromInventory(slotIdx: number, itemType: 'shawarma' | 'energy'): void {
    this.localInventory[slotIdx] = null;

    if (itemType === 'shawarma') {
      this.stamina = STAMINA_MAX;
      this.isExhausted = false;
      this.shawarmaBuffTimer = SHAWARMA_BUFF_SEC;
      SoundEffects.playEatSound();
      this.float(
        'Ты съел сытную шаурму! Выносливость восстановлена на 100%!',
        this.player.x,
        this.player.y - 30,
        '#ffd700',
      );
    } else {
      this.energyDrinkBuffTimer = ENERGY_BUFF_SEC;
      SoundEffects.playDrinkSound();
      this.float(
        'Выпит Ягуар! Ты получил заряд бешеной скорости!',
        this.player.x,
        this.player.y - 30,
        '#ffd700',
      );
    }

    this.refreshUI();
  }

  private finishDrag(toSlot: number): void {
    const fromSlot = this.dragDrop.state.fromSlot;
    if (fromSlot === toSlot || fromSlot < 0) return;

    const temp = this.localInventory[fromSlot];
    this.localInventory[fromSlot] = this.localInventory[toSlot];
    this.localInventory[toSlot] = temp;

    this.currentWeight = calculateInventoryWeight(this.localInventory);
    this.refreshUI();
  }

  private updateHud(): void {
    this.hud.update({
      money: this.localMoney,
      currentWeight: this.currentWeight,
      backpackTier: this.backpackTier,
      stamina: this.stamina,
      isExhausted: this.isExhausted,
      energyDrinkBuffTimer: this.energyDrinkBuffTimer,
      shawarmaBuffTimer: this.shawarmaBuffTimer,
      remoteCount: this.remotes.size,
    });
  }

  private refreshUI(): void {
    this.updateHud();
    if (this.isInventoryOpen) {
      this.dashboard.show(this.dashboardContext(), this.dashboardCallbacks());
    }
  }

  private destroyHTMLOverlays(): void {
    this.hud.destroy();
    this.dashboard.destroy();
    this.playerMenu.hide();
    this.dragDrop.cancel();
    removeAllTradePopups();

    const pulseStyle = document.getElementById('hud-pulse-style');
    if (pulseStyle) pulseStyle.remove();
  }

  // ============================================================
  //  SECTION: BOTTLES
  // ============================================================

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
      ease: 'Sine.easeInOut',
    });

    this.bottlesMap.set(b.id, img);
  }

  private removeBottleClient(id: string): void {
    const img = this.bottlesMap.get(id);
    if (!img) return;
    this.tweens.add({
      targets: img,
      scale: 0.05,
      alpha: 0,
      angle: 180,
      duration: 200,
      onComplete: () => img.destroy(),
    });
    this.bottlesMap.delete(id);
  }

  // ============================================================
  //  SECTION: HELPERS
  // ============================================================

  private float(text: string, x: number, y: number, color = '#4caf6a'): void {
    showFloatingText(this, text, x, y, color);
  }
}
