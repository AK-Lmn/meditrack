/**
 * Inventory management and stock alert module for MediTrack.
 * Enforces non-negative stock constraints, handles depletion on dose logs,
 * replenishment, and exact boundary triggers for low-stock alerts.
 */

import { validateQuantity } from './validation'

export interface MedicationInventory {
  medicationId: number
  currentStock: number
  lowStockThreshold: number
  unit?: string
  lastRestockedAt?: Date | null
}

export interface InventoryOperationResult {
  success: boolean
  previousStock: number
  currentStock: number
  change: number
  isLowStock: boolean
  isOutOfStock: boolean
  error?: string
}

export type StockAlertLevel = 'normal' | 'low' | 'empty'

export interface StockAlert {
  level: StockAlertLevel
  message: string
  currentStock: number
  threshold: number
}

/**
 * Check if a given stock level trips the low-stock threshold boundary.
 * Trips at exactly the threshold boundary (currentStock <= threshold).
 */
export function isStockLow(currentStock: number, threshold: number): boolean {
  return currentStock <= threshold
}

/**
 * Check if stock is completely depleted.
 */
export function isStockEmpty(currentStock: number): boolean {
  return currentStock <= 0
}

/**
 * Initialize a safe inventory record.
 */
export function createInventory(
  medicationId: number,
  initialStock = 0,
  lowStockThreshold = 5,
  unit = 'doses'
): MedicationInventory {
  const safeStock = Math.max(0, Math.floor(initialStock || 0))
  const safeThreshold = Math.max(0, Math.floor(lowStockThreshold || 0))
  return {
    medicationId,
    currentStock: safeStock,
    lowStockThreshold: safeThreshold,
    unit,
    lastRestockedAt: safeStock > 0 ? new Date() : null,
  }
}

/**
 * Decrement stock on dose log.
 * - Prevents negative stock counts (never falls below 0).
 * - Detects exact boundary crossing for low-stock alerts (currentStock <= threshold).
 */
export function decrementStock(
  inventory: MedicationInventory,
  quantity = 1
): InventoryOperationResult {
  const qtyResult = validateQuantity(quantity)
  if (!qtyResult.valid || qtyResult.value <= 0) {
    return {
      success: false,
      previousStock: inventory.currentStock,
      currentStock: inventory.currentStock,
      change: 0,
      isLowStock: isStockLow(inventory.currentStock, inventory.lowStockThreshold),
      isOutOfStock: isStockEmpty(inventory.currentStock),
      error: qtyResult.error ?? 'Decrement quantity must be at least 1.',
    }
  }

  const decrementAmount = qtyResult.value
  const prev = inventory.currentStock

  if (prev === 0) {
    return {
      success: false,
      previousStock: 0,
      currentStock: 0,
      change: 0,
      isLowStock: true,
      isOutOfStock: true,
      error: 'Cannot log dose: stock is already 0.',
    }
  }

  // Strictly clamp at 0 - never allow negative stock
  const actualDecrement = Math.min(prev, decrementAmount)
  const nextStock = Math.max(0, prev - decrementAmount)

  inventory.currentStock = nextStock

  return {
    success: true,
    previousStock: prev,
    currentStock: nextStock,
    change: -actualDecrement,
    isLowStock: isStockLow(nextStock, inventory.lowStockThreshold),
    isOutOfStock: isStockEmpty(nextStock),
  }
}

/**
 * Replenish stock with refill quantity.
 * Rejects non-positive or invalid amounts.
 */
export function restockInventory(
  inventory: MedicationInventory,
  refillQuantity: number
): InventoryOperationResult {
  if (typeof refillQuantity === 'number' && refillQuantity <= 0) {
    return {
      success: false,
      previousStock: inventory.currentStock,
      currentStock: inventory.currentStock,
      change: 0,
      isLowStock: isStockLow(inventory.currentStock, inventory.lowStockThreshold),
      isOutOfStock: isStockEmpty(inventory.currentStock),
      error: 'Restock quantity must be greater than 0.',
    }
  }

  const qtyResult = validateQuantity(refillQuantity)
  if (!qtyResult.valid || qtyResult.value <= 0) {
    return {
      success: false,
      previousStock: inventory.currentStock,
      currentStock: inventory.currentStock,
      change: 0,
      isLowStock: isStockLow(inventory.currentStock, inventory.lowStockThreshold),
      isOutOfStock: isStockEmpty(inventory.currentStock),
      error: 'Restock quantity must be greater than 0.',
    }
  }

  const prev = inventory.currentStock
  const nextStock = prev + qtyResult.value

  inventory.currentStock = nextStock
  inventory.lastRestockedAt = new Date()

  return {
    success: true,
    previousStock: prev,
    currentStock: nextStock,
    change: qtyResult.value,
    isLowStock: isStockLow(nextStock, inventory.lowStockThreshold),
    isOutOfStock: isStockEmpty(nextStock),
  }
}

/**
 * Generate user-facing alert for medication stock state.
 */
export function getStockAlert(
  inventory: MedicationInventory,
  medicationName = 'Medication'
): StockAlert {
  if (isStockEmpty(inventory.currentStock)) {
    return {
      level: 'empty',
      message: `${medicationName} is out of stock! Refill needed immediately.`,
      currentStock: inventory.currentStock,
      threshold: inventory.lowStockThreshold,
    }
  }

  if (isStockLow(inventory.currentStock, inventory.lowStockThreshold)) {
    return {
      level: 'low',
      message: `Low stock alert: ${inventory.currentStock} ${inventory.unit ?? 'units'} remaining of ${medicationName} (threshold: ${inventory.lowStockThreshold}).`,
      currentStock: inventory.currentStock,
      threshold: inventory.lowStockThreshold,
    }
  }

  return {
    level: 'normal',
    message: `${inventory.currentStock} ${inventory.unit ?? 'units'} in stock.`,
    currentStock: inventory.currentStock,
    threshold: inventory.lowStockThreshold,
  }
}
