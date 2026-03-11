import type {
  Bounds,
  CanvasTarget,
  DraftState,
  Floor,
  Furniture,
  Room,
  RoomSuggestion,
  Structure,
  SuggestionSegment,
} from '../types'
import {
  angleDelta,
  angleFromPoints,
  boundsCenter,
  boundsSize,
  emptyBounds,
  formatFeet,
  mergeBounds,
  pointDistance,
  projectVector,
  roomToGeometry,
  round,
  subtractPoints,
} from './geometry'

export const STORAGE_KEY = 'incremental-blueprint/v1'
export const MIN_WALL_STROKE_SCALE = 0.6
export const MAX_WALL_STROKE_SCALE = 2.2
export const DEFAULT_WALL_STROKE_SCALE = 1
export const MIN_LABEL_FONT_SIZE = 10
export const MAX_LABEL_FONT_SIZE = 18
export const DEFAULT_LABEL_FONT_SIZE = 12.5
export const DEFAULT_SHOW_LABEL_SHAPES = true
export const MIN_FURNITURE_SNAP_STRENGTH = 0
export const MAX_FURNITURE_SNAP_STRENGTH = 3
export const DEFAULT_FURNITURE_SNAP_STRENGTH = 1
export const MIN_FURNITURE_CORNER_SNAP_STRENGTH = 0
export const MAX_FURNITURE_CORNER_SNAP_STRENGTH = 3
export const DEFAULT_FURNITURE_CORNER_SNAP_STRENGTH = 1

export function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

export function nowIso() {
  return new Date().toISOString()
}

export function createSegment(partial?: Partial<Room['segments'][number]>) {
  return {
    id: partial?.id ?? makeId('seg'),
    label: partial?.label ?? `Wall`,
    length: partial?.length ?? 10,
    turn: partial?.turn ?? 90,
    notes: partial?.notes ?? '',
  }
}

export function createFurniture(partial?: Partial<Furniture>): Furniture {
  return {
    id: partial?.id ?? makeId('furn'),
    name: partial?.name ?? 'Bench',
    x: partial?.x ?? 2,
    y: partial?.y ?? -2,
    width: partial?.width ?? 3,
    depth: partial?.depth ?? 1.75,
    rotation: partial?.rotation ?? 0,
  }
}

export function createRoom(partial?: Partial<Room>): Room {
  const name = partial?.name ?? 'New room'

  return {
    id: partial?.id ?? makeId('room'),
    name,
    color: partial?.color ?? '#f7f7f5',
    anchor: partial?.anchor ?? { x: 0, y: 0 },
    startHeading: partial?.startHeading ?? 0,
    notes: partial?.notes ?? '',
    segments:
      partial?.segments?.map((segment) => createSegment(segment)) ??
      [
        createSegment({ label: `${name} north wall`, length: 12, turn: 90 }),
        createSegment({ label: `${name} east wall`, length: 10, turn: 90 }),
      ],
    furniture: partial?.furniture ?? [],
  }
}

export function createFloor(partial?: Partial<Floor>): Floor {
  return {
    id: partial?.id ?? makeId('floor'),
    name: partial?.name ?? 'New floor',
    elevation: partial?.elevation ?? 0,
    rooms: partial?.rooms ?? [],
  }
}

export function createStructure(partial?: Partial<Structure>): Structure {
  const createdAt = partial?.createdAt ?? nowIso()
  return {
    id: partial?.id ?? makeId('structure'),
    name: partial?.name ?? 'Untitled structure',
    notes: partial?.notes ?? '',
    createdAt,
    updatedAt: partial?.updatedAt ?? createdAt,
    floors: partial?.floors ?? [createFloor({ name: 'First floor', elevation: 0 })],
  }
}

