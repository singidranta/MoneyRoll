import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { PreloadScene } from '../scenes/PreloadScene';
import { EditorScene } from '../scenes/EditorScene';

export const EditorGameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  backgroundColor: '#0a0a0a',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: 1280,
    height: 720,
  },
  pixelArt: false,
  fps: {
    target: 60,
    forceSetTimeOut: false,
  },
  scene: [BootScene, PreloadScene, EditorScene],
};
