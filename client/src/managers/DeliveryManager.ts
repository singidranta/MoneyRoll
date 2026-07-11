import Phaser from 'phaser';
import { TILE_SIZE, TILE_SIZE_HALF } from '../../../shared/map';

export class DeliveryManager {
  private activeDeliveryTarget: { x: number; y: number; key: string } | null = null;
  private deliveryHighlight?: Phaser.GameObjects.Graphics;
  private innerHighlight?: Phaser.GameObjects.Graphics;

  constructor(private scene: Phaser.Scene) {}

  startDelivery(targetHouse: { cellX: number; cellY: number }): { x: number; y: number } {
    const tx = targetHouse.cellX * TILE_SIZE + TILE_SIZE_HALF;
    const ty = targetHouse.cellY * TILE_SIZE + TILE_SIZE_HALF;

    this.activeDeliveryTarget = {
      x: tx,
      y: ty,
      key: `${targetHouse.cellX},${targetHouse.cellY}`
    };

    this.highlightDeliveryTarget();
    return { x: tx, y: ty };
  }

  private highlightDeliveryTarget(): void {
    this.clearDeliveryHighlight();
    if (!this.activeDeliveryTarget) return;

    const g = this.scene.add.graphics();
    g.setDepth(900);
    g.lineStyle(5, 0x00ff88, 0.95);
    g.strokeCircle(this.activeDeliveryTarget.x, this.activeDeliveryTarget.y, 75);

    const inner = this.scene.add.graphics();
    inner.setDepth(899);
    inner.fillStyle(0x00ff88, 0.18);
    inner.fillCircle(this.activeDeliveryTarget.x, this.activeDeliveryTarget.y, 58);

    this.deliveryHighlight = g;
    this.innerHighlight = inner;

    this.scene.tweens.add({
      targets: g,
      alpha: { from: 0.35, to: 1 },
      duration: 850,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  clearDeliveryHighlight(): void {
    if (this.deliveryHighlight) {
      this.deliveryHighlight.destroy();
      this.deliveryHighlight = undefined;
    }
    if (this.innerHighlight) {
      this.innerHighlight.destroy();
      this.innerHighlight = undefined;
    }
  }

  getActiveTarget(): { x: number; y: number; key: string } | null {
    return this.activeDeliveryTarget;
  }

  completeDelivery(): void {
    this.clearDeliveryHighlight();
    this.activeDeliveryTarget = null;
  }

  isNearDeliveryTarget(playerX: number, playerY: number, radius = 180): boolean {
    if (!this.activeDeliveryTarget) return false;
    const dist = Phaser.Math.Distance.Between(
      playerX, playerY,
      this.activeDeliveryTarget.x, this.activeDeliveryTarget.y
    );
    return dist < radius;
  }
}
