import { describe, expect, it } from 'vitest'
import { createSeedState } from '../data/seed'
import { resolveViewScope, summarizeViewScope } from './viewScope'

describe('resolveViewScope', () => {
  it('resolves the selected room for room scope', () => {
    const draft = createSeedState()
    const resolved = resolveViewScope(draft, [], { kind: 'room' })

    expect(resolved.kind).toBe('room')
    expect(resolved.rooms).toHaveLength(1)
    expect(resolved.rooms[0]?.name).toBe('Living room')
    expect(summarizeViewScope(resolved)).toBe('Living room')
  })

  it('falls back from empty selection scope to room scope', () => {
    const draft = createSeedState()
    const resolved = resolveViewScope(draft, [], { kind: 'selection' })

    expect(resolved.kind).toBe('room')
    expect(resolved.rooms).toHaveLength(1)
  })

  it('resolves multiple selected rooms on the active floor for selection scope', () => {
    const draft = createSeedState()
    const [livingRoom, hall] = draft.structures[0].floors[0].rooms
    const resolved = resolveViewScope(
      draft,
      [
        {
          kind: 'room',
          structureId: draft.activeStructureId,
          floorId: draft.activeFloorId,
          roomId: livingRoom.id,
        },
        {
          kind: 'wall',
          structureId: draft.activeStructureId,
          floorId: draft.activeFloorId,
          roomId: hall.id,
          segmentId: hall.segments[0].id,
        },
      ],
      { kind: 'selection' },
    )

    expect(resolved.kind).toBe('selection')
    expect(resolved.roomIds).toEqual([livingRoom.id, hall.id])
    expect(summarizeViewScope(resolved)).toBe('2 selected rooms')
  })
})
