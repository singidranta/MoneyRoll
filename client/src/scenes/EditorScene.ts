import Phaser from 'phaser';
import {
  MAP_WIDTH,
  MAP_HEIGHT,
  TILE_SIZE,
  cellKey,
  NEXT_TILE,
  type TileType,
  type MapDocument,
} from '../../../shared/map';
import {
  loadMap,
  saveMapDebounced,
  saveMapNow,
  getSaveStatus,
} from '../systems/MapSystem';

const PIXEL_WIDTH = MAP_WIDTH * TILE_SIZE; // 30 * 128 = 3840
const PIXEL_HEIGHT = MAP_HEIGHT * TILE_SIZE;

export class EditorScene extends Phaser.Scene {
  private mapJson: MapDocument | null = null;
  private currentTile: TileType | null = 'ground';
  private currentRotation = 0; // 0, 90, 180, 270

  private tileImagesMap = new Map<string, Phaser.GameObjects.Image>();
  private ghost!: Phaser.GameObjects.Image;
  private hudText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private coordText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'Editor' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0a0a0a');
    this.cameras.main.setBounds(0, 0, PIXEL_WIDTH, PIXEL_HEIGHT);

    // Центрируем камеру на середине карты 30x30
    this.cameras.main.centerOn(PIXEL_WIDTH / 2, PIXEL_HEIGHT / 2);

    // Кастомный курсор для точного попадания
    this.input.setDefaultCursor('crosshair');

    // Рисуем сетку
    this.drawGridBackground();

    // Тонкая обводка по границам карты
    const border = this.add.graphics();
    border.lineStyle(3, 0xff6b6b, 0.8);
    border.strokeRect(0, 0, PIXEL_WIDTH, PIXEL_HEIGHT);
    border.setDepth(10);

    // HUD верхний левый
    this.hudText = this.add.text(16, 16, this.hudContent(), {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#ff6b6b',
      backgroundColor: '#000000dd',
      padding: { x: 8, y: 5 },
    });
    this.hudText.setScrollFactor(0);
    this.hudText.setDepth(2000);

