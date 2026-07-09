// ============================================================
//  SECTION: PLAYER INTERACTION MENU + TRADE OFFER POPUP
// ============================================================

import type { InventoryItem } from '../../../shared/economy';
import { getItemName, getItemWebpPath } from '../../../shared/items';

export type InteractionAction = 'steal' | 'trade' | 'give';

export class PlayerInteractionUI {
  private menuEl: HTMLDivElement | null = null;

  show(onAction: (action: InteractionAction) => void, onClose: () => void): void {
    this.hide();

    const menu = document.createElement('div');
    menu.id = 'player-interaction-menu';
    menu.className = 'player-interaction-menu';

    menu.innerHTML = `
      <div class="pi-menu-header">
        <span class="pi-menu-title">Действия с игроком</span>
        <button class="pi-menu-close" title="Закрыть">&times;</button>
      </div>
      <button class="pi-action-btn" data-action="steal">
        <span class="pi-action-icon">🥷</span>
        <span class="pi-action-text">
          <strong>Украсть предмет</strong>
          <small>Шанс: 20% — если провалишься, игрок узнает!</small>
        </span>
      </button>
      <button class="pi-action-btn" data-action="trade">
        <span class="pi-action-icon">🤝</span>
        <span class="pi-action-text">
          <strong>Предложить обмен</strong>
          <small>Выбери предмет из инвентаря для обмена</small>
        </span>
      </button>
      <button class="pi-action-btn" data-action="give">
        <span class="pi-action-icon">💰</span>
        <span class="pi-action-text">
          <strong>Дать денег</strong>
          <small>Перевести деньги другому игроку</small>
        </span>
      </button>
    `;

    document.body.appendChild(menu);
    this.menuEl = menu;

    menu.querySelector('.pi-menu-close')?.addEventListener('click', () => onClose());

    menu.querySelectorAll('.pi-action-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const action = (e.currentTarget as HTMLElement).dataset.action as InteractionAction;
        onAction(action);
      });
    });
  }

  hide(): void {
    if (this.menuEl) {
      this.menuEl.remove();
      this.menuEl = null;
    }
  }

  get isVisible(): boolean {
    return this.menuEl !== null;
  }
}

export function showTradeOfferPopup(
  fromId: string,
  itemType: InventoryItem,
  onAccept: () => void,
  onDecline: () => void,
): void {
  const popup = document.createElement('div');
  popup.className = 'trade-offer-popup';
  popup.innerHTML = `
    <div class="trade-offer-header">
      <span>🤝 Предложение обмена</span>
    </div>
    <div class="trade-offer-body">
      <p>Игрок <strong>${fromId}</strong> предлагает:</p>
      <div class="trade-offer-item">
        <img src="${getItemWebpPath(itemType)}" alt="" />
        <span>${getItemName(itemType)}</span>
      </div>
    </div>
    <div class="trade-offer-actions">
      <button class="dash-btn dash-btn-primary" id="trade-accept">Принять</button>
      <button class="dash-btn dash-btn-danger" id="trade-decline">Отклонить</button>
    </div>
  `;
  document.body.appendChild(popup);

  popup.querySelector('#trade-accept')?.addEventListener('click', () => {
    onAccept();
    popup.remove();
  });
  popup.querySelector('#trade-decline')?.addEventListener('click', () => {
    onDecline();
    popup.remove();
  });

  setTimeout(() => popup.remove(), 15_000);
}

export function removeAllTradePopups(): void {
  document.querySelectorAll('.trade-offer-popup').forEach((el) => el.remove());
}