export function ensureSelections(state: DraftState): DraftState {
  normalizeDraftCanvasSettings(state)

  if (state.structures.length === 0) {
    const structure = createStructure()
    const floor = structure.floors[0]
    return {
      ...state,
      structures: [structure],
      activeStructureId: structure.id,
      activeFloorId: floor.id,
      selectedRoomId: floor.rooms[0]?.id ?? null,
      selectedFurnitureId: null,
    }
  }

  const activeStructure =
    state.structures.find((structure) => structure.id === state.activeStructureId) ?? state.structures[0]
  const floors = activeStructure.floors.length > 0 ? activeStructure.floors : [createFloor({ name: 'First floor' })]

  if (activeStructure.floors.length === 0) {
    activeStructure.floors = floors
  }

  const activeFloor = floors.find((floor) => floor.id === state.activeFloorId) ?? floors[0]
  const selectedRoom = activeFloor.rooms.find((room) => room.id === state.selectedRoomId) ?? activeFloor.rooms[0]

  return {
    ...state,
    activeStructureId: activeStructure.id,
    activeFloorId: activeFloor.id,
    selectedRoomId: selectedRoom?.id ?? null,
    selectedFurnitureId:
      selectedRoom?.furniture.find((item) => item.id === state.selectedFurnitureId)?.id ?? null,
  }
}

export function findActiveStructure(state: DraftState) {
  return state.structures.find((structure) => structure.id === state.activeStructureId) ?? state.structures[0]
}

export function findStructureById(state: DraftState, structureId: string) {
  return state.structures.find((structure) => structure.id === structureId)
}

export function findActiveFloor(state: DraftState) {
  const structure = findActiveStructure(state)
  return structure?.floors.find((floor) => floor.id === state.activeFloorId) ?? structure?.floors[0]
}

export function findFloorById(state: DraftState, structureId: string, floorId: string) {
  return findStructureById(state, structureId)?.floors.find((floor) => floor.id === floorId)
}

export function findSelectedRoom(state: DraftState) {
  const floor = findActiveFloor(state)
  return floor?.rooms.find((room) => room.id === state.selectedRoomId) ?? floor?.rooms[0]
}

export function findRoomById(state: DraftState, structureId: string, floorId: string, roomId: string) {
  return findFloorById(state, structureId, floorId)?.rooms.find((room) => room.id === roomId)
}

export function findSelectedFurniture(state: DraftState) {
  const room = findSelectedRoom(state)
  return room?.furniture.find((item) => item.id === state.selectedFurnitureId) ?? room?.furniture[0]
}

export function findFurnitureById(
  state: DraftState,
  structureId: string,
  floorId: string,
  roomId: string,
  furnitureId: string,
) {
  return findRoomById(state, structureId, floorId, roomId)?.furniture.find((item) => item.id === furnitureId)
}

export function findSegmentById(state: DraftState, structureId: string, floorId: string, roomId: string, segmentId: string) {
  return findRoomById(state, structureId, floorId, roomId)?.segments.find((segment) => segment.id === segmentId)
}

export function selectTargetInDraft(state: DraftState, target: CanvasTarget) {
  switch (target.kind) {
    case 'structure': {
      const structure = findStructureById(state, target.structureId)
      if (!structure) {
        return
      }
      state.activeStructureId = structure.id
      state.activeFloorId = structure.floors[0]?.id ?? ''
      state.selectedRoomId = structure.floors[0]?.rooms[0]?.id ?? null
      state.selectedFurnitureId = null
      return
    }
    case 'floor': {
      const floor = findFloorById(state, target.structureId, target.floorId)
      if (!floor) {
        return
      }
      state.activeStructureId = target.structureId
      state.activeFloorId = floor.id
      state.selectedRoomId = floor.rooms[0]?.id ?? null
      state.selectedFurnitureId = null
      return
    }
    case 'room':
    case 'wall':
    case 'corner': {
      const room = findRoomById(state, target.structureId, target.floorId, target.roomId)
      if (!room) {
        return
      }
      state.activeStructureId = target.structureId
      state.activeFloorId = target.floorId
      state.selectedRoomId = room.id
      state.selectedFurnitureId = null
      return
    }
    case 'furniture': {
      const furniture = findFurnitureById(
        state,
        target.structureId,
        target.floorId,
        target.roomId,
        target.furnitureId,
      )
      if (!furniture) {
        return
      }
      state.activeStructureId = target.structureId
      state.activeFloorId = target.floorId
      state.selectedRoomId = target.roomId
      state.selectedFurnitureId = furniture.id
      return
    }
    case 'canvas':
      if (target.structureId) {
        state.activeStructureId = target.structureId
      }
      if (target.floorId) {
        state.activeFloorId = target.floorId
    }
  }
}

