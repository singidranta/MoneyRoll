import express from 'express';
import cors from 'cors';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { networkInterfaces } from 'node:os';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { World } from './World.js';
import type { WireMessage } from './World.js';
import { PROPERTIES, type PropertyType } from '../../shared/economy.js';
import {
  emptyMap,
  MAP_HEIGHT,
  MAP_WIDTH,
  TILE_SIZE,
  isMapEntityType,
  parseKey,
  TILE_TYPES,
  type MapDocument,
  type TileType,
} from '../../shared/map.js';

// ============================================================
//  SECTION: SERVER CONFIGURATION
// ============================================================
const parsedPort = Number(process.env.PORT ?? 3000);
const PORT = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65_535 ? parsedPort : 3000;
const DATA_DIR = path.resolve('data');
const MAP_FILE = path.join(DATA_DIR, 'map.json');
const SNAPSHOT_TICK_MS = 50; // 20 Hz
const MAX_WS_MESSAGE_BYTES = 16 * 1024;
const MAX_WS_MESSAGES_PER_WINDOW = 500;
const WS_RATE_WINDOW_MS = 10_000;
const allowedCorsOrigins = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const mapAdminToken = process.env.MAP_ADMIN_TOKEN?.trim() || null;

const world = new World();

// ============================================================
//  SECTION: NETWORK INTROSPECTION
// ============================================================

function listLocalIPs(): Array<{ iface: string; ip: string }> {
  const out: Array<{ iface: string; ip: string }> = [];
  for (const [iface, addrs] of Object.entries(networkInterfaces())) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        out.push({ iface, ip: addr.address });
      }
    }
  }
  return out;
}

// ============================================================
//  SECTION: MAP PERSISTENCE
// ============================================================

