import Phaser from 'phaser';
import { GameConfig } from './config/GameConfig';

const container = document.getElementById('game');
if (!container) {
  throw new Error('Не найден #game контейнер. Проверь index.html.');
}

const game = new Phaser.Game({
  ...GameConfig,
  parent: 'game',
});

// Скрываем loading-overlay когда сцена Boot создастся
window.addEventListener('phaser-ready', () => {
  const loading = document.getElementById('loading');
  if (loading) loading.classList.add('hidden');
});

// Глобальный обработчик ошибок для удобной отладки
window.addEventListener('error', (e) => {
  console.error('[MoneyRoll] window.error:', e.message);
});

export default game;
