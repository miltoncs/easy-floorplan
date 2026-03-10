import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

function createStorage() {
  const store = new Map<string, string>()

  return {
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, value),
    get length() {
      return store.size
    },
  }
}

Object.defineProperty(window, 'localStorage', {
  value: createStorage(),
  writable: true,
})

Object.defineProperty(window, 'scrollTo', {
  value: () => undefined,
  writable: true,
})

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
})
