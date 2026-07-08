import Phaser from 'phaser';
import {
  MAP_WIDTH,
  MAP_HEIGHT,
  TILE_SIZE,
  cellKey,
  type TileType,
  type MapDocument,
  type MapEntity,
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
  
  // Выбранные инструменты
  private currentTool: 'tile' | 'entity' | 'eraser' = 'tile';
  private selectedTileType: TileType = 'ground';
  private selectedEntityType: 'kiosk' | 'spawner' | 'npc' | 'building' = 'kiosk';
  private currentRotation = 0; // 0, 90, 180, 270

  // Спрайты
  private tileImagesMap = new Map<string, Phaser.GameObjects.Image>();
  private entitySpritesMap = new Map<string, Phaser.GameObjects.GameObject>();
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

    // Центрируем камеру по умолчанию
    this.cameras.main.centerOn(PIXEL_WIDTH / 2, PIXEL_HEIGHT / 2);

    // Кастомный курсор
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

    this.coordText = this.add.text(16, 76, 'cell: —, —, tool: TILE', {
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

    // Управление мышкой
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerdown', this.handlePointerDown, this);

    // Создаем HTML Sidebar
    this.createSidebarUI();

    // Загружаем карту
    void this.loadInitial();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.removeSidebarUI();
    });

    console.log('[MoneyRoll] Editor ready!');
  }

  private drawGridBackground(): void {
    // Мелкая сетка (каждые 128px)
    const minor = this.add.graphics();
    minor.lineStyle(1, 0x222222, 0.4);
    minor.setDepth(0);
    for (let x = 0; x <= MAP_WIDTH; x++) {
      minor.lineBetween(x * TILE_SIZE, 0, x * TILE_SIZE, PIXEL_HEIGHT);
    }
    for (let y = 0; y <= MAP_HEIGHT; y++) {
      minor.lineBetween(0, y * TILE_SIZE, PIXEL_WIDTH, y * TILE_SIZE);
    }

    // Крупная сетка (каждые 10 клеток)
    const major = this.add.graphics();
    major.lineStyle(2, 0x444444, 0.6);
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
    if (!map.rotations) map.rotations = {};
    if (!map.entities) map.entities = {};
    
    this.mapJson = map;
    this.renderAll();
    this.refreshStatus('ready');
  }

  private renderAll(): void {
    // Очищаем тайлы
    for (const img of this.tileImagesMap.values()) {
      img.destroy();
    }
    this.tileImagesMap.clear();

    // Очищаем объекты
    for (const gobj of this.entitySpritesMap.values()) {
      gobj.destroy();
    }
    this.entitySpritesMap.clear();

    if (!this.mapJson) return;

    // 1. Отрисовка тайлов (30х30)
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

    // 2. Отрисовка объектов (entities)
    for (const [key, entity] of Object.entries(this.mapJson.entities ?? {})) {
      this.renderEntity(key, entity);
    }
  }

  private renderEntity(key: string, entity: MapEntity): void {
    // Удаляем старый спрайт по этому ключу если он был
    const oldSprite = this.entitySpritesMap.get(key);
    if (oldSprite) oldSprite.destroy();

    const px = entity.cellX * TILE_SIZE + TILE_SIZE / 2;
    const py = entity.cellY * TILE_SIZE + TILE_SIZE / 2;

    if (entity.type === 'kiosk') {
      const img = this.add.image(px, py, 'recycle-machine');
      img.setScale(1.1);
      img.setAngle(entity.rotation);
      img.setDepth(100);
      this.entitySpritesMap.set(key, img);
    } else if (entity.type === 'spawner') {
      // Сделаем визуальный контейнер для спавнера (бутылка по центру + желтый пунктирный круг зоны)
      const visualContainer = this.add.container(px, py);
      visualContainer.setDepth(100);

      // Круг зоны спавна
      const rangeCircle = this.add.graphics();
      rangeCircle.lineStyle(2, 0xffd700, 0.6);
      rangeCircle.strokeCircle(0, 0, 150); // примерный радиус спавна

      // Фоновая метка спавнера
      const mark = this.add.rectangle(0, 0, 80, 80, 0xffd700, 0.2);
      mark.setStrokeStyle(2, 0xffd700, 0.8);

      // Иконка бутылки по центру
      const botImg = this.add.image(0, 0, 'bottle-water');
      botImg.setScale(0.7);

      // Текст интервала
      const label = this.add.text(0, -50, `Спавнер (${entity.properties.spawnInterval ?? 15}с)`, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#ffd700',
        backgroundColor: '#000000aa',
        padding: { x: 4, y: 2 }
      });
      label.setOrigin(0.5);

      visualContainer.add([rangeCircle, mark, botImg, label]);
      this.entitySpritesMap.set(key, visualContainer);
    } else if (entity.type === 'npc') {
      // NPC заглушка (синий прямоугольник + надпись NPC)
      const visualContainer = this.add.container(px, py);
      visualContainer.setDepth(100);

      const body = this.add.rectangle(0, 0, 48, 48, 0x00ccff, 0.8);
      body.setStrokeStyle(2, 0xffffff);

      const label = this.add.text(0, -35, entity.properties.label || 'NPC', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#00ccff',
        backgroundColor: '#000000aa',
        padding: { x: 4, y: 2 }
      });
      label.setOrigin(0.5);

      visualContainer.add([body, label]);
      this.entitySpritesMap.set(key, visualContainer);
    } else if (entity.type === 'building') {
      // Декоративное здание (серый куб + надпись)
      const visualContainer = this.add.container(px, py);
      visualContainer.setDepth(100);

      const body = this.add.rectangle(0, 0, 110, 110, 0x777788, 0.9);
      body.setStrokeStyle(3, 0xbbbbcc);

      const label = this.add.text(0, 0, entity.properties.label || 'ЗДАНИЕ', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffffff',
        fontStyle: 'bold'
      });
      label.setOrigin(0.5);

      visualContainer.add([body, label]);
      this.entitySpritesMap.set(key, visualContainer);
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
    this.coordText.setText(`Клетка: ${cell.x}, ${cell.y}  ·  Инструмент: ${this.currentTool.toUpperCase()}`);
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.mapJson) return;
    const cell = this.worldToCell(pointer.worldX, pointer.worldY);
    if (!cell) return;

    const key = cellKey(cell.x, cell.y);

    // ПКМ / Ластик — мгновенно удаляет объект из клетки
    if (pointer.rightButtonDown() || this.currentTool === 'eraser') {
      this.deleteEntityAt(key);
      this.refreshStatus('Изменения сохранены (debounced)');
      return;
    }

    if (pointer.button !== 0) return; // Только левый клик для добавления

    if (this.currentTool === 'tile') {
      // Ставим тайл
      this.mapJson.tiles[key] = this.selectedTileType;
      if (!this.mapJson.rotations) this.mapJson.rotations = {};
      this.mapJson.rotations[key] = this.currentRotation;

      // Визуальное обновление тайла
      const spriteKey = this.selectedTileType === 'road' ? 'tile-road' : 'tile-ground';
      const existingImg = this.tileImagesMap.get(key);
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

    } else if (this.currentTool === 'entity') {
      // Получаем свойства из HTML Sidebar
      const intervalVal = parseInt((document.getElementById('prop-interval') as HTMLInputElement)?.value || '15');
      const maxVal = parseInt((document.getElementById('prop-max') as HTMLInputElement)?.value || '3');

      // Создаем объект MapEntity
      const newEntity: MapEntity = {
        id: `entity_${Math.random().toString(36).slice(2, 10)}`,
        type: this.selectedEntityType,
        cellX: cell.x,
        cellY: cell.y,
        rotation: this.currentRotation,
        properties: {
          spawnInterval: intervalVal,
          maxBottles: maxVal,
          label: this.selectedEntityType === 'building' ? 'МАГАЗИН' : this.selectedEntityType === 'npc' ? 'Торговец' : undefined
        }
      };

      if (!this.mapJson.entities) this.mapJson.entities = {};
      this.mapJson.entities[key] = newEntity;

      // Рисуем объект
      this.renderEntity(key, newEntity);
    }

    // Сохраняем на сервер
    saveMapDebounced(this.mapJson, 600);
    this.refreshStatus('сохранение…');
  }

  private deleteEntityAt(key: string): void {
    if (!this.mapJson) return;
    
    // Удаляем из базы
    if (this.mapJson.entities && this.mapJson.entities[key]) {
      delete this.mapJson.entities[key];
    }

    // Удаляем спрайт
    const sprite = this.entitySpritesMap.get(key);
    if (sprite) {
      sprite.destroy();
      this.entitySpritesMap.delete(key);
    }

    // Если ластик, также очищаем тайл (делаем его травой по дефолту)
    if (this.currentTool === 'eraser') {
      this.mapJson.tiles[key] = 'ground';
      const tileImg = this.tileImagesMap.get(key);
      if (tileImg) {
        tileImg.setTexture('tile-ground');
        tileImg.setAngle(0);
      }
    }

    saveMapDebounced(this.mapJson, 600);
  }

  private handleKey(event: KeyboardEvent): void {
    const keyLower = event.key.toLowerCase();

    if (keyLower === 'r') {
      // Поворот по часовой стрелке
      this.currentRotation = (this.currentRotation + 90) % 360;
      this.hudText.setText(this.hudContent());

      const badge = document.getElementById('rot-badge');
      if (badge) badge.innerText = `${this.currentRotation}°`;

      if (this.ghost) {
        this.ghost.setAngle(this.currentRotation);
      }
    } else if (event.key === 'Escape') {
      this.setTool('eraser');
    } else if (event.ctrlKey && keyLower === 's') {
      event.preventDefault();
      this.saveMapInstantly();
    }
  }

  private showGhost(cellX: number, cellY: number): void {
    const px = cellX * TILE_SIZE + TILE_SIZE / 2;
    const py = cellY * TILE_SIZE + TILE_SIZE / 2;

    let spriteKey = 'tile-ground';
    
    if (this.currentTool === 'tile') {
      spriteKey = this.selectedTileType === 'road' ? 'tile-road' : 'tile-ground';
    } else if (this.currentTool === 'entity') {
      if (this.selectedEntityType === 'kiosk') {
        spriteKey = 'recycle-machine';
      } else {
        spriteKey = 'bottle-water'; // иконка спавнера в ghost
      }
    } else {
      spriteKey = 'tile-ground'; // ластик
    }

    if (!this.ghost) {
      this.ghost = this.add.image(px, py, spriteKey);
      this.ghost.setAlpha(0.6);
      this.ghost.setDepth(1999);
    } else {
      this.ghost.setPosition(px, py);
      this.ghost.setTexture(spriteKey);
    }
    
    this.ghost.setAngle(this.currentRotation);
    this.ghost.setVisible(this.currentTool !== 'eraser');
  }

  private worldToCell(wx: number, wy: number): { x: number; y: number } | null {
    const cx = Math.floor(wx / TILE_SIZE);
    const cy = Math.floor(wy / TILE_SIZE);
    if (cx < 0 || cx >= MAP_WIDTH || cy < 0 || cy >= MAP_HEIGHT) return null;
    return { x: cx, y: cy };
  }

  private saveMapInstantly(): void {
    if (this.mapJson) {
      void saveMapNow(this.mapJson).then((ok) =>
        this.refreshStatus(ok ? 'сохранено на сервер!' : 'Ошибка сохранения!')
      );
    }
  }

  private hudContent(): string {
    const count = this.mapJson ? Object.keys(this.mapJson.tiles).length : 0;
    const objCount = this.mapJson ? Object.keys(this.mapJson.entities ?? {}).length : 0;
    return `РЕДАКТОР · Клеток: ${count}/900 · Объектов: ${objCount}\n[R] Повернуть · [Ctrl+S] Быстрое сохранение`;
  }

  private refreshStatus(text: string): void {
    if (!this.statusText) return;
    const s = getSaveStatus();
    const stamp = new Date(s.lastSavedAt).toLocaleTimeString();
    this.statusText.setText(`${text} · статус: ${s.state}${s.state === 'saved' ? ` (${stamp})` : ''}`);
    this.hudText.setText(this.hudContent());
  }

  // ───── HTML Sidebar UI Panel ─────

  private createSidebarUI(): void {
    // Удаляем старую панель если есть
    this.removeSidebarUI();

    const sidebar = document.createElement('div');
    sidebar.id = 'editor-sidebar';
    sidebar.style.position = 'fixed';
    sidebar.style.right = '15px';
    sidebar.style.top = '15px';
    sidebar.style.width = '280px';
    sidebar.style.background = 'rgba(15,15,15,0.96)';
    sidebar.style.color = '#fafafa';
    sidebar.style.border = '2px solid #ff6b6b';
    sidebar.style.borderRadius = '8px';
    sidebar.style.padding = '15px';
    sidebar.style.fontFamily = 'monospace';
    sidebar.style.fontSize = '13px';
    sidebar.style.zIndex = '99999';
    sidebar.style.boxShadow = '0 4px 15px rgba(0,0,0,0.6)';
    sidebar.style.pointerEvents = 'auto';

    sidebar.innerHTML = `
      <h3 style="margin-top:0; border-bottom:2px solid #ff6b6b; padding-bottom:6px; color:#ff6b6b; text-align:center; letter-spacing:1px;">MONEYROLL EDITOR</h3>
      
      <div style="margin-bottom:15px; border-bottom:1px solid #333; padding-bottom:10px;">
        <strong style="color:#ffd700; display:block; margin-bottom:6px;">1. РЕЖИМ РАБОТЫ:</strong>
        <label style="display:block; margin-bottom:4px; cursor:pointer;">
          <input type="radio" name="editor-tool" value="tile" checked style="cursor:pointer;" /> 🧱 Рисовать тайлы
        </label>
        <label style="display:block; margin-bottom:4px; cursor:pointer;">
          <input type="radio" name="editor-tool" value="entity" style="cursor:pointer;" /> 🤖 Ставить объекты
        </label>
        <label style="display:block; margin-bottom:4px; cursor:pointer;">
          <input type="radio" name="editor-tool" value="eraser" style="cursor:pointer;" /> 🧹 Ластик (Стереть)
        </label>
      </div>

      <!-- Параметры тайла -->
      <div id="tile-tool-options" style="margin-bottom:15px; background:rgba(255,255,255,0.05); padding:8px; border-radius:4px;">
        <strong style="color:#ffd700; display:block; margin-bottom:4px;">ТИП ТАЙЛА:</strong>
        <select id="editor-tile-select" style="width:100%; background:#222; color:#fff; border:1px solid #ff6b6b; padding:5px; border-radius:4px; cursor:pointer;">
          <option value="ground">Трава (Ground)</option>
          <option value="road">Асфальт (Road)</option>
        </select>
      </div>

      <!-- Параметры объекта -->
      <div id="entity-tool-options" style="margin-bottom:15px; background:rgba(255,255,255,0.05); padding:8px; border-radius:4px; display:none;">
        <strong style="color:#ffd700; display:block; margin-bottom:4px;">ТИП ОБЪЕКТА:</strong>
        <select id="editor-entity-select" style="width:100%; background:#222; color:#fff; border:1px solid #ff6b6b; padding:5px; border-radius:4px; cursor:pointer; margin-bottom:10px;">
          <option value="kiosk">Recycle Kiosk (Автомат)</option>
          <option value="spawner">Bottle Spawner (Спавнер)</option>
          <option value="building">Здание (Декор)</option>
          <option value="npc">NPC-Житель</option>
        </select>

        <div id="editor-spawner-props" style="display:none; border-top:1px solid #444; padding-top:8px;">
          <label style="display:block; margin-bottom:8px;">
            Интервал спавна (сек):
            <input type="number" id="prop-interval" value="15" min="2" style="width:100%; box-sizing:border-box; background:#111; color:#7cfc00; border:1px solid #555; padding:4px; border-radius:3px; margin-top:2px;" />
          </label>
          <label style="display:block;">
            Макс. бутылок рядом:
            <input type="number" id="prop-max" value="3" min="1" style="width:100%; box-sizing:border-box; background:#111; color:#7cfc00; border:1px solid #555; padding:4px; border-radius:3px; margin-top:2px;" />
          </label>
        </div>
      </div>

      <div style="margin-bottom:15px; font-size:11px; color:#aaa; line-height:1.4;">
        <span style="color:#ffd700; font-weight:bold;">[R]</span> — Вращать выбранное на 90°<br/>
        Угол вращения: <strong id="rot-badge" style="color:#ff6b6b;">0°</strong><br/>
        <span style="color:#ff3333; font-weight:bold;">[ПКМ]</span> — Быстро стереть клетку
      </div>

      <button id="btn-save-editor" style="width:100%; padding:10px; background:#ff6b6b; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold; letter-spacing:1px; margin-bottom:8px; box-shadow:0 2px 5px rgba(0,0,0,0.3);">Ctrl+S: СОХРАНИТЬ</button>
      <button id="btn-clear-editor" style="width:100%; padding:8px; background:#444; color:#fff; border:none; border-radius:4px; cursor:pointer;">Очистить карту</button>
    `;

    document.body.appendChild(sidebar);

    // Вешаем слушатели событий
    const toolRadios = sidebar.querySelectorAll('input[name="editor-tool"]');
    toolRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        const val = (e.target as HTMLInputElement).value as any;
        this.setTool(val);
      });
    });

    const tileSelect = sidebar.querySelector('#editor-tile-select') as HTMLSelectElement;
    tileSelect.addEventListener('change', () => {
      this.selectedTileType = tileSelect.value as TileType;
    });

    const entitySelect = sidebar.querySelector('#editor-entity-select') as HTMLSelectElement;
    const spawnerProps = sidebar.querySelector('#editor-spawner-props') as HTMLDivElement;
    entitySelect.addEventListener('change', () => {
      this.selectedEntityType = entitySelect.value as any;
      spawnerProps.style.display = this.selectedEntityType === 'spawner' ? 'block' : 'none';
    });

    // Кнопка сохранения
    sidebar.querySelector('#btn-save-editor')?.addEventListener('click', () => {
      this.saveMapInstantly();
    });

    // Кнопка очистки
    sidebar.querySelector('#btn-clear-editor')?.addEventListener('click', () => {
      if (confirm('ВНИМАНИЕ! Вы действительно хотите полностью очистить всю карту?')) {
        if (this.mapJson) {
          this.mapJson.tiles = {};
          this.mapJson.rotations = {};
          this.mapJson.entities = {};
          this.renderAll();
          saveMapDebounced(this.mapJson, 100);
          this.refreshStatus('Карта очищена');
        }
      }
    });
  }

  private setTool(tool: 'tile' | 'entity' | 'eraser'): void {
    this.currentTool = tool;

    // Включаем нужные разделы опций
    const tileProps = document.getElementById('tile-tool-options');
    const entityProps = document.getElementById('entity-tool-options');

    if (tileProps) tileProps.style.display = tool === 'tile' ? 'block' : 'none';
    if (entityProps) entityProps.style.display = tool === 'entity' ? 'block' : 'none';

    // Обновляем радиобаттоны в HTML на случай если переключение вызвано кнопками клавиатуры
    const radio = document.querySelector(`input[name="editor-tool"][value="${tool}"]`) as HTMLInputElement;
    if (radio) radio.checked = true;

    this.hudText.setText(this.hudContent());
  }

  private removeSidebarUI(): void {
    const existing = document.getElementById('editor-sidebar');
    if (existing) {
      existing.remove();
    }
  }
}
