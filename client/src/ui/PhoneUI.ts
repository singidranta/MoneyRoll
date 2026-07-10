// ============================================================
//  SECTION: PHONE UI — business income dashboard
// ============================================================

import {
  PROPERTIES,
  PROPERTY_MAX_LEVEL,
  calculatePropertiesIncomePerMin,
  getPropertyIncomePerMin,
  getPropertyUpgradeCost,
  type OwnedProperty,
} from '../../../shared/economy';

export type PhoneContext = {
  money: number;
  properties: OwnedProperty[];
};

export type PhoneCallbacks = {
  onClose: () => void;
  onUpgradeProperty: (propertyId: string) => void;
};

export class PhoneUI {
  private root?: HTMLDivElement;

  get isOpen(): boolean { return !!this.root; }

  show(ctx: PhoneContext, cb: PhoneCallbacks): void {
    this.destroy();

    const root = document.createElement('div');
    root.id = 'phone-ui-overlay';
    document.body.appendChild(root);
    this.root = root;

    const totalIncome = calculatePropertiesIncomePerMin(ctx.properties);
    const nextPayout = totalIncome * 0.25;

    root.innerHTML = `
      <div class="phone-shell">
        <div class="phone-speaker"></div>
        <div class="phone-screen">
          <div class="phone-header">
            <div>
              <div class="phone-title">MoneyRoll Phone</div>
              <div class="phone-subtitle">Доход от бизнесов</div>
            </div>
            <button id="phone-close" class="phone-close" title="Закрыть">×</button>
          </div>

          <div class="phone-summary">
            <div class="phone-summary-card">
              <span>Баланс</span>
              <strong>$${ctx.money.toFixed(2)}</strong>
            </div>
            <div class="phone-summary-card">
              <span>Доход/мин</span>
              <strong>$${totalIncome.toFixed(2)}</strong>
            </div>
            <div class="phone-summary-card">
              <span>Выплата / 15с</span>
              <strong>$${nextPayout.toFixed(2)}</strong>
            </div>
          </div>

          <div class="phone-list-title">Мои бизнесы (${ctx.properties.length})</div>
          <div class="phone-business-list">
            ${ctx.properties.length === 0 ? `
              <div class="phone-empty">
                У тебя пока нет бизнесов. Купи точку недвижимости на карте — после покупки она появится здесь.
              </div>
            ` : ctx.properties.map((property) => {
              const def = PROPERTIES[property.type];
              const level = property.level ?? 1;
              const income = getPropertyIncomePerMin(property);
              const upgradeCost = getPropertyUpgradeCost(property);
              const canUpgrade = level < PROPERTY_MAX_LEVEL;
              return `
                <div class="phone-business-card">
                  <div class="phone-business-main">
                    <img src="/assets/props/flat/${def.iconKey === 'shack' || def.iconKey.startsWith('apartment') ? 'buildings' : 'kiosk'}/${def.iconKey}${def.iconKey === 'shack' ? '.png' : '.webp'}" alt="" onerror="this.style.display='none'" />
                    <div>
                      <strong>${def.name}</strong>
                      <span>Уровень ${level}/${PROPERTY_MAX_LEVEL} · $${income.toFixed(2)}/мин</span>
                    </div>
                  </div>
                  <button class="phone-upgrade-btn" data-upgrade-id="${property.id}" ${canUpgrade ? '' : 'disabled'}>
                    ${canUpgrade ? `Прокачать $${upgradeCost}` : 'Макс. уровень'}
                  </button>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;

    root.querySelector('#phone-close')?.addEventListener('click', () => cb.onClose());
    root.addEventListener('click', (event) => {
      if (event.target === root) cb.onClose();
    });
    root.querySelectorAll('[data-upgrade-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.upgradeId;
        if (id) cb.onUpgradeProperty(id);
      });
    });
  }

  destroy(): void {
    const existing = document.getElementById('phone-ui-overlay');
    if (existing) existing.remove();
    this.root = undefined;
  }
}
