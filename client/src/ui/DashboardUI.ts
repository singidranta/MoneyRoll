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
import { BOTTLE_TYPES, type BottleType } from '../../../shared/economy';

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
};

export class DashboardUI {
  private root?: HTMLDivElement;

  get element(): HTMLDivElement | undefined {
    return this.root;
  }

  get isOpen(): boolean {
    return !!this.root;
  }

  show(ctx: DashboardContext, cb: DashboardCallbacks): void {
    this.destroy();

    const dashboard = document.createElement('div');
    dashboard.id = 'game-dashboard-container';
    document.body.appendChild(dashboard);
    this.root = dashboard;

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

  refresh(ctx: DashboardContext, cb: DashboardCallbacks): void {
    if (!this.root) return;
    this.renderInventory(ctx, cb);
  }

  destroy(): void {
    const existing = document.getElementById('game-dashboard-container');
    if (existing) existing.remove();
    this.root = undefined;
  }

  // ============================================================
  //  SECTION: SHOP PANELS
  // ============================================================

  private createKioskPanel(cb: DashboardCallbacks): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'dashboard-panel kiosk shop-panel-large';
    panel.innerHTML = `
      <h3><img src="/assets/props/flat/kiosk/recycle-machine.webp" alt="" />Автомат сдачи</h3>
      <p>Кликни бутылку в инвентаре справа, чтобы сдать поштучно, или используй кнопку ниже для массовой сдачи.</p>
      <div class="kiosk-prices">
        <div class="kiosk-price-row"><img src="/assets/props/flat/bottles/water.webp" /><span>Пластиковая вода</span><span class="kiosk-price">$0.05</span></div>
        <div class="kiosk-price-row"><img src="/assets/props/flat/bottles/beer-glass.webp" /><span>Стекло пиво</span><span class="kiosk-price">$0.20</span></div>
        <div class="kiosk-price-row"><img src="/assets/props/flat/bottles/wine.webp" /><span>Вино</span><span class="kiosk-price">$1.00</span></div>
        <div class="kiosk-price-row"><img src="/assets/props/flat/bottles/champagne.webp" /><span>Шампанское</span><span class="kiosk-price">$5.00</span></div>
        <div class="kiosk-price-row"><img src="/assets/props/flat/bottles/bordeaux-1982.webp" /><span>Bordeaux 1982</span><span class="kiosk-price">$50.00</span></div>
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
      <p>Еда попадает в инвентарь. Кликни по ней, чтобы съесть.</p>
      <div class="shop-grid">
        <div class="shop-card" id="btn-buy-shawa">
          <div class="shop-card-img"><img src="/assets/props/flat/food/shawarma.webp" alt="Шаурма" /></div>
          <div class="shop-card-info">
            <span class="shop-card-name">Шаурма</span>
            <span class="shop-card-desc">Восстанавливает 100% энергии + бафф бега</span>
          </div>
          <div class="shop-card-price">$1.50</div>
        </div>
        <div class="shop-card" id="btn-buy-energy">
          <div class="shop-card-img"><img src="/assets/props/flat/food/energy-drink.webp" alt="Ягуар" /></div>
          <div class="shop-card-info">
            <span class="shop-card-name">Энергетик «Ягуар»</span>
            <span class="shop-card-desc">Бешеная скорость на 30 сек</span>
          </div>
          <div class="shop-card-price">$3.00</div>
        </div>
      </div>
      <button id="btn-close-dashboard" class="dash-btn dash-btn-danger">Закрыть</button>
    `;
    panel.querySelector('#btn-buy-shawa')?.addEventListener('click', () => cb.onBuyItem('shawarma', 1.5));
    panel.querySelector('#btn-buy-energy')?.addEventListener('click', () => cb.onBuyItem('energy', 3.0));
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
          <button id="btn-save-game" class="dash-btn-save" title="Сохранить игру">💾</button>
          <button id="btn-close-dashboard-x" class="dash-btn-close" title="Закрыть (I)">&times;</button>
        </div>
      </div>
      <div class="bag-slot-row">
        <div id="equip-bag-slot" class="bag-slot empty"></div>
        <div style="font-size:12px; line-height:1.4;">
          <strong style="color:#e8eaed; display:block; font-size:12px;">Слот сумки</strong>
          <span id="equip-bag-desc" style="color:#8a919e;">Без сумки · 4 кармана</span>
        </div>
      </div>
      <div id="inventory-grid" class="inventory-grid-large"></div>
      <div class="dashboard-footer">
        <span id="inv-guide-text">Кликни предмет · ПКМ — выбросить · Перетаскивай между слотами</span>
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
        equipDesc.innerHTML =
          ctx.equippedBag === 'bag-adidas'
            ? 'Сумка Adidas · 15 кг<br/><span style="color:#8a919e;font-size:11px;">Кликни, чтобы снять</span>'
            : 'Рюкзак туриста · 30 кг<br/><span style="color:#8a919e;font-size:11px;">Кликни, чтобы снять</span>';
      } else {
        equipSlot.classList.add('empty');
        equipSlot.innerHTML = `<span style="font-size:18px;color:#5a6270;">+</span>`;
        equipDesc.innerHTML =
          'Без сумки · 4 кармана<br/><span style="color:#8a919e;font-size:11px;">Купи сумку в магазине</span>';
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
        slot.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" style="opacity:0.35;fill:none;stroke:#4a5261;stroke-width:2.5;"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 1 1 8 0v4"/></svg>`;
        grid.appendChild(slot);
        continue;
      }

