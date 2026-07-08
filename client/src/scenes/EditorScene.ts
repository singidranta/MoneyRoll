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

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.mapJson) return;
    const cell = this.worldToCell(pointer.worldX, pointer.worldY);
    if (!cell) {
      if (this.ghost) this.ghost.setVisible(false);
      return;
    }
    this.showGhost(cell.x, cell.y);
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
      this.ghost.setAlpha(0.5);
      this.ghost.setStrokeStyle(2, 0xffff00);
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

  private refreshStatus(text: string): void {
    if (!this.statusText) return;
    const s = getSaveStatus();
    const stamp = new Date(s.lastSavedAt).toLocaleTimeString();
    this.statusText.setText(`${text} · save: ${s.state}${s.state === 'saved' ? ` (${stamp})` : ''}`);
  }
}
