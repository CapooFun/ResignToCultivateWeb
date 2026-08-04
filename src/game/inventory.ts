import { ITEMS } from './content';
import type { ItemStack } from './types';

export function cloneStacks(stacks: ItemStack[]): ItemStack[] {
  return stacks.map((stack) => ({ ...stack }));
}

export function usedSlots(stacks: ItemStack[]): number {
  return stacks.reduce((total, stack) => {
    const definition = ITEMS[stack.itemId];
    const maxStack = definition?.maxStack ?? 1;
    return total + Math.ceil(stack.count / maxStack);
  }, 0);
}

export function itemCount(stacks: ItemStack[], itemId: string): number {
  return stacks.filter((stack) => stack.itemId === itemId).reduce((total, stack) => total + stack.count, 0);
}

export function addItem(stacks: ItemStack[], capacity: number, itemId: string, count: number): { stacks: ItemStack[]; added: number } {
  const definition = ITEMS[itemId];
  if (!definition || count <= 0) return { stacks: cloneStacks(stacks), added: 0 };
  const result = cloneStacks(stacks);
  let remaining = count;
  for (const stack of result) {
    if (stack.itemId !== itemId || stack.count >= definition.maxStack) continue;
    const amount = Math.min(remaining, definition.maxStack - stack.count);
    stack.count += amount;
    remaining -= amount;
    if (remaining <= 0) return { stacks: result, added: count };
  }
  while (remaining > 0 && usedSlots(result) < capacity) {
    const amount = Math.min(remaining, definition.maxStack);
    result.push({ itemId, count: amount });
    remaining -= amount;
  }
  return { stacks: result, added: count - remaining };
}

export function removeItem(stacks: ItemStack[], itemId: string, count: number): { stacks: ItemStack[]; removed: number } {
  const result = cloneStacks(stacks);
  let remaining = Math.max(0, count);
  for (let index = result.length - 1; index >= 0 && remaining > 0; index -= 1) {
    if (result[index].itemId !== itemId) continue;
    const amount = Math.min(remaining, result[index].count);
    result[index].count -= amount;
    remaining -= amount;
    if (result[index].count <= 0) result.splice(index, 1);
  }
  return { stacks: result, removed: count - remaining };
}

export function canAfford(stacks: ItemStack[], costs: ItemStack[]): boolean {
  return costs.every((cost) => itemCount(stacks, cost.itemId) >= cost.count);
}

export function mergeSources(first: ItemStack[], second: ItemStack[]): ItemStack[] {
  const totals: Record<string, number> = {};
  for (const stack of [...first, ...second]) totals[stack.itemId] = (totals[stack.itemId] ?? 0) + stack.count;
  return Object.entries(totals).map(([itemId, count]) => ({ itemId, count }));
}

