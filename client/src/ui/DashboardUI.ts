// ============================================================
//  SECTION: DASHBOARD (shops + inventory panel)
// ============================================================

import { INVENTORY_SLOTS, type InventoryItem } from '../../../shared/economy';
import {
  getActiveSlotsCount,
  getItemWebpPath,
  getMaxWeight,
  isBag,
  isFood,
} from '../../../shared/items';
import { BOTTLE_TYPES, type BottleType, HUNGER_MAX, HUNGER_CRITICAL } from '../../../shared/economy';

// ============================================================
//  SECTION: FOOD ITEMS
// ============================================================

const FOOD_ITEMS: { key: string; name: string; cost: number; path: string; desc: string }[] = [
  { key: 'shawarma', name: 'Шаурма', cost: 1.5, path: '/assets/props/flat/food/shawarma.webp', desc: '+35 сытости, буст бега' },
  { key: 'hotdog', name: 'Хот-дог', cost: 2.0, path: '/assets/props/flat/food/hotdog.webp', desc: '+20 сытости' },
  { key: 'salad', name: 'Салат', cost: 2.5, path: '/assets/props/flat/food/salad.webp', desc: '+15 сытости, лёгкая' },
  { key: 'energy', name: 'Энергетик', cost: 3.0, path: '/assets/props/flat/food/energy-drink.webp', desc: '+5 сытости, скорость 30с' },
  { key: 'ramen', name: 'Рамен', cost: 3.5, path: '/assets/props/flat/food/ramen.webp', desc: '+30 сытости, горячий' },
  { key: 'sushi', name: 'Суши', cost: 4.5, path: '/assets/props/flat/food/sushi.webp', desc: '+25 сытости, премиум' },
  { key: 'pizza', name: 'Пицца', cost: 5.0, path: '/assets/props/flat/food/pizza.webp', desc: '+40 сытости, сытная' },
  { key: 'steak', name: 'Стейк', cost: 7.0, path: '/assets/props/flat/food/steak.webp', desc: '+50 сытости, королевский' },
];

// ============================================================
//  SECTION: DASHBOARD CALLBACKS
// ============================================================

export type DashboardCallbacks = {
  onClose: () => void;
  onSave: () => void;
  onSellAll: () => void;
  onBuyItem: (itemKey: string, cost: number) => void;
  onBuyClothing: (type: 'jacket' | 'sneakers' | 'crown', cost: number) => void;
  onUnequipBag: () => void;
  onUseSlot: (slotIdx: number, item: InventoryItem) => void;
  onDropSlot: (slotIdx: number) => void;
  onStartDrag: (e: MouseEvent, slotIdx: number, item: InventoryItem) => void;
  onFinishDrag: (toSlot: number) => void;
  onCancelDrag: () => void;
  isDragActive: () => boolean;
  getDragFromSlot: () => number;
};

export type DashboardContext = {
  nearKiosk: boolean;
  nearFoodCart: boolean;
  nearClothingShop: boolean;
  inventory: (InventoryItem | null)[];
  backpackTier: number;
  equippedBag: 'bag-adidas' | 'backpack-tourist' | null;
  currentWeight: number;
  tradeMode: boolean;
  hunger: number;
};

export class DashboardUI {
  private root?: HTMLDivElement;

  get element(): HTMLDivElement | undefined { return this.root; }
  get isOpen(): boolean { return !!this.root; }

  show(ctx: DashboardContext, cb: DashboardCallbacks): void {
    this.destroy();

    const dashboard = document.createElement('div');
    dashboard.id = 'game-dashboard-container';
    document.body.appendChild(dashboard);
    this.root = dashboard;

    // Hunger warning
    if (ctx.hunger <= HUNGER_CRITICAL) {
      dashboard.appendChild(this.createHungerWarning(ctx.hunger));
    }

    if (ctx.nearKiosk) {
      dashboard.appendChild(this.createKioskPanel(cb));
    } else if (ctx.nearFoodCart) {
      dashboard.appendChild(this.createFoodPanel(cb));
    } else if (ctx.nearClothingShop) {
      dashboard.appendChild(this.createClothingPanel(cb));
    }

    const inventoryPanel = this.createInventoryPanel(cb);
    dashboard.appendChild(inventoryPanel);

    const equipSlot = inventoryPanel.querySelector('#equip-bag-slot') as HTMLDivElement;
    equipSlot.addEventListener('click', () => cb.onUnequipBag());

    this.renderInventory(ctx, cb);
  }

