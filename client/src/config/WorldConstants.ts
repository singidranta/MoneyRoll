// ============================================================
//  SECTION: WORLD SCENE CONSTANTS
// ============================================================
import { MAP_WIDTH, MAP_HEIGHT, TILE_SIZE } from '../../../shared/map';

export const MAP_PIXEL_W = MAP_WIDTH * TILE_SIZE;
export const MAP_PIXEL_H = MAP_HEIGHT * TILE_SIZE;

export const SEND_INTERVAL_MS = 50;
export const SNAPSHOT_INTERP_DELAY_MS = 100;
export const REMOTE_TINT = 0xffaacc;
export const DEFAULT_SPAWN = { x: 400, y: 300 };

export const BASE_WALK_SPEED = 130;
export const BASE_SPRINT_SPEED = 200;

export const PLAYER_SCALE = 0.42;
export const PLAYER_BODY_SIZE = 24;
export const PLAYER_BODY_OFFSET_X = 20;
export const PLAYER_BODY_OFFSET_Y = 40;

export const OBSTACLE_SCALE = 0.5;
export const BOTTLE_PICKUP_RADIUS = 30;
export const INTERACT_RADIUS = 90;
export const PROMPT_OFFSET_Y = 60;

export const KIOSK_SCALE = 0.58;
export const DROP_ITEM_SCALE = 0.35;

export const SAVE_KEY = 'moneyroll_save_v2';
export const PLAYER_TOKEN_KEY = 'moneyroll_player_token';
export const AUTOSAVE_INTERVAL_MS = 30_000;

export const STAMINA_MAX = 100;
export const STAMINA_DRAIN_BASE = 18;
export const STAMINA_REGEN_BASE = 12;
export const STAMINA_REGEN_JACKET = 18;
export const STAMINA_EXHAUST_RECOVER = 20;

export const SHAWARMA_BUFF_SEC = 20;
export const ENERGY_BUFF_SEC = 30;
export const ENERGY_SPEED_BONUS = 100;
export const SNEAKERS_WALK_BONUS = 40;
export const SNEAKERS_SPRINT_BONUS = 70;

export const FOOTSTEP_SPRINT_MS = 220;
export const FOOTSTEP_WALK_MS = 350;