      if (item) {
        slot.classList.add('has-item');

        const webpPath = getItemWebpPath(item);
        let label = '';

        if (isBag(item)) {
          label = '<span class="inv-slot-label">сумка</span>';
        } else if (isFood(item)) {
          label = '<span class="inv-slot-label">еда</span>';
        } else {
          const weight = BOTTLE_TYPES[item as BottleType]?.weight ?? 1.0;
          label = `<span class="inv-slot-label">${weight} кг</span>`;
        }

        slot.innerHTML = `<img src="${webpPath}" />${label}`;

        slot.addEventListener('mousedown', (e) => {
          if (e.button === 0) cb.onStartDrag(e, i, item);
        });

        slot.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          cb.onDropSlot(i);
        });

        slot.addEventListener('click', () => cb.onUseSlot(i, item));
      } else {
        slot.innerHTML = `<span style="font-size:11px;color:#4a5260;font-weight:600;">${i + 1}</span>`;
      }

      slot.addEventListener('dragover', (e) => {
        e.preventDefault();
        slot.classList.add('drag-over');
      });
      slot.addEventListener('dragleave', () => {
        slot.classList.remove('drag-over');
      });
      slot.addEventListener('mouseup', (e) => {
        e.preventDefault();
        if (cb.isDragActive() && cb.getDragFromSlot() !== i) {
          cb.onFinishDrag(i);
        }
        cb.onCancelDrag();
      });

      grid.appendChild(slot);
    }

    const maxLimit = getMaxWeight(ctx.backpackTier);
    const weightStatus = this.root.querySelector('#inv-weight-status');
    if (weightStatus) {
      weightStatus.textContent = `Вес: ${ctx.currentWeight.toFixed(1)} / ${maxLimit} кг`;
    }

    const guideText = this.root.querySelector('#inv-guide-text') as HTMLSpanElement | null;
    if (guideText) {
      if (ctx.tradeMode) {
        guideText.textContent = 'Выбери предмет для обмена с игроком';
      } else {
        guideText.textContent = ctx.nearKiosk
          ? 'Кликни на бутылку, чтобы сдать! · ПКМ — выбросить'
          : 'Кликни предмет · ПКМ — выбросить · Перетаскивай между слотами';
      }
    }
  }
}
