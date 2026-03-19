import { describe, expect, it } from 'vitest'
import { createSeedState } from '../data/seed'
import { buildIsometricScene } from './isometric'
import { resolveViewScope } from './viewScope'

describe('buildIsometricScene', () => {
  it('builds slabs, walls, and furniture blocks for a closed room scope', () => {
    const draft = createSeedState()
    const kitchen = draft.structures[0].floors[0].rooms[2]
    draft.selectedRoomId = kitchen.id
    const resolvedScope = resolveViewScope(draft, [], { kind: 'room' })

    const scene = buildIsometricScene({ draft, resolvedScope })

    expect(scene.rooms).toHaveLength(1)
    expect(scene.rooms[0]).toMatchObject({
      roomId: kitchen.id,
      floorElevation: 0,
      isOpen: false,
    })
    expect(scene.rooms[0]?.walls).toHaveLength(4)
    expect(scene.rooms[0]?.slab).not.toBeNull()
    expect(scene.rooms[0]?.furniture).toHaveLength(1)
  })

  it('does not fabricate slabs for open rooms', () => {
    const draft = createSeedState()
    const resolvedScope = resolveViewScope(draft, [], { kind: 'room' })

    const scene = buildIsometricScene({ draft, resolvedScope })

    expect(scene.rooms).toHaveLength(1)
    expect(scene.rooms[0]).toMatchObject({
      roomId: draft.structures[0].floors[0].rooms[0].id,
      isOpen: true,
    })
    expect(scene.rooms[0]?.slab).toBeNull()
    expect(scene.rooms[0]?.walls).toHaveLength(2)
  })

  it('keeps multi-room selection scope on the active floor in floor order', () => {
    const draft = createSeedState()
    const [livingRoom, hall] = draft.structures[0].floors[0].rooms
    const resolvedScope = resolveViewScope(
      draft,
      [
        {
          kind: 'wall',
          structureId: draft.activeStructureId,
          floorId: draft.activeFloorId,
          roomId: hall.id,
          segmentId: hall.segments[0].id,
        },
        {
          kind: 'room',
          structureId: draft.activeStructureId,
          floorId: draft.activeFloorId,
          roomId: livingRoom.id,
        },
      ],
      { kind: 'selection' },
    )

    const scene = buildIsometricScene({ draft, resolvedScope })

    expect(scene.scopeKind).toBe('selection')
    expect(scene.floors).toEqual([
      expect.objectContaining({
        floorId: draft.activeFloorId,
        roomIds: [livingRoom.id, hall.id],
      }),
    ])
    expect(scene.rooms.map((room) => room.roomId)).toEqual([livingRoom.id, hall.id])
  })

  it('builds a scene for the active floor scope', () => {
    const draft = createSeedState()
    const activeFloor = draft.structures[0].floors[0]
    const resolvedScope = resolveViewScope(draft, [], { kind: 'floor', floorId: activeFloor.id })

    const scene = buildIsometricScene({ draft, resolvedScope })

    expect(scene.scopeKind).toBe('floor')
    expect(scene.floors).toEqual([
      expect.objectContaining({
        floorId: activeFloor.id,
        elevation: 0,
        roomIds: activeFloor.rooms.map((room) => room.id),
      }),
    ])
    expect(scene.rooms).toHaveLength(activeFloor.rooms.length)
  })

  it('stacks house scope rooms by floor elevation', () => {
    const draft = createSeedState()
    const resolvedScope = resolveViewScope(draft, [], {
      kind: 'house',
      structureId: draft.activeStructureId,
    })

    const scene = buildIsometricScene({ draft, resolvedScope })

    expect(scene.scopeKind).toBe('house')
    expect(scene.floors.map((floor) => floor.elevation)).toEqual([0, 10])
    expect(scene.rooms.find((room) => room.name === 'Bedroom')).toMatchObject({
      floorElevation: 10,
      isOpen: false,
    })
  })
})
