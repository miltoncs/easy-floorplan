import { describe, expect, it } from 'vitest'
import { createFloor, createFurniture, createRoom, createSegment } from './blueprint'
import {
  deleteRoomSegmentPreservingGeometry,
  getConnectedRoomIds,
  getCornerAngleBetweenWalls,
  getRoomCorners,
  getTurnFromCornerAngle,
  rotateRoom,
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

  it('allows a self-intersecting room outline', () => {
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

    expect(validateRoomWalls(room)).toEqual({
      valid: true,
      error: null,
    })
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

  it('finds connected rooms without merging nearby rooms across a gap', () => {
    const roomA = createRoom({
      id: 'room-a',
      anchor: { x: 0, y: 0 },
      startHeading: 0,
      segments: [
        createSegment({ id: 'a-top', label: 'A top', length: 10, turn: -90 }),
        createSegment({ id: 'a-shared', label: 'A shared', length: 8, turn: -90 }),
        createSegment({ id: 'a-bottom', label: 'A bottom', length: 10, turn: -90 }),
        createSegment({ id: 'a-left', label: 'A left', length: 8, turn: -90 }),
      ],
    })
    const roomB = createRoom({
      id: 'room-b',
      anchor: { x: 10, y: 0 },
      startHeading: 0,
      segments: [
        createSegment({ id: 'b-top', label: 'B top', length: 6, turn: -90 }),
        createSegment({ id: 'b-right', label: 'B right', length: 8, turn: -90 }),
        createSegment({ id: 'b-bottom', label: 'B bottom', length: 6, turn: -90 }),
        createSegment({ id: 'b-shared', label: 'B shared', length: 8, turn: -90 }),
      ],
    })
    const roomC = createRoom({
      id: 'room-c',
      anchor: { x: 16, y: 0 },
      startHeading: 0,
      segments: [
        createSegment({ id: 'c-top', label: 'C top', length: 4, turn: -90 }),
        createSegment({ id: 'c-right', label: 'C right', length: 8, turn: -90 }),
        createSegment({ id: 'c-bottom', label: 'C bottom', length: 4, turn: -90 }),
        createSegment({ id: 'c-shared', label: 'C shared', length: 8, turn: -90 }),
      ],
    })
    const roomGap = createRoom({
      id: 'room-gap',
      anchor: { x: 20.46, y: 0 },
      startHeading: 90,
      segments: [
        createSegment({ id: 'gap-left', label: 'Gap left', length: 8, turn: -90 }),
        createSegment({ id: 'gap-top', label: 'Gap top', length: 4, turn: -90 }),
        createSegment({ id: 'gap-right', label: 'Gap right', length: 8, turn: -90 }),
        createSegment({ id: 'gap-bottom', label: 'Gap bottom', length: 4, turn: -90 }),
      ],
    })
    const floor = createFloor({
      rooms: [roomA, roomB, roomC, roomGap],
    })

    expect(getConnectedRoomIds(floor, roomA.id).sort()).toEqual([roomA.id, roomB.id, roomC.id].sort())
    expect(getConnectedRoomIds(floor, roomB.id).sort()).toEqual([roomA.id, roomB.id, roomC.id].sort())
    expect(getConnectedRoomIds(floor, roomGap.id)).toEqual([roomGap.id])
  })

  it('converts between turn deltas and angles between walls', () => {
    expect(getCornerAngleBetweenWalls(0)).toBe(180)
    expect(getCornerAngleBetweenWalls(90)).toBe(90)
    expect(getCornerAngleBetweenWalls(-45)).toBe(135)

    expect(getTurnFromCornerAngle(180, 'left')).toBe(0)
    expect(getTurnFromCornerAngle(90, 'left')).toBe(90)
    expect(getTurnFromCornerAngle(135, 'right')).toBe(-45)
    expect(getTurnFromCornerAngle(270, 'right')).toBe(90)
    expect(getTurnFromCornerAngle(270, 'left')).toBe(-90)
    expect(getTurnFromCornerAngle(360, 'right')).toBe(-180)
  })

  it('omits open-chain exit turns from room corners unless explicitly requested', () => {
    const room = createRoom({
      anchor: { x: 0, y: 0 },
      startHeading: 0,
      segments: [
        createSegment({ id: 'seg-a', label: 'A', length: 10, turn: 90 }),
        createSegment({ id: 'seg-b', label: 'B', length: 8, turn: -90 }),
      ],
    })

    expect(getRoomCorners(room)).toEqual([
      expect.objectContaining({
        segmentId: 'seg-a',
        incomingLabel: 'A',
        outgoingLabel: 'B',
        isExit: false,
      }),
    ])
    expect(getRoomCorners(room, { includeExits: true })).toEqual([
      expect.objectContaining({
        segmentId: 'seg-a',
        incomingLabel: 'A',
        outgoingLabel: 'B',
        isExit: false,
      }),
      expect.objectContaining({
        segmentId: 'seg-b',
        incomingLabel: 'B',
        outgoingLabel: null,
        isExit: true,
      }),
    ])
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

  it('rotates a room and its furniture around the room center', () => {
    const room = createRoom({
      anchor: { x: 0, y: 0 },
      startHeading: 0,
      segments: [
        createSegment({ id: 'seg-a', label: 'A', length: 10, turn: -90 }),
        createSegment({ id: 'seg-b', label: 'B', length: 8, turn: -90 }),
        createSegment({ id: 'seg-c', label: 'C', length: 10, turn: -90 }),
        createSegment({ id: 'seg-d', label: 'D', length: 8, turn: -90 }),
      ],
      furniture: [
        createFurniture({
          id: 'furn-a',
          x: 1,
          y: -7,
          width: 2,
          depth: 2,
          rotation: 15,
        }),
      ],
    })

    rotateRoom(room, -90)

    expect(room.anchor).toEqual({ x: 9, y: 1 })
    expect(room.startHeading).toBe(270)
    expect(room.furniture).toEqual([
      expect.objectContaining({
        id: 'furn-a',
        x: 2,
        y: -2,
        rotation: 285,
      }),
    ])

    const rotatedGeometry = roomToGeometry(room)
    expect(rotatedGeometry.segments[0].heading).toBe(270)
    expect(rotatedGeometry.segments[0].start).toEqual({ x: 9, y: 1 })
    expect(rotatedGeometry.segments[0].end.x).toBeCloseTo(9, 6)
    expect(rotatedGeometry.segments[0].end.y).toBeCloseTo(-9, 6)
  })

  it('keeps the remaining chain connected when deleting the first wall', () => {
    const room = createRoom({
      anchor: { x: 0, y: 0 },
      startHeading: 0,
      segments: [
        createSegment({ id: 'seg-a', label: 'A', length: 10, turn: 90 }),
        createSegment({ id: 'seg-b', label: 'B', length: 8, turn: -90 }),
        createSegment({ id: 'seg-c', label: 'C', length: 6, turn: 90 }),
        createSegment({ id: 'seg-d', label: 'D', length: 4, turn: 0 }),
      ],
    })

    expect(deleteRoomSegmentPreservingGeometry(room, 'seg-a')).toEqual({
      deleted: true,
    })

    const after = roomToGeometry(room)

    expect(after.chains).toHaveLength(1)
    expect(after.segments.map((segment) => segment.id)).toEqual(['seg-b', 'seg-c', 'seg-d'])
    expect(after.segments[0].start).toEqual({ x: 10, y: 0 })
    expect(after.segments[1].start).toEqual(after.segments[0].end)
    expect(after.segments[2].start).toEqual(after.segments[1].end)
  })

  it('detaches the following run when deleting a middle wall from an open chain', () => {
    const room = createRoom({
      anchor: { x: 0, y: 0 },
      startHeading: 0,
      segments: [
        createSegment({ id: 'seg-a', label: 'A', length: 10, turn: 90 }),
        createSegment({ id: 'seg-b', label: 'B', length: 8, turn: -90 }),
        createSegment({ id: 'seg-c', label: 'C', length: 6, turn: 0 }),
      ],
    })
    const before = roomToGeometry(room)
    const expectedById = Object.fromEntries(
      before.segments
        .filter((segment) => segment.id !== 'seg-b')
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

    expect(deleteRoomSegmentPreservingGeometry(room, 'seg-b')).toEqual({
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
    expect(after.chains).toHaveLength(2)
    expect(room.segments[1].startPoint).toEqual({ x: 10, y: 8 })
    expect(room.segments[1].startHeading).toBe(0)
  })

  it('removes the last remaining wall without deleting the room model', () => {
    const room = createRoom({
      anchor: { x: 2, y: 3 },
      startHeading: 45,
      segments: [createSegment({ id: 'seg-a', label: 'Only wall', length: 7, turn: 0 })],
    })

    expect(deleteRoomSegmentPreservingGeometry(room, 'seg-a')).toEqual({
      deleted: true,
    })
    expect(room.segments).toEqual([])
    expect(room.anchor).toEqual({ x: 2, y: 3 })
    expect(room.startHeading).toBe(45)
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
