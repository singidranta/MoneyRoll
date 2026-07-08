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

window.addEventListener('phaser-ready', () => {
  const loading = document.getElementById('loading');
  if (loading) loading.classList.add('hidden');
});

window.addEventListener('error', (e) => {
  console.error('[MoneyRoll] window.error:', e.message);
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
