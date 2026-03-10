import { describe, expect, it } from 'vitest'
import { getViewBox } from './blueprint'

describe('blueprint camera framing', () => {
  it('expands the viewBox to match a wider canvas aspect ratio', () => {
    const result = getViewBox(
      {
        minX: 0,
        minY: 0,
        maxX: 12,
        maxY: 24,
      },
      1,
      { x: 0, y: 0 },
      2,
    )

    expect(result.width / result.height).toBeCloseTo(2, 5)
    expect(result.width).toBeGreaterThan(result.height)
  })
})
