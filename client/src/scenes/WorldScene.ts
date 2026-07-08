import Phaser from 'phaser';
import { connectNetcode, type NetcodeClient, type NetcodeMessage } from '../systems/Netcode';
import { loadMap } from '../systems/MapSystem';
import { BOTTLE_TYPES, MAX_INVENTORY_WEIGHT, INVENTORY_SLOTS, type BottleType, type ServerBottle } from '../../../shared/economy';
import { MAP_WIDTH, MAP_HEIGHT, TILE_SIZE, type MapDocument } from '../../../shared/map';

const MAP_PIXEL_W = MAP_WIDTH * TILE_SIZE; // 30 * 128 = 3840
const MAP_PIXEL_H = MAP_HEIGHT * TILE_SIZE;
const MOVE_SPEED = 240;
const SEND_INTERVAL_MS = 50;
const SNAPSHOT_INTERP_DELAY_MS = 100;
const REMOTE_TINT = 0xff6b6b;
const REMOTE_BORDER = 0xaaffff;
const DEFAULT_SPAWN = { x: 400, y: 300 };

type PeerSnapshot = { id: string; x: number; y: number };
type SnapshotEntry = {
  localT: number;
  players: Map<string, { x: number; y: number }>;
};

type NetInfo = { ips: Array<{ iface: string; ip: string }>; port: number };

