import Phaser from 'phaser';
import { TILE_SIZE, TILE_SIZE_HALF } from '../../../shared/map';
import type { MapEntity } from '../../../shared/map';
import type { JobType, PropertyType } from '../../../shared/economy';

export interface InteractionResult {
  nearestEntity: MapEntity | null;
  distance: number;
  targetX: number;
  targetY: number;
}

export class InteractionDetector {
  private readonly INTERACT_RADIUS = 180;

  constructor(_scene?: Phaser.Scene) {}

  detectNearestInteractive(
    playerX: number,
    playerY: number,
    entities: MapEntity[]
  ): InteractionResult {
    let nearest: MapEntity | null = null;
    let minDist = this.INTERACT_RADIUS;
    let targetX = playerX;
    let targetY = playerY;

    for (const entity of entities) {
      const kx = entity.cellX * TILE_SIZE + TILE_SIZE_HALF;
      const ky = entity.cellY * TILE_SIZE + TILE_SIZE_HALF;
      const dist = Phaser.Math.Distance.Between(playerX, playerY, kx, ky);

      if (dist < minDist) {
        minDist = dist;
        nearest = entity;
        targetX = kx;
        targetY = ky;
      }
    }

    return { nearestEntity: nearest, distance: minDist, targetX, targetY };
  }

  detectNearbyDeliveryHouse(
    playerX: number,
    playerY: number,
    entities: MapEntity[]
  ): { target: { x: number; y: number } | null; distance: number } {
    let closestTarget: { x: number; y: number } | null = null;
    let minDist = Infinity;

    for (const entity of entities) {
      if (['apartment-1', 'apartment-2', 'building'].includes(entity.type)) {
        const hx = entity.cellX * TILE_SIZE + TILE_SIZE_HALF;
        const hy = entity.cellY * TILE_SIZE + TILE_SIZE_HALF;
        const dist = Phaser.Math.Distance.Between(playerX, playerY, hx, hy);
        if (dist < minDist) {
          minDist = dist;
          closestTarget = { x: hx, y: hy };
        }
      }
    }

    return minDist < this.INTERACT_RADIUS 
      ? { target: closestTarget, distance: minDist } 
      : { target: null, distance: Infinity };
  }

  getJobType(entity: MapEntity): JobType | null {
    if (entity.type === 'courier-hub') return 'courier';
    if (entity.type === 'lemonade-stand') return 'lemonade';
    if (entity.type === 'trash-sort-station') return 'trash-sort';
    return null;
  }

  getPropertyType(entity: MapEntity): PropertyType | null {
    const pt = entity.properties?.propertyType;
    return pt && ['shack', 'apartment-small', 'apartment-big', 'lemonade-stand'].includes(pt) 
      ? pt as PropertyType 
      : null;
  }
}
