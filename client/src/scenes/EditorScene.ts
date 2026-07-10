import Phaser from 'phaser';
import {
  MAP_WIDTH,
  MAP_HEIGHT,
  TILE_SIZE,
  TILE_SIZE_HALF,
  cellKey,
  type TileType,
  type MapDocument,
  type MapEntity,
  type MapEntityType,
} from '../../../shared/map';
import { PROPERTIES, type PropertyType } from '../../../shared/economy';
import {
  loadMap,
  saveMapDebounced,
  saveMapNow,
  getSaveStatus,
} from '../systems/MapSystem';

// ============================================================
//  SECTION: EDITOR CONSTANTS
// ============================================================
const PIXEL_WIDTH = MAP_WIDTH * TILE_SIZE;
const PIXEL_HEIGHT = MAP_HEIGHT * TILE_SIZE;

export class EditorScene extends Phaser.Scene {
  // ============================================================
  //  SECTION: STATE
  // ============================================================
  private mapJson: MapDocument | null = null;
  private currentTool: 'tile' | 'entity' | 'eraser' = 'tile';
  private selectedTileType: TileType = 'ground-grass';
  private selectedEntityType: MapEntityType = 'kiosk';
  private selectedPropertyType: PropertyType = 'shack';
  private currentRotation = 0; // 0, 90, 180, 270

  // ============================================================
  //  SECTION: SPRITES & UI
  // ============================================================
  private tileImagesMap = new Map<string, Phaser.GameObjects.Image>();
  private entitySpritesMap = new Map<string, Phaser.GameObjects.GameObject>();
  private ghost!: Phaser.GameObjects.Image;
  private hudText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private coordText!: Phaser.GameObjects.Text;

  // ============================================================
  //  SECTION: INPUT
  // ============================================================
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasdKeys!: any;

  constructor() {
    super({ key: 'Editor' });
  }

