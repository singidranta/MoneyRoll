import express from 'express';
import cors from 'cors';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { networkInterfaces } from 'node:os';
import { WebSocketServer } from 'ws';
import { World } from './World.js';
import type { WireMessage } from './World.js';
import {
  emptyMap,
  MAP_HEIGHT,
  MAP_WIDTH,
  parseKey,
  TILE_TYPES,
  type MapDocument,
  type TileType,
} from '../../shared/map.js';

// ============================================================
//  SECTION: SERVER CONFIGURATION
// ============================================================
const PORT = Number(process.env.PORT ?? 3000);
const DATA_DIR = path.resolve('data');
const MAP_FILE = path.join(DATA_DIR, 'map.json');
const SNAPSHOT_TICK_MS = 50; // 20 Hz

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

async function loadMap(): Promise<MapDocument> {
  try {
    const raw = await fs.readFile(MAP_FILE, 'utf8');
    const parsed = JSON.parse(raw) as MapDocument;
    if (parsed.version !== 1) throw new Error(`unsupported version ${parsed.version}`);
    // Если размер сохраненной карты не совпадает с текущей сборкой — сбрасываем.
    if (parsed.width !== MAP_WIDTH || parsed.height !== MAP_HEIGHT) {
      console.warn(
        `[MoneyRoll][server] saved map size ${parsed.width}x${parsed.height} does not match current ${MAP_WIDTH}x${MAP_HEIGHT}; resetting`
      );
      return emptyMap();
    }
    // Санитайз tiles: только известные типы и валидные ключи.
    const tiles: Record<string, TileType> = {};
    for (const [k, t] of Object.entries(parsed.tiles ?? {})) {
      const pos = parseKey(k);
      if (!pos) continue;
      if (!TILE_TYPES.includes(t)) continue;
      if (pos.x < 0 || pos.x >= parsed.width) continue;
      if (pos.y < 0 || pos.y >= parsed.height) continue;
      tiles[k] = t;
    }
    const rotations: Record<string, number> = {};
    for (const [k, r] of Object.entries(parsed.rotations ?? {})) {
      const pos = parseKey(k);
      if (!pos) continue;
      if (typeof r !== 'number') continue;
      rotations[k] = r;
    }
    return { ...parsed, tiles, rotations, version: 1 };
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
app.use(cors());
app.use(express.json({ limit: '4mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime(), clients: world.size, version: '1.5' });
});

app.get('/api/network', (_req, res) => {
  res.json({ ips: listLocalIPs(), port: 5173 });
});

app.get('/api/map', (_req, res) => {
  res.json(currentMap);
});

app.put('/api/map', async (req, res) => {
  const body = req.body as MapDocument;
  if (!body || typeof body !== 'object' || body.version !== 1) {
    res.status(400).json({ ok: false, error: 'bad version' });
    return;
  }
  if (body.width !== MAP_WIDTH || body.height !== MAP_HEIGHT) {
    res.status(400).json({ ok: false, error: 'bad size' });
    return;
  }
  const tiles: Record<string, TileType> = {};
  for (const [k, t] of Object.entries(body.tiles ?? {})) {
    const pos = parseKey(k);
    if (!pos) continue;
    if (!TILE_TYPES.includes(t)) continue;
    tiles[k] = t;
  }
  const rotations: Record<string, number> = {};
  for (const [k, r] of Object.entries(body.rotations ?? {})) {
    const pos = parseKey(k);
    if (!pos) continue;
    if (typeof r !== 'number') continue;
    rotations[k] = r;
  }
  currentMap = { ...body, tiles, rotations, version: 1 };
  world.setMap(currentMap);
  mapDirty = true;
  await flushMap();
  res.json({ ok: true, tiles: Object.keys(tiles).length });
});

// ============================================================
//  SECTION: WEBSOCKET
// ============================================================

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const id = Math.random().toString(36).slice(2, 10);
  const remote = req.socket.remoteAddress ?? 'unknown';
  console.log(`[MoneyRoll][server] +client ${id} from ${remote}`);

  world.add(id, ws, null);

  // Привет – без токена пока $5, клиент потом пришлёт auth с токеном
  const playerClient = world.getClient(id);
  ws.send(JSON.stringify({
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
    properties: playerClient?.properties ?? [],
  }));

  // Сообщаем остальным, что новый игрок появился.
  world.broadcastExcept(id, { type: 'peer-join', id });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as WireMessage;
      world.handle(id, msg);
    } catch (err) {
      console.warn(`[MoneyRoll][server] bad msg from ${id}:`, err);
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
setInterval(() => {
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

void initMap().then(() => {
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
});

process.on('SIGINT', async () => {
  console.log('[MoneyRoll][server] SIGINT, flushing map...');
  await flushMap();
  process.exit(0);
});