export class WorldScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyI!: Phaser.Input.Keyboard.Key;
  private keyTab!: Phaser.Input.Keyboard.Key;
  
  private netcode?: NetcodeClient;
  private networkPanel!: Phaser.GameObjects.Text;
  private lastSentAt = 0;
  private myId: string | null = null;
  private remotePlayers = new Map<string, Phaser.GameObjects.Rectangle>();
  private snapshotBuffer: SnapshotEntry[] = [];

  // Игровая логика и сущности
  private localMoney = 5.0;
  private localInventory: (BottleType | null)[] = Array(INVENTORY_SLOTS).fill(null);
  private currentWeight = 0.0;

  private mapJson: MapDocument | null = null;
  private groundTileSprite?: Phaser.GameObjects.TileSprite;
  
  private bottlesMap = new Map<string, Phaser.GameObjects.Image>();
  private kiosksSpritesMap = new Map<string, Phaser.GameObjects.GameObject>();
  private npcSpritesList: Phaser.GameObjects.GameObject[] = [];
  private buildingSpritesList: Phaser.GameObjects.GameObject[] = [];

  // Неткод-фишка: симуляция пинга
  private simulatedLagMs = 0;

  // HTML UI элементы
  private hudOverlayEl?: HTMLDivElement;
  private inventoryEl?: HTMLDivElement;

  private isInventoryOpen = false;
  private nearKioskId: string | null = null;

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

    // Фоновая трава по всей карте 30х30
    this.groundTileSprite = this.add.tileSprite(
      MAP_PIXEL_W / 2,
      MAP_PIXEL_H / 2,
      MAP_PIXEL_W,
      MAP_PIXEL_H,
      'tile-ground'
    );
    this.groundTileSprite.setDepth(0);

    // Игрок
    this.player = this.add.rectangle(DEFAULT_SPAWN.x, DEFAULT_SPAWN.y, 36, 36, 0x7cfc00);
    this.player.setStrokeStyle(2, 0xffffff);
    this.player.setDepth(500);

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
    // Отрисовываем только дороги поверх травы
    for (const [key, type] of Object.entries(this.mapJson.tiles)) {
      if (type === 'road') {
        const parts = key.split(',');
        const x = Number(parts[0]);
        const y = Number(parts[1]);
        if (Number.isInteger(x) && Number.isInteger(y)) {
          const rotation = this.mapJson.rotations?.[key] ?? 0;
          const px = x * TILE_SIZE + TILE_SIZE / 2;
          const py = y * TILE_SIZE + TILE_SIZE / 2;
          
          const img = this.add.image(px, py, 'tile-road');
          img.setDepth(1);
          img.setAngle(rotation);
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

    for (const sprite of this.buildingSpritesList) {
      sprite.destroy();
    }
    this.buildingSpritesList = [];

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
      } else if (entity.type === 'building') {
        const buildContainer = this.add.container(px, py);
        buildContainer.setDepth(99);

        const body = this.add.rectangle(0, 0, 110, 110, 0x777788);
        body.setStrokeStyle(3, 0xbbbbcc);

        const label = this.add.text(0, 0, entity.properties.label || 'ЗДАНИЕ', {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#ffffff',
          fontStyle: 'bold'
        }).setOrigin(0.5);

        buildContainer.add([body, label]);
        this.buildingSpritesList.push(buildContainer);
      }
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
          this.updateInventoryUI();
          this.updateHUDUI();

          // Рендерим игроков
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

          // Рендерим бутылки
          if (Array.isArray(msg.bottles)) {
            for (const b of msg.bottles) {
              this.spawnBottleClient(b as ServerBottle);
            }
          }
        }
        break;
      }

      case 'map-reload': {
        console.log('[MoneyRoll] Карта была обновлена в редакторе! Авто-перезагрузка...');
        void this.loadMapData();
        
        // Перерисовываем бутылки
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
          // Восстанавливаем видимость
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

      default:
        console.log('[MoneyRoll] ws ←', msg);
    }
  }

  private isPeerSnapshot(v: unknown): v is PeerSnapshot {
    if (!v || typeof v !== 'object') return false;
    const p = v as Partial<PeerSnapshot>;
    return typeof p.id === 'string' && typeof p.x === 'number' && typeof p.y === 'number';
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

  // ───── Spawners ─────

  private spawnBottleClient(b: ServerBottle): void {
    if (this.bottlesMap.has(b.id)) return;

    const def = BOTTLE_TYPES[b.type];
    if (!def) return;

    const img = this.add.image(b.x, b.y, def.spriteKey);
    img.setScale(0.85);
    img.setDepth(100);

    // Парение бутылки
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

  // ───── Floating Text ─────

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
      rect = this.add.rectangle(x, y, 36, 36, REMOTE_TINT);
      rect.setStrokeStyle(2, REMOTE_BORDER);
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

  // ───── Movement & Interaction ─────

  update(_time: number, delta: number): void {
    const now = performance.now();
    const dt = Math.min(delta, 100) / 1000;

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

    this.player.x = Phaser.Math.Clamp(this.player.x + vx * MOVE_SPEED * dt, 18, MAP_PIXEL_W - 18);
    this.player.y = Phaser.Math.Clamp(this.player.y + vy * MOVE_SPEED * dt, 18, MAP_PIXEL_H - 18);

    if ((vx !== 0 || vy !== 0) && this.netcode) {
      this.sendMoveThrottled();
    }

    // Горячие клавиши инвентаря
    if (Phaser.Input.Keyboard.JustDown(this.keyI) || Phaser.Input.Keyboard.JustDown(this.keyTab)) {
      this.toggleInventory();
    }

    // ───── Подбор бутылок при соприкосновении ─────
    for (const [id, img] of this.bottlesMap.entries()) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, img.x, img.y);
      if (dist < 48) {
        if (img.visible) {
          // Предсказание на клиенте: скрываем бутылку
          img.setVisible(false);
          this.sendGameMessage({ type: 'pickup-bottle', bottleId: id });
        }
      }
    }

    // ───── Взаимодействие с автоматами сдачи ─────
    let activeKioskId: string | null = null;
    if (this.mapJson && this.mapJson.entities) {
      for (const entity of Object.values(this.mapJson.entities)) {
        if (entity.type === 'kiosk') {
          const kx = entity.cellX * TILE_SIZE + TILE_SIZE / 2;
          const ky = entity.cellY * TILE_SIZE + TILE_SIZE / 2;
          const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, kx, ky);
          if (dist < 100) {
            activeKioskId = entity.id;
            break;
          }
        }
      }
    }

    this.nearKioskId = activeKioskId;

    const kioskPrompt = document.getElementById('kiosk-prompt-indicator');
    if (kioskPrompt) {
      if (this.nearKioskId) {
        kioskPrompt.style.display = 'block';
        if (Phaser.Input.Keyboard.JustDown(this.keyE)) {
          this.openKioskUI();
        }
      } else {
        kioskPrompt.style.display = 'none';
        this.closeKioskUI();
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
    hud.style.background = 'rgba(10,10,10,0.85)';
    hud.style.color = '#7cfc00';
    hud.style.border = '2px solid #7cfc00';
    hud.style.borderRadius = '6px';
    hud.style.padding = '10px 14px';
    hud.style.fontFamily = 'monospace';
    hud.style.fontSize = '14px';
    hud.style.zIndex = '9999';
    hud.style.lineHeight = '1.5';
    hud.style.boxShadow = '0 2px 10px rgba(0,0,0,0.5)';

    hud.innerHTML = `
      <div style="font-weight:bold; font-size:16px; margin-bottom:4px; color:#fff;">🎒 MONEYROLL HUD</div>
      <div id="hud-money">Баланс: $5.00</div>
      <div id="hud-weight">Вес сумки: 0.0 / 8.0 кг</div>
      <div style="width: 150px; background: #333; height: 6px; border-radius: 3px; margin: 4px 0 8px 0; overflow:hidden;">
        <div id="hud-weight-bar" style="background:#7cfc00; width:0%; height:100%; transition: width 0.2s;"></div>
      </div>
      <div style="font-size:12px; color:#aaa;">Игроков рядом: <span id="hud-players">1</span></div>
      <div style="font-size:11px; color:#ff9900; margin-top:2px;">Клавиша L: лаг-симулятор (${this.simulatedLagMs}мс)</div>
      <button id="btn-toggle-inv" style="margin-top:10px; width:100%; padding:6px; background:#7cfc00; color:#050505; border:none; border-radius:3px; font-weight:bold; cursor:pointer;">ИНВЕНТАРЬ (I)</button>
      
      <!-- Индикатор автомата сдачи -->
      <div id="kiosk-prompt-indicator" style="display:none; margin-top:10px; background:rgba(255,215,0,0.2); color:#ffd700; border:1px solid #ffd700; padding:6px; border-radius:3px; text-align:center; font-weight:bold; animation: pulse 1s infinite alternate;">
        [E] ОТКРЫТЬ АВТОМАТ СДАЧИ
      </div>
    `;

    document.body.appendChild(hud);
    this.hudOverlayEl = hud;

    hud.querySelector('#btn-toggle-inv')?.addEventListener('click', () => {
      this.toggleInventory();
    });

    // Добавляем стиль для анимации индикатора
    const style = document.createElement('style');
    style.id = 'hud-pulse-style';
    style.innerHTML = `
      @keyframes pulse {
        from { opacity: 0.7; }
        to { opacity: 1; transform: scale(1.02); }
      }
    `;
    document.head.appendChild(style);
  }

  private createHTMLInventory(): void {
    this.removeHTMLInventory();

    const inv = document.createElement('div');
    inv.id = 'game-inventory-panel';
    inv.style.position = 'fixed';
    inv.style.left = '50%';
    inv.style.top = '50%';
    inv.style.transform = 'translate(-50%, -50%)';
    inv.style.background = 'rgba(20,20,20,0.98)';
    inv.style.border = '3px solid #7cfc00';
    inv.style.borderRadius = '8px';
    inv.style.padding = '18px';
    inv.style.fontFamily = 'monospace';
    inv.style.zIndex = '99999';
    inv.style.boxShadow = '0 5px 25px rgba(0,0,0,0.8)';
    inv.style.display = 'none'; // По умолчанию закрыт
    inv.style.pointerEvents = 'auto';

    inv.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid #333; padding-bottom:6px;">
        <span style="font-weight:bold; font-size:15px; color:#7cfc00; letter-spacing:1px;">🎒 МОЙ РЮКЗАК (3х4 слота)</span>
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
    kiosk.style.left = '50%';
    kiosk.style.top = '10%';
    kiosk.style.transform = 'translateX(-50%)';
    kiosk.style.background = 'rgba(15,15,15,0.98)';
    kiosk.style.border = '3px solid #ffd700';
    kiosk.style.borderRadius = '8px';
    kiosk.style.padding = '15px';
    kiosk.style.width = '310px';
    kiosk.style.fontFamily = 'monospace';
    kiosk.style.zIndex = '99999';
    kiosk.style.boxShadow = '0 5px 25px rgba(0,0,0,0.8)';
    kiosk.style.pointerEvents = 'auto';

    kiosk.innerHTML = `
      <h3 style="margin-top:0; border-bottom:2px solid #ffd700; padding-bottom:6px; color:#ffd700; text-align:center;">🏪 АВТОМАТ СДАЧИ БУТЫЛОК</h3>
      <p style="font-size:12px; color:#ccc; line-height:1.4; margin-bottom:12px; text-align:center;">
        Сдавай стеклотару в автомат! Кликни по бутылке в инвентаре, чтобы сдать её поштучно, либо нажми кнопку ниже.
      </p>
      
      <button id="btn-recycle-all" style="width:100%; padding:10px; background:#ffd700; color:#111; border:none; border-radius:4px; font-weight:bold; cursor:pointer; font-size:14px; letter-spacing:1px; margin-bottom:8px;">♻️ СДАТЬ ВСЕ БУТЫЛКИ</button>
      <button id="btn-close-kiosk" style="width:100%; padding:6px; background:#444; color:#fff; border:none; border-radius:4px; cursor:pointer;">Закрыть</button>
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

  private updateHUDUI(): void {
    if (!this.hudOverlayEl) return;

    const moneyEl = this.hudOverlayEl.querySelector('#hud-money');
    if (moneyEl) moneyEl.innerHTML = `Баланс: <strong style="color:#fff;">$${this.localMoney.toFixed(2)}</strong>`;

    const weightEl = this.hudOverlayEl.querySelector('#hud-weight');
    if (weightEl) weightEl.innerHTML = `Вес сумки: <strong style="color:#fff;">${this.currentWeight.toFixed(1)}</strong> / ${MAX_INVENTORY_WEIGHT} кг`;

    const weightBar = this.hudOverlayEl.querySelector('#hud-weight-bar') as HTMLDivElement;
    if (weightBar) {
      const pct = Math.min((this.currentWeight / MAX_INVENTORY_WEIGHT) * 100, 100);
      weightBar.style.width = `${pct}%`;
      weightBar.style.background = pct > 85 ? '#ff3333' : pct > 60 ? '#ffd700' : '#7cfc00';
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
      slot.style.background = 'rgba(50,50,50,0.5)';
      slot.style.border = '2px solid #555';
      slot.style.borderRadius = '6px';
      slot.style.display = 'flex';
      slot.style.alignItems = 'center';
      slot.style.justifyContent = 'center';
      slot.style.position = 'relative';
      slot.style.cursor = item ? 'pointer' : 'default';
      slot.style.transition = 'border-color 0.15s, background 0.15s';

      if (item) {
        slot.style.border = '2px solid #7cfc00';
        slot.style.background = 'rgba(124,252,0,0.1)';

        const def = BOTTLE_TYPES[item];
        const webpPath = `/assets/props/flat/bottles/${item}.webp`;

        // Картинка бутылки
        slot.innerHTML = `
          <img src="${webpPath}" style="max-width:48px; max-height:48px; object-fit:contain;" />
          <div style="position:absolute; right:4px; bottom:2px; font-size:10px; color:#fff; background:#000000aa; padding:1px 3px; border-radius:2px;">
            ${def.weight}кг
          </div>
        `;

        // Клик по слоту сдаёт бутылку (если открыт киоск)
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

    const weightStatus = this.inventoryEl.querySelector('#inv-weight-status');
    if (weightStatus) {
      weightStatus.textContent = `Вес: ${this.currentWeight.toFixed(1)} / ${MAX_INVENTORY_WEIGHT} кг`;
    }
  }

  private destroyHTMLOverlays(): void {
    this.removeHTMLHUD();
    this.removeHTMLInventory();
    this.removeKioskUI();

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
}
