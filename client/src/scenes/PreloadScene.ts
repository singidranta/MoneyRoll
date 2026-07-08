import Phaser from 'phaser';

function isEditorMode(): boolean {
  try {
    return new URL(window.location.href).searchParams.get('mode') === 'editor';
  } catch {
    return false;
  }
}

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Preload' });
  }

  preload(): void {
    // В Этапе 0 нет ассетов. В Этапе 5 (AI-пайплайн) сюда добавятся
    // this.load.image('player-head', '/assets/chars/flat/head/base.png') и т.д.
    console.log('[MoneyRoll] Preload OK (no assets yet)');
  }

  create(): void {
    const next = isEditorMode() ? 'Editor' : 'World';
    console.log(`[MoneyRoll] Preload → ${next}`);
    this.scene.start(next);
  }
}