  create(): void {
    // ---------- Camera ----------
    this.cameras.main.setBackgroundColor('#0a0a0a');
    this.cameras.main.setBounds(0, 0, PIXEL_WIDTH, PIXEL_HEIGHT);
    this.cameras.main.centerOn(PIXEL_WIDTH / 2, PIXEL_HEIGHT / 2);

    // ---------- Input ----------
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasdKeys = this.input.keyboard!.addKeys('W,A,S,D') as any;
    this.input.setDefaultCursor('crosshair');
    this.input.mouse!.disableContextMenu();

    // ---------- Grid ----------
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

  // ============================================================
  //  SECTION: CAMERA FLIGHT
  // ============================================================
  update(): void {
    const speed = 12;
    if (this.wasdKeys.W.isDown || this.cursors.up.isDown) {
      this.cameras.main.scrollY -= speed;
    }
    if (this.wasdKeys.S.isDown || this.cursors.down.isDown) {
      this.cameras.main.scrollY += speed;
    }
    if (this.wasdKeys.A.isDown || this.cursors.left.isDown) {
      this.cameras.main.scrollX -= speed;
    }
    if (this.wasdKeys.D.isDown || this.cursors.right.isDown) {
      this.cameras.main.scrollX += speed;
    }
  }

  // ============================================================
  //  SECTION: GRID DRAWING
  // ============================================================
  private drawGridBackground(): void {
    // Minor grid: every tile
    const minor = this.add.graphics();
    minor.lineStyle(1, 0x222222, 0.4);
    minor.setDepth(0);
    for (let x = 0; x <= MAP_WIDTH; x++) {
      minor.lineBetween(x * TILE_SIZE, 0, x * TILE_SIZE, PIXEL_HEIGHT);
    }
    for (let y = 0; y <= MAP_HEIGHT; y++) {
      minor.lineBetween(0, y * TILE_SIZE, PIXEL_WIDTH, y * TILE_SIZE);
    }

    // Major grid: every 10 tiles
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

  // ============================================================
  //  SECTION: MAP LOADING
  // ============================================================
  private async loadInitial(): Promise<void> {
    const map = await loadMap();
    if (!map.rotations) map.rotations = {};
    if (!map.entities) map.entities = {};

    this.mapJson = map;
    this.renderAll();
    this.refreshStatus('ready');
  }

  // ============================================================
  //  SECTION: MAP RENDERING
  // ============================================================
  private renderAll(): void {
    // Cleanup
    for (const img of this.tileImagesMap.values()) {
      img.destroy();
    }
    this.tileImagesMap.clear();

    for (const gobj of this.entitySpritesMap.values()) {
      gobj.destroy();
    }
    this.entitySpritesMap.clear();

    if (!this.mapJson) return;

    // Render tiles
    for (let x = 0; x < MAP_WIDTH; x++) {
      for (let y = 0; y < MAP_HEIGHT; y++) {
        const key = cellKey(x, y);
        const type = this.mapJson.tiles[key] ?? 'ground-grass';
        const rot = this.mapJson.rotations?.[key] ?? 0;

        const px = x * TILE_SIZE + TILE_SIZE_HALF;
        const py = y * TILE_SIZE + TILE_SIZE_HALF;

        const img = this.add.image(px, py, `tile-${type}`);
        img.setDepth(2);
        img.setAngle(rot);

        this.tileImagesMap.set(key, img);
      }
    }

    // Render entities
    for (const [key, entity] of Object.entries(this.mapJson.entities ?? {})) {
      this.renderEntity(key, entity);
    }
  }

  // ============================================================
  //  SECTION: ENTITY RENDERING
  // ============================================================
  private renderEntity(key: string, entity: MapEntity): void {
    const oldSprite = this.entitySpritesMap.get(key);
    if (oldSprite) oldSprite.destroy();

    const px = entity.cellX * TILE_SIZE + TILE_SIZE_HALF;
    const py = entity.cellY * TILE_SIZE + TILE_SIZE_HALF;

    switch (entity.type) {
      case 'kiosk':
      case 'food-cart':
      case 'clothing-shop':
      case 'electronics-shop':
      case 'apartment-1':
      case 'apartment-2':
      case 'wall':
      case 'school':
      case 'courier-hub':
      case 'trash-sort-station':
      case 'lemonade-stand':
        this.renderImageEntity(
          key,
          entity,
          px,
          py,
          entity.type,
          0.9,
        );
        break;
      case 'spawner':
        this.renderSpawner(key, entity, px, py);
        break;
      case 'npc':
        this.renderNpc(key, entity, px, py);
        break;
      case 'building':
        this.renderBuilding(key, entity, px, py);
        break;
      case 'property':
        this.renderPropertyImage(key, entity, px, py);
        break;
    }
  }

  private renderImageEntity(
    key: string,
    entity: MapEntity,
    px: number,
    py: number,
    texture: string,
    scale: number
  ): void {
    const img = this.add.image(px, py, texture);
    img.setScale(scale);
    img.setAngle(entity.rotation);
    img.setDepth(100);
    this.entitySpritesMap.set(key, img);
  }

  private renderSpawner(key: string, entity: MapEntity, px: number, py: number): void {
    const radiusInCells = entity.properties.spawnRadius ?? 3;
    const radiusInPixels = radiusInCells * TILE_SIZE;
    const interval = entity.properties.spawnInterval ?? 15;

    const visualContainer = this.add.container(px, py);
    visualContainer.setDepth(100);

    const rangeCircle = this.add.graphics();
    rangeCircle.lineStyle(2, 0xffd700, 0.6);
    rangeCircle.strokeCircle(0, 0, radiusInPixels);

    const mark = this.add.rectangle(0, 0, 80, 80, 0xffd700, 0.2);
    mark.setStrokeStyle(2, 0xffd700, 0.8);

    const botImg = this.add.image(0, 0, 'bottle-water');
    botImg.setScale(0.7);

    const labelText = `Территория спавна\nРадиус: ${radiusInCells} кл (${interval}с)`;
    const label = this.add.text(0, -60, labelText, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#ffd700',
      backgroundColor: '#000000aa',
      align: 'center',
      padding: { x: 5, y: 3 }
    });
    label.setOrigin(0.5);

    visualContainer.add([rangeCircle, mark, botImg, label]);
    this.entitySpritesMap.set(key, visualContainer);
  }

  private renderNpc(key: string, entity: MapEntity, px: number, py: number): void {
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
  }

  private renderBuilding(key: string, entity: MapEntity, px: number, py: number): void {
    const visualContainer = this.add.container(px, py);
    visualContainer.setDepth(100);

    const body = this.add.rectangle(0, 0, 110, 110, 0x777788, 0.9);
    body.setStrokeStyle(3, 0xbbbbcc);

    const label = this.add.text(0, 0, entity.properties.label || 'ЗДАНИЕ', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#ffffff',
      fontStyle: 'bold',
    });
    label.setOrigin(0.5);

    visualContainer.add([body, label]);
    this.entitySpritesMap.set(key, visualContainer);
  }

