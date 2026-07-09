// ============================================================
//  SECTION: INVENTORY DRAG & DROP
// ============================================================

import type { InventoryItem } from '../../../shared/economy';
import { getItemWebpPath } from '../../../shared/items';

export type DragState = {
  active: boolean;
  fromSlot: number;
  item: InventoryItem | null;
  ghostEl: HTMLDivElement | null;
  startX: number;
  startY: number;
};

export function createEmptyDragState(): DragState {
  return { active: false, fromSlot: -1, item: null, ghostEl: null, startX: 0, startY: 0 };
}

export class DragDropController {
  state: DragState = createEmptyDragState();

  private onMove?: (ev: MouseEvent) => void;
  private onUp?: (ev: MouseEvent) => void;

  start(
    e: MouseEvent,
    slotIdx: number,
    item: InventoryItem,
    getActiveSlots: () => number,
    onFinish: (toSlot: number) => void,
  ): void {
    this.cancel();

    this.state = {
      active: true,
      fromSlot: slotIdx,
      item,
      ghostEl: null,
      startX: e.clientX,
      startY: e.clientY,
    };

    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.innerHTML = `<img src="${getItemWebpPath(item)}" />`;
    ghost.style.left = `${e.clientX - 24}px`;
    ghost.style.top = `${e.clientY - 24}px`;
    document.body.appendChild(ghost);
    this.state.ghostEl = ghost;

    this.onMove = (ev: MouseEvent) => {
      if (this.state.ghostEl) {
        this.state.ghostEl.style.left = `${ev.clientX - 24}px`;
        this.state.ghostEl.style.top = `${ev.clientY - 24}px`;
      }
      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
      const slot = target?.closest('.inv-slot') as HTMLElement | null;
      if (slot?.dataset.slotIndex) {
        const targetIdx = parseInt(slot.dataset.slotIndex, 10);
        if (targetIdx !== this.state.fromSlot && targetIdx < getActiveSlots()) {
          slot.classList.add('drag-over');
        }
      }
    };

    this.onUp = (ev: MouseEvent) => {
      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      const slot = target?.closest('.inv-slot') as HTMLElement | null;
      if (slot?.dataset.slotIndex) {
        const targetIdx = parseInt(slot.dataset.slotIndex, 10);
        if (targetIdx !== this.state.fromSlot && targetIdx < getActiveSlots()) {
          onFinish(targetIdx);
        }
      }
      this.cancel();
    };

    document.addEventListener('mousemove', this.onMove);
    document.addEventListener('mouseup', this.onUp);
  }

  cancel(): void {
    if (this.state.ghostEl) this.state.ghostEl.remove();
    document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
    if (this.onMove) document.removeEventListener('mousemove', this.onMove);
    if (this.onUp) document.removeEventListener('mouseup', this.onUp);
    this.onMove = undefined;
    this.onUp = undefined;
    this.state = createEmptyDragState();
  }
}
