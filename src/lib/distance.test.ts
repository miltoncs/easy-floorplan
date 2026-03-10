import { describe, expect, it } from 'vitest'
import { parseDistanceInput } from './distance'

describe('parseDistanceInput', () => {
  it('accepts decimal feet values', () => {
    expect(parseDistanceInput('10.5')).toBe(10.5)
    expect(parseDistanceInput('-2.25')).toBe(-2.25)
  })

  it('accepts feet and inches notation', () => {
    expect(parseDistanceInput(`10'6"`)).toBe(10.5)
    expect(parseDistanceInput(`10' 6"`)).toBe(10.5)
    expect(parseDistanceInput(`6"`)).toBe(0.5)
    expect(parseDistanceInput(`10'`)).toBe(10)
  })

  it('accepts space-separated feet and inches', () => {
    expect(parseDistanceInput('10 6')).toBe(10.5)
    expect(parseDistanceInput('-3 3')).toBe(-3.25)
  })

  it('rejects invalid distance text', () => {
    expect(parseDistanceInput('')).toBeNull()
    expect(parseDistanceInput('abc')).toBeNull()
    expect(parseDistanceInput(`10'6`)).toBeNull()
  })
})
