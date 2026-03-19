import type {
  Bounds,
  DraftState,
  IsometricFurnitureBlock,
  IsometricScene,
  IsometricSceneRoom,
  ResolvedViewScope,
  Room,
} from '../types'
import { findActiveStructure, findStructureById } from './blueprint'
import { getFurnitureCorners, mergeBounds, roomToGeometry, round } from './geometry'

const DEFAULT_WALL_HEIGHT = 9
const MIN_FURNITURE_HEIGHT = 1.5
const MAX_FURNITURE_HEIGHT = 4.5

export function buildIsometricScene(input: {
  draft: DraftState
  resolvedScope: ResolvedViewScope
}): IsometricScene {
  const structure =
    (input.resolvedScope.structureId
      ? findStructureById(input.draft, input.resolvedScope.structureId)
      : null) ?? findActiveStructure(input.draft)

  if (!structure) {
    return {
      structureId: null,
      scopeKind: input.resolvedScope.kind,
      bounds: null,
      floors: [],
      rooms: [],
    }
  }

  const scopeRoomIdSet = new Set(input.resolvedScope.roomIds)
  const floorEntries = structure.floors.flatMap((floor) => {
    const roomIds = floor.rooms.filter((room) => scopeRoomIdSet.has(room.id)).map((room) => room.id)

    return roomIds.length > 0
      ? [
          {
            floorId: floor.id,
            name: floor.name,
            elevation: floor.elevation,
            roomIds,
          },
        ]
      : []
  })

  const rooms = floorEntries.flatMap((floorEntry) => {
    const floor = structure.floors.find((candidate) => candidate.id === floorEntry.floorId)

    if (!floor) {
      return []
    }

    return floor.rooms
      .filter((room) => scopeRoomIdSet.has(room.id))
      .map((room) => buildRoomScene(room, floor.id, floor.name, floor.elevation))
  })

  const bounds = rooms.reduce<Bounds | null>(
    (combined, room) => (combined ? mergeBounds(combined, room.footprintBounds) : room.footprintBounds),
    null,
  )

  return {
    structureId: structure.id,
    scopeKind: input.resolvedScope.kind,
    bounds,
    floors: floorEntries,
    rooms,
  }
}

function buildRoomScene(room: Room, floorId: string, floorName: string, floorElevation: number): IsometricSceneRoom {
  const geometry = roomToGeometry(room)
  const primaryChain = geometry.chains[geometry.chains.length - 1] ?? null
  const slabPoints = geometry.closed && primaryChain ? getClosedChainPoints(primaryChain.points) : null

  return {
    roomId: room.id,
    floorId,
    floorName,
    name: room.name,
    color: room.color,
    floorElevation,
    wallHeight: DEFAULT_WALL_HEIGHT,
    footprintBounds: geometry.bounds,
    isOpen: !geometry.closed,
    slab:
      slabPoints && slabPoints.length >= 3
        ? {
            points: slabPoints,
            elevation: floorElevation,
            area: round(geometry.measuredArea ?? geometry.inferredArea ?? 0, 2),
          }
        : null,
    walls: geometry.segments.map((segment) => ({
      id: segment.id,
      label: segment.label,
      start: segment.start,
      end: segment.end,
      heading: segment.heading,
      length: segment.length,
      baseElevation: floorElevation,
      topElevation: floorElevation + DEFAULT_WALL_HEIGHT,
    })),
    furniture: room.furniture.map((item) => buildFurnitureBlock(item, floorElevation)),
  }
}

function getClosedChainPoints(points: Room['anchor'][]) {
  return points.length > 1 ? points.slice(0, -1) : points
}

function buildFurnitureBlock(
  furniture: Room['furniture'][number],
  floorElevation: number,
): IsometricFurnitureBlock {
  const center = {
    x: round(furniture.x + furniture.width / 2, 4),
    y: round(furniture.y + furniture.depth / 2, 4),
  }

  return {
    id: furniture.id,
    name: furniture.name,
    position: {
      x: furniture.x,
      y: furniture.y,
    },
    center,
    corners: getFurnitureCorners(furniture).map((corner) => ({
      x: round(corner.x, 4),
      y: round(corner.y, 4),
    })),
    width: furniture.width,
    depth: furniture.depth,
    rotation: furniture.rotation,
    height: deriveFurnitureHeight(furniture),
    baseElevation: floorElevation,
  }
}

function deriveFurnitureHeight(furniture: Room['furniture'][number]) {
  return round(
    Math.min(
      Math.max(Math.min(furniture.width, furniture.depth) * 0.75, MIN_FURNITURE_HEIGHT),
      MAX_FURNITURE_HEIGHT,
    ),
    2,
  )
}
