# 💸 MoneyRoll

> 2D онлайн-RPG в браузере: единственная цель — **стать богатым**.
> Стартуешь с $5, выполняешь мини-игры работы, строишь бизнес или сваливаешь в криминал.

## 🚀 Быстрый старт

👉 См. **[`docs/HOW_TO_RUN.md`](docs/HOW_TO_RUN.md)** — пошаговая инструкция для непрограммиста.

Короткий вариант:
```bash
pnpm install
pnpm dev
# открыть http://localhost:5173
```

## 📚 Документация

| Файл | Что внутри |
|------|-----------|
| **[`docs/ROADMAP.md`](docs/ROADMAP.md)** | Дизайн игры, список работ, магазинов, бутылок, архитектура, этапы |
| **[`docs/STYLE_PROMPTS.md`](docs/STYLE_PROMPTS.md)** | Как генерировать спрайты через AI: промпты, параметры, чеклист |
| **[`docs/COMMUNICATION.md`](docs/COMMUNICATION.md)** | Как я общаюсь с тобой (простой русский, глоссарий) |
| **[`docs/HOW_TO_RUN.md`](docs/HOW_TO_RUN.md)** | Как запустить проект локально пошагово |

## 🏗️ Архитектура

```
MoneyRoll/
├── client/        # Phaser + Vite + TS (браузер)
├── server/        # Node.js + Express + WebSocket (бэкенд)
└── docs/          # Документация
```

**Стек:** Vite, TypeScript, Phaser 3, Node.js, Express, WebSocket, pnpm.

## 🎯 Текущий статус

🚧 **Этап 0: Скелет** — работает движение, камера, WS-соединение. Ассеты пока placeholder.

Следующие этапы — см. [ROADMAP.md](docs/ROADMAP.md).
