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
  TILE_COLORS,
  getSaveStatus,
} from '../systems/MapSystem';

const PIXEL_WIDTH = MAP_WIDTH * TILE_SIZE;
const PIXEL_HEIGHT = MAP_HEIGHT * TILE_SIZE;

export class EditorScene extends Phaser.Scene {
  private mapJson: MapDocument | null = null;
  private currentTile: TileType | null = 'ground';
  private layer!: Phaser.GameObjects.Graphics;
  private ghost!: Phaser.GameObjects.Rectangle;
  private hudText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'Editor' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0a0a0a');
    this.cameras.main.setBounds(0, 0, PIXEL_WIDTH, PIXEL_HEIGHT);

    // Центрируем камеру на середине карты — по умолчанию Phaser ставит камеру в (0,0),
    // и пользователь видит только верхний левый угол. С центром — видит середину.
    this.cameras.main.centerOn(PIXEL_WIDTH / 2, PIXEL_HEIGHT / 2);

    // Кастомный курсор — крестик для точного попадания в клетки.
    this.input.setDefaultCursor('crosshair');

    // Сетка-фон: рисуем 200×200 клеток тонкими линиями, чтобы видно playable area
    // даже если ни один тайл ещё не поставлен.
    this.drawGridBackground();

    // Тонкая обводка по границам карты (чтобы было видно границы)
    const border = this.add.graphics();
    border.lineStyle(2, 0xff6b6b, 0.6);
    border.strokeRect(0, 0, PIXEL_WIDTH, PIXEL_HEIGHT);
    border.setDepth(0);

    // HUD верхний левый
    this.hudText = this.add.text(16, 16, this.hudContent(), {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#ff6b6b',
      backgroundColor: '#000000aa',
      padding: { x: 8, y: 4 },
    });
    this.hudText.setScrollFactor(0);
    this.hudText.setDepth(2000);

