import { describe, expect, it } from 'vitest'
import { createSeedState } from '../data/seed'
import {
  createFloor,
  createRoom,
  createSegment,
  ensureSelections,
  findSelectedRoom,
  getRoomLabelPoint,
  getRoomSuggestions,
  getViewBox,
  selectTargetInDraft,
} from './blueprint'

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
  it('keeps inferred closures even when they intersect an existing wall', () => {
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

    expect(getRoomSuggestions(room, floor)).toContainEqual(
      expect.objectContaining({
        kind: 'closure',
        title: 'Close the room with one final wall',
      }),
    )
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

describe('selection normalization', () => {
  it('preserves an intentionally cleared room selection', () => {
    const draft = createSeedState()
    draft.selectedRoomId = null
    draft.selectedFurnitureId = draft.structures[0].floors[0].rooms[0].furniture[0]?.id ?? null

    const result = ensureSelections(draft)

    expect(result.selectedRoomId).toBeNull()
    expect(result.selectedFurnitureId).toBeNull()
    expect(findSelectedRoom(result)).toBeNull()
  })

  it('clears room and furniture selection when the canvas target is selected', () => {
    const draft = createSeedState()
    const room = draft.structures[0].floors[0].rooms[0]
    draft.selectedRoomId = room.id
    draft.selectedFurnitureId = room.furniture[0]?.id ?? null

    selectTargetInDraft(draft, {
      kind: 'canvas',
      structureId: draft.activeStructureId,
      floorId: draft.activeFloorId,
    })

    expect(draft.selectedRoomId).toBeNull()
    expect(draft.selectedFurnitureId).toBeNull()
  })
})
