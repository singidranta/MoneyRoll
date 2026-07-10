// ============================================================
//  SECTION: REMOTE PLAYERS + SNAPSHOT INTERPOLATION
// ============================================================

import Phaser from 'phaser';
import {
  PLAYER_SCALE,
  REMOTE_TINT,
  SNAPSHOT_INTERP_DELAY_MS,
} from '../config/WorldConstants';

export type PeerSnapshot = { id: string; x: number; y: number };

export type SnapshotEntry = {
  localT: number;
  players: Map<string, { x: number; y: number }>;
};

// Добавим тип для состояния анимации удалённого игрока
interface RemotePlayerState {
  sprite: Phaser.GameObjects.Sprite;
  prevX: number;
  prevY: number;
  lastMoveTime: number;
  facingDir: 'down' | 'left' | 'right' | 'up';
}

export function isPeerSnapshot(v: unknown): v is PeerSnapshot {
  if (!v || typeof v !== 'object') return false;
  const p = v as Partial<PeerSnapshot>;
  return typeof p.id === 'string' && typeof p.x === 'number' && typeof p.y === 'number';
}

export class RemotePlayers {
  readonly sprites = new Map<string, Phaser.GameObjects.Sprite>();
  private playerStates = new Map<string, RemotePlayerState>();
  snapshotBuffer: SnapshotEntry[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    this.createRemoteAnimations();
  }

  /** Создаём анимации для remote игроков (те же, что и для локального) */
  private createRemoteAnimations(): void {
    if (this.scene.anims.exists('remote-walk-down')) return;
    const dirs = ['down', 'left', 'right', 'up'] as const;
    for (let i = 0; i < dirs.length; i++) {
      this.scene.anims.create({
        key: `remote-walk-${dirs[i]}`,
        frames: this.scene.anims.generateFrameNumbers('player-sprites', { start: i * 4, end: i * 4 + 3 }),
        frameRate: 10, repeat: -1,
      });
    }
  }

  clearBuffer(): void {
    this.snapshotBuffer = [];
  }

  pushSnapshot(players: Map<string, { x: number; y: number }>, localT = performance.now()): void {
    this.snapshotBuffer.push({ localT, players });
    while (this.snapshotBuffer.length > 30) {
      this.snapshotBuffer.shift();
    }
  }

  ensure(id: string, x: number, y: number): Phaser.GameObjects.Sprite {
    let sprite = this.sprites.get(id);
    if (!sprite) {
      sprite = this.scene.add.sprite(x, y, 'player-sprites', 0);
      sprite.setScale(PLAYER_SCALE);
      sprite.setTint(REMOTE_TINT);
      sprite.setDepth(500);
      this.sprites.set(id, sprite);
      // Инициализируем состояние
      this.playerStates.set(id, {
        sprite,
        prevX: x,
        prevY: y,
        lastMoveTime: performance.now(),
        facingDir: 'down',
      });
    }
    sprite.x = x;
    sprite.y = y;
    return sprite;
  }

  remove(id: string): void {
    const sprite = this.sprites.get(id);
    if (sprite) {
      sprite.destroy();
      this.sprites.delete(id);
    }
  }

  get size(): number {
    return this.sprites.size;
  }

  /** Интерполяция remote-игроков между снапшотами + анимации ходьбы/idle */
  renderInterpolated(now: number, myId: string | null): void {
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
      if (myId && id === myId) continue;
      seen.add(id);

      // Интерполяция позиции
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

      // Проверяем, двигается ли игрок
      const state = this.playerStates.get(id);
      const isMoving = state ? (Math.abs(px - state.prevX) > 0.5 || Math.abs(py - state.prevY) > 0.5) : true;

      // Определяем направление движения
      let facingDir: 'down' | 'left' | 'right' | 'up' = 'down';
      if (state) {
        const dx = px - state.prevX;
        const dy = py - state.prevY;
        if (Math.abs(dx) > Math.abs(dy)) {
          facingDir = dx > 0 ? 'right' : 'left';
        } else if (Math.abs(dy) > 0.1) {
          facingDir = dy > 0 ? 'down' : 'up';
        } else {
          facingDir = state.facingDir;
        }
      }

      const sprite = this.ensure(id, px, py);

      // Обновляем состояние
      if (state) {
        state.prevX = px;
        state.prevY = py;
        state.lastMoveTime = now;
        state.facingDir = facingDir;
      }

      // Проигрываем анимацию ходьбы если двигается, иначе idle
      if (isMoving) {
        const animKey = `remote-walk-${facingDir}`;
        if (sprite.anims.currentAnim?.key !== animKey) {
          sprite.play(animKey, true);
        }
      } else {
        sprite.stop();
        // Показываем idle фрейм в направлении взгляда
        const dirs = ['down', 'left', 'right', 'up'] as const;
        const dirIndex = dirs.indexOf(facingDir);
        sprite.setFrame(dirIndex * 4); // Первый кадр каждого направления
      }
    }

    for (const id of Array.from(this.sprites.keys())) {
      if (!seen.has(id)) this.remove(id);
    }
  }

  destroy(): void {
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
    this.playerStates.clear();
    this.snapshotBuffer = [];
  }
}
