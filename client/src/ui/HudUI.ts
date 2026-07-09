// ============================================================
//  SECTION: TOP-LEVEL HUD (money / weight / stamina / bag btn)
// ============================================================

import { getBackpackName, getMaxWeight } from '../../../shared/items';

export type HudState = {
  money: number;
  currentWeight: number;
  backpackTier: number;
  stamina: number;
  isExhausted: boolean;
  energyDrinkBuffTimer: number;
  shawarmaBuffTimer: number;
  remoteCount: number;
};

export class HudUI {
  private root?: HTMLDivElement;

  create(onToggleInventory: () => void): void {
    this.destroy();

    const hud = document.createElement('div');
    hud.id = 'game-hud-overlay';
    document.body.appendChild(hud);
    this.root = hud;

    const moneyPanel = document.createElement('div');
    moneyPanel.id = 'hud-money-panel';
    moneyPanel.innerHTML = `$<span id="hud-money-val">5.00</span>`;
    hud.appendChild(moneyPanel);

    const statsPanel = document.createElement('div');
    statsPanel.id = 'hud-stats-panel';
    statsPanel.innerHTML = `
      <div class="hud-stat-label" id="hud-weight">Пакет · 0.0 / 8.0 кг</div>
      <div class="hud-bar">
        <div id="hud-weight-bar" class="hud-bar-fill" style="width:0%; background:#4caf6a;"></div>
      </div>
      <div class="hud-stat-hint">Энергия · Shift — бег</div>
      <div class="hud-bar">
        <div id="hud-stamina-bar" class="hud-bar-fill" style="width:100%; background:#e0b03a;"></div>
      </div>
    `;
    hud.appendChild(statsPanel);

    const btnBackpack = document.createElement('button');
    btnBackpack.id = 'btn-toggle-backpack';
    btnBackpack.title = 'Инвентарь (I)';
    btnBackpack.innerHTML =
      '<img src="/assets/props/flat/bags/backpack-tourist.webp" alt="Инвентарь" width="28" height="28" />';
    btnBackpack.addEventListener('click', () => onToggleInventory());
    hud.appendChild(btnBackpack);
  }

  update(state: HudState): void {
    if (!this.root) return;

    const maxLimit = getMaxWeight(state.backpackTier);
    const bagName = getBackpackName(state.backpackTier);

    const moneyVal = this.root.querySelector('#hud-money-val');
    if (moneyVal) moneyVal.textContent = state.money.toFixed(2);

    const weightEl = this.root.querySelector('#hud-weight');
    if (weightEl) {
      weightEl.textContent = `${bagName} · ${state.currentWeight.toFixed(1)} / ${maxLimit} кг`;
    }

    const weightBar = this.root.querySelector('#hud-weight-bar') as HTMLDivElement | null;
    if (weightBar) {
      const pct = Math.min((state.currentWeight / maxLimit) * 100, 100);
      const color = pct > 85 ? '#d45454' : pct > 60 ? '#e0b03a' : '#4caf6a';
      weightBar.style.width = `${pct}%`;
      weightBar.style.background = color;
    }

    const staminaBar = this.root.querySelector('#hud-stamina-bar') as HTMLDivElement | null;
    if (staminaBar) {
      const pct = Math.min(state.stamina, 100);
      const color =
        state.energyDrinkBuffTimer > 0
          ? '#4aa8c8'
          : state.shawarmaBuffTimer > 0
            ? '#d4893a'
            : state.isExhausted
              ? '#d45454'
              : '#e0b03a';
      staminaBar.style.width = `${pct}%`;
      staminaBar.style.background = color;
    }

    const playersEl = this.root.querySelector('#hud-players');
    if (playersEl) playersEl.textContent = `${state.remoteCount + 1}`;
  }

  destroy(): void {
    const existing = document.getElementById('game-hud-overlay');
    if (existing) existing.remove();
    this.root = undefined;
  }

  get element(): HTMLDivElement | undefined {
    return this.root;
  }
}
