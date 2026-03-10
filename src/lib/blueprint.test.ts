import { describe, expect, it } from 'vitest'
import { createRoom, createSegment, getRoomLabelPoint, getViewBox } from './blueprint'

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

  it('anchors open room labels at the center of the traced room bounds', () => {
    const room = createRoom({
      anchor: { x: 0, y: 10 },
      startHeading: 0,
      segments: [
        createSegment({ id: 'seg-a', length: 12, turn: -90 }),
        createSegment({ id: 'seg-b', length: 8, turn: -90 }),
        createSegment({ id: 'seg-c', length: 4, turn: -90 }),
      ],
    })

    expect(getRoomLabelPoint(room)).toEqual({ x: 6, y: 6 })
  })
})
