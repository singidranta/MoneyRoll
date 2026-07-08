import Phaser from 'phaser';
import { connectNetcode, type NetcodeClient, type NetcodeMessage } from '../systems/Netcode';

const MAP_PIXEL_W = 12800;   // 200 * 64
const MAP_PIXEL_H = 12800;
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
  private netcode?: NetcodeClient;
  private hudText!: Phaser.GameObjects.Text;
  private networkPanel!: Phaser.GameObjects.Text;
  private lastSentAt = 0;
  private myId: string | null = null;
  private remotePlayers = new Map<string, Phaser.GameObjects.Rectangle>();
  private snapshotBuffer: SnapshotEntry[] = [];

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

    this.player = this.add.rectangle(DEFAULT_SPAWN.x, DEFAULT_SPAWN.y, 32, 32, 0x7cfc00);
    this.player.setStrokeStyle(2, 0xffffff);

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

    // Пересчитать позицию при ресайзе
    this.scale.on('resize', () => this.positionNetworkPanel());

    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    this.cameras.main.setBackgroundColor('#0a0a0a');
    this.cameras.main.setBounds(0, 0, MAP_PIXEL_W, MAP_PIXEL_H);

    this.netcode = connectNetcode((msg) => this.handleServerMessage(msg));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.netcode?.close();
    });

    void this.loadNetwork();

    console.log('[MoneyRoll] World ready. WASD / стрелки — движение.');
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

  private renderNetworkPanel(info: NetInfo): void {
    const lines: string[] = ['— SHARE WITH FRIENDS —'];
    for (const { iface, ip } of info.ips) {
      lines.push(`http://${ip}:${info.port}  (${iface})`);
    }
    lines.push('(Radmin VPN: используй Radmin-IP из списка)');
    this.networkPanel.setText(lines.join('\n'));
    console.log('%c[MoneyRoll] Share URLs for friends:', 'color:#aaccff;font-weight:bold');
    for (const { iface, ip } of info.ips) {
      console.log(`  http://${ip}:${info.port}  (${iface})`);
    }
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
          // Очищаем буфер интерполяции при переподключении.
          this.snapshotBuffer = [];
          // Сервер прислал начальный снимок игроков — сразу рисуем их.
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
          this.refreshHud();
        }
        break;
      }
      case 'peer-join': {
        if (typeof msg.id === 'string' && msg.id !== this.myId) {
          // Рисуем на стандартной точке; первая же позиция придёт из snapshot.
          this.ensureRemote(msg.id, DEFAULT_SPAWN.x, DEFAULT_SPAWN.y);
        }
        break;
      }
      case 'peer': {
        // Устаревший путь (на случай если сервер ещё на старом протоколе) —
        // мгновенно обновляем ремоут-плеера.
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
        // Новый путь: тик-серверный снапшот, сохраняем в буфер для интерполяции.
        if (Array.isArray(msg.players)) {
          const players = new Map<string, { x: number; y: number }>();
          for (const p of msg.players) {
            if (typeof p.id === 'string' && this.isPeerSnapshot(p) && p.id !== this.myId) {
              players.set(p.id, { x: p.x, y: p.y });
            }
          }
          this.snapshotBuffer.push({ localT: performance.now(), players });
          // Ограничиваем буфер ~30 записями (≈1.5 сек при 20Гц).
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
      default:
        console.log('[MoneyRoll] ws ←', msg);
    }
  }

  private isPeerSnapshot(v: unknown): v is PeerSnapshot {
    if (!v || typeof v !== 'object') return false;
    const p = v as Partial<PeerSnapshot>;
    return typeof p.id === 'string' && typeof p.x === 'number' && typeof p.y === 'number';
  }

  /**
   * Интерполяция: ищем два соседних снапшота A (≤ renderTime) и B (> renderTime),
   * и линейно интерполируем позиции. Если B нет — fallback на A.
   * Принимаем peer-данные из buffer, обрабатываем плавность движения ремоут-плееров.
   */
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

    // Удаляем ремоут-плееров, которых больше нет в снапшотах.
    for (const id of Array.from(this.remotePlayers.keys())) {
      if (!seen.has(id)) {
        this.removeRemote(id);
      }
    }
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

  // ───── Movement ─────

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

    // Интерполяция remote-плееров: вызываем каждый кадр.
    this.renderRemoteInterpolated(now);
  }

  private sendMoveThrottled(): void {
    const now = performance.now();
    if (now - this.lastSentAt < SEND_INTERVAL_MS) return;
    this.lastSentAt = now;
    this.netcode?.send({ type: 'move', x: this.player.x, y: this.player.y });
  }
}
