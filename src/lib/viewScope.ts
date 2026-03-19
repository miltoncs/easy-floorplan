import type {
  CanvasTarget,
  DraftState,
  ResolvedViewScope,
  Room,
  Structure,
  ViewScopeState,
} from '../types'
import { findActiveFloor, findActiveStructure, findFloorById, findRoomById, findSelectedRoom } from './blueprint'

export function resolveViewScope(
  draft: DraftState,
  selectionTargets: CanvasTarget[],
  scope: ViewScopeState,
): ResolvedViewScope {
  const activeStructure = findActiveStructure(draft)
  const activeFloor = findActiveFloor(draft)

  if (!activeStructure) {
    return {
      kind: scope.kind,
      structureId: null,
      floorId: null,
      floors: [],
      rooms: [],
      roomIds: [],
    }
  }

  switch (scope.kind) {
    case 'house':
      return buildResolvedScope(activeStructure, null, activeStructure.floors.flatMap((floor) => floor.rooms), 'house')
    case 'floor': {
      const floor = findFloorById(draft, activeStructure.id, scope.floorId) ?? activeFloor
      return buildResolvedScope(activeStructure, floor?.id ?? null, floor ? [...floor.rooms] : [], 'floor')
    }
    case 'selection': {
      const selectedRooms = resolveSelectionRooms(draft, selectionTargets)

      if (selectedRooms.length > 0) {
        return buildResolvedScope(activeStructure, selectedRooms[0].floorId, selectedRooms.map((entry) => entry.room), 'selection')
      }

      return resolveViewScope(draft, selectionTargets, { kind: 'room' })
    }
    case 'room':
    default: {
      const room = findSelectedRoom(draft)
      return buildResolvedScope(activeStructure, activeFloor?.id ?? null, room ? [room] : [], 'room')
    }
  }
}

export function summarizeViewScope(scope: ResolvedViewScope) {
  switch (scope.kind) {
    case 'house':
      return scope.rooms.length === 1 ? 'Whole house (1 room)' : `Whole house (${scope.rooms.length} rooms)`
    case 'floor':
      return scope.rooms.length === 1 ? 'Current floor (1 room)' : `Current floor (${scope.rooms.length} rooms)`
    case 'selection':
      return scope.rooms.length === 1 ? 'Selected room' : `${scope.rooms.length} selected rooms`
    case 'room':
    default:
      return scope.rooms[0]?.name ?? 'Selected room'
  }
}

function buildResolvedScope(
  structure: Structure,
  floorId: string | null,
  rooms: Room[],
  kind: ResolvedViewScope['kind'],
): ResolvedViewScope {
  const roomIds = rooms.map((room) => room.id)
  const floors = floorId ? structure.floors.filter((floor) => floor.id === floorId) : [...structure.floors]

  return {
    kind,
    structureId: structure.id,
    floorId,
    floors,
    rooms,
    roomIds,
  }
}

function resolveSelectionRooms(draft: DraftState, selectionTargets: CanvasTarget[]) {
  const roomRefs = selectionTargets.flatMap((target) => {
    switch (target.kind) {
      case 'room':
      case 'wall':
      case 'corner':
      case 'furniture':
        return [
          {
            structureId: target.structureId,
            floorId: target.floorId,
            roomId: target.roomId,
          },
        ]
      default:
        return []
    }
  })

  const firstRef = roomRefs[0]

  if (!firstRef) {
    return []
  }

  const uniqueRoomRefs = Array.from(
    new Map(
      roomRefs
        .filter((roomRef) => roomRef.structureId === firstRef.structureId && roomRef.floorId === firstRef.floorId)
        .map((roomRef) => [`${roomRef.structureId}:${roomRef.floorId}:${roomRef.roomId}`, roomRef]),
    ).values(),
  )

  return uniqueRoomRefs.flatMap((roomRef) => {
    const room = findRoomById(draft, roomRef.structureId, roomRef.floorId, roomRef.roomId)
    return room ? [{ floorId: roomRef.floorId, room }] : []
  })
}
