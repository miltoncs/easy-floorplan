import { describe, expect, it } from 'vitest'
import { createFurniture, createRoom, createSegment } from './blueprint'
import {
  deleteRoomSegmentPreservingGeometry,
  getCornerAngleBetweenWalls,
  getTurnFromCornerAngle,
  roomToGeometry,
  round,
  snapFurnitureToRoom,
  validateRoomWalls,
} from './geometry'

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

  it('preserves closed-room wall geometry when deleting a wall', () => {
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

    const before = roomToGeometry(room)
    const expectedById = Object.fromEntries(
      before.segments
        .filter((segment) => segment.id !== 'seg-a')
        .map((segment) => [
          segment.id,
          {
            heading: round(segment.heading, 4),
            start: {
              x: round(segment.start.x, 4),
              y: round(segment.start.y, 4),
            },
            end: {
              x: round(segment.end.x, 4),
              y: round(segment.end.y, 4),
            },
          },
        ]),
    )

    expect(deleteRoomSegmentPreservingGeometry(room, 'seg-a')).toEqual({
      deleted: true,
    })

    const after = roomToGeometry(room)
    const actualById = Object.fromEntries(
      after.segments.map((segment) => [
        segment.id,
        {
          heading: round(segment.heading, 4),
          start: {
            x: round(segment.start.x, 4),
            y: round(segment.start.y, 4),
          },
          end: {
            x: round(segment.end.x, 4),
            y: round(segment.end.y, 4),
          },
        },
      ]),
    )

    expect(actualById).toEqual(expectedById)
    expect(room.anchor).toEqual({ x: 10, y: 0 })
    expect(room.startHeading).toBe(90)
  })

  it('rejects deleting a middle wall from an open chain', () => {
    const room = createRoom({
      anchor: { x: 0, y: 0 },
      startHeading: 0,
      segments: [
        createSegment({ id: 'seg-a', label: 'A', length: 10, turn: 90 }),
        createSegment({ id: 'seg-b', label: 'B', length: 8, turn: -90 }),
        createSegment({ id: 'seg-c', label: 'C', length: 6, turn: 0 }),
      ],
    })
    const before = structuredClone(room)

    expect(deleteRoomSegmentPreservingGeometry(room, 'seg-b')).toEqual({
      deleted: false,
      reason: 'split-open-chain',
    })
    expect(room).toEqual(before)
  })

  it('snaps nearby furniture edges flush to room walls', () => {
    const room = createRoom({
      anchor: { x: 0, y: 0 },
      startHeading: 0,
      segments: [
        createSegment({ id: 'seg-a', length: 10, turn: -90 }),
        createSegment({ id: 'seg-b', length: 8, turn: -90 }),
        createSegment({ id: 'seg-c', length: 10, turn: -90 }),
        createSegment({ id: 'seg-d', length: 8, turn: -90 }),
      ],
    })

    const result = snapFurnitureToRoom(
      room,
      createFurniture({ x: 4.1, y: -2.4, width: 3, depth: 2, rotation: 0 }),
      0.5,
      0,
    )

    expect(result.x).toBeCloseTo(4.1)
    expect(result.y).toBeCloseTo(-2)
  })

  it('snaps furniture corners directly onto room corners', () => {
    const room = createRoom({
      anchor: { x: 0, y: 0 },
      startHeading: 0,
      segments: [
        createSegment({ id: 'seg-a', length: 10, turn: -90 }),
        createSegment({ id: 'seg-b', length: 8, turn: -90 }),
        createSegment({ id: 'seg-c', length: 10, turn: -90 }),
        createSegment({ id: 'seg-d', length: 8, turn: -90 }),
      ],
    })

    const result = snapFurnitureToRoom(
      room,
      createFurniture({ x: 0.3, y: -2.2, width: 2, depth: 2, rotation: 0 }),
      0,
      0.5,
    )

    expect(result).toEqual({
      x: 0,
      y: -2,
    })
  })

  it('ignores wall extensions when furniture is not near the actual segment span', () => {
    const room = createRoom({
      anchor: { x: 0, y: 0 },
      startHeading: 0,
      segments: [
        createSegment({ id: 'seg-a', length: 10, turn: -90 }),
        createSegment({ id: 'seg-b', length: 8, turn: -90 }),
        createSegment({ id: 'seg-c', length: 10, turn: -90 }),
        createSegment({ id: 'seg-d', length: 8, turn: -90 }),
      ],
    })
    const furniture = createFurniture({ x: 0.3, y: -11, width: 2, depth: 2, rotation: 0 })

    expect(snapFurnitureToRoom(room, furniture, 1, 0)).toEqual({
      x: 0.3,
      y: -11,
    })
  })
})