    this.statusText = this.add.text(16, 48, 'Загрузка карты…', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#cccccc',
      backgroundColor: '#000000dd',
      padding: { x: 8, y: 4 },
    });
    this.statusText.setScrollFactor(0);
    this.statusText.setDepth(2000);

    this.coordText = this.add.text(16, 76, 'cell: —, —', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#888888',
      backgroundColor: '#000000dd',
      padding: { x: 8, y: 4 },
    });
    this.coordText.setScrollFactor(0);
    this.coordText.setDepth(2000);

    // Клавиши
    this.input.keyboard!.on('keydown', this.handleKey, this);

    // Pointer
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerdown', this.handlePointerDown, this);

    void this.loadInitial();

    console.log(
      `[MoneyRoll][editor] ready: ${MAP_WIDTH}×${MAP_HEIGHT} cells, ${TILE_SIZE}px each ` +
        `(${PIXEL_WIDTH}×${PIXEL_HEIGHT}px world)`,
    );
  }

  private drawGridBackground(): void {
    // Minor сетка: 1px, тёмно-серая, каждая клетка (128px)
    const minor = this.add.graphics();
    minor.lineStyle(1, 0x222222, 0.5);
    minor.setDepth(0);
    for (let x = 0; x <= MAP_WIDTH; x++) {
      minor.lineBetween(x * TILE_SIZE, 0, x * TILE_SIZE, PIXEL_HEIGHT);
    }
    for (let y = 0; y <= MAP_HEIGHT; y++) {
      minor.lineBetween(0, y * TILE_SIZE, PIXEL_WIDTH, y * TILE_SIZE);
    }

    // Major сетка: 2px, светло-серая, каждые 10 клеток (1280px)
    const major = this.add.graphics();
    major.lineStyle(2, 0x444444, 0.7);
    major.setDepth(1);
    for (let x = 0; x <= MAP_WIDTH; x += 10) {
      major.lineBetween(x * TILE_SIZE, 0, x * TILE_SIZE, PIXEL_HEIGHT);
    }
    for (let y = 0; y <= MAP_HEIGHT; y += 10) {
      major.lineBetween(0, y * TILE_SIZE, PIXEL_WIDTH, y * TILE_SIZE);
    }
  }

  private async loadInitial(): Promise<void> {
    const map = await loadMap();
    if (!map.rotations) {
      map.rotations = {};
    }
    this.mapJson = map;
    this.renderAll();
    this.refreshStatus('ready');
    console.log('[MoneyRoll][editor] map rendered');
  }

  private renderAll(): void {
    for (const img of this.tileImagesMap.values()) {
      img.destroy();
    }
    this.tileImagesMap.clear();

    if (!this.mapJson) return;

    // Рендерим 30х30 карту
    for (let x = 0; x < MAP_WIDTH; x++) {
      for (let y = 0; y < MAP_HEIGHT; y++) {
        const key = cellKey(x, y);
        const type = this.mapJson.tiles[key] ?? 'ground';
        const rot = this.mapJson.rotations?.[key] ?? 0;

        const spriteKey = type === 'road' ? 'tile-road' : 'tile-ground';
        const px = x * TILE_SIZE + TILE_SIZE / 2;
        const py = y * TILE_SIZE + TILE_SIZE / 2;

        const img = this.add.image(px, py, spriteKey);
        img.setDepth(2);
        img.setAngle(rot);

        this.tileImagesMap.set(key, img);
      }
    }
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.mapJson) return;
    const cell = this.worldToCell(pointer.worldX, pointer.worldY);
    if (!cell) {
      if (this.ghost) this.ghost.setVisible(false);
      this.coordText.setText('cell: —, —');
      return;
    }
    this.showGhost(cell.x, cell.y);
    this.coordText.setText(`cell: ${cell.x}, ${cell.y}  ·  30×30  ·  128px each`);
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.mapJson || !this.currentTile) return;
    if (pointer.button !== 0) return; // только ЛКМ
    const cell = this.worldToCell(pointer.worldX, pointer.worldY);
    if (!cell) return;

    const key = cellKey(cell.x, cell.y);
    this.mapJson.tiles[key] = this.currentTile;
    if (!this.mapJson.rotations) this.mapJson.rotations = {};
    this.mapJson.rotations[key] = this.currentRotation;

    const existingImg = this.tileImagesMap.get(key);
    const spriteKey = this.currentTile === 'road' ? 'tile-road' : 'tile-ground';

    if (existingImg) {
      existingImg.setTexture(spriteKey);
      existingImg.setAngle(this.currentRotation);
    } else {
      const px = cell.x * TILE_SIZE + TILE_SIZE / 2;
      const py = cell.y * TILE_SIZE + TILE_SIZE / 2;
      const img = this.add.image(px, py, spriteKey);
      img.setDepth(2);
      img.setAngle(this.currentRotation);
      this.tileImagesMap.set(key, img);
    }

    // Автосохранение (debounced)
    saveMapDebounced(this.mapJson, 600);

    // Цикличная смена выбранного типа тайла
    this.currentTile = NEXT_TILE[this.currentTile];
    this.hudText.setText(this.hudContent());
    this.showGhost(cell.x, cell.y);

    this.refreshStatus('saving…');
  }

  private handleKey(event: KeyboardEvent): void {
    const keyLower = event.key.toLowerCase();

    if (event.key === '1') {
      this.currentTile = 'ground';
      this.hudText.setText(this.hudContent());
    } else if (event.key === '2') {
      this.currentTile = 'road';
      this.hudText.setText(this.hudContent());
    } else if (keyLower === 'r') {
      // Поворот выбранного тайла по часовой стрелке
      this.currentRotation = (this.currentRotation + 90) % 360;
      this.hudText.setText(this.hudContent());

      if (this.ghost) {
        this.ghost.setAngle(this.currentRotation);
      }
    } else if (event.key === 'Escape') {
      this.currentTile = null;
      this.hudText.setText(this.hudContent());
      if (this.ghost) this.ghost.setVisible(false);
    } else if (event.ctrlKey && keyLower === 's') {
      event.preventDefault();
      if (this.mapJson) {
        void saveMapNow(this.mapJson).then((ok) =>
          this.refreshStatus(ok ? 'saved!' : 'save failed'),
        );
      }
    }

    if (this.ghost && this.currentTile) {
      const spriteKey = this.currentTile === 'road' ? 'tile-road' : 'tile-ground';
      this.ghost.setTexture(spriteKey);
      this.ghost.setAngle(this.currentRotation);
    }
  }

  private showGhost(cellX: number, cellY: number): void {
    if (!this.currentTile) {
      if (this.ghost) this.ghost.setVisible(false);
      return;
    }
    const px = cellX * TILE_SIZE + TILE_SIZE / 2;
    const py = cellY * TILE_SIZE + TILE_SIZE / 2;
    const spriteKey = this.currentTile === 'road' ? 'tile-road' : 'tile-ground';

    if (!this.ghost) {
      this.ghost = this.add.image(px, py, spriteKey);
      this.ghost.setAlpha(0.6);
      this.ghost.setDepth(1999);
      this.ghost.setAngle(this.currentRotation);
    } else {
      this.ghost.setPosition(px, py);
      this.ghost.setTexture(spriteKey);
      this.ghost.setAngle(this.currentRotation);
      this.ghost.setVisible(true);
    }
  }

  private worldToCell(wx: number, wy: number): { x: number; y: number } | null {
    const cx = Math.floor(wx / TILE_SIZE);
    const cy = Math.floor(wy / TILE_SIZE);
    if (cx < 0 || cx >= MAP_WIDTH || cy < 0 || cy >= MAP_HEIGHT) return null;
    return { x: cx, y: cy };
  }

  private hudContent(): string {
    const sel = this.currentTile ?? '(none)';
    const count = this.mapJson ? Object.keys(this.mapJson.tiles).length : 0;
    return `РЕДАКТОР · Выбрано: ${sel} · Поворот: ${this.currentRotation}° · Создано: ${count} / 900\n[1]Трава [2]Дорога [R]Повернуть [Esc]Отмена [Ctrl+S]Сохранить`;
  }

  private refreshStatus(text: string): void {
    if (!this.statusText) return;
    const s = getSaveStatus();
    const stamp = new Date(s.lastSavedAt).toLocaleTimeString();
    this.statusText.setText(`${text} · save: ${s.state}${s.state === 'saved' ? ` (${stamp})` : ''}`);
  }
}