  private renderPropertyImage(key: string, entity: MapEntity, px: number, py: number): void {
    const propertyType = entity.properties.propertyType ?? 'shack';
    const texture = propertyType === 'shack'
      ? 'shack'
      : propertyType === 'apartment-big'
        ? 'apartment-2'
        : propertyType === 'lemonade-stand'
          ? 'lemonade-stand'
          : 'apartment-1';
    this.renderImageEntity(key, entity, px, py, texture, 0.9);
  }

  private entityLabel(): string | undefined {
    switch (this.selectedEntityType) {
      case 'building':
        return 'МАГАЗИН';
      case 'npc':
        return 'Торговец';
      case 'courier-hub':
        return 'Курьер';
      case 'lemonade-stand':
        return 'Лимонад';
      case 'trash-sort-station':
        return 'Сортировка мусора';
      case 'property':
        return PROPERTIES[this.selectedPropertyType].name;
      default:
        return undefined;
    }
  }

  // ============================================================
  //  SECTION: INPUT HANDLING
  // ============================================================
  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.mapJson) return;

    // Drag camera with Space + LMB or middle mouse button
    if (pointer.isDown && (pointer.button === 1 || this.input.keyboard!.addKey('SPACE').isDown)) {
      this.cameras.main.scrollX -= (pointer.x - pointer.prevPosition.x);
      this.cameras.main.scrollY -= (pointer.y - pointer.prevPosition.y);
      return;
    }

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
      this.mapJson.tiles[key] = this.selectedTileType;
      if (!this.mapJson.rotations) this.mapJson.rotations = {};
      this.mapJson.rotations[key] = this.currentRotation;

      const spriteKey = `tile-${this.selectedTileType}`;
      const existingImg = this.tileImagesMap.get(key);
      if (existingImg) {
        existingImg.setTexture(spriteKey);
        existingImg.setAngle(this.currentRotation);
      } else {
        const px = cell.x * TILE_SIZE + TILE_SIZE_HALF;
        const py = cell.y * TILE_SIZE + TILE_SIZE_HALF;
        const img = this.add.image(px, py, spriteKey);
        img.setDepth(2);
        img.setAngle(this.currentRotation);
        this.tileImagesMap.set(key, img);
      }
    } else if (this.currentTool === 'entity') {
      const intervalVal = parseInt((document.getElementById('prop-interval') as HTMLInputElement)?.value || '15');
      const maxVal = parseInt((document.getElementById('prop-max') as HTMLInputElement)?.value || '3');
      const radiusVal = parseInt((document.getElementById('prop-radius') as HTMLInputElement)?.value || '3');

      const newEntity: MapEntity = {
        id: `entity_${Math.random().toString(36).slice(2, 10)}`,
        type: this.selectedEntityType,
        cellX: cell.x,
        cellY: cell.y,
        rotation: this.currentRotation,
        properties: {
          spawnInterval: intervalVal,
          maxBottles: maxVal,
          spawnRadius: radiusVal,
          propertyType: this.selectedEntityType === 'property' ? this.selectedPropertyType : undefined,
          label: this.entityLabel(),
        },
      };

      if (!this.mapJson.entities) this.mapJson.entities = {};
      this.mapJson.entities[key] = newEntity;
      this.renderEntity(key, newEntity);
    }

    saveMapDebounced(this.mapJson, 600);
    this.refreshStatus('сохранение…');
  }

  private deleteEntityAt(key: string): void {
    if (!this.mapJson) return;

    if (this.mapJson.entities && this.mapJson.entities[key]) {
      delete this.mapJson.entities[key];
    }

    const sprite = this.entitySpritesMap.get(key);
    if (sprite) {
      sprite.destroy();
      this.entitySpritesMap.delete(key);
    }

    if (this.currentTool === 'eraser') {
      this.mapJson.tiles[key] = 'ground-grass';
      const tileImg = this.tileImagesMap.get(key);
      if (tileImg) {
        tileImg.setTexture('tile-ground-grass');
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
    const px = cellX * TILE_SIZE + TILE_SIZE_HALF;
    const py = cellY * TILE_SIZE + TILE_SIZE_HALF;

    let spriteKey = 'tile-ground-grass';
    
    if (this.currentTool === 'tile') {
      spriteKey = 'tile-' + this.selectedTileType;
    } else if (this.currentTool === 'entity') {
      if (this.selectedEntityType === 'kiosk') {
        spriteKey = 'recycle-machine';
      } else if (this.selectedEntityType === 'food-cart') {
        spriteKey = 'food-cart';
      } else if (this.selectedEntityType === 'clothing-shop') {
        spriteKey = 'clothing-shop';
      } else if (this.selectedEntityType === 'electronics-shop') {
        spriteKey = 'electronics-shop';
      } else if (this.selectedEntityType === 'apartment-1') {
        spriteKey = 'apartment-1';
      } else if (this.selectedEntityType === 'apartment-2') {
        spriteKey = 'apartment-2';
      } else if (this.selectedEntityType === 'wall') {
        spriteKey = 'wall';
      } else if (this.selectedEntityType === 'school') {
        spriteKey = 'school';
      } else if (this.selectedEntityType === 'npc') {
        spriteKey = 'player-sprites';
      } else if (this.selectedEntityType === 'courier-hub') {
        spriteKey = 'courier-hub';
      } else if (this.selectedEntityType === 'trash-sort-station') {
        spriteKey = 'trash-sort-station';
      } else if (this.selectedEntityType === 'lemonade-stand') {
        spriteKey = 'lemonade-stand';
      } else if (this.selectedEntityType === 'property') {
        spriteKey = this.selectedPropertyType === 'shack'
          ? 'shack'
          : this.selectedPropertyType === 'apartment-big'
            ? 'apartment-2'
            : this.selectedPropertyType === 'lemonade-stand'
              ? 'lemonade-stand'
              : 'apartment-1';
      } else {
        spriteKey = 'bottle-water';
      }
    } else {
      spriteKey = 'tile-ground-grass'; // ластик
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
    const totalCells = MAP_WIDTH * MAP_HEIGHT;
    return `РЕДАКТОР · Клеток: ${count}/${totalCells} · Объектов: ${objCount}\nWASD / Стрелочки — Свободный полёт по карте!\nЗажатый Space + ЛКМ — Перетаскивание камеры!`;
  }

  private refreshStatus(text: string): void {
    if (!this.statusText) return;
    const s = getSaveStatus();
    const stamp = new Date(s.lastSavedAt).toLocaleTimeString();
    this.statusText.setText(`${text} · статус: ${s.state}${s.state === 'saved' ? ` (${stamp})` : ''}`);
    this.hudText.setText(this.hudContent());
  }

  // ============================================================
  //  SECTION: SIDEBAR UI
  // ============================================================
  private createSidebarUI(): void {
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
          <option value="ground-grass">Трава (Ground Grass)</option>
          <option value="ground-sand">Песок (Ground Sand)</option>
          <option value="ground-dirt">Грязь (Ground Dirt)</option>
          <option value="road-straight">Прямая дорога (Road Straight)</option>
          <option value="road-corner">Поворот дороги (Road Corner)</option>
          <option value="road-t-junction">Т-образный перекресток (Road T)</option>
          <option value="road-crossroad">4-сторонний перекресток (Road Cross)</option>
        </select>
      </div>

      <!-- Параметры объекта -->
      <div id="entity-tool-options" style="margin-bottom:15px; background:rgba(255,255,255,0.05); padding:8px; border-radius:4px; display:none;">
        <strong style="color:#ffd700; display:block; margin-bottom:4px;">ТИП ОБЪЕКТА:</strong>
        <select id="editor-entity-select" style="width:100%; background:#222; color:#fff; border:1px solid #ff6b6b; padding:5px; border-radius:4px; cursor:pointer; margin-bottom:10px;">
          <optgroup label="Мир и магазины">
            <option value="kiosk">Recycle Kiosk (Автомат)</option>
            <option value="spawner">Bottle Spawner (Спавнер)</option>
            <option value="food-cart">Ларёк с Шаурмой (Магазин)</option>
            <option value="clothing-shop">Магазин одежды (Гардероб)</option>
            <option value="electronics-shop">📱 Магазин электроники</option>
            <option value="school">🎓 Школа профессий</option>
            <option value="apartment-1">Кирпичный жилой дом</option>
            <option value="apartment-2">Панельный жилой дом</option>
            <option value="wall">Забор/Стена (Препятствие)</option>
            <option value="building">Здание (Декор)</option>
            <option value="npc">NPC-Житель</option>
          </optgroup>
          <optgroup label="Работы">
            <option value="courier-hub">📦 Курьер-Хаб</option>
            <option value="trash-sort-station">♻ Станция сортировки</option>
            <option value="lemonade-stand">🍋 Лимонад-стенд</option>
          </optgroup>
          <optgroup label="Инвестиции">
            <option value="property">⌂ Точка покупки недвижимости</option>
          </optgroup>
        </select>

        <div id="editor-property-props" style="display:none; border-top:1px solid #444; padding-top:8px; margin-bottom:8px;">
          <label style="display:block; margin-bottom:5px;">Тип недвижимости:</label>
          <select id="editor-property-select" style="width:100%; background:#111; color:#d8b4fe; border:1px solid #a855f7; padding:4px; border-radius:3px; cursor:pointer;">
            <option value="shack">Сарай с бомжами — $120 · +$3/мин</option>
            <option value="apartment-small">Хрущёвка — $450 · +$12/мин</option>
            <option value="apartment-big">Пентхаус — $1500 · +$45/мин</option>
            <option value="lemonade-stand">🍋 Лимонад-стенд — $320 · +$8.5/мин</option>
          </select>
          <div id="editor-property-info" style="color:#d8b4fe; font-size:11px; line-height:1.35; margin-top:6px;"></div>
        </div>

        <div id="editor-spawner-props" style="display:none; border-top:1px solid #444; padding-top:8px;">
          <label style="display:block; margin-bottom:8px;">
            Интервал спавна (сек):
            <input type="number" id="prop-interval" value="15" min="2" style="width:100%; box-sizing:border-box; background:#111; color:#7cfc00; border:1px solid #555; padding:4px; border-radius:3px; margin-top:2px;" />
          </label>
          <label style="display:block; margin-bottom:8px;">
            Макс. бутылок рядом:
            <input type="number" id="prop-max" value="3" min="1" style="width:100%; box-sizing:border-box; background:#111; color:#7cfc00; border:1px solid #555; padding:4px; border-radius:3px; margin-top:2px;" />
          </label>
          <label style="display:block;">
            Радиус территории (клет.):
            <input type="number" id="prop-radius" value="3" min="1" max="10" style="width:100%; box-sizing:border-box; background:#111; color:#7cfc00; border:1px solid #555; padding:4px; border-radius:3px; margin-top:2px;" />
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
    const propertyProps = sidebar.querySelector('#editor-property-props') as HTMLDivElement;
    const propertySelect = sidebar.querySelector('#editor-property-select') as HTMLSelectElement;
    const propertyInfo = sidebar.querySelector('#editor-property-info') as HTMLDivElement;

    const refreshEntityOptions = () => {
      spawnerProps.style.display = this.selectedEntityType === 'spawner' ? 'block' : 'none';
      propertyProps.style.display = this.selectedEntityType === 'property' ? 'block' : 'none';
      const property = PROPERTIES[this.selectedPropertyType];
      propertyInfo.textContent = `${property.name}: покупка $${property.price}, пассивный доход $${property.incomePerMin}/мин.`;
    };

    entitySelect.addEventListener('change', () => {
      this.selectedEntityType = entitySelect.value as MapEntityType;
      refreshEntityOptions();
    });
    propertySelect.addEventListener('change', () => {
      this.selectedPropertyType = propertySelect.value as PropertyType;
      refreshEntityOptions();
    });
    refreshEntityOptions();

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