async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (err) {
    console.warn('[MoneyRoll][server] cannot create data dir:', err);
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidCell(x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT;
}

function sanitizeRotation(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const normalized = ((Math.round(value / 90) * 90) % 360 + 360) % 360;
  return normalized;
}

function isLoopbackAddress(remoteAddress: string | undefined): boolean {
  return remoteAddress === '127.0.0.1' || remoteAddress === '::1' || remoteAddress === '::ffff:127.0.0.1';
}

function extractBearerToken(header: unknown): string | null {
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function isMapWriteAllowed(req: express.Request): boolean {
  if (mapAdminToken) return extractBearerToken(req.header('authorization')) === mapAdminToken;
  return isLoopbackAddress(req.socket.remoteAddress);
}

function sanitizeMapDocument(input: unknown): MapDocument | null {
  if (!isPlainRecord(input) || input.version !== 1 || input.width !== MAP_WIDTH || input.height !== MAP_HEIGHT) {
    return null;
  }

  const tiles: Record<string, TileType> = {};
  if (isPlainRecord(input.tiles)) {
    for (const [k, t] of Object.entries(input.tiles)) {
      const pos = parseKey(k);
      if (!pos || !isValidCell(pos.x, pos.y)) continue;
      if (typeof t !== 'string' || !TILE_TYPES.includes(t as TileType)) continue;
      tiles[k] = t as TileType;
    }
  }

  const rotations: Record<string, number> = {};
  if (isPlainRecord(input.rotations)) {
    for (const [k, r] of Object.entries(input.rotations)) {
      const pos = parseKey(k);
      if (!pos || !isValidCell(pos.x, pos.y)) continue;
      const rotation = sanitizeRotation(r);
      if (rotation === null) continue;
      rotations[k] = rotation;
    }
  }

  const entities: MapDocument['entities'] = {};
  if (isPlainRecord(input.entities)) {
    for (const [key, rawEntity] of Object.entries(input.entities)) {
      if (!isPlainRecord(rawEntity)) continue;
      const cell = parseKey(key);
      const cellX = typeof rawEntity.cellX === 'number' ? rawEntity.cellX : cell?.x;
      const cellY = typeof rawEntity.cellY === 'number' ? rawEntity.cellY : cell?.y;
      if (typeof cellX !== 'number' || typeof cellY !== 'number' || !isValidCell(cellX, cellY)) continue;
      const entityKey = `${cellX},${cellY}`;
      const type = rawEntity.type;
      if (!isMapEntityType(type)) continue;
      const id = typeof rawEntity.id === 'string' && rawEntity.id.length <= 128 ? rawEntity.id : `entity_${entityKey}`;
      const rotation = sanitizeRotation(rawEntity.rotation) ?? 0;
      const props = isPlainRecord(rawEntity.properties) ? rawEntity.properties : {};
      const sanitizedProperties: NonNullable<MapDocument['entities']>[string]['properties'] = {};

      if (typeof props.spawnInterval === 'number' && Number.isFinite(props.spawnInterval)) {
        sanitizedProperties.spawnInterval = Math.max(1, Math.min(300, props.spawnInterval));
      }
      if (typeof props.maxBottles === 'number' && Number.isFinite(props.maxBottles)) {
        sanitizedProperties.maxBottles = Math.max(0, Math.min(100, Math.floor(props.maxBottles)));
      }
      if (typeof props.spawnRadius === 'number' && Number.isFinite(props.spawnRadius)) {
        sanitizedProperties.spawnRadius = Math.max(0, Math.min(20, Math.floor(props.spawnRadius)));
      }
      if (typeof props.propertyType === 'string' && Object.prototype.hasOwnProperty.call(PROPERTIES, props.propertyType)) {
        sanitizedProperties.propertyType = props.propertyType as PropertyType;
      }
      if (typeof props.spriteKey === 'string' && props.spriteKey.length <= 128) sanitizedProperties.spriteKey = props.spriteKey;
      if (typeof props.label === 'string' && props.label.length <= 128) sanitizedProperties.label = props.label;

      entities[entityKey] = { id, type, cellX, cellY, rotation, properties: sanitizedProperties };
    }
  }

  return {
    version: 1,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    tileSize: TILE_SIZE,
    tiles,
    rotations,
    entities,
  };
}

async function loadMap(): Promise<MapDocument> {
  try {
    const raw = await fs.readFile(MAP_FILE, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    const sanitized = sanitizeMapDocument(parsed);
    if (!sanitized) throw new Error('invalid map document');
    return sanitized;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      // Первый запуск — файла ещё нет, это нормально.
      console.log('[MoneyRoll][server] no map.json yet — starting with empty map');
    } else {
      console.warn('[MoneyRoll][server] cannot load map.json (using empty):', err);
    }
    return emptyMap();
  }
}

let currentMap: MapDocument = emptyMap();
let mapDirty = false;

async function initMap(): Promise<void> {
  await ensureDataDir();
  currentMap = await loadMap();
  world.setMap(currentMap);
  console.log(
    `[MoneyRoll][server] map loaded: ${Object.keys(currentMap.tiles).length} tiles from ${MAP_FILE}`,
  );
}

async function flushMap(): Promise<void> {
  if (!mapDirty) return;
  try {
    await fs.writeFile(MAP_FILE, JSON.stringify(currentMap, null, 2), 'utf8');
    mapDirty = false;
    console.log(
      `[MoneyRoll][server] map saved → ${MAP_FILE} (${Object.keys(currentMap.tiles).length} tiles)`,
    );
  } catch (err) {
    console.warn('[MoneyRoll][server] map save failed:', err);
  }
}

// ============================================================
//  SECTION: EXPRESS APP
// ============================================================

const app = express();
app.disable('x-powered-by');
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedCorsOrigins.length === 0 || allowedCorsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('CORS origin rejected'));
  },
}));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime(), clients: world.size, version: '1.6' });
});

app.get('/api/network', (_req, res) => {
  res.json({ ips: listLocalIPs(), port: 5173 });
});

app.get('/api/map', (_req, res) => {
  res.json(currentMap);
});

app.put('/api/map', async (req, res) => {
  if (!isMapWriteAllowed(req)) {
    res.status(403).json({ ok: false, error: 'map write forbidden' });
    return;
  }

  const sanitized = sanitizeMapDocument(req.body);
  if (!sanitized) {
    res.status(400).json({ ok: false, error: 'invalid map document' });
    return;
  }

  currentMap = sanitized;
  world.setMap(currentMap);
  mapDirty = true;
  await flushMap();
  res.json({ ok: true, tiles: Object.keys(currentMap.tiles).length, entities: Object.keys(currentMap.entities ?? {}).length });
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.warn('[MoneyRoll][server] request rejected:', err);
  res.status(400).json({ ok: false, error: 'bad request' });
});

// ============================================================
//  SECTION: WEBSOCKET
// ============================================================

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_WS_MESSAGE_BYTES, perMessageDeflate: false });

function safeSend(ws: WebSocket, payload: object): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function parseWireMessage(raw: RawData): WireMessage | null {
  const bytes = Buffer.isBuffer(raw) ? raw.byteLength : Buffer.byteLength(raw.toString());
  if (bytes > MAX_WS_MESSAGE_BYTES) return null;
  const parsed = JSON.parse(raw.toString()) as unknown;
  if (!isPlainRecord(parsed) || typeof parsed.type !== 'string' || parsed.type.length > 64) return null;
  return parsed as WireMessage;
}

