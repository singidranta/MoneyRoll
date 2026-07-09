import Phaser from 'phaser';
import { GameConfig } from './config/GameConfig';
import { EditorGameConfig } from './config/EditorGameConfig';

// Режим определяется через URL-параметр `?mode=editor`.
// Так кросс-платформенно: не зависит от shell (cmd.exe не понимает
// inline-VITE_MR_MODE, а URL работает везде).
const modeParam = (() => {
  try {
    return new URL(window.location.href).searchParams.get('mode');
  } catch {
    return null;
  }
})();
const isEditor = modeParam === 'editor';

const container = document.getElementById('game');
if (!container) {
  throw new Error('Не найден #game контейнер. Проверь index.html.');
}

const game = new Phaser.Game({
  ...(isEditor ? EditorGameConfig : GameConfig),
  parent: 'game',
});

// Loading screen is driven by PreloadScene progress + hide on World start.
// Fallback: if something fails early, still don't leave user stuck forever.
window.addEventListener('phaser-ready', () => {
  // Boot finished — progress bar stays until assets load.
});

window.addEventListener('error', (e) => {
  console.error('[MoneyRoll] window.error:', e.message);
  const text = document.getElementById('loading-pct');
  if (text) text.textContent = 'ошибка загрузки — смотри консоль';
});

if (isEditor) {
  console.log('%c[MoneyRoll] MODE: EDITOR (build map)', 'color:#ff6b6b;font-weight:bold');
  console.log('[MoneyRoll] Клик по клетке: ставит текущий тайл и переключает на следующий');
  console.log('[MoneyRoll] Клавиши: 1 = ground, 2 = road, Esc = отменить выбор, Ctrl+S = сохранить');
} else {
  console.log('%c[MoneyRoll] MODE: PLAY', 'color:#7cfc00;font-weight:bold');
  console.log('[MoneyRoll] WASD / стрелки — движение. Другие игроки подключаются автоматически.');
}

export default game;
