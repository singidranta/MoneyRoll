import Phaser from 'phaser';
import { connectNetcode, type NetcodeClient, type NetcodeMessage } from '../systems/Netcode';
import { loadMap } from '../systems/MapSystem';
import { BOTTLE_TYPES, INVENTORY_SLOTS, type BottleType, type ServerBottle } from '../../../shared/economy';
import { MAP_WIDTH, MAP_HEIGHT, TILE_SIZE, type MapDocument } from '../../../shared/map';

const MAP_PIXEL_W = MAP_WIDTH * TILE_SIZE; // 30 * 128 = 3840
const MAP_PIXEL_H = MAP_HEIGHT * TILE_SIZE;
const SEND_INTERVAL_MS = 50;
const SNAPSHOT_INTERP_DELAY_MS = 100;
const REMOTE_TINT = 0xffaacc; // Розовый оттенок для других игроков
const DEFAULT_SPAWN = { x: 400, y: 300 };
const MOVE_SPEED = 240;

type PeerSnapshot = { id: string; x: number; y: number };
type SnapshotEntry = {
  localT: number;
  players: Map<string, { x: number; y: number }>;
};

type NetInfo = { ips: Array<{ iface: string; ip: string }>; port: number };

export class WorldScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite; // Персонаж теперь анимированный спрайт!
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyI!: Phaser.Input.Keyboard.Key;
  private keyTab!: Phaser.Input.Keyboard.Key;
  
  private netcode?: NetcodeClient;
  private networkPanel!: Phaser.GameObjects.Text;
  private lastSentAt = 0;
  private myId: string | null = null;
  private remotePlayers = new Map<string, Phaser.GameObjects.Sprite>();
  private snapshotBuffer: SnapshotEntry[] = [];

  // Игровая логика и сущности
  private localMoney = 5.0;
  private localInventory: (BottleType | null)[] = Array(INVENTORY_SLOTS).fill(null);
  private currentWeight = 0.0;
  private backpackTier = 1; // 1 = Пакет, 2 = Сумка Adidas, 3 = Рюкзак туриста

  // Система выносливости (Stamina)
  private stamina = 100.0;
  private isExhausted = false;

  // Временные баффы
  private energyDrinkBuffTimer = 0.0; // Суперскорость
  private shawarmaBuffTimer = 0.0; // Безлимитная энергия

  private mapJson: MapDocument | null = null;
  private groundTileSprite?: Phaser.GameObjects.TileSprite;
  
  private bottlesMap = new Map<string, Phaser.GameObjects.Image>();
  private kiosksSpritesMap = new Map<string, Phaser.GameObjects.GameObject>();
  private npcSpritesList: Phaser.GameObjects.GameObject[] = [];
  private staticTileImages: Phaser.GameObjects.Image[] = [];

  // Физика (Препятствия/Коллизии)
  private obstaclesGroup!: Phaser.Physics.Arcade.StaticGroup;

  // Неткод-фишка: симуляция пинга
  private simulatedLagMs = 0;

  // HTML UI элементы
  private hudOverlayEl?: HTMLDivElement;
  private inventoryEl?: HTMLDivElement;
  private foodCartEl?: HTMLDivElement;

  private isInventoryOpen = false;
  private nearKioskId: string | null = null;
  private nearFoodCartEntity: any = null; // Текущий ларёк рядом

  constructor() {
    super({ key: 'World' });
  }

  create(): void {
    const kb = this.input.keyboard;
    if (!kb) {
      console.error('[MoneyRoll] клавиатура недоступна');
      return;
    }
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
    this.keyE = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyI = kb.addKey(Phaser.Input.Keyboard.KeyCodes.I);
    this.keyTab = kb.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);

    // Фоновая трава по всей карте 30х30 в качестве основы
    this.groundTileSprite = this.add.tileSprite(
      MAP_PIXEL_W / 2,
      MAP_PIXEL_H / 2,
      MAP_PIXEL_W,
      MAP_PIXEL_H,
      'tile-ground-grass'
    );
    this.groundTileSprite.setDepth(0);

    // Персонаж — сочный детализированный WebP спрайт!
    this.player = this.add.sprite(DEFAULT_SPAWN.x, DEFAULT_SPAWN.y, 'player');
    this.player.setScale(0.85);
    this.player.setDepth(500);

    // Создаем анимации ходьбы из атласа spritesheet
    if (!this.anims.exists('walk-down')) {
      this.anims.create({
        key: 'walk-down',
        frames: this.anims.generateFrameNumbers('player-sprites', { start: 0, end: 3 }),
        frameRate: 10,
        repeat: -1
      });
      this.anims.create({
        key: 'walk-left',
        frames: this.anims.generateFrameNumbers('player-sprites', { start: 4, end: 7 }),
        frameRate: 10,
        repeat: -1
      });
      this.anims.create({
        key: 'walk-right',
        frames: this.anims.generateFrameNumbers('player-sprites', { start: 8, end: 11 }),
        frameRate: 10,
        repeat: -1
      });
      this.anims.create({
        key: 'walk-up',
        frames: this.anims.generateFrameNumbers('player-sprites', { start: 12, end: 15 }),
        frameRate: 10,
        repeat: -1
      });
    }

    // Инициализируем физику для игрока
    this.physics.add.existing(this.player);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);
    body.setSize(48, 48); // уменьшаем хитбокс для комфортного прохода между клетками

    // Инициализируем статическую группу для физических коллизий (Стены, Квартиры)
    this.obstaclesGroup = this.physics.add.staticGroup();
    this.physics.add.collider(this.player, this.obstaclesGroup);

    // Панель «поделиться с друзьями» — справа вверху
    this.networkPanel = this.add.text(0, 0, '[network…]', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#aaccff',
      backgroundColor: '#000000aa',
      padding: { x: 8, y: 6 },
      align: 'right',
    });
    this.networkPanel.setOrigin(1, 0);
    this.networkPanel.setScrollFactor(0);
    this.networkPanel.setDepth(1000);
    this.positionNetworkPanel();

    this.scale.on('resize', () => this.positionNetworkPanel());

    // Настройка камеры
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    this.cameras.main.setBackgroundColor('#0a0a0a');
    this.cameras.main.setBounds(0, 0, MAP_PIXEL_W, MAP_PIXEL_H);

    // Подключение к серверу
    this.netcode = connectNetcode((msg) => this.handleServerMessage(msg));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.netcode?.close();
      this.destroyHTMLOverlays();
    });

    // Обработка кнопки L для неткод симуляции
    kb.on('keydown-L', () => {
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
    });

    // Создание HTML HUD и инвентаря
    this.createHTMLHUD();
    this.createHTMLInventory();

    void this.loadNetwork();
    void this.loadMapData();

    console.log('[MoneyRoll] World ready. I — инвентарь, E — автомат сдачи, L — пинг.');
  }

  private positionNetworkPanel(): void {
    const pad = 16;
    this.networkPanel.setPosition(
      this.scale.width - pad,
      pad
    );
  }

  private async loadNetwork(): Promise<void> {
    try {
      const res = await fetch('/api/network');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const info = (await res.json()) as NetInfo;
      this.renderNetworkPanel(info);
    } catch (err) {
      this.networkPanel.setText('[network info unavailable]');
    }
  }

  private renderNetworkPanel(info: NetInfo): void {
    const lines: string[] = ['— MULTIPLAYER ACCESS —'];
    for (const { iface, ip } of info.ips) {
      lines.push(`http://${ip}:${info.port}  (${iface})`);
    }
    lines.push('(Для игры с друзьями: используй Radmin VPN)');
    this.networkPanel.setText(lines.join('\n'));
  }

  private async loadMapData(): Promise<void> {
    try {
      this.mapJson = await loadMap();
      this.renderMapTiles();
      this.renderMapEntities();
    } catch (err) {
      console.warn('[MoneyRoll] failed to load map tiles:', err);
    }
  }

  private renderMapTiles(): void {
    if (!this.mapJson) return;

    // Очищаем старые тайлы
    for (const img of this.staticTileImages) {
      img.destroy();
    }
    this.staticTileImages = [];

    // Отрисовываем тайлы поверх основы
    for (const [key, type] of Object.entries(this.mapJson.tiles)) {
      const parts = key.split(',');
      const x = Number(parts[0]);
      const y = Number(parts[1]);
      if (Number.isInteger(x) && Number.isInteger(y)) {
        const rotation = this.mapJson.rotations?.[key] ?? 0;
        const px = x * TILE_SIZE + TILE_SIZE / 2;
        const py = y * TILE_SIZE + TILE_SIZE / 2;
        
        const spriteKey = `tile-${type}`;
        
        if (type !== 'ground-grass') {
          const img = this.add.image(px, py, spriteKey);
          img.setDepth(1);
          img.setAngle(rotation);
          this.staticTileImages.push(img);
        }
      }
    }
  }

  private renderMapEntities(): void {
    if (!this.mapJson) return;
    if (!this.mapJson.entities) this.mapJson.entities = {};

    // Очищаем старые спрайты объектов
    for (const k of this.kiosksSpritesMap.values()) {
      k.destroy();
    }
    this.kiosksSpritesMap.clear();

    for (const sprite of this.npcSpritesList) {
      sprite.destroy();
    }
    this.npcSpritesList = [];

    // Полностью очищаем физическую группу коллизий, чтобы пересоздать её без дубликатов
    this.obstaclesGroup.clear(true, true);

    // Рендерим сущности из единой карты
    for (const entity of Object.values(this.mapJson.entities)) {
      const px = entity.cellX * TILE_SIZE + TILE_SIZE / 2;
      const py = entity.cellY * TILE_SIZE + TILE_SIZE / 2;

      if (entity.type === 'kiosk') {
        const kioskSprite = this.add.image(px, py, 'recycle-machine');
        kioskSprite.setScale(1.15);
        kioskSprite.setDepth(100);
        kioskSprite.setAngle(entity.rotation);

        // Зеленое свечение
        const glow = this.add.graphics();
        glow.fillStyle(0x00ff66, 0.08);
        glow.fillCircle(px, py, 140);
        glow.setDepth(10);

        this.kiosksSpritesMap.set(entity.id, kioskSprite);
      } else if (entity.type === 'food-cart') {
        // Ларёк с шаурмой
        const kioskSprite = this.add.image(px, py, 'food-cart');
        kioskSprite.setScale(1.0);
        kioskSprite.setDepth(100);
        kioskSprite.setAngle(entity.rotation);

        this.kiosksSpritesMap.set(entity.id, kioskSprite);
      } else if (entity.type === 'apartment-1' || entity.type === 'apartment-2' || entity.type === 'wall' || entity.type === 'building') {
        // Твердые препятствия (Квартиры, Стены) — добавляем их в физическую группу статических препятствий!
        const spriteKey = entity.type;
        const obstacle = this.obstaclesGroup.create(px, py, spriteKey);
        obstacle.setScale(1.0);
        obstacle.setAngle(entity.rotation);
        obstacle.setDepth(90);
        obstacle.refreshBody(); // Обновляем физическое тело статического объекта
      } else if (entity.type === 'npc') {
        const npcContainer = this.add.container(px, py);
        npcContainer.setDepth(101);

        const body = this.add.rectangle(0, 0, 48, 48, 0x00ccff);
        body.setStrokeStyle(2, 0xffffff);

        const label = this.add.text(0, -35, entity.properties.label || 'NPC', {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#00ccff',
          backgroundColor: '#000000aa',
          padding: { x: 4, y: 2 }
        }).setOrigin(0.5);

        npcContainer.add([body, label]);
        this.npcSpritesList.push(npcContainer);
      }
    }
  }

  // ───── Netcode ─────

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
          this.updateInventoryUI();
          this.updateHUDUI();

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
        console.log('[MoneyRoll] Карта была обновлена! Перерисовываем...');
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
        this.updateInventoryUI();
        this.updateHUDUI();
        this.showFloatingText(text, this.player.x, this.player.y - 30, '#7cfc00');
        break;
      }

      case 'pickup-failed': {
        const bottleId = msg.bottleId as string;
        const reason = msg.reason as string;
        const text = msg.message as string;

        if (reason === 'already-taken') {
          this.removeBottleClient(bottleId);
          this.showFloatingText('ОПЕРЕДИЛИ!', this.player.x, this.player.y - 30, '#ff3333');
        } else {
          const img = this.bottlesMap.get(bottleId);
          if (img) img.setVisible(true);
          this.showFloatingText(text, this.player.x, this.player.y - 30, '#ff9900');
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

        this.updateInventoryUI();
        this.updateHUDUI();
        
        this.showFloatingText(text, this.player.x, this.player.y - 35, '#ffd700');
        this.cameras.main.shake(150, 0.005);
        break;
      }

      case 'sell-failed': {
        const text = msg.message as string;
        this.showFloatingText(text, this.player.x, this.player.y - 30, '#ff3333');
        break;
      }

      // Новые обработчики еды и улучшений
      case 'upgrade-success': {
        const tier = msg.backpackTier as number;
        const money = msg.money as number;
        const text = msg.message as string;

        this.backpackTier = tier;
        this.localMoney = money;

        this.updateInventoryUI();
        this.updateHUDUI();
        this.updateFoodCartUI(); // Обновляем цены/кнопки в магазине

        this.showFloatingText(text, this.player.x, this.player.y - 40, '#ffd700');
        this.cameras.main.shake(200, 0.008);
        break;
      }

      case 'upgrade-failed': {
        const text = msg.message as string;
        this.showFloatingText(text, this.player.x, this.player.y - 30, '#ff3333');
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
          this.shawarmaBuffTimer = 20.0; // Безлимитная выносливость на 20 сек
        } else if (item === 'energy') {
          this.energyDrinkBuffTimer = 30.0; // Суперскорость на 30 сек
        }

        this.showFloatingText(text, this.player.x, this.player.y - 40, '#7cfc00');
        break;
      }

      case 'buy-food-failed': {
        const text = msg.message as string;
        this.showFloatingText(text, this.player.x, this.player.y - 30, '#ff3333');
        break;
      }

      default:
        console.log('[MoneyRoll] ws ←', msg);
    }
  }

  // ───── Spawners ─────

  private spawnBottleClient(b: ServerBottle): void {
    if (this.bottlesMap.has(b.id)) return;

    const def = BOTTLE_TYPES[b.type];
    if (!def) return;

    const img = this.add.image(b.x, b.y, def.spriteKey);
    img.setScale(0.85);
    img.setDepth(100);

    this.tweens.add({
      targets: img,
      y: b.y - 8,
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
        scale: 0.1,
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

  // ───── Movement & Interaction ─────

  update(_time: number, delta: number): void {
    const now = performance.now();
    const dt = Math.min(delta, 100) / 1000;

    // Снижаем таймеры баффов
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

    // Рассчитываем скорость (Базовая / Спринт / Баффы)
    const isSprinting = this.input.keyboard!.addKey('SHIFT').isDown && (vx !== 0 || vy !== 0) && !this.isExhausted;
    
    let currentSpeed = MOVE_SPEED; // 240
    if (this.energyDrinkBuffTimer > 0) {
      currentSpeed = 440; // Суперскорость под баффом ягуара!
    } else if (isSprinting) {
      currentSpeed = 350; // Обычный спринт
    }

    // Логика выносливости (Stamina)
    if (isSprinting && this.shawarmaBuffTimer <= 0) {
      // Расход энергии зависит от веса мешка!
      const drainRate = 18 * (1 + this.currentWeight / (this.backpackTier === 1 ? 8.0 : this.backpackTier === 2 ? 15.0 : 30.0));
      this.stamina = Math.max(0, this.stamina - drainRate * dt);
      if (this.stamina === 0) {
        this.isExhausted = true;
        this.showFloatingText('УСТАЛ! Передохни!', this.player.x, this.player.y - 30, '#ff3333');
      }
    } else {
      // Восстановление энергии
      this.stamina = Math.min(100, this.stamina + 12 * dt);
      if (this.isExhausted && this.stamina >= 20) {
        this.isExhausted = false; // Можно снова бегать!
      }
    }

    // Движение через Arcade Physics! Полностью блокирует хождение сквозь Стены и Квартиры!
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(vx * currentSpeed, vy * currentSpeed);

    // Проигрывание анимации в зависимости от направления движения
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
      this.player.setFrame(0); // Остановка в кадре по умолчанию (стоит прямо)
    }

    if ((vx !== 0 || vy !== 0) && this.netcode) {
      this.sendMoveThrottled();
    }

    // Горячие клавиши инвентаря
    if (Phaser.Input.Keyboard.JustDown(this.keyI) || Phaser.Input.Keyboard.JustDown(this.keyTab)) {
      this.toggleInventory();
    }

    // Обновляем HUD и полоску выносливости
    this.updateHUDUI();

    // ───── Подбор бутылок при соприкосновении ─────
    for (const [id, img] of this.bottlesMap.entries()) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, img.x, img.y);
      if (dist < 48) {
        if (img.visible) {
          img.setVisible(false);
          this.sendGameMessage({ type: 'pickup-bottle', bottleId: id });
        }
      }
    }

    // ───── Взаимодействие с объектами карты (Киоски, Ларьки Шаурмы) ─────
    let activeKioskId: string | null = null;
    let activeFoodCartEntity: any = null;

    if (this.mapJson && this.mapJson.entities) {
      for (const entity of Object.values(this.mapJson.entities)) {
        const kx = entity.cellX * TILE_SIZE + TILE_SIZE / 2;
        const ky = entity.cellY * TILE_SIZE + TILE_SIZE / 2;
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, kx, ky);

        if (dist < 100) {
          if (entity.type === 'kiosk') {
            activeKioskId = entity.id;
          } else if (entity.type === 'food-cart') {
            activeFoodCartEntity = entity;
          }
          break;
        }
      }
    }

    this.nearKioskId = activeKioskId;
    this.nearFoodCartEntity = activeFoodCartEntity;

    // ───── Авто-закрытие меню при отдалении ─────
    if (!this.nearKioskId && document.getElementById('game-kiosk-panel')) {
      this.closeKioskUI();
      this.toggleInventory(false);
    }
    if (!this.nearFoodCartEntity && document.getElementById('game-food-cart-panel')) {
      this.closeFoodCartUI();
      this.toggleInventory(false);
    }

    // Всплывающие плашки на экране
    const kioskPrompt = document.getElementById('kiosk-prompt-indicator');
    if (kioskPrompt) {
      kioskPrompt.style.display = this.nearKioskId ? 'block' : 'none';
      if (this.nearKioskId && Phaser.Input.Keyboard.JustDown(this.keyE)) {
        this.openKioskUI();
      }
    }

    const foodPrompt = document.getElementById('food-cart-prompt-indicator');
    if (foodPrompt) {
      foodPrompt.style.display = this.nearFoodCartEntity ? 'block' : 'none';
      if (this.nearFoodCartEntity && Phaser.Input.Keyboard.JustDown(this.keyE)) {
        this.openFoodCartUI();
      }
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

  // ───── HTML Overlay Managers ─────

  private createHTMLHUD(): void {
    this.removeHTMLHUD();

    const hud = document.createElement('div');
    hud.id = 'game-hud-overlay';
    hud.style.position = 'fixed';
    hud.style.left = '16px';
    hud.style.top = '16px';
    hud.style.background = "url('/assets/ui/panel-bg.webp') repeat";
    hud.style.color = '#ffffff';
    hud.style.border = '4px solid #7cfc00';
    hud.style.borderRadius = '8px';
    hud.style.padding = '14px 18px';
    hud.style.fontFamily = 'monospace';
    hud.style.fontSize = '14px';
    hud.style.zIndex = '9999';
    hud.style.lineHeight = '1.5';
    hud.style.boxShadow = '0 4px 15px rgba(0,0,0,0.6)';
    hud.style.imageRendering = 'pixelated';

    hud.innerHTML = `
      <div style="font-weight:bold; font-size:16px; margin-bottom:6px; color:#fff; display:flex; align-items:center;">
        <img src="/assets/chars/player.webp" style="width:24px; height:24px; margin-right:8px; border-radius:50%;" /> MONEYROLL HUD
      </div>
      <div id="hud-money" style="display:flex; align-items:center; margin-bottom:4px; font-weight:bold; color:#7cfc00;">
        <img src="/assets/icons/coin.webp" style="width:16px; height:16px; margin-right:6px;" /> Баланс: $5.00
      </div>
      <div id="hud-weight">Сумка: Пакет (0.0 / 8.0 кг)</div>
      
      <!-- Полоска выносливости (Stamina) -->
      <div style="margin-top:6px;">
        <span style="font-size:11px; color:#ccc; display:block; margin-bottom:2px;">⚡ Энергия (Бег: зажми Shift):</span>
        <div style="width: 150px; background: #333; height: 8px; border-radius: 4px; overflow:hidden; border:1px solid #555;">
          <div id="hud-stamina-bar" style="background:#ffd700; width:100%; height:100%; transition: width 0.1s;"></div>
        </div>
      </div>

      <div style="font-size:12px; color:#aaa; margin-top:8px;">Игроков рядом: <span id="hud-players">1</span></div>
      <div style="font-size:11px; color:#ff9900; margin-top:2px;">Клавиша L: лаг-симулятор (${this.simulatedLagMs}мс)</div>
      
      <button id="btn-toggle-inv" style="margin-top:10px; width:100%; padding:8px; background: url('/assets/ui/button-bg.webp') no-repeat center; background-size: 100% 100%; border:none; border-radius:4px; font-weight:bold; cursor:pointer; font-family: monospace; image-rendering: pixelated; color:#000;">ИНВЕНТАРЬ (I)</button>
      
      <!-- Индикатор автомата сдачи -->
      <div id="kiosk-prompt-indicator" style="display:none; margin-top:10px; background:rgba(255,215,0,0.2); color:#ffd700; border:1px solid #ffd700; padding:6px; border-radius:3px; text-align:center; font-weight:bold; animation: pulse 1s infinite alternate;">
        [E] ОТКРЫТЬ АВТОМАТ СДАЧИ
      </div>

      <!-- Индикатор Ларька Шаурмы -->
      <div id="food-cart-prompt-indicator" style="display:none; margin-top:10px; background:rgba(0,204,255,0.2); color:#00ccff; border:1px solid #00ccff; padding:6px; border-radius:3px; text-align:center; font-weight:bold; animation: pulse 1s infinite alternate;">
        [E] ЗАЙТИ К АШОТУ (ШАУРМА / СУМКИ)
      </div>
    `;

    document.body.appendChild(hud);
    this.hudOverlayEl = hud;

    hud.querySelector('#btn-toggle-inv')?.addEventListener('click', () => {
      this.toggleInventory();
    });
  }

  private createHTMLInventory(): void {
    this.removeHTMLInventory();

    const inv = document.createElement('div');
    inv.id = 'game-inventory-panel';
    inv.style.position = 'fixed';
    inv.style.left = '50%';
    inv.style.top = '50%';
    inv.style.transform = 'translate(-50%, -50%)';
    inv.style.background = "url('/assets/ui/panel-bg.webp') repeat";
    inv.style.border = '4px solid #7cfc00';
    inv.style.borderRadius = '8px';
    inv.style.padding = '18px';
    inv.style.fontFamily = 'monospace';
    inv.style.zIndex = '99999';
    inv.style.boxShadow = '0 5px 25px rgba(0,0,0,0.8)';
    inv.style.display = 'none';
    inv.style.pointerEvents = 'auto';
    inv.style.imageRendering = 'pixelated';

    inv.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid #333; padding-bottom:6px;">
        <span style="font-weight:bold; font-size:15px; color:#7cfc00; letter-spacing:1px; display:flex; align-items:center;">
          🎒 МОЙ РЮКЗАК (3х4 слота)
        </span>
        <button id="btn-close-inv" style="background:none; border:none; color:#ff4444; font-weight:bold; cursor:pointer; font-size:16px;">[X]</button>
      </div>
      
      <div id="inventory-grid" style="display:grid; grid-template-columns: repeat(4, 72px); grid-template-rows: repeat(3, 72px); gap: 10px; margin-bottom:12px;">
        <!-- Сюда вставляются слоты динамически -->
      </div>
      
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:#888;">
        <span>Клик по предмету — сдать (у автомата)</span>
        <span id="inv-weight-status">Вес: 0.0 / 8.0 кг</span>
      </div>
    `;

    document.body.appendChild(inv);
    this.inventoryEl = inv;

    inv.querySelector('#btn-close-inv')?.addEventListener('click', () => {
      this.toggleInventory(false);
    });

    this.updateInventoryUI();
  }

  private toggleInventory(force?: boolean): void {
    this.isInventoryOpen = force !== undefined ? force : !this.isInventoryOpen;
    if (this.inventoryEl) {
      this.inventoryEl.style.display = this.isInventoryOpen ? 'block' : 'none';
    }
  }

  private openKioskUI(): void {
    if (!this.nearKioskId) return;
    this.toggleInventory(true); // Всегда открываем инвентарь при открытии киоска

    this.removeKioskUI();

    const kiosk = document.createElement('div');
    kiosk.id = 'game-kiosk-panel';
    kiosk.style.position = 'fixed';
    kiosk.style.left = '10%';
    kiosk.style.top = '50%';
    kiosk.style.transform = 'translateY(-50%)';
    kiosk.style.background = "url('/assets/ui/panel-bg.webp') repeat";
    kiosk.style.border = '4px solid #ffd700';
    kiosk.style.borderRadius = '8px';
    kiosk.style.padding = '18px';
    kiosk.style.width = '310px';
    kiosk.style.fontFamily = 'monospace';
    kiosk.style.zIndex = '99999';
    kiosk.style.boxShadow = '0 5px 25px rgba(0,0,0,0.8)';
    kiosk.style.pointerEvents = 'auto';
    kiosk.style.imageRendering = 'pixelated';

    kiosk.innerHTML = `
      <h3 style="margin-top:0; border-bottom:2px solid #ffd700; padding-bottom:6px; color:#ffd700; text-align:center;">🏪 АВТОМАТ СДАЧИ БУТЫЛОК</h3>
      <p style="font-size:12px; color:#ccc; line-height:1.4; margin-bottom:12px; text-align:center;">
        Сдавай стеклотару в автомат! Кликни по бутылке в инвентаре, чтобы сдать её поштучно, либо нажми кнопку ниже.
      </p>
      
      <button id="btn-recycle-all" style="width:100%; padding:10px; background: url('/assets/ui/button-bg.webp') no-repeat center; background-size: 100% 100%; border:none; color:#000; font-weight:bold; cursor:pointer; font-size:14px; letter-spacing:1px; margin-bottom:8px; font-family: monospace; image-rendering: pixelated;">♻️ СДАТЬ ВСЕ БУТЫЛКИ</button>
      <button id="btn-close-kiosk" style="width:100%; padding:8px; background: url('/assets/ui/button-bg.webp') no-repeat center; background-size: 100% 100%; border:none; color:#ff3333; font-weight:bold; cursor:pointer; font-family: monospace; image-rendering: pixelated;">Закрыть</button>
    `;

    document.body.appendChild(kiosk);

    kiosk.querySelector('#btn-recycle-all')?.addEventListener('click', () => {
      this.sendGameMessage({ type: 'sell-all-bottles' });
    });

    kiosk.querySelector('#btn-close-kiosk')?.addEventListener('click', () => {
      this.closeKioskUI();
    });
  }

  private closeKioskUI(): void {
    this.removeKioskUI();
  }

  // ───── Ларёк Шаурмы и Магазин Улучшений ─────

  private openFoodCartUI(): void {
    if (!this.nearFoodCartEntity) return;
    this.toggleInventory(true); // Открываем рюкзак для наглядности веса

    this.removeFoodCartUI();

    const cart = document.createElement('div');
    cart.id = 'game-food-cart-panel';
    cart.style.position = 'fixed';
    cart.style.right = '10%';
    cart.style.top = '50%';
    cart.style.transform = 'translateY(-50%)';
    cart.style.background = "url('/assets/ui/panel-bg.webp') repeat";
    cart.style.border = '4px solid #00ccff';
    cart.style.borderRadius = '8px';
    cart.style.padding = '18px';
    cart.style.width = '320px';
    cart.style.fontFamily = 'monospace';
    cart.style.zIndex = '99999';
    cart.style.boxShadow = '0 5px 25px rgba(0,0,0,0.8)';
    cart.style.pointerEvents = 'auto';
    cart.style.imageRendering = 'pixelated';

    document.body.appendChild(cart);
    this.foodCartEl = cart;

    this.updateFoodCartUI();
  }

  private updateFoodCartUI(): void {
    if (!this.foodCartEl) return;

    // В зависимости от текущего тира рюкзака, показываем доступные апгрейды
    const upgradeText = this.backpackTier === 1 
      ? `<button id="btn-upgrade-bag-2" style="width:100%; padding:10px; background: url('/assets/ui/button-bg.webp') no-repeat center; background-size: 100% 100%; border:none; color:#000; font-weight:bold; cursor:pointer; margin-bottom:8px; font-family: monospace; image-rendering: pixelated;">👜 Купить Сумку Adidas ($15.00)</button>` 
      : this.backpackTier === 2 
      ? `<button id="btn-upgrade-bag-3" style="width:100%; padding:10px; background: url('/assets/ui/button-bg.webp') no-repeat center; background-size: 100% 100%; border:none; color:#000; font-weight:bold; cursor:pointer; margin-bottom:8px; font-family: monospace; image-rendering: pixelated;">🎒 Купить Рюкзак туриста ($45.00)</button>`
      : `<div style="text-align:center; padding:8px; background:#333; color:#aaa; border-radius:4px; margin-bottom:8px;">У тебя максимальный Рюкзак!</div>`;

    this.foodCartEl.innerHTML = `
      <h3 style="margin-top:0; border-bottom:2px solid #00ccff; padding-bottom:6px; color:#00ccff; text-align:center; display:flex; align-items:center; justify-content:center;">
        <img src="/assets/props/flat/kiosk/food-cart.webp" style="width:24px; height:24px; margin-right:8px;" /> ШАУРМА У АШОТА
      </h3>
      
      <div style="margin-bottom:12px;">
        <strong style="color:#ffd700; display:block; margin-bottom:4px;">🍕 ГОРЯЧЕЕ ПИТАНИЕ:</strong>
        <button id="btn-buy-shawa" style="width:100%; padding:10px; background: url('/assets/ui/button-bg.webp') no-repeat center; background-size: 100% 100%; border:none; color:#000; font-weight:bold; cursor:pointer; margin-bottom:6px; display:flex; justify-content:space-between; font-family: monospace; image-rendering: pixelated;">
          <span>🌯 Сытная Шаурма</span>
          <span>$1.50</span>
        </button>
        <span style="font-size:10px; color:#ccc; display:block; margin-bottom:8px;">Восстанавливает 100% энергии + 20 сек бесконечного спринта!</span>

        <button id="btn-buy-energy" style="width:100%; padding:10px; background: url('/assets/ui/button-bg.webp') no-repeat center; background-size: 100% 100%; border:none; color:#000; font-weight:bold; cursor:pointer; display:flex; justify-content:space-between; font-family: monospace; image-rendering: pixelated;">
          <span>⚡ Энергетик "Ягуар"</span>
          <span>$3.00</span>
        </button>
        <span style="font-size:10px; color:#ccc; display:block;">Даёт безумную суперскорость бега на 30 секунд!</span>
      </div>

      <div style="margin-bottom:12px; border-top:1px solid #333; padding-top:10px;">
        <strong style="color:#7cfc00; display:block; margin-bottom:6px;">🎒 УЛУЧШИТЬ СУМКУ:</strong>
        ${upgradeText}
        <span style="font-size:10px; color:#ccc; display:block;">Увеличение лимита веса: Пакет (8кг) ➔ Сумка (15кг) ➔ Рюкзак (30кг)</span>
      </div>

      <button id="btn-close-food" style="width:100%; padding:8px; background: url('/assets/ui/button-bg.webp') no-repeat center; background-size: 100% 100%; border:none; color:#ff3333; font-weight:bold; cursor:pointer; margin-top:4px; font-family: monospace; image-rendering: pixelated;">Выйти из ларька</button>
    `;

    // Слушатели кликов
    this.foodCartEl.querySelector('#btn-buy-shawa')?.addEventListener('click', () => {
      this.sendGameMessage({ type: 'buy-food', itemType: 'shawarma' });
    });

    this.foodCartEl.querySelector('#btn-buy-energy')?.addEventListener('click', () => {
      this.sendGameMessage({ type: 'buy-food', itemType: 'energy' });
    });

    this.foodCartEl.querySelector('#btn-upgrade-bag-2')?.addEventListener('click', () => {
      this.sendGameMessage({ type: 'upgrade-backpack', tier: 2 });
    });

    this.foodCartEl.querySelector('#btn-upgrade-bag-3')?.addEventListener('click', () => {
      this.sendGameMessage({ type: 'upgrade-backpack', tier: 3 });
    });

    this.foodCartEl.querySelector('#btn-close-food')?.addEventListener('click', () => {
      this.closeFoodCartUI();
    });
  }

  private closeFoodCartUI(): void {
    this.removeFoodCartUI();
  }

  private removeFoodCartUI(): void {
    const existing = document.getElementById('game-food-cart-panel');
    if (existing) existing.remove();
    this.foodCartEl = undefined;
  }

  // ───── HUD ─────

  private updateHUDUI(): void {
    if (!this.hudOverlayEl) return;

    const maxLimit = this.backpackTier === 1 ? 8.0 : this.backpackTier === 2 ? 15.0 : 30.0;
    const bagName = this.backpackTier === 1 ? 'Пакет' : this.backpackTier === 2 ? 'Сумка Adidas' : 'Рюкзак туриста';

    const moneyEl = this.hudOverlayEl.querySelector('#hud-money');
    if (moneyEl) moneyEl.innerHTML = `<img src="/assets/icons/coin.webp" style="width:18px; height:18px; margin-right:6px;" /> Баланс: <strong style="color:#fff;">$${this.localMoney.toFixed(2)}</strong>`;

    const weightEl = this.hudOverlayEl.querySelector('#hud-weight');
    if (weightEl) weightEl.innerHTML = `Сумка: <strong style="color:#fff;">${bagName}</strong> (${this.currentWeight.toFixed(1)} / ${maxLimit} кг)`;

    const weightBar = this.hudOverlayEl.querySelector('#hud-weight-bar') as HTMLDivElement;
    if (weightBar) {
      const pct = Math.min((this.currentWeight / maxLimit) * 100, 100);
      weightBar.style.width = `${pct}%`;
      weightBar.style.background = pct > 85 ? '#ff3333' : pct > 60 ? '#ffd700' : '#7cfc00';
    }

    const staminaBar = this.hudOverlayEl.querySelector('#hud-stamina-bar') as HTMLDivElement;
    if (staminaBar) {
      const pct = Math.min(this.stamina, 100);
      staminaBar.style.width = `${pct}%`;
      staminaBar.style.background = this.energyDrinkBuffTimer > 0 
        ? '#00ccff' 
        : this.shawarmaBuffTimer > 0 
        ? '#ff9900' 
        : this.isExhausted 
        ? '#ff3333' 
        : '#ffd700';
    }

    const playersEl = this.hudOverlayEl.querySelector('#hud-players');
    if (playersEl) playersEl.textContent = `${this.remotePlayers.size + 1}`;
  }

  private updateInventoryUI(): void {
    if (!this.inventoryEl) return;

    const grid = this.inventoryEl.querySelector('#inventory-grid');
    if (!grid) return;

    grid.innerHTML = '';

    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const item = this.localInventory[i];
      const slot = document.createElement('div');
      
      slot.style.width = '70px';
      slot.style.height = '70px';
      slot.style.background = "url('/assets/ui/slot-bg.webp') no-repeat center";
      slot.style.backgroundSize = '100% 100%';
      slot.style.border = 'none';
      slot.style.borderRadius = '6px';
      slot.style.display = 'flex';
      slot.style.alignItems = 'center';
      slot.style.justifyContent = 'center';
      slot.style.position = 'relative';
      slot.style.cursor = item ? 'pointer' : 'default';
      slot.style.imageRendering = 'pixelated';

      if (item) {
        const def = BOTTLE_TYPES[item];
        const webpPath = `/assets/props/flat/bottles/${item}.webp`;

        slot.innerHTML = `
          <img src="${webpPath}" style="max-width:44px; max-height:48px; object-fit:contain;" />
          <div style="position:absolute; right:6px; bottom:6px; font-size:9px; color:#fff; background:#000000aa; padding:1px 3px; border-radius:2px; font-family: monospace;">
            ${def.weight}кг
          </div>
        `;

        slot.addEventListener('click', () => {
          if (this.nearKioskId) {
            this.sendGameMessage({ type: 'sell-slot', slotIndex: i });
          } else {
            this.showFloatingText('Используй автомат, чтобы сдать!', this.player.x, this.player.y - 30, '#ff9900');
          }
        });
      } else {
        slot.innerHTML = `<span style="font-size:9px; color:#444;">${i+1}</span>`;
      }

      grid.appendChild(slot);
    }

    const maxLimit = this.backpackTier === 1 ? 8.0 : this.backpackTier === 2 ? 15.0 : 30.0;
    const weightStatus = this.inventoryEl.querySelector('#inv-weight-status');
    if (weightStatus) {
      weightStatus.textContent = `Вес: ${this.currentWeight.toFixed(1)} / ${maxLimit} кг`;
    }
  }

  private destroyHTMLOverlays(): void {
    this.removeHTMLHUD();
    this.removeHTMLInventory();
    this.removeKioskUI();
    this.removeFoodCartUI();

    const pulseStyle = document.getElementById('hud-pulse-style');
    if (pulseStyle) pulseStyle.remove();
  }

  private removeHTMLHUD(): void {
    const existing = document.getElementById('game-hud-overlay');
    if (existing) existing.remove();
    this.hudOverlayEl = undefined;
  }

  private removeHTMLInventory(): void {
    const existing = document.getElementById('game-inventory-panel');
    if (existing) existing.remove();
    this.inventoryEl = undefined;
  }

  private removeKioskUI(): void {
    const existing = document.getElementById('game-kiosk-panel');
    if (existing) existing.remove();
  }

  private isPeerSnapshot(v: unknown): v is PeerSnapshot {
    if (!v || typeof v !== 'object') return false;
    const p = v as Partial<PeerSnapshot>;
    return typeof p.id === 'string' && typeof p.x === 'number' && typeof p.y === 'number';
  }

  private showFloatingText(text: string, x: number, y: number, color = '#7cfc00'): void {
    const ftext = this.add.text(x, y, text, {
      fontFamily: 'monospace',
      fontSize: '13px',
      color,
      backgroundColor: '#000000dd',
      padding: { x: 6, y: 3 }
    });
    ftext.setOrigin(0.5);
    ftext.setDepth(2000);

    this.tweens.add({
      targets: ftext,
      y: y - 50,
      alpha: 0,
      duration: 1600,
      onComplete: () => ftext.destroy()
    });
  }

  private ensureRemote(id: string, x: number, y: number): void {
    let rect = this.remotePlayers.get(id);
    if (!rect) {
      const newSprite = this.add.sprite(x, y, 'player');
      newSprite.setScale(0.85);
      newSprite.setTint(REMOTE_TINT);
      newSprite.setDepth(500);
      this.remotePlayers.set(id, newSprite);
      this.updateHUDUI();
      rect = newSprite;
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