  destroy(): void {
    const existing = document.getElementById('game-dashboard-container');
    if (!existing) { this.root = undefined; return; }

    // Close all submenus too
    existing.querySelectorAll('[data-popup]').forEach(el => el.remove());

    existing.remove();
    this.root = undefined;
  }

  // ============================================================
  //  SECTION: HUNGER WARNING
  // ============================================================

  private createHungerWarning(hunger: number): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'dashboard-panel hunger-warning-panel';
    panel.style.cssText = 'border-color:#d45454 !important;';
    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;color:#d45454;font-weight:700;font-size:14px;margin-bottom:8px;">
        <img src="/assets/icons/hunger.webp" width="24" height="24" alt="" />
        <span>Голод: ${Math.round((hunger / HUNGER_MAX) * 100)}%</span>
      </div>
      <p style="font-size:12px;color:#aaa;margin:0 0 8px;">Скорость снижена! Купи еду в ларьке.</p>
      <p style="font-size:11px;color:#888;margin:0;"><strong style="color:#e0b03a;">Совет:</strong> Шаурма ($1.5) - 35 сытости. Самый выгодный вариант!</p>
    `;
    return panel;
  }

  // ============================================================
  //  SECTION: SHOP PANELS
  // ============================================================

  private createKioskPanel(cb: DashboardCallbacks): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'dashboard-panel kiosk shop-panel-large';
    panel.innerHTML = `
      <h3><img src="/assets/props/flat/kiosk/recycle-machine.webp" alt="" />Автомат сдачи</h3>
      <p>Кликни бутылку в инвентаре, чтобы сдать поштучно.</p>
      <div class="kiosk-prices">
        ${Object.entries(BOTTLE_TYPES).map(([key, def]) =>
          `<div class="kiosk-price-row">
            <img src="/assets/props/flat/bottles/${key}.webp" alt="" />
            <span>${def.name}</span>
            <span class="kiosk-price">$${def.price.toFixed(2)}</span>
          </div>`
        ).join('')}
      </div>
      <button id="btn-recycle-all" class="dash-btn dash-btn-primary">Сдать все бутылки</button>
      <button id="btn-close-dashboard" class="dash-btn dash-btn-danger">Закрыть</button>
    `;
    panel.querySelector('#btn-recycle-all')?.addEventListener('click', () => cb.onSellAll());
    panel.querySelector('#btn-close-dashboard')?.addEventListener('click', () => cb.onClose());
    return panel;
  }

  private createFoodPanel(cb: DashboardCallbacks): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'dashboard-panel food shop-panel-large';
    panel.innerHTML = `
      <h3><img src="/assets/props/flat/kiosk/food-cart.webp" alt="" />Ларёк у Ашота</h3>
      <p>Еда восстанавливает сытость. Кликни по еде в инвентаре — съешь.</p>
      <div class="shop-grid">
        ${FOOD_ITEMS.map(f => `
          <div class="shop-card" data-item="${f.key}">
            <div class="shop-card-img"><img src="${f.path}" alt="${f.name}" /></div>
            <div class="shop-card-info">
              <span class="shop-card-name">${f.name}</span>
              <span class="shop-card-desc">${f.desc}</span>
            </div>
            <div class="shop-card-price">$${f.cost.toFixed(2)}</div>
          </div>
        `).join('')}
      </div>
      <button id="btn-close-dashboard" class="dash-btn dash-btn-danger">Закрыть</button>
    `;
    FOOD_ITEMS.forEach(f => {
      panel.querySelector(`[data-item="${f.key}"]`)?.addEventListener('click', () => cb.onBuyItem(f.key, f.cost));
    });
    panel.querySelector('#btn-close-dashboard')?.addEventListener('click', () => cb.onClose());
    return panel;
  }

  private createClothingPanel(cb: DashboardCallbacks): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'dashboard-panel clothing shop-panel-large';
    panel.innerHTML = `
      <h3><img src="/assets/props/flat/buildings/clothing-shop.webp" alt="" />Магазин одежды</h3>
      <div class="shop-section-title">Сумки</div>
      <div class="shop-grid">
        <div class="shop-card" id="btn-buy-bag-adidas">
          <div class="shop-card-img"><img src="/assets/props/flat/bags/bag-adidas.webp" alt="Сумка Adidas" /></div>
          <div class="shop-card-info">
            <span class="shop-card-name">Сумка Adidas</span>
            <span class="shop-card-desc">До 15 кг</span>
          </div>
          <div class="shop-card-price">$15.00</div>
        </div>
        <div class="shop-card" id="btn-buy-backpack-tourist">
          <div class="shop-card-img"><img src="/assets/props/flat/bags/backpack-tourist.webp" alt="Рюкзак туриста" /></div>
          <div class="shop-card-info">
            <span class="shop-card-name">Рюкзак туриста</span>
            <span class="shop-card-desc">До 30 кг</span>
          </div>
          <div class="shop-card-price">$45.00</div>
        </div>
      </div>
      <div class="shop-section-title">Экипировка</div>
      <div class="shop-grid">
        <div class="shop-card" id="btn-buy-jacket">
          <div class="shop-card-img"><img src="/assets/props/flat/clothing/adidas-jacket.webp" alt="Свитшот Adidas" /></div>
          <div class="shop-card-info">
            <span class="shop-card-name">Свитшот Adidas</span>
            <span class="shop-card-desc">+50% регенерация выносливости</span>
          </div>
          <div class="shop-card-price">$10.00</div>
        </div>
        <div class="shop-card" id="btn-buy-sneakers">
          <div class="shop-card-img"><img src="/assets/props/flat/clothing/sneakers.webp" alt="Кроссовки Nike" /></div>
          <div class="shop-card-info">
            <span class="shop-card-name">Кроссовки Nike</span>
            <span class="shop-card-desc">+30% скорость бега</span>
          </div>
          <div class="shop-card-price">$20.00</div>
        </div>
        <div class="shop-card" id="btn-buy-crown">
          <div class="shop-card-img"><img src="/assets/props/flat/clothing/crown.webp" alt="Корона" /></div>
          <div class="shop-card-info">
            <span class="shop-card-name">Золотая корона</span>
            <span class="shop-card-desc">Статус короля улиц</span>
          </div>
          <div class="shop-card-price">$100.00</div>
        </div>
      </div>
      <button id="btn-close-dashboard" class="dash-btn dash-btn-danger">Закрыть</button>
    `;
    panel.querySelector('#btn-buy-bag-adidas')?.addEventListener('click', () => cb.onBuyItem('bag-adidas', 15.0));
    panel.querySelector('#btn-buy-backpack-tourist')?.addEventListener('click', () => cb.onBuyItem('backpack-tourist', 45.0));
    panel.querySelector('#btn-buy-jacket')?.addEventListener('click', () => cb.onBuyClothing('jacket', 10.0));
    panel.querySelector('#btn-buy-sneakers')?.addEventListener('click', () => cb.onBuyClothing('sneakers', 20.0));
    panel.querySelector('#btn-buy-crown')?.addEventListener('click', () => cb.onBuyClothing('crown', 100.0));
    panel.querySelector('#btn-close-dashboard')?.addEventListener('click', () => cb.onClose());
    return panel;
  }

  // ============================================================
  //  SECTION: INVENTORY PANEL
  // ============================================================

  private createInventoryPanel(cb: DashboardCallbacks): HTMLDivElement {
    const panel = document.createElement('div');
    panel.id = 'dashboard-inventory-panel';
    panel.className = 'dashboard-panel inventory-panel-large';
    panel.innerHTML = `
      <div class="inventory-header">
        <span class="inventory-title">
          <img src="/assets/props/flat/bags/backpack-tourist.webp" alt="" />
          Рюкзак
        </span>
        <div class="header-actions">
          <button id="btn-save-game" class="dash-btn-save" title="Сохранить игру">
            <img src="/assets/icons/save.webp" width="16" height="16" alt="Сохранить" />
          </button>
          <button id="btn-close-dashboard-x" class="dash-btn-close" title="Закрыть (I)">&times;</button>
        </div>
      </div>
      <div class="bag-slot-row">
        <div id="equip-bag-slot" class="bag-slot empty"></div>
        <div style="font-size:12px; line-height:1.4;">
          <strong style="color:#e8eaed; display:block; font-size:12px;">Слот сумки</strong>
          <span id="equip-bag-desc" style="color:#8a919e;">Без сумки - 4 кармана</span>
        </div>
      </div>
      <div id="inventory-grid" class="inventory-grid-large"></div>
      <div class="dashboard-footer">
        <span id="inv-guide-text">Кликни предмет - ПКМ выбросить - Перетаскивай</span>
        <span id="inv-weight-status">Вес: 0.0 / ${getMaxWeight(1)} кг</span>
      </div>
    `;
    panel.querySelector('#btn-close-dashboard-x')?.addEventListener('click', () => cb.onClose());
    panel.querySelector('#btn-save-game')?.addEventListener('click', () => cb.onSave());
    return panel;
  }

  // ============================================================
  //  SECTION: INVENTORY GRID
  // ============================================================

  private renderInventory(ctx: DashboardContext, cb: DashboardCallbacks): void {
    if (!this.root) return;

    const grid = this.root.querySelector('#inventory-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const equipSlot = this.root.querySelector('#equip-bag-slot') as HTMLDivElement | null;
    const equipDesc = this.root.querySelector('#equip-bag-desc') as HTMLSpanElement | null;

    if (equipSlot && equipDesc) {
      equipSlot.className = 'bag-slot';
      if (ctx.equippedBag) {
        const bagPath = `/assets/props/flat/bags/${ctx.equippedBag}.webp`;
        equipSlot.classList.add('equipped');
        equipSlot.innerHTML = `<img src="${bagPath}" alt="" />`;
        equipDesc.innerHTML = ctx.equippedBag === 'bag-adidas'
          ? 'Сумка Adidas - 15 кг<br/><span style="color:#8a919e;font-size:11px;">Кликни, чтобы снять</span>'
          : 'Рюкзак туриста - 30 кг<br/><span style="color:#8a919e;font-size:11px;">Кликни, чтобы снять</span>';
      } else {
        equipSlot.classList.add('empty');
        equipSlot.innerHTML = '<span style="font-size:18px;color:#5a6270;">+</span>';
        equipDesc.innerHTML = 'Без сумки - 4 кармана<br/><span style="color:#8a919e;font-size:11px;">Купи сумку в магазине</span>';
      }
    }

    const activeSlotsCount = getActiveSlotsCount(ctx.backpackTier);

    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const item = ctx.inventory[i];
      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      slot.dataset.slotIndex = String(i);

      if (i >= activeSlotsCount) {
        slot.classList.add('locked');
        slot.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" style="opacity:0.35;fill:none;stroke:#4a5261;stroke-width:2.5;"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 1 1 8 0v4"/></svg>';
        grid.appendChild(slot);
        continue;
      }

      if (item) {
        slot.classList.add('has-item');
        const webpPath = getItemWebpPath(item);
        let label = '';
        if (item === 'parcel') {
          label = '<span class="inv-slot-label">посылка</span>';
        } else if (isBag(item)) {
          label = '<span class="inv-slot-label">сумка</span>';
        } else if (isFood(item)) {
          label = '<span class="inv-slot-label">еда</span>';
        } else {
          const weight = BOTTLE_TYPES[item as BottleType]?.weight ?? 1.0;
          label = `<span class="inv-slot-label">${weight} кг</span>`;
        }

        slot.innerHTML = `<img src="${webpPath}" />${label}`;

        slot.addEventListener('mousedown', (e) => { if (e.button === 0) cb.onStartDrag(e, i, item); });
        slot.addEventListener('contextmenu', (e) => { e.preventDefault(); cb.onDropSlot(i); });
        slot.addEventListener('click', () => cb.onUseSlot(i, item));
      } else {
        slot.innerHTML = `<span style="font-size:11px;color:#4a5260;font-weight:600;">${i + 1}</span>`;
      }

      slot.addEventListener('dragover', (e) => { e.preventDefault(); slot.classList.add('drag-over'); });
      slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
      slot.addEventListener('mouseup', (e) => {
        e.preventDefault();
        if (cb.isDragActive() && cb.getDragFromSlot() !== i) cb.onFinishDrag(i);
        cb.onCancelDrag();
      });

      grid.appendChild(slot);
    }

    const maxLimit = getMaxWeight(ctx.backpackTier);
    const weightStatus = this.root.querySelector('#inv-weight-status');
    if (weightStatus) weightStatus.textContent = `Вес: ${ctx.currentWeight.toFixed(1)} / ${maxLimit} кг`;

    const guideText = this.root.querySelector('#inv-guide-text') as HTMLSpanElement | null;
    if (guideText) {
      if (ctx.tradeMode) guideText.textContent = 'Выбери предмет для обмена с игроком';
      else if (ctx.nearKiosk) guideText.textContent = 'Кликни на бутылку, чтобы сдать! ПКМ - выбросить';
      else guideText.textContent = 'Кликни предмет - ПКМ выбросить - Перетаскивай';
    }
  }
}
