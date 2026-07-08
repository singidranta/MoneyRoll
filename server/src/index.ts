import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { World } from './World.js';
import type { WireMessage } from './World.js';

const PORT = Number(process.env.PORT ?? 3000);

// World создаём сразу, чтобы /api/health мог про него читать безопасно.
const world = new World();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    clients: world.size,
    version: '0.1.0-stage0',
  });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const id = Math.random().toString(36).slice(2, 10);
  const remote = req.socket.remoteAddress ?? 'unknown';
  console.log(`[MoneyRoll][server] +client ${id} from ${remote}`);

  world.add(id, ws);

  // Привет + стартовый список уже подключённых игроков,
  // чтобы новый клиент увидел их сразу, до первого peer-move.
  ws.send(
    JSON.stringify({
      type: 'welcome',
      id,
      players: world.snapshot(id),
    }),
  );

  // Оповещаем остальных: новый игрок появился.
  // Клиенты отрендерят его на стандартной точке; координаты обновятся по peer-move.
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
    // Сообщаем остальным, что игрок ушёл — клиенты удалят его remote-rect.
    world.broadcastAll({ type: 'leave', id });
  });

  ws.on('error', (err) => {
    console.warn(`[MoneyRoll][server] error ${id}:`, err);
  });
});

server.listen(PORT, () => {
  console.log(`[MoneyRoll][server] listening on http://localhost:${PORT}`);
  console.log(`[MoneyRoll][server] WebSocket path: /ws`);
});
