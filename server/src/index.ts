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
  parseKey,
  type MapDocument,
  type TileType,
} from '../../shared/map.js';

const PORT = Number(process.env.PORT ?? 3000);
const DATA_DIR = path.resolve('data');
const MAP_FILE = path.join(DATA_DIR, 'map.json');
const SNAPSHOT_TICK_MS = 50; // 20 Hz

const world = new World();

// ───── Network introspection ─────

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

// ───── Map persistence (data/map.json) ─────

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
    // Санитайз tiles: только известные типы и валидные ключи.
    const tiles: Record<string, TileType> = {};
    for (const [k, t] of Object.entries(parsed.tiles ?? {})) {
      const pos = parseKey(k);
      if (!pos) continue;
      if (t !== 'ground' && t !== 'road') continue;
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

// ───── Express app ─────

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime(), clients: world.size, version: '0.2.0' });
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
  if (body.width !== currentMap.width || body.height !== currentMap.height) {
    res.status(400).json({ ok: false, error: 'bad size' });
    return;
  }
  const tiles: Record<string, TileType> = {};
  for (const [k, t] of Object.entries(body.tiles ?? {})) {
    const pos = parseKey(k);
    if (!pos) continue;
    if (t !== 'ground' && t !== 'road') continue;
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
  mapDirty = true;
  await flushMap();
  res.json({ ok: true, tiles: Object.keys(tiles).length });
});

// ───── WebSocket ─────

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const id = Math.random().toString(36).slice(2, 10);
  const remote = req.socket.remoteAddress ?? 'unknown';
  console.log(`[MoneyRoll][server] +client ${id} from ${remote}`);

  world.add(id, ws);

  // Привет + стартовый список игроков, бутылок и киосков.
  ws.send(JSON.stringify({
    type: 'welcome',
    id,
    players: world.snapshot(id),
    bottles: world.getBottles(),
    kiosks: world.getKiosks()
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

// ───── Snapshot tick (server-authoritative, 20Hz) ─────
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

// ───── Startup ─────

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
