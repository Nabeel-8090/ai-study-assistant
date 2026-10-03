import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => cleanup())

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: vi.fn(() => ({ matches: false })),
})
Element.prototype.scrollIntoView = vi.fn()

Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
  writable: true,
})
