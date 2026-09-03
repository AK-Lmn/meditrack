/**
 * Hardened client storage and payload resilience module for MediTrack.
 * Handles safe localStorage/IndexedDB reads and writes, recovering gracefully
 * back to safe default empty states without crashing the UI.
 */

import { safeParseJson } from './validation'

/**
 * Read and deserialize an item from localStorage with guaranteed error resilience.
 */
export function getStorageItem<T>(
  key: string,
  fallback: T,
  validator?: (val: unknown) => val is T
): T {
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }

  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return fallback
    return safeParseJson(raw, fallback, validator)
  } catch (error) {
    console.warn(`[storage] Failed reading key '${key}' from localStorage:`, error)
    return fallback
  }
}

/**
 * Serialize and store an item in localStorage safely.
 */
export function setStorageItem<T>(key: string, value: T): boolean {
  if (typeof window === 'undefined' || !window.localStorage) {
    return false
  }

  try {
    const serialized = JSON.stringify(value)
    window.localStorage.setItem(key, serialized)
    return true
  } catch (error) {
    console.warn(`[storage] Failed writing key '${key}' to localStorage:`, error)
    return false
  }
}

/**
 * Remove an item from localStorage safely.
 */
export function removeStorageItem(key: string): boolean {
  if (typeof window === 'undefined' || !window.localStorage) {
    return false
  }

  try {
    window.localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}
