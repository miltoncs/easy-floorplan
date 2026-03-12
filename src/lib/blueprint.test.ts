import { describe, expect, it } from 'vitest'
import { createFloor, createRoom, createSegment, getRoomLabelPoint, getRoomSuggestions, getViewBox } from './blueprint'

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

describe('getRoomSuggestions', () => {
  it('skips inferred closures that would intersect an existing wall', () => {
    const room = createRoom({
      anchor: { x: 0, y: 0 },
      startHeading: 0,
      segments: [
        createSegment({ id: 'seg-a', length: 10, turn: 90 }),
        createSegment({ id: 'seg-b', length: 2, turn: 90 }),
        createSegment({ id: 'seg-c', length: 5, turn: -90 }),
        createSegment({ id: 'seg-d', length: 4, turn: -90 }),
        createSegment({ id: 'seg-e', length: 3, turn: 90 }),
        createSegment({ id: 'seg-f', length: 2, turn: 135 }),
      ],
    })
    const floor = createFloor({
      rooms: [room],
    })

    expect(getRoomSuggestions(room, floor)).toEqual([])
  })

  it('keeps offering valid inferred closures', () => {
    const room = createRoom({
      anchor: { x: 0, y: 0 },
      startHeading: 0,
      segments: [
        createSegment({ id: 'seg-a', length: 12, turn: 90 }),
        createSegment({ id: 'seg-b', length: 8, turn: 90 }),
      ],
    })
    const floor = createFloor({
      rooms: [room],
    })

    expect(getRoomSuggestions(room, floor)).toContainEqual(
      expect.objectContaining({
        kind: 'rectangle',
        title: 'Assume a rectangle and mirror the measured walls',
      }),
    )
  })
})
