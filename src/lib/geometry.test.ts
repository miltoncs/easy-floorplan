import { describe, expect, it } from 'vitest'
import { createRoom, createSegment } from './blueprint'
import { getCornerAngleBetweenWalls, getTurnFromCornerAngle, validateRoomWalls } from './geometry'

describe('validateRoomWalls', () => {
  it('allows a non-intersecting room outline', () => {
    const room = createRoom({
      anchor: { x: 0, y: 0 },
      startHeading: 0,
      segments: [
        createSegment({ id: 'seg-a', label: 'A', length: 10, turn: 90 }),
        createSegment({ id: 'seg-b', label: 'B', length: 8, turn: 90 }),
        createSegment({ id: 'seg-c', label: 'C', length: 10, turn: 90 }),
        createSegment({ id: 'seg-d', label: 'D', length: 8, turn: 90 }),
      ],
    })

    expect(validateRoomWalls(room)).toEqual({
      valid: true,
      error: null,
    })
  })

  it('rejects a self-intersecting room outline', () => {
    const room = createRoom({
      anchor: { x: 0, y: 0 },
      startHeading: 0,
      segments: [
        createSegment({ id: 'seg-a', label: 'A', length: 10, turn: 135 }),
        createSegment({ id: 'seg-b', label: 'B', length: 14.1421, turn: -135 }),
        createSegment({ id: 'seg-c', label: 'C', length: 10, turn: -135 }),
        createSegment({ id: 'seg-d', label: 'D', length: 14.1421, turn: 0 }),
      ],
    })

    const result = validateRoomWalls(room)

    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.error).toBe('Walls cannot intersect.')
      expect(result.segmentIds).toEqual(['seg-b', 'seg-d'])
    }
  })

  it('allows collinear overlapping walls', () => {
    const room = createRoom({
      anchor: { x: 0, y: 0 },
      startHeading: 0,
      segments: [
        createSegment({ id: 'seg-a', label: 'A', length: 10, turn: 180 }),
        createSegment({ id: 'seg-b', label: 'B', length: 5, turn: 180 }),
        createSegment({ id: 'seg-c', label: 'C', length: 8, turn: 90 }),
      ],
    })

    expect(validateRoomWalls(room)).toEqual({
      valid: true,
      error: null,
    })
  })

  it('converts between turn deltas and angles between walls', () => {
    expect(getCornerAngleBetweenWalls(0)).toBe(180)
    expect(getCornerAngleBetweenWalls(90)).toBe(90)
    expect(getCornerAngleBetweenWalls(-45)).toBe(135)

    expect(getTurnFromCornerAngle(180, 'left')).toBe(0)
    expect(getTurnFromCornerAngle(90, 'left')).toBe(90)
    expect(getTurnFromCornerAngle(135, 'right')).toBe(-45)
  })
})
