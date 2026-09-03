import { describe, it, expect } from 'vitest'
import {
  createInventory,
  decrementStock,
  restockInventory,
  isStockLow,
  isStockEmpty,
  getStockAlert,
} from '../lib/inventory'

describe('Inventory Engine - Depletion & Threshold Boundaries', () => {
  it('decrements stock accurately on dose logs', () => {
    const inventory = createInventory(1, 10, 3, 'tablets')
    const result = decrementStock(inventory, 2)

    expect(result.success).toBe(true)
    expect(result.previousStock).toBe(10)
    expect(result.currentStock).toBe(8)
    expect(result.change).toBe(-2)
    expect(result.isLowStock).toBe(false)
    expect(result.isOutOfStock).toBe(false)
  })

  it('strictly prevents negative stock counts when dose exceeds inventory', () => {
    const inventory = createInventory(2, 2, 5, 'capsules')
    const result = decrementStock(inventory, 5)

    expect(result.success).toBe(true)
    expect(result.previousStock).toBe(2)
    expect(result.currentStock).toBe(0) // Clamped at 0, never negative
    expect(result.isOutOfStock).toBe(true)
    expect(result.isLowStock).toBe(true)
  })

  it('rejects decrement when stock is already 0', () => {
    const inventory = createInventory(3, 0, 5, 'pills')
    const result = decrementStock(inventory, 1)

    expect(result.success).toBe(false)
    expect(result.currentStock).toBe(0)
    expect(result.isOutOfStock).toBe(true)
    expect(result.error).toContain('Cannot log dose: stock is already 0')
  })

  it('trips low-inventory alert at the exact threshold boundary', () => {
    const threshold = 5
    // Above threshold: not low
    expect(isStockLow(6, threshold)).toBe(false)

    // Exact threshold boundary: trips alert!
    expect(isStockLow(5, threshold)).toBe(true)

    // Below threshold: alert remains active
    expect(isStockLow(4, threshold)).toBe(true)
    expect(isStockLow(0, threshold)).toBe(true)
  })

  it('generates correct user alerts across normal, low, and empty states', () => {
    const inv = createInventory(4, 10, 5, 'tablets')
    expect(getStockAlert(inv, 'Amoxicillin').level).toBe('normal')

    // Decrement to exact threshold (5)
    decrementStock(inv, 5)
    const lowAlert = getStockAlert(inv, 'Amoxicillin')
    expect(lowAlert.level).toBe('low')
    expect(lowAlert.message).toContain('Low stock alert')

    // Decrement to empty (0)
    decrementStock(inv, 5)
    const emptyAlert = getStockAlert(inv, 'Amoxicillin')
    expect(emptyAlert.level).toBe('empty')
    expect(emptyAlert.message).toContain('out of stock')
  })
})

describe('Inventory Engine - Replenishment', () => {
  it('replenishes stock and clears low-stock state when above threshold', () => {
    const inventory = createInventory(5, 2, 5, 'tablets')
    expect(inventory.currentStock).toBe(2)
    expect(isStockLow(inventory.currentStock, inventory.lowStockThreshold)).toBe(true)

    // Restock with 20 tablets
    const result = restockInventory(inventory, 20)
    expect(result.success).toBe(true)
    expect(result.previousStock).toBe(2)
    expect(result.currentStock).toBe(22)
    expect(result.isLowStock).toBe(false)
    expect(result.isOutOfStock).toBe(false)
  })

  it('rejects non-positive and invalid restock amounts', () => {
    const inventory = createInventory(6, 10, 3)

    const zeroResult = restockInventory(inventory, 0)
    expect(zeroResult.success).toBe(false)

    const negativeResult = restockInventory(inventory, -5)
    expect(negativeResult.success).toBe(false)
    expect(negativeResult.error).toContain('greater than 0')

    const nanResult = restockInventory(inventory, NaN)
    expect(nanResult.success).toBe(false)
  })
})