export function normalizeDraftCanvasSettings(state: DraftState) {
  if (typeof state.showRoomFloorLabels !== 'boolean') {
    state.showRoomFloorLabels = true
  }
  if (typeof state.showWallLabels !== 'boolean') {
    state.showWallLabels = true
  }
  if (typeof state.showAngleLabels !== 'boolean') {
    state.showAngleLabels = true
  }
  if (typeof state.wallStrokeScale !== 'number' || !Number.isFinite(state.wallStrokeScale)) {
    state.wallStrokeScale = DEFAULT_WALL_STROKE_SCALE
  } else {
    state.wallStrokeScale = clampNumber(state.wallStrokeScale, MIN_WALL_STROKE_SCALE, MAX_WALL_STROKE_SCALE)
  }
  if (typeof state.labelFontSize !== 'number' || !Number.isFinite(state.labelFontSize)) {
    state.labelFontSize = DEFAULT_LABEL_FONT_SIZE
  } else {
    state.labelFontSize = clampNumber(state.labelFontSize, MIN_LABEL_FONT_SIZE, MAX_LABEL_FONT_SIZE)
  }
  if (typeof state.showLabelShapes !== 'boolean') {
    state.showLabelShapes = DEFAULT_SHOW_LABEL_SHAPES
  }
  if (typeof state.furnitureSnapStrength !== 'number' || !Number.isFinite(state.furnitureSnapStrength)) {
    state.furnitureSnapStrength = DEFAULT_FURNITURE_SNAP_STRENGTH
  } else {
    state.furnitureSnapStrength = clampNumber(
      state.furnitureSnapStrength,
      MIN_FURNITURE_SNAP_STRENGTH,
      MAX_FURNITURE_SNAP_STRENGTH,
    )
  }
  if (typeof state.furnitureCornerSnapStrength !== 'number' || !Number.isFinite(state.furnitureCornerSnapStrength)) {
    state.furnitureCornerSnapStrength = clampNumber(
      state.furnitureSnapStrength,
      MIN_FURNITURE_CORNER_SNAP_STRENGTH,
      MAX_FURNITURE_CORNER_SNAP_STRENGTH,
    )
  } else {
    state.furnitureCornerSnapStrength = clampNumber(
      state.furnitureCornerSnapStrength,
      MIN_FURNITURE_CORNER_SNAP_STRENGTH,
      MAX_FURNITURE_CORNER_SNAP_STRENGTH,
    )
  }
}

export function getRoomCompletion(room: Room) {
  const geometry = roomToGeometry(room)

  if (geometry.closed) {
    return 1
  }

  if (room.segments.length >= 2) {
    return 0.7
  }

  return Math.min(room.segments.length * 0.25, 0.5)
}

function buildClosureSegment(
  room: Room,
  title: string,
  detail: string,
  segmentsToAdd: SuggestionSegment[],
  kind: RoomSuggestion['kind'],
) {
  return {
    id: createRoomSuggestionId({
      roomId: room.id,
      kind,
      segmentsToAdd,
    }),
    kind,
    roomId: room.id,
    title,
    detail,
    segmentsToAdd,
  } satisfies RoomSuggestion
}

function createRoomSuggestionId({
  roomId,
  kind,
  relatedRoomId,
  gapFeet,
  overlapFeet,
  segmentsToAdd,
}: {
  roomId: string
  kind: RoomSuggestion['kind']
  relatedRoomId?: string
  gapFeet?: number
  overlapFeet?: number
  segmentsToAdd?: SuggestionSegment[]
}) {
  const signature = JSON.stringify({
    roomId,
    kind,
    relatedRoomId: relatedRoomId ?? null,
    gapFeet: typeof gapFeet === 'number' ? round(gapFeet, 3) : null,
    overlapFeet: typeof overlapFeet === 'number' ? round(overlapFeet, 3) : null,
    segments:
      segmentsToAdd?.map((segment) => ({
        length: round(segment.length, 3),
        turn: round(segment.turn, 3),
      })) ?? [],
  })

  return `suggest-${kind}-${hashSuggestionSignature(signature)}`
}

function hashSuggestionSignature(value: string) {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}

