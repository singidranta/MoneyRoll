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

export function isPeerSnapshot(v: unknown): v is PeerSnapshot {
  if (!v || typeof v !== 'object') return false;
  const p = v as Partial<PeerSnapshot>;
  return typeof p.id === 'string' && typeof p.x === 'number' && typeof p.y === 'number';
}

export class RemotePlayers {
  readonly sprites = new Map<string, Phaser.GameObjects.Sprite>();
  snapshotBuffer: SnapshotEntry[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

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

  /** Интерполяция remote-игроков между снапшотами. */
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
      this.ensure(id, px, py);
    }

    for (const id of Array.from(this.sprites.keys())) {
      if (!seen.has(id)) this.remove(id);
    }
  }

  destroy(): void {
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
    this.snapshotBuffer = [];
  }
}
