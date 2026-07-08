import Phaser from 'phaser';
import { connectNetcode, type NetcodeClient, type NetcodeMessage } from '../systems/Netcode';

const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 2000;
const MOVE_SPEED = 220;
const SEND_INTERVAL_MS = 50;
const REMOTE_TINT = 0xff6b6b;
const REMOTE_BORDER = 0xaaffff;
const DEFAULT_SPAWN = { x: 400, y: 300 };

type PeerSnapshot = { id: string; x: number; y: number };

export class WorldScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private netcode?: NetcodeClient;
  private hudText!: Phaser.GameObjects.Text;
  private lastSentAt = 0;
  private myId: string | null = null;
  private remotePlayers = new Map<string, Phaser.GameObjects.Rectangle>();

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

    // Placeholder игрок — локальный зелёный квадратик 32×32.
    this.player = this.add.rectangle(DEFAULT_SPAWN.x, DEFAULT_SPAWN.y, 32, 32, 0x7cfc00);
    this.player.setStrokeStyle(2, 0xffffff);

    // HUD
    this.hudText = this.add.text(16, 16, this.hudContent(), {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#7cfc00',
      backgroundColor: '#000000aa',
      padding: { x: 8, y: 4 },
    });
    this.hudText.setScrollFactor(0);
    this.hudText.setDepth(1000);

    // Сетка-фон: TileSprite с одной тайл-текстурой 64×64.
    // Фикс пропадающих клеточек справа (WebGL precision на длинных Graphics-линиях).
    this.buildGridBackground();

    // Камера
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    this.cameras.main.setBackgroundColor('#0a0a0a');
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // Подключение к серверу — все сообщения идут в единый обработчик.
    this.netcode = connectNetcode((msg) => this.handleServerMessage(msg));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.netcode?.close();
    });

    console.log('[MoneyRoll] World ready. WASD / стрелки — двигайся.');
  }

  private buildGridBackground(): void {
    if (this.textures.exists('grid-tile')) return;

    // Off-screen graphics → генерация текстуры 64×64.
    const tmp = this.add.graphics({ x: -1000, y: -1000 });
    tmp.lineStyle(1, 0x2a2a2a, 0.6);
    tmp.lineBetween(0, 0, 64, 0);  // top border
    tmp.lineBetween(0, 0, 0, 64);  // left border
    tmp.generateTexture('grid-tile', 64, 64);
    tmp.destroy();

    const bg = this.add.tileSprite(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 'grid-tile');
    bg.setOrigin(0, 0);
    bg.setDepth(-1);
  }

  // ───── HUD ─────

  private hudContent(): string {
    return `$5 · 0/5 · you: ${this.myId ?? '...'} · players: ${this.remotePlayers.size}`;
  }

  private refreshHud(): void {
    if (this.hudText && this.hudText.active) {
      this.hudText.setText(this.hudContent());
    }
  }

  // ───── Netcode ─────

  private handleServerMessage(msg: NetcodeMessage): void {
    switch (msg.type) {
      case 'welcome': {
        if (typeof msg.id === 'string') {
          this.myId = msg.id;
          console.log('[MoneyRoll] my id =', msg.id);
          if (Array.isArray(msg.players)) {
            for (const p of msg.players) {
              if (this.isPeerSnapshot(p)) {
                this.spawnOrUpdateRemote(p.id, p.x, p.y);
              }
            }
          }
          this.refreshHud();
        }
        break;
      }
      case 'peer-join': {
        if (typeof msg.id === 'string' && msg.id !== this.myId) {
          // Новый игрок подключился — рисуем на стандартной точке,
          // при первом move координаты обновятся.
          this.spawnOrUpdateRemote(msg.id, DEFAULT_SPAWN.x, DEFAULT_SPAWN.y);
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
          this.spawnOrUpdateRemote(msg.id, msg.x, msg.y);
        }
        break;
      }
      case 'leave': {
        if (typeof msg.id === 'string') {
          this.removeRemote(msg.id);
        }
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

  // ───── Remote players ─────

  private spawnOrUpdateRemote(id: string, x: number, y: number): void {
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

  // ───── Movement ─────

  update(_time: number, delta: number): void {
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

    this.player.x = Phaser.Math.Clamp(this.player.x + vx * MOVE_SPEED * dt, 16, WORLD_WIDTH - 16);
    this.player.y = Phaser.Math.Clamp(this.player.y + vy * MOVE_SPEED * dt, 16, WORLD_HEIGHT - 16);

    if ((vx !== 0 || vy !== 0) && this.netcode) {
      this.sendMoveThrottled();
    }
  }

  private sendMoveThrottled(): void {
    const now = performance.now();
    if (now - this.lastSentAt < SEND_INTERVAL_MS) return;
    this.lastSentAt = now;
    this.netcode?.send({ type: 'move', x: this.player.x, y: this.player.y });
  }
}
