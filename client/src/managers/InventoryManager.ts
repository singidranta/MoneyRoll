import { 
  calculateInventoryWeight, 
  getActiveSlotsCount,
  getMaxWeight
} from '../../../shared/items';
import type { InventoryItem } from '../../../shared/economy';

export class InventoryManager {
  constructor(
    private inventory: (InventoryItem | null)[],
    private backpackTier: number
  ) {}

  updateInventory(newInventory: (InventoryItem | null)[], newTier?: number): void {
    this.inventory = newInventory;
    if (newTier !== undefined) this.backpackTier = newTier;
  }

  findFreeSlot(): number {
    const maxSlots = getActiveSlotsCount(this.backpackTier);
    for (let i = 0; i < maxSlots; i++) {
      if (this.inventory[i] === null) return i;
    }
    return -1;
  }

  swapSlots(from: number, to: number): boolean {
    if (from < 0 || to < 0 || from === to) return false;
    const max = getActiveSlotsCount(this.backpackTier);
    if (from >= max || to >= max) return false;

    [this.inventory[from], this.inventory[to]] = [this.inventory[to], this.inventory[from]];
    return true;
  }

  getCurrentWeight(): number {
    return calculateInventoryWeight(this.inventory);
  }

  getMaxWeight(): number {
    return getMaxWeight(this.backpackTier);
  }

  getSnapshot(): (InventoryItem | null)[] {
    return [...this.inventory];
  }

  hasItem(item: InventoryItem): boolean {
    return this.inventory.some(i => i === item);
  }

  removeItemFromSlot(slot: number): InventoryItem | null {
    if (slot < 0 || slot >= this.inventory.length) return null;
    const item = this.inventory[slot];
    this.inventory[slot] = null;
    return item;
  }

  addItemToSlot(item: InventoryItem, slot: number): boolean {
    if (slot < 0 || slot >= this.inventory.length || this.inventory[slot] !== null) return false;
    this.inventory[slot] = item;
    return true;
  }
}