    this.statusText = this.add.text(16, 44, 'loading…', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#cccccc',
      backgroundColor: '#000000aa',
      padding: { x: 8, y: 4 },
    });
    this.statusText.setScrollFactor(0);
    this.statusText.setDepth(2000);

    // Координаты внизу слева — чтобы видеть, где курсор в клеточной системе
    this.coordText = this.add.text(16, 72, 'cell: —, —', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#aaccff',
      backgroundColor: '#000000aa',
      padding: { x: 8, y: 4 },
    });
    this.coordText.setScrollFactor(0);
    this.coordText.setDepth(2000);

    // Zoom-индикатор (обновляется в wheel-handler)
    this.zoomText = this.add.text(16, 100, 'zoom: 1.00x  ·  scroll wheel to change', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#ffcc00',
      backgroundColor: '#000000aa',
      padding: { x: 8, y: 4 },
    });
    this.zoomText.setScrollFactor(0);
    this.zoomText.setDepth(2000);

    // Mouse wheel = zoom. zoom 0.1x (вся карта) … 4x (детали одной клетки).
    // Камера зумится в текущей точке — естественно для editor.
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objs: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      const oldZoom = cam.zoom;
      const newZoom = Phaser.Math.Clamp(oldZoom - dy * 0.0015, 0.1, 4);
      if (Math.abs(newZoom - oldZoom) < 0.001) return;
      // Зум вокруг курсора: worldX = scrollX + pointer.x / oldZoom, после зума
      // new_scrollX = worldX * newZoom - pointer.x — точка под курсором остаётся на месте.
      const worldX = _pointer.worldX;
      const worldY = _pointer.worldY;
      cam.setZoom(newZoom);
      cam.scrollX = worldX * newZoom - _pointer.x;
      cam.scrollY = worldY * newZoom - _pointer.y;
      if (this.zoomText && this.zoomText.active) {
        this.zoomText.setText(`zoom: ${cam.zoom.toFixed(2)}x  ·  scroll wheel to change`);
      }
    });

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

  private async loadInitial(): Promise<void> {
    const map = await loadMap();
    this.mapJson = map;
    this.renderAll();
    this.refreshStatus('ready');
    console.log('[MoneyRoll][editor] map rendered');
  }

  private renderAll(): void {
    if (this.layer) this.layer.destroy();
    this.layer = this.add.graphics();
    this.layer.setDepth(0);
    for (const [key, type] of Object.entries(this.mapJson?.tiles ?? {})) {
      const [xs, ys] = key.split(',');
      const x = Number(xs);
      const y = Number(ys);
      if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
      this.layer.fillStyle(TILE_COLORS[type], 1);
      this.layer.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }

  /**
   * Сетка-фон: minor-линии каждый TILE_SIZE (200×200 клеток) + major-линии
   * каждые 10 клеток (для ориентации). Major ярче, чтобы не терялись.
   * Два Graphics-объекта = два draw call (всё равно быстро).
   */
  private drawGridBackground(): void {
    // Minor: 1px, средне-серый, каждые 64px (границы клеток)
    const minor = this.add.graphics();
    minor.lineStyle(1, 0x707070, 1);
    minor.setDepth(-2);
    for (let x = 0; x <= MAP_WIDTH; x++) {
      if (x % 10 === 0) continue; // major нарисует эти
      minor.lineBetween(x * TILE_SIZE, 0, x * TILE_SIZE, PIXEL_HEIGHT);
    }
    for (let y = 0; y <= MAP_HEIGHT; y++) {
      if (y % 10 === 0) continue;
      minor.lineBetween(0, y * TILE_SIZE, PIXEL_WIDTH, y * TILE_SIZE);
    }

    // Major: 2px, светло-серый, каждые 10 клеток (640px) — для ориентации
    const major = this.add.graphics();
    major.lineStyle(2, 0xc0c0c0, 1);
    major.setDepth(-1);
    for (let x = 0; x <= MAP_WIDTH; x += 10) {
      major.lineBetween(x * TILE_SIZE, 0, x * TILE_SIZE, PIXEL_HEIGHT);
    }
    for (let y = 0; y <= MAP_HEIGHT; y += 10) {
      major.lineBetween(0, y * TILE_SIZE, PIXEL_WIDTH, y * TILE_SIZE);
    }
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.mapJson) return;
    const cell = this.worldToCell(pointer.worldX, pointer.worldY);
    if (!this.coordText) return;
    if (!cell) {
      if (this.ghost) this.ghost.setVisible(false);
      this.coordText.setText('cell: —, —');
      return;
    }
    this.showGhost(cell.x, cell.y);
    this.coordText.setText(`cell: ${cell.x}, ${cell.y}  ·  200×200  ·  64px each`);
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.mapJson || !this.currentTile) return;
    if (pointer.button !== 0) return; // только ЛКМ
    const cell = this.worldToCell(pointer.worldX, pointer.worldY);
    if (!cell) return;

    const key = cellKey(cell.x, cell.y);
    this.mapJson.tiles[key] = this.currentTile;

    // Перерисовка одной клетки внутри общего Graphics (быстрее + сохраняет z-stack)
    this.layer.fillStyle(TILE_COLORS[this.currentTile], 1);
    this.layer.fillRect(cell.x * TILE_SIZE, cell.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);

    // Автосохранение (debounced)
    saveMapDebounced(this.mapJson, 600);

    // Цикл: ставим текущий → переключаемся на следующий
    this.currentTile = NEXT_TILE[this.currentTile];
    this.hudText.setText(this.hudContent());
    this.showGhost(cell.x, cell.y);

    this.refreshStatus('saving…');
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.key === '1') {
      this.currentTile = 'ground';
      this.hudText.setText(this.hudContent());
    } else if (event.key === '2') {
      this.currentTile = 'road';
      this.hudText.setText(this.hudContent());
    } else if (event.key === 'Escape') {
      this.currentTile = null;
      this.hudText.setText(this.hudContent());
      if (this.ghost) this.ghost.setVisible(false);
    } else if (event.ctrlKey && (event.key === 's' || event.key === 'S')) {
      event.preventDefault();
      if (this.mapJson) {
        void saveMapNow(this.mapJson).then((ok) =>
          this.refreshStatus(ok ? 'saved!' : 'save failed'),
        );
      }
    }

    // При наличии курсора и валидного типа — обновить цвет ghost
    if (this.ghost && this.currentTile) {
      this.ghost.setFillStyle(TILE_COLORS[this.currentTile]);
    }
  }

  private showGhost(cellX: number, cellY: number): void {
    if (!this.currentTile) {
      if (this.ghost) this.ghost.setVisible(false);
      return;
    }
    const px = cellX * TILE_SIZE + TILE_SIZE / 2;
    const py = cellY * TILE_SIZE + TILE_SIZE / 2;
    if (!this.ghost) {
      this.ghost = this.add.rectangle(px, py, TILE_SIZE, TILE_SIZE, TILE_COLORS[this.currentTile]);
      this.ghost.setAlpha(0.6);
      this.ghost.setStrokeStyle(3, 0xffffff);  // белая рамка 3px — видно на любом фоне
      this.ghost.setDepth(1999);
    } else {
      this.ghost.setPosition(px, py);
      this.ghost.setVisible(true);
      this.ghost.setFillStyle(TILE_COLORS[this.currentTile]);
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
    return `EDITOR · selected: ${sel} · placed: ${count} · [1]ground [2]road [Esc]cancel`;
  }

  /** Координаты мыши в клеточной сетке — для HUD внизу. */
  private coordText!: Phaser.GameObjects.Text;

  /** Zoom-индикатор в HUD. */
  private zoomText!: Phaser.GameObjects.Text;

  private refreshStatus(text: string): void {
    if (!this.statusText) return;
    const s = getSaveStatus();
    const stamp = new Date(s.lastSavedAt).toLocaleTimeString();
    this.statusText.setText(`${text} · save: ${s.state}${s.state === 'saved' ? ` (${stamp})` : ''}`);
  }
}