wss.on('connection', (ws, req) => {
  const id = randomUUID().slice(0, 8);
  const remote = req.socket.remoteAddress ?? 'unknown';
  let windowStartedAt = Date.now();
  let messagesInWindow = 0;
  console.log(`[MoneyRoll][server] +client ${id} from ${remote}`);

  world.add(id, ws, null);

  // Привет – без токена пока $5, клиент потом пришлёт auth с токеном
  const playerClient = world.getClient(id);
  safeSend(ws, {
    type: 'welcome',
    id,
    players: world.snapshot(id),
    bottles: world.getBottles(),
    kiosks: world.getKiosks(),
    money: playerClient?.money ?? 5.0,
    inventory: playerClient?.inventory ?? Array(12).fill(null),
    backpackTier: playerClient?.backpackTier ?? 1,
    hasJacket: playerClient?.hasJacket ?? false,
    hasSneakers: playerClient?.hasSneakers ?? false,
    hasCrown: playerClient?.hasCrown ?? false,
    hasPhone: playerClient?.hasPhone ?? false,
    properties: playerClient?.properties ?? [],
  });

  // Сообщаем остальным, что новый игрок появился.
  world.broadcastExcept(id, { type: 'peer-join', id });

  ws.on('message', (raw) => {
    const now = Date.now();
    if (now - windowStartedAt > WS_RATE_WINDOW_MS) {
      windowStartedAt = now;
      messagesInWindow = 0;
    }
    messagesInWindow++;
    if (messagesInWindow > MAX_WS_MESSAGES_PER_WINDOW) {
      console.warn(`[MoneyRoll][server] rate limit exceeded by ${id}`);
      ws.close(1008, 'rate limit');
      return;
    }

    try {
      const msg = parseWireMessage(raw);
      if (!msg) {
        ws.close(1003, 'bad message');
        return;
      }
      world.handle(id, msg);
    } catch (err) {
      console.warn(`[MoneyRoll][server] bad msg from ${id}:`, err);
      ws.close(1003, 'bad message');
    }
  });

  ws.on('close', () => {
    console.log(`[MoneyRoll][server] -client ${id}`);
    world.remove(id);
    world.broadcastAll({ type: 'leave', id });
  });

  ws.on('error', (err) => {
    console.warn(`[MoneyRoll][server] error ${id}:`, err);
  });
});

// ============================================================
//  SECTION: SNAPSHOT TICK
// ============================================================
//
// Раньше был per-event broadcast (после каждого move-сообщения) —
// это даёт "телепортацию" remote-плееров при пинге >30мс.
// Теперь — фиксированный тик: каждый клиент каждые 50мс шлёт свой move
// через sendMoveThrottled (тоже 20Hz), а сервер раз в 50мс собирает
// срез всех позиций и рассылает. Клиент интерполирует между снапшотами.
const snapshotTimer = setInterval(() => {
  if (world.size === 0) return;
  const payload = JSON.stringify({
    type: 'snapshot',
    t: Date.now(),
    players: world.snapshot(),
  });
  world.broadcastAllRaw(payload);
}, SNAPSHOT_TICK_MS);

// ============================================================
//  SECTION: STARTUP
// ============================================================

void initMap()
  .then(() => {
    server.listen(PORT, '0.0.0.0', () => {
      const ips = listLocalIPs();
      console.log(`[MoneyRoll][server] listening on http://0.0.0.0:${PORT}`);
      console.log(`[MoneyRoll][server] WebSocket path: /ws`);
      console.log('');
      console.log('%c[MoneyRoll] SHARE URLS (give one to your friend):', 'color:#aaccff;font-weight:bold');
      for (const { iface, ip } of ips) {
        console.log(`  http://${ip}:5173   (interface: ${iface})`);
      }
      console.log('');
      console.log('[MoneyRoll][server] (For Radmin VPN: pick the Radmin IP from above)');
    });
  })
  .catch((error) => {
    console.error('[MoneyRoll][server] startup failed:', error);
    process.exit(1);
  });

async function shutdown(signal: string): Promise<void> {
  console.log(`[MoneyRoll][server] ${signal}, flushing map...`);
  clearInterval(snapshotTimer);
  world.destroy();
  await flushMap();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2_000).unref();
}

process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