export function getRoomSuggestions(room: Room, floor: Floor) {
  const geometry = roomToGeometry(room)
  const suggestions: RoomSuggestion[] = []

  if (!geometry.closed && room.segments.length >= 2) {
    const closureVector = subtractPoints(room.anchor, geometry.endPoint)
    const closureDistance = pointDistance(room.anchor, geometry.endPoint)

    if (closureDistance > 0.15) {
      const closureHeading = angleFromPoints(geometry.endPoint, room.anchor)
      const directAlignment = Math.abs(angleDelta(geometry.exitHeading, closureHeading))

      if (directAlignment <= 8) {
        const turnBackToStart = angleDelta(closureHeading, room.startHeading)
        suggestions.push(
          buildClosureSegment(
            room,
            'Close the room with one final wall',
            `${formatFeet(closureDistance)} returns to the starting corner.`,
            [
              {
                label: `${room.name} closure wall`,
                length: round(closureDistance),
                turn: round(turnBackToStart, 1),
              },
            ],
            'closure',
          ),
        )
      }

      const forwardDistance = projectVector(closureVector, geometry.exitHeading)
      const sideDistance = projectVector(closureVector, geometry.exitHeading + 90)

      if (forwardDistance > 0.25 && Math.abs(sideDistance) > 0.25) {
        const orthogonalTurn = sideDistance >= 0 ? 90 : -90
        const secondHeading = geometry.exitHeading + orthogonalTurn
        suggestions.push(
          buildClosureSegment(
            room,
            'Close with two orthogonal legs',
            `${formatFeet(forwardDistance)} forward, then ${formatFeet(
              Math.abs(sideDistance),
            )} after a ${orthogonalTurn > 0 ? 'left' : 'right'} turn.`,
            [
              {
                label: `${room.name} forward leg`,
                length: round(forwardDistance),
                turn: orthogonalTurn,
              },
              {
                label: `${room.name} return leg`,
                length: round(Math.abs(sideDistance)),
                turn: round(angleDelta(secondHeading, room.startHeading), 1),
              },
            ],
            'orthogonal',
          ),
        )
      }
    }
  }

  if (
    room.segments.length === 2 &&
    Math.abs(Math.abs(room.segments[0].turn) - 90) <= 5 &&
    Math.abs(room.segments[0].turn - room.segments[1].turn) <= 5
  ) {
    const cornerTurn = room.segments[1].turn
    suggestions.push(
      buildClosureSegment(
        room,
        'Assume a rectangle and mirror the measured walls',
        `${formatFeet(room.segments[0].length)} by ${formatFeet(
          room.segments[1].length,
        )} closes the room with the minimum common measurements.`,
        [
          {
            label: `${room.name} mirrored wall`,
            length: room.segments[0].length,
            turn: cornerTurn,
          },
          {
            label: `${room.name} final wall`,
            length: room.segments[1].length,
            turn: cornerTurn,
          },
        ],
        'rectangle',
      ),
    )
  }

  floor.rooms
    .filter((candidate) => candidate.id !== room.id)
    .forEach((candidate) => {
      const gap = inferGapBetweenRooms(room, candidate)

      if (!gap) {
        return
      }

      suggestions.push({
        id: createRoomSuggestionId({
          roomId: room.id,
          kind: 'gap',
          relatedRoomId: candidate.id,
          gapFeet: gap.gapFeet,
          overlapFeet: gap.overlapFeet,
        }),
        kind: 'gap',
        roomId: room.id,
        relatedRoomId: candidate.id,
        gapFeet: gap.gapFeet,
        title: `Possible inter-room wall cavity toward ${candidate.name}`,
        detail: `${formatFeet(gap.gapFeet)} separates parallel walls across ${formatFeet(
          gap.overlapFeet,
        )} of overlap.`,
      })
    })

  return suggestions
}

