export interface BulkSelectableDish {
  id: string;
  name: string;
  available: boolean;
  pricePaise?: number;
}

export interface BulkSelectionSummary {
  totalSelected: number;
  availableCount: number;
  unavailableCount: number;
  allSelected: boolean;
  someSelected: boolean;
  selectedIds: string[];
  targetIdsToMakeAvailable: string[];
  targetIdsToMakeUnavailable: string[];
  invertedTargets: { id: string; available: boolean }[];
}

export type BulkPriceMode = "SET_EXACT" | "ADJUST_AMOUNT" | "ADJUST_PERCENT";

export interface BulkPriceChangeItem {
  id: string;
  name: string;
  oldPricePaise: number;
  newPricePaise: number;
  deltaPaise: number;
}

export interface BulkPricePreview {
  valid: boolean;
  error: string | null;
  mode: BulkPriceMode;
  changes: BulkPriceChangeItem[];
}

/**
 * Toggles a single dish ID in the current selection list while preserving order and uniqueness.
 */
export function toggleDishSelection(selectedIds: readonly string[], id: string): string[] {
  const cleanId = id.trim();
  if (!cleanId) return [...selectedIds];
  const exists = selectedIds.includes(cleanId);
  if (exists) {
    return selectedIds.filter((item) => item !== cleanId);
  }
  return [...selectedIds, cleanId];
}

/**
 * If all dishes in `items` are currently selected, returns an empty selection.
 * Otherwise selects every dish ID in `items`.
 */
export function toggleSelectAllDishes(
  items: readonly Pick<BulkSelectableDish, "id">[],
  selectedIds: readonly string[],
): string[] {
  if (items.length === 0) return [];
  const selectedSet = new Set(selectedIds);
  const allSelected = items.every((item) => selectedSet.has(item.id));
  if (allSelected) return [];
  return items.map((item) => item.id);
}

/**
 * Returns the IDs of all dishes matching the requested `available` state.
 */
export function selectDishesByAvailability(
  items: readonly Pick<BulkSelectableDish, "id" | "available">[],
  available: boolean,
): string[] {
  return items.filter((item) => item.available === available).map((item) => item.id);
}

/**
 * Computes counts and action targets for the current bulk selection against the loaded menu.
 */
export function summarizeBulkSelection(
  items: readonly BulkSelectableDish[],
  rawSelectedIds: readonly string[],
): BulkSelectionSummary {
  const rawSet = new Set(rawSelectedIds);
  const selectedItems = items.filter((item) => rawSet.has(item.id));
  const selectedIds = selectedItems.map((item) => item.id);
  const availableItems = selectedItems.filter((item) => item.available);
  const unavailableItems = selectedItems.filter((item) => !item.available);

  return {
    totalSelected: selectedItems.length,
    availableCount: availableItems.length,
    unavailableCount: unavailableItems.length,
    allSelected: items.length > 0 && selectedItems.length === items.length,
    someSelected: selectedItems.length > 0 && selectedItems.length < items.length,
    selectedIds,
    targetIdsToMakeAvailable: unavailableItems.map((item) => item.id),
    targetIdsToMakeUnavailable: availableItems.map((item) => item.id),
    invertedTargets: selectedItems.map((item) => ({
      id: item.id,
      available: !item.available,
    })),
  };
}

/**
 * Computes a validated before/after price preview for all currently selected dishes.
 * - `SET_EXACT`: `rawValue` is the new price in rupees (must be >= 0).
 * - `ADJUST_AMOUNT`: `rawValue` is the rupee delta (+/- ₹, resulting price clamped to >= 0).
 * - `ADJUST_PERCENT`: `rawValue` is the percentage delta (must be >= -100, resulting price clamped to >= 0).
 */
export function computeBulkPricePreview(
  items: readonly { id: string; name: string; pricePaise: number }[],
  rawSelectedIds: readonly string[],
  mode: BulkPriceMode,
  rawValue: string | number,
): BulkPricePreview {
  const rawSet = new Set(rawSelectedIds);
  const selectedItems = items.filter((item) => rawSet.has(item.id));
  if (selectedItems.length === 0) {
    return {
      valid: false,
      error: "Select at least one dish to update prices.",
      mode,
      changes: [],
    };
  }

  const trimmed = typeof rawValue === "string" ? rawValue.trim() : String(rawValue);
  if (trimmed.length === 0) {
    return {
      valid: false,
      error: "Enter a price value.",
      mode,
      changes: [],
    };
  }

  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) {
    return {
      valid: false,
      error: "Enter a valid number.",
      mode,
      changes: [],
    };
  }

  if (mode === "SET_EXACT" && numeric < 0) {
    return {
      valid: false,
      error: "Exact price cannot be negative.",
      mode,
      changes: [],
    };
  }

  if (mode === "ADJUST_PERCENT" && numeric < -100) {
    return {
      valid: false,
      error: "Percentage reduction cannot exceed 100%.",
      mode,
      changes: [],
    };
  }

  const changes: BulkPriceChangeItem[] = selectedItems.map((item) => {
    const oldPricePaise = Math.max(0, Math.round(item.pricePaise));
    let newPricePaise = oldPricePaise;
    if (mode === "SET_EXACT") {
      newPricePaise = Math.max(0, Math.round(numeric * 100));
    } else if (mode === "ADJUST_AMOUNT") {
      newPricePaise = Math.max(0, Math.round(oldPricePaise + numeric * 100));
    } else if (mode === "ADJUST_PERCENT") {
      newPricePaise = Math.max(0, Math.round(oldPricePaise * (1 + numeric / 100)));
    }
    return {
      id: item.id,
      name: item.name,
      oldPricePaise,
      newPricePaise,
      deltaPaise: newPricePaise - oldPricePaise,
    };
  });

  return {
    valid: true,
    error: null,
    mode,
    changes,
  };
}

/**
 * Merges updated menu items into the current menu list without mutating the input array.
 */
export function applyBulkAvailabilityToMenu<T extends { id: string }>(
  menu: readonly T[],
  updatedItems: readonly T[],
): T[] {
  if (updatedItems.length === 0) return [...menu];
  const byId = new Map(updatedItems.map((u) => [u.id, u]));
  return menu.map((item) => byId.get(item.id) ?? item);
}
