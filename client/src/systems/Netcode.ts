/**
 * Клиентский WebSocket-обёртка для MoneyRoll.
 * Подключается к /ws через Vite dev-proxy → ws://localhost:3000/ws.
 */

export type NetcodeMessage = {
  type: string;
  [key: string]: unknown;
};

export type NetcodeClient = {
  send(msg: NetcodeMessage): void;
  close(): void;
};

export function connectNetcode(onMessage: (msg: NetcodeMessage) => void): NetcodeClient {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${proto}://${window.location.host}/ws`;

  let ws: WebSocket;
  try {
    ws = new WebSocket(url);
  } catch (err) {
    console.warn('[MoneyRoll] WS construction failed:', err);
    return makeNoopClient();
  }

  let closedByUser = false;

  ws.onopen = () => {
    console.log(`[MoneyRoll] WS connected → ${url}`);
  };
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg && typeof msg === 'object' && 'type' in msg) {
        onMessage(msg as NetcodeMessage);
      }
    } catch (err) {
      console.warn('[MoneyRoll] bad ws message:', err);
    }
  };
  ws.onerror = (event) => {
    console.warn('[MoneyRoll] WS error:', event);
  };
  ws.onclose = () => {
    if (!closedByUser) {
      console.log('[MoneyRoll] WS closed (auto). Перезапуск через 2с…');
      window.setTimeout(() => connectNetcode(onMessage), 2000);
    }
  };

  return {
    send: (msg) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    },
    close: () => {
      closedByUser = true;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    },
  };
}

function makeNoopClient(): NetcodeClient {
  console.warn('[MoneyRoll] WS недоступен. Игра будет работать локально, без сервера.');
  return {
    send: () => {},
    close: () => {},
  };
}
