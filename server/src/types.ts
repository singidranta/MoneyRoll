// ============================================================
//  SECTION: SERVER TYPES
// ============================================================

import type { WebSocket } from 'ws';
import type {
  InventoryItem,
  JobType,
  OwnedProperty,
  PropertyType,
} from '../../shared/economy.js';

export type WireMessage = {
  type: string;
  [key: string]: unknown;
};

import type { JobSkills, JobLicense } from '../../shared/economy.js';

export type Client = {
  id: string;
  ws: WebSocket;
  x: number;
  y: number;
  money: number;
  inventory: (InventoryItem | null)[];
  backpackTier: number;
  hasJacket: boolean;
  hasSneakers: boolean;
  hasCrown: boolean;
  properties: OwnedProperty[];
  lastJobAt: Record<JobType, number>;
  playerToken: string | null;
  jobSkills: JobSkills;
  licenses: JobLicense;
  trainingCompleted: string[];
  activeJob?: {
    type: JobType;
    startedAt: number;
    stage?: number;
    data?: any;
  } | null;
  hunger: number;
};

export type PeerSnapshot = {
  id: string;
  x: number;
  y: number;
};

export type JobPoint = {
  id: string;
  jobType: JobType;
  x: number;
  y: number;
};

export type PropertyPoint = {
  id: string;
  propertyType: PropertyType;
  x: number;
  y: number;
};

export type SchoolPoint = {
  id: string;
  x: number;
  y: number;
};

// Courier delivery house point
export type DeliveryPoint = {
  id: string;
  x: number;
  y: number;
  cellX: number;
  cellY: number;
};
