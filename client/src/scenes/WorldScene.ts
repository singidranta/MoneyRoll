import Phaser from 'phaser';
import { connectNetcode, type NetcodeClient, type NetcodeMessage } from '../systems/Netcode';
import { loadMap } from '../systems/MapSystem';
import { MAP_WIDTH, MAP_HEIGHT, TILE_SIZE, type MapDocument } from '../../../shared/map';
import { BOTTLE_TYPES, type BottleType, type ServerBottle, type ServerKiosk } from '../../../shared/economy';

const MAP_PIXEL_W = MAP_WIDTH * TILE_SIZE; // 30 * 128 = 3840
const MAP_PIXEL_H = MAP_HEIGHT * TILE_SIZE;
const MOVE_SPEED = 220;
const SEND_INTERVAL_MS = 50;
const SNAPSHOT_INTERP_DELAY_MS = 100;  // буфер для сглаживания
const REMOTE_TINT = 0xff6b6b;
const REMOTE_BORDER = 0xaaffff;
const DEFAULT_SPAWN = { x: 400, y: 300 };

type PeerSnapshot = { id: string; x: number; y: number };
type SnapshotEntry = {
  localT: number;             // performance.now() когда пакет пришёл
  players: Map<string, { x: number; y: number }>;
};

type NetInfo = { ips: Array<{ iface: string; ip: string }>; port: number };

export class WorldScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private keyE!: Phaser.Input.Keyboard.Key;
  private netcode?: NetcodeClient;
  private hudText!: Phaser.GameObjects.Text;
  private networkPanel!: Phaser.GameObjects.Text;
  private lastSentAt = 0;
  private myId: string | null = null;
  private remotePlayers = new Map<string, Phaser.GameObjects.Rectangle>();
  private snapshotBuffer: SnapshotEntry[] = [];
  // Игровая логика и сущности
  private localMoney = 5.0;
  private localInventory: BottleType[] = [];
  private mapJson: MapDocument | null = null;
  private groundTileSprite?: Phaser.GameObjects.TileSprite;
  
  private bottlesMap = new Map<string, Phaser.GameObjects.Image>();
  private kiosksMap = new Map<string, { id: string; x: number; y: number; sprite: Phaser.GameObjects.Image }>();
  private kioskPromptText?: Phaser.GameObjects.Text;

  // Неткод-фишка: симуляция пинга и потерянных пакетов
  private simulatedLagMs = 0;
  private lagIndicatorText?: Phaser.GameObjects.Text;

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

    // Фоновая трава по всей карте 12800х12800
    this.groundTileSprite = this.add.tileSprite(
      MAP_PIXEL_W / 2,
      MAP_PIXEL_H / 2,
      MAP_PIXEL_W,
      MAP_PIXEL_H,
      'tile-ground'
    );
    this.groundTileSprite.setDepth(0);

    this.player = this.add.rectangle(DEFAULT_SPAWN.x, DEFAULT_SPAWN.y, 32, 32, 0x7cfc00);
    this.player.setStrokeStyle(2, 0xffffff);
    this.player.setDepth(500);

    // Подсказка возле игрока для взаимодействия с киосками
    this.kioskPromptText = this.add.text(0, 0, '[E] СДАТЬ БУТЫЛКИ', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#ffd700',
      backgroundColor: '#000000dd',
      padding: { x: 6, y: 3 },
    });
    this.kioskPromptText.setOrigin(0.5, 2.0);
    this.kioskPromptText.setDepth(1000);
    this.kioskPromptText.setVisible(false);

    this.hudText = this.add.text(16, 16, this.hudContent(), {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#7cfc00',
      backgroundColor: '#000000aa',
      padding: { x: 8, y: 4 },
    });
    this.hudText.setScrollFactor(0);
    this.hudText.setDepth(1000);

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

    // Панель симулятора пинга
    this.lagIndicatorText = this.add.text(16, 120, 'Пинг: 0ms (Нажми [L] для переключения лага)', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#ff9900',
      backgroundColor: '#000000dd',
      padding: { x: 6, y: 4 },
    });
    this.lagIndicatorText.setScrollFactor(0);
    this.lagIndicatorText.setDepth(1000);

    // Пересчитать позицию при ресайзе
    this.scale.on('resize', () => this.positionNetworkPanel());

    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    this.cameras.main.setBackgroundColor('#0a0a0a');
    this.cameras.main.setBounds(0, 0, MAP_PIXEL_W, MAP_PIXEL_H);

    // Кастомный курсор — крестик для попадания в клетки
    this.input.setDefaultCursor('crosshair');

    this.netcode = connectNetcode((msg) => this.handleServerMessage(msg));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.netcode?.close();
    });