function inferGapBetweenRooms(
  room: Room,
  candidate: Room,
): {
  gapFeet: number
  overlapFeet: number
} | null {
  const roomGeometry = roomToGeometry(room)
  const candidateGeometry = roomToGeometry(candidate)

  let bestGap:
    | {
        gapFeet: number
        overlapFeet: number
      }
    | null = null

  roomGeometry.segments.forEach((leftSegment) => {
    const leftVector = subtractPoints(leftSegment.end, leftSegment.start)
    const leftLength = pointDistance(leftSegment.start, leftSegment.end)

    if (leftLength <= 0.01) {
      return
    }

    candidateGeometry.segments.forEach((rightSegment) => {
      const rightVector = subtractPoints(rightSegment.end, rightSegment.start)
      const rightLength = pointDistance(rightSegment.start, rightSegment.end)

      if (rightLength <= 0.01) {
        return
      }

      const parallelism =
        Math.abs(leftVector.x * rightVector.y - leftVector.y * rightVector.x) / (leftLength * rightLength)

      if (parallelism > 0.08) {
        return
      }

      const axisAngle = leftSegment.heading
      const aStart = projectVector(leftSegment.start, axisAngle)
      const aEnd = projectVector(leftSegment.end, axisAngle)
      const bStart = projectVector(rightSegment.start, axisAngle)
      const bEnd = projectVector(rightSegment.end, axisAngle)

      const overlapFeet =
        Math.min(Math.max(aStart, aEnd), Math.max(bStart, bEnd)) -
        Math.max(Math.min(aStart, aEnd), Math.min(bStart, bEnd))

      if (overlapFeet < 2) {
        return
      }

      const normalAngle = axisAngle + 90
      const normalDistance = Math.abs(
        projectVector(subtractPoints(rightSegment.start, leftSegment.start), normalAngle),
      )

      if (normalDistance < 0.15 || normalDistance > 1.5) {
        return
      }

      if (!bestGap || normalDistance < bestGap.gapFeet) {
        bestGap = {
          gapFeet: round(normalDistance),
          overlapFeet: round(overlapFeet),
        }
      }
    })
  })

  return bestGap
}

export function computeFloorBounds(floor: Floor) {
  if (floor.rooms.length === 0) {
    return {
      ...emptyBounds(),
      minX: -8,
      minY: -8,
      maxX: 8,
      maxY: 8,
    }
  }

  return floor.rooms
    .map((room) => roomToGeometry(room).bounds)
    .reduce((combined, bounds) => mergeBounds(combined, bounds))
}

export function computeVisibleBounds(floors: Floor[]) {
  if (floors.length === 0) {
    return {
      ...emptyBounds(),
      minX: -8,
      minY: -8,
      maxX: 8,
      maxY: 8,
    }
  }

  return floors.map(computeFloorBounds).reduce((combined, bounds) => mergeBounds(combined, bounds))
}

export function padBounds(bounds: Bounds, padding = 6): Bounds {
  return {
    minX: bounds.minX - padding,
    minY: bounds.minY - padding,
    maxX: bounds.maxX + padding,
    maxY: bounds.maxY + padding,
  }
}

export function getViewBox(
  bounds: Bounds,
  zoom: number,
  offset = { x: 0, y: 0 },
  aspectRatio?: number,
) {
  const padded = padBounds(bounds, 6)
  const center = boundsCenter(padded)
  const size = boundsSize(padded)
  let width = size.width / zoom
  let height = size.height / zoom

  if (aspectRatio && Number.isFinite(aspectRatio) && aspectRatio > 0) {
    const currentRatio = width / height

    if (currentRatio < aspectRatio) {
      width = height * aspectRatio
    } else if (currentRatio > aspectRatio) {
      height = width / aspectRatio
    }
  }

  return {
    x: center.x - width / 2 + offset.x,
    y: -(center.y + height / 2) + offset.y,
    width,
    height,
  }
}

export function getRoomLabelPoint(room: Room) {
  const geometry = roomToGeometry(room)

  if (geometry.points.length < 2) {
    return room.anchor
  }

  return boundsCenter(geometry.bounds)
}

export function touchStructure(structure: Structure) {
  structure.updatedAt = nowIso()
}

export function cloneImportedStructure(snapshot: Structure): Structure {
  return createStructure({
    ...snapshot,
    id: makeId('structure'),
    floors: snapshot.floors.map((floor) =>
      createFloor({
        ...floor,
        id: makeId('floor'),
        rooms: floor.rooms.map((room) =>
          createRoom({
            ...room,
            id: makeId('room'),
            segments: room.segments.map((segment) =>
              createSegment({
                ...segment,
                id: makeId('seg'),
              }),
            ),
            furniture: room.furniture.map((item) =>
              createFurniture({
                ...item,
                id: makeId('furn'),
              }),
            ),
          }),
        ),
      }),
    ),
  })
}

export function loadDraftState() {
  const saved = window.localStorage.getItem(STORAGE_KEY)

  if (!saved) {
    return null
  }

  try {
    const parsed = JSON.parse(saved) as DraftState
    return ensureSelections(parsed)
  } catch {
    return null
  }
}

export function saveDraftState(state: DraftState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
