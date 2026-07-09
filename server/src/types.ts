// ============================================================
//  SECTION: SERVER TYPES
// ============================================================

import type { WebSocket } from 'ws';
import type {
  InventoryItem,
  JobType,
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
  properties: PropertyType[];
  lastJobAt: Record<JobType, number>;
  playerToken: string | null;
  // v2 job system
  jobSkills: JobSkills;
  licenses: JobLicense;
  trainingCompleted: string[];
  activeJob?: {
    type: JobType;
    startedAt: number;
    stage?: number;
    data?: any;
  } | null;
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