// Обработка кнопки L для неткод симуляции
    kb.on('keydown-L', () => {
      if (this.simulatedLagMs === 0) {
        this.simulatedLagMs = 150;
      } else if (this.simulatedLagMs === 150) {
        this.simulatedLagMs = 400;
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

    void this.loadNetwork();
    void this.loadMapData();

    console.log('[MoneyRoll] World ready. WASD — движение, E — сдать, L — лаг симулятор.');
  }

  private positionNetworkPanel(): void {
    const pad = 16;
    this.networkPanel.setPosition(
      this.scale.width - pad,
      pad + this.hudText.height + 8,
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
      console.warn('[MoneyRoll] no network info:', err);
    }
  }

  private async loadMapData(): Promise<void> {
    try {
      this.mapJson = await loadMap();
      this.renderMapTiles();
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

  private renderNetworkPanel(info: NetInfo): void {
    const lines: string[] = ['— SHARE WITH FRIENDS —'];
    for (const { iface, ip } of info.ips) {
      lines.push(`http://${ip}:${info.port}  (${iface})`);
    }
    lines.push('(Radmin VPN: используй Radmin-IP из списка)');
    this.networkPanel.setText(lines.join('\n'));
  }



  // ───── HUD ─────

  private hudContent(): string {
    const moneyStr = `$${this.localMoney.toFixed(2)}`;
    const count = this.localInventory.length;
    const invDetails = count > 0 
      ? `[${this.localInventory.map(b => BOTTLE_TYPES[b]?.name.split(' ')[0] || b).join(', ')}]` 
      : 'Пусто';

    return `${moneyStr} · Собрано: ${count}/5 ${invDetails}\nyou: ${this.myId ?? '...'} · players: ${this.remotePlayers.size + 1}`;
  }

  private refreshHud(): void {
    if (this.hudText && this.hudText.active) {
      this.hudText.setText(this.hudContent());
    }
  }

  // ───── Netcode ─────

  private handleServerMessage(msg: NetcodeMessage): void {
    // Внедряем искусственную задержку если включен лаг симулятор
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
          console.log('[MoneyRoll] my id =', msg.id);
          this.snapshotBuffer = [];
          
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

          // Рендерим киоски
          if (Array.isArray(msg.kiosks)) {
            for (const k of msg.kiosks) {
              this.spawnKioskClient(k as ServerKiosk);
            }
          }

          this.refreshHud();
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

      // Новые сообщения игрового процесса
      case 'bottle-spawn': {
        const b = msg.bottle as ServerBottle;
        if (b) this.spawnBottleClient(b);
        break;
      }

      case 'bottle-picked-up': {
        const bottleId = msg.bottleId as string;
        const pickerId = msg.pickerId as string;
        
        // Если это не мы подобрали, удаляем бутылку
        if (pickerId !== this.myId) {
          this.removeBottleClient(bottleId);
          // Визуальный эффект для конкурента
          const p = this.remotePlayers.get(pickerId);
          if (p) {
            this.showFloatingText('Подобрал!', p.x, p.y - 25, '#ff3333');
          }
        }
        break;
      }

      case 'pickup-success': {
        const bottleId = msg.bottleId as string;
        const inv = msg.inventory as BottleType[];
        const text = msg.message as string;

        this.localInventory = inv;
        this.removeBottleClient(bottleId);
        this.refreshHud();
        this.showFloatingText(text, this.player.x, this.player.y - 30, '#7cfc00');
        break;
      }

      case 'pickup-failed': {
        const bottleId = msg.bottleId as string;
        const reason = msg.reason as string;
        const text = msg.message as string;

        // Если бутылка была скрыта (Client-Side Prediction), но подбор не удался - восстанавливаем её!
        if (reason === 'already-taken') {
          this.removeBottleClient(bottleId); // удаляем окончательно
          this.showFloatingText('ОПЕРЕДИЛИ! Сбой неткода!', this.player.x, this.player.y - 30, '#ff3333');
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
        const inv = msg.inventory as BottleType[];
        const text = msg.message as string;

        this.localMoney = money;
        this.localInventory = inv;
        this.refreshHud();
        this.showFloatingText(text, this.player.x, this.player.y - 30, '#ffd700');
        
        // Камера трясётся от радости получения денег!
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

  // ───── Client Spawners ─────

  private spawnBottleClient(b: ServerBottle): void {
    if (this.bottlesMap.has(b.id)) return;

    const def = BOTTLE_TYPES[b.type];
    if (!def) return;

    // Рендерим картинку бутылки
    const img = this.add.image(b.x, b.y, def.spriteKey);
    img.setScale(0.8);
    img.setDepth(100);

    // Добавляем анимацию парения (bobbing)
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
      // Плавное исчезновение при подборе
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

  private spawnKioskClient(k: ServerKiosk): void {
    if (this.kiosksMap.has(k.id)) return;

    const sprite = this.add.image(k.x, k.y, 'recycle-machine');
    sprite.setScale(1.2);
    sprite.setDepth(200);

    // Зона свечения под киоском
    const glow = this.add.graphics();
    glow.fillStyle(0x00ff66, 0.1);
    glow.fillCircle(k.x, k.y, 80);
    glow.setDepth(10);

    this.kiosksMap.set(k.id, { id: k.id, x: k.x, y: k.y, sprite });
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
      duration: 1500,
      onComplete: () => ftext.destroy()
    });
  }

  // ───── Remote players ─────

  private ensureRemote(id: string, x: number, y: number): void {
    let rect = this.remotePlayers.get(id);
    if (!rect) {
      rect = this.add.rectangle(x, y, 32, 32, REMOTE_TINT);
      rect.setStrokeStyle(2, REMOTE_BORDER);
      rect.setDepth(500);
      this.remotePlayers.set(id, rect);
      console.log(`[MoneyRoll] +remote ${id}`);
      this.refreshHud();
    }
    rect.x = x;
    rect.y = y;
  }

  private removeRemote(id: string): void {
    const rect = this.remotePlayers.get(id);
    if (rect) {
      rect.destroy();
      this.remotePlayers.delete(id);
      console.log(`[MoneyRoll] -remote ${id}`);
      this.refreshHud();
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

    this.player.x = Phaser.Math.Clamp(this.player.x + vx * MOVE_SPEED * dt, 16, MAP_PIXEL_W - 16);
    this.player.y = Phaser.Math.Clamp(this.player.y + vy * MOVE_SPEED * dt, 16, MAP_PIXEL_H - 16);

    if ((vx !== 0 || vy !== 0) && this.netcode) {
      this.sendMoveThrottled();
    }

    // Текст симулятора пинга
    if (this.lagIndicatorText) {
      this.lagIndicatorText.setText(`Лаг-симулятор (клавиша L): ${this.simulatedLagMs}ms`);
    }

    // ───── Логика авто-подбора бутылок ─────
    let closestBottleId: string | null = null;
    let closestBottleDist = Infinity;

    for (const [id, img] of this.bottlesMap.entries()) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, img.x, img.y);
      if (dist < 45) {
        // Мы близко! Посылаем запрос на подбор
        if (this.localInventory.length < 5) {
          // Client-Side Prediction: мгновенно скрываем бутылку, чтобы игра чувствовалась отзывчиво!
          img.setVisible(false);
          this.sendGameMessage({ type: 'pickup-bottle', bottleId: id });
        } else {
          // Если инвентарь полон, сообщаем
          if (dist < closestBottleDist) {
            closestBottleDist = dist;
            closestBottleId = id;
          }
        }
      }
    }

    if (closestBottleId && closestBottleDist < 45) {
      this.showFloatingText('Инвентарь полон! Сдай бутылки в киоск!', this.player.x, this.player.y - 30, '#ff9900');
    }

    // ───── Логика взаимодействия с киосками ─────
    let nearKiosk: { id: string; x: number; y: number } | null = null;
    for (const k of this.kiosksMap.values()) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, k.x, k.y);
      if (dist < 85) {
        nearKiosk = k;
        break;
      }
    }

    if (nearKiosk) {
      if (this.kioskPromptText) {
        this.kioskPromptText.setPosition(this.player.x, this.player.y);
        this.kioskPromptText.setVisible(true);
      }

      if (Phaser.Input.Keyboard.JustDown(this.keyE)) {
        if (this.localInventory.length > 0) {
          this.sendGameMessage({ type: 'sell-bottles', kioskId: nearKiosk.id });
        } else {
          this.showFloatingText('У тебя нет бутылок для сдачи!', this.player.x, this.player.y - 30, '#ff9900');
        }
      }
    } else {
      if (this.kioskPromptText) {
        this.kioskPromptText.setVisible(false);
      }
    }

    // Интерполяция remote-плееров
    this.renderRemoteInterpolated(now);
  }

  private sendMoveThrottled(): void {
    const now = performance.now();
    if (now - this.lastSentAt < SEND_INTERVAL_MS) return;
    this.lastSentAt = now;
    this.sendGameMessage({ type: 'move', x: this.player.x, y: this.player.y });
  }

  // Обертка отправки сообщений с учетом симуляции задержки
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
}
