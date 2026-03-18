import type { Bounds, CornerGeometry, Floor, Furniture, Point, Room, RoomGeometry, RoomGeometryChain, SegmentGeometry } from '../types'

const CLOSE_EPSILON = 0.45
const INTERSECTION_EPSILON = 1e-6
const ROOM_CONNECTION_EPSILON = 0.02

export type RoomWallValidation =
  | {
      valid: true
      error: null
    }
  | {
      valid: false
      error: string
      segmentIds: [string, string]
    }

export function degToRad(deg: number) {
  return (deg * Math.PI) / 180
}

export function radToDeg(rad: number) {
  return (rad * 180) / Math.PI
}

export function normalizeAngle(angle: number) {
  const normalized = angle % 360
  return normalized < 0 ? normalized + 360 : normalized
}

export function angleDelta(from: number, to: number) {
  const delta = ((to - from + 540) % 360) - 180
  return Math.abs(delta) === 180 ? 180 : delta
}

export function pointDistance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function angleFromPoints(start: Point, end: Point) {
  return normalizeAngle(radToDeg(Math.atan2(end.y - start.y, end.x - start.x)))
}

export function addPolar(point: Point, length: number, angle: number): Point {
  const radians = degToRad(angle)
  return {
    x: point.x + Math.cos(radians) * length,
    y: point.y + Math.sin(radians) * length,
  }
}

export function polygonArea(points: Point[]) {
  if (points.length < 3) {
    return 0
  }

  let sum = 0

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    sum += current.x * next.y - next.x * current.y
  }

  return Math.abs(sum / 2)
}

export function expandBounds(bounds: Bounds, point: Point): Bounds {
  return {
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y),
  }
}

export function createEmptyBounds(point: Point): Bounds {
  return {
    minX: point.x,
    minY: point.y,
    maxX: point.x,
    maxY: point.y,
  }
}

export function mergeBounds(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  }
}

export function boundsCenter(bounds: Bounds): Point {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  }
}

export function boundsSize(bounds: Bounds) {
  return {
    width: Math.max(bounds.maxX - bounds.minX, 1),
    height: Math.max(bounds.maxY - bounds.minY, 1),
  }
}

export function roomToGeometry(room: Room): RoomGeometry {
  if (room.segments.length === 0) {
    return {
      points: [room.anchor],
      segments: [],
      chains: [],
      endPoint: room.anchor,
      exitHeading: room.startHeading,
      closed: false,
      measuredArea: null,
      inferredArea: null,
      bounds: createEmptyBounds(room.anchor),
    }
  }

  const chains: RoomGeometryChain[] = []
  const segments: SegmentGeometry[] = []
  let bounds: Bounds | null = null
  let currentPoints: Point[] = []
  let currentSegments: SegmentGeometry[] = []
  let cursor = room.anchor
  let heading = room.startHeading

  const flushChain = () => {
    if (currentPoints.length === 0) {
      return
    }

    const endPoint = currentPoints[currentPoints.length - 1]
    const closed = currentSegments.length >= 3 && pointDistance(endPoint, currentPoints[0]) <= CLOSE_EPSILON
    const closedLoop = closed ? currentPoints.slice(0, -1) : currentPoints

    chains.push({
      points: currentPoints,
      segments: currentSegments,
      endPoint,
      exitHeading: heading,
      closed,
      measuredArea: closed ? polygonArea(closedLoop) : null,
      inferredArea: currentPoints.length >= 3 ? polygonArea([...currentPoints, currentPoints[0]]) : null,
    })
  }

  room.segments.forEach((segment, index) => {
    const startsDetachedRun = index === 0 || Boolean(segment.startPoint)

    if (startsDetachedRun) {
      flushChain()
      cursor = index === 0 ? room.anchor : { ...segment.startPoint! }
      heading = index === 0 ? room.startHeading : segment.startHeading ?? room.startHeading
      currentPoints = [cursor]
      currentSegments = []
      bounds = bounds ? expandBounds(bounds, cursor) : createEmptyBounds(cursor)
    }

    const next = addPolar(cursor, segment.length, heading)
    const geometrySegment = {
      id: segment.id,
      label: segment.label,
      length: segment.length,
      turn: segment.turn,
      heading,
      start: cursor,
      end: next,
    }

    currentSegments.push(geometrySegment)
    segments.push(geometrySegment)
    currentPoints.push(next)
    bounds = expandBounds(bounds ?? createEmptyBounds(cursor), next)
    cursor = next
    heading = normalizeAngle(heading + segment.turn)
  })

  flushChain()

  const primaryChain = chains[chains.length - 1]

  return {
    points: primaryChain?.points ?? [room.anchor],
    segments,
    chains,
    endPoint: primaryChain?.endPoint ?? room.anchor,
    exitHeading: primaryChain?.exitHeading ?? room.startHeading,
    closed: chains.length === 1 ? primaryChain?.closed ?? false : false,
    measuredArea: chains.length === 1 ? primaryChain?.measuredArea ?? null : null,
    inferredArea: chains.length === 1 ? primaryChain?.inferredArea ?? null : null,
    bounds: bounds ?? createEmptyBounds(room.anchor),
  }
}

export function deleteRoomSegmentPreservingGeometry(room: Room, segmentId: string) {
  const segmentIndex = room.segments.findIndex((segment) => segment.id === segmentId)

  if (segmentIndex < 0) {
    return {
      deleted: false as const,
      reason: 'not-found' as const,
    }
  }

  const geometry = roomToGeometry(room)
  const nextGeometrySegment = geometry.segments[segmentIndex + 1] ?? null

  room.segments.splice(segmentIndex, 1)

  if (room.segments.length === 0) {
    return {
      deleted: true as const,
    }
  }

  if (segmentIndex === 0 && nextGeometrySegment) {
    room.anchor = { ...nextGeometrySegment.start }
    room.startHeading = nextGeometrySegment.heading
    delete room.segments[0].startPoint
    delete room.segments[0].startHeading

    return {
      deleted: true as const,
    }
  }

  if (segmentIndex < room.segments.length && nextGeometrySegment) {
    room.segments[segmentIndex].startPoint = { ...nextGeometrySegment.start }
    room.segments[segmentIndex].startHeading = nextGeometrySegment.heading
  }

  return {
    deleted: true as const,
  }
}

export function getConnectedRoomIds(floor: Floor, roomId: string) {
  const startRoom = floor.rooms.find((room) => room.id === roomId)

  if (!startRoom) {
    return []
  }

  if (floor.rooms.length <= 1) {
    return [startRoom.id]
  }

  const geometryByRoomId = new Map(
    floor.rooms.map((room) => [room.id, roomToGeometry(room)]),
  )
  const adjacencyByRoomId = new Map(
    floor.rooms.map((room) => [room.id, new Set<string>()]),
  )

  for (let leftIndex = 0; leftIndex < floor.rooms.length; leftIndex += 1) {
    const leftRoom = floor.rooms[leftIndex]
    const leftGeometry = geometryByRoomId.get(leftRoom.id)

    if (!leftGeometry || leftGeometry.segments.length === 0) {
      continue
    }

    for (let rightIndex = leftIndex + 1; rightIndex < floor.rooms.length; rightIndex += 1) {
      const rightRoom = floor.rooms[rightIndex]
      const rightGeometry = geometryByRoomId.get(rightRoom.id)

      if (!rightGeometry || rightGeometry.segments.length === 0) {
        continue
      }

      if (!roomsShareConnectedWalls(leftGeometry.segments, rightGeometry.segments)) {
        continue
      }

      adjacencyByRoomId.get(leftRoom.id)?.add(rightRoom.id)
      adjacencyByRoomId.get(rightRoom.id)?.add(leftRoom.id)
    }
  }

  const connectedRoomIds: string[] = []
  const visitedRoomIds = new Set<string>()
  const queue = [startRoom.id]

  while (queue.length > 0) {
    const nextRoomId = queue.shift()

    if (!nextRoomId || visitedRoomIds.has(nextRoomId)) {
      continue
    }

    visitedRoomIds.add(nextRoomId)
    connectedRoomIds.push(nextRoomId)

    adjacencyByRoomId.get(nextRoomId)?.forEach((adjacentRoomId) => {
      if (!visitedRoomIds.has(adjacentRoomId)) {
        queue.push(adjacentRoomId)
      }
    })
  }

  return connectedRoomIds
}

export function getRoomCorners(room: Room, options?: { includeExits?: boolean }): CornerGeometry[] {
  const geometry = roomToGeometry(room)

  return geometry.chains.flatMap((chain) =>
    chain.segments.flatMap((segment, index) => {
      const nextSegment = chain.segments[index + 1] ?? (chain.closed ? chain.segments[0] : null)

      if (!nextSegment && !options?.includeExits) {
        return []
      }

      const incomingLabel = segment.label || `Wall ${index + 1}`
      const outgoingLabel = nextSegment ? nextSegment.label || `Wall ${(index + 1) % chain.segments.length + 1}` : null

      return {
        segmentId: segment.id,
        point: segment.end,
        turn: segment.turn,
        incomingLabel,
        outgoingLabel,
        isExit: nextSegment === null,
      }
    }),
  )
}

export function validateRoomWalls(room: Room): RoomWallValidation {
  void room
  return {
    valid: true,
    error: null,
  }
}

export function pointsToPath(points: Point[]) {
  if (points.length === 0) {
    return ''
  }

  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${-point.y}`)
    .join(' ')
}

export function formatFeet(value: number) {
  const sign = value < 0 ? '-' : ''
  let feet = Math.floor(Math.abs(value))
  let inches = Math.round((Math.abs(value) - feet) * 12)

  if (inches === 12) {
    feet += 1
    inches = 0
  }

  if (feet === 0) {
    return `${sign}${inches}"`
  }

  if (inches === 0) {
    return `${sign}${feet}'`
  }

  return `${sign}${feet}' ${inches}"`
}

export function formatDegrees(value: number) {
  const rounded = Math.round(value * 10) / 10
  return `${rounded > 0 ? '+' : ''}${rounded}\u00b0`
}

export function describeTurn(turn: number) {
  if (Math.abs(turn) < 0.5) {
    return 'Continue straight'
  }

  const direction = turn > 0 ? 'Left' : 'Right'
  return `${direction} ${Math.abs(Math.round(turn))}\u00b0`
}

export function formatTurnBadge(turn: number) {
  if (Math.abs(turn) < 0.5) {
    return '0\u00b0'
  }

  const direction = turn > 0 ? 'L' : 'R'
  return `${direction} ${Math.abs(Math.round(turn))}\u00b0`
}

export function getCornerAngleBetweenWalls(turn: number) {
  return round(180 - Math.min(Math.abs(turn), 180), 1)
}

export function getTurnFromCornerAngle(angleBetweenWalls: number, direction: 'left' | 'right' | 'straight') {
  const normalizedAngle = clamp(angleBetweenWalls, 0, 360)

  if (direction === 'straight' || Math.abs(normalizedAngle - 180) < 0.5) {
    return 0
  }

  const isFullSweep = normalizedAngle >= 359.5
  const isReflexAngle = normalizedAngle > 180 && !isFullSweep
  const canonicalAngle = isFullSweep ? 0 : isReflexAngle ? 360 - normalizedAngle : normalizedAngle
  const turnMagnitude = 180 - canonicalAngle
  const effectiveDirection = isReflexAngle ? (direction === 'left' ? 'right' : 'left') : direction

  return effectiveDirection === 'left' ? turnMagnitude : -turnMagnitude
}

export function describeCornerAngle(turn: number) {
  const angle = getCornerAngleBetweenWalls(turn)

  if (angle >= 179.5) {
    return '180\u00b0 straight'
  }

  const direction = turn > 0 ? 'Left' : 'Right'
  return `${formatDegrees(angle)} between walls, ${direction.toLowerCase()} turn`
}

export function formatCornerAngleBadge(turn: number) {
  return `${Math.round(getCornerAngleBetweenWalls(turn))}\u00b0`
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function round(value: number, precision = 2) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

export function projectVector(point: Point, axisAngle: number) {
  const radians = degToRad(axisAngle)
  return point.x * Math.cos(radians) + point.y * Math.sin(radians)
}

export function subtractPoints(a: Point, b: Point): Point {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
  }
}

export function midpoint(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  }
}

export function rotatePoint(point: Point, center: Point, angle: number) {
  if (Math.abs(angle) <= INTERSECTION_EPSILON) {
    return point
  }

  const radians = degToRad(angle)
  const translatedX = point.x - center.x
  const translatedY = point.y - center.y

  return {
    x: center.x + translatedX * Math.cos(radians) - translatedY * Math.sin(radians),
    y: center.y + translatedX * Math.sin(radians) + translatedY * Math.cos(radians),
  }
}

export function rotateRoom(room: Room, angle: number) {
  const normalizedAngle = normalizeAngle(angle)

  if (normalizedAngle === 0) {
    return
  }

  const geometry = roomToGeometry(room)
  const center = boundsCenter(geometry.bounds)
  const rotatedAnchor = rotatePoint(room.anchor, center, angle)

  room.anchor = {
    x: round(rotatedAnchor.x, 4),
    y: round(rotatedAnchor.y, 4),
  }
  room.startHeading = normalizeAngle(room.startHeading + angle)
  room.furniture = room.furniture.map((item) => {
    const rotatedCenter = rotatePoint(
      {
        x: item.x + item.width / 2,
        y: item.y + item.depth / 2,
      },
      center,
      angle,
    )

    return {
      ...item,
      x: round(rotatedCenter.x - item.width / 2, 4),
      y: round(rotatedCenter.y - item.depth / 2, 4),
      rotation: normalizeAngle(item.rotation + angle),
    }
  })
}

export function snapFurnitureToRoom(
  room: Room,
  furniture: Furniture,
  wallSnapStrength: number,
  cornerSnapStrength: number,
) {
  const cornerSnapCandidate = getFurnitureCornerSnapCandidate(room, furniture, cornerSnapStrength)
  if (cornerSnapCandidate) {
    return cornerSnapCandidate
  }

  const threshold = Math.max(wallSnapStrength, 0)

  if (threshold === 0) {
    return {
      x: furniture.x,
      y: furniture.y,
    }
  }

  const corners = getFurnitureCorners(furniture)
  let bestX = furniture.x
  let bestY = furniture.y
  let bestScore = Number.POSITIVE_INFINITY

  roomToGeometry(room).segments.forEach((segment) => {
    const tangent = normalizeVector(subtractPoints(segment.end, segment.start))

    if (!tangent) {
      return
    }

    const normal = {
      x: -tangent.y,
      y: tangent.x,
    }
    const segmentInterval = getProjectionInterval([segment.start, segment.end], tangent)
    const furnitureTangentInterval = getProjectionInterval(corners, tangent)
    const alongGap = getIntervalGap(segmentInterval, furnitureTangentInterval)

    if (alongGap > threshold) {
      return
    }

    const wallOffset = dotProduct(segment.start, normal)
    const furnitureNormalInterval = getProjectionInterval(corners, normal)
    const alignNearSide = wallOffset - furnitureNormalInterval.min
    const alignFarSide = wallOffset - furnitureNormalInterval.max
    const snapDelta = Math.abs(alignNearSide) <= Math.abs(alignFarSide) ? alignNearSide : alignFarSide

    if (Math.abs(snapDelta) > threshold) {
      return
    }

    const score = Math.abs(snapDelta) + alongGap * 0.25
    if (bestScore <= score) {
      return
    }

    bestX = round(furniture.x + normal.x * snapDelta, 4)
    bestY = round(furniture.y + normal.y * snapDelta, 4)
    bestScore = score
  })

  if (!Number.isFinite(bestScore)) {
    return {
      x: furniture.x,
      y: furniture.y,
    }
  }

  return {
    x: bestX,
    y: bestY,
  }
}

export function emptyBounds(): Bounds {
  return {
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0,
  }
}

function roomsShareConnectedWalls(
  leftSegments: Array<Pick<SegmentGeometry, 'start' | 'end'>>,
  rightSegments: Array<Pick<SegmentGeometry, 'start' | 'end'>>,
) {
  return leftSegments.some((leftSegment) =>
    rightSegments.some((rightSegment) => segmentsTouch(leftSegment, rightSegment)),
  )
}

function segmentsTouch(
  left: Pick<SegmentGeometry, 'start' | 'end'>,
  right: Pick<SegmentGeometry, 'start' | 'end'>,
) {
  if (hasProperIntersection(left.start, left.end, right.start, right.end)) {
    return true
  }

  return (
    pointToSegmentDistance(left.start, right.start, right.end) <= ROOM_CONNECTION_EPSILON ||
    pointToSegmentDistance(left.end, right.start, right.end) <= ROOM_CONNECTION_EPSILON ||
    pointToSegmentDistance(right.start, left.start, left.end) <= ROOM_CONNECTION_EPSILON ||
    pointToSegmentDistance(right.end, left.start, left.end) <= ROOM_CONNECTION_EPSILON
  )
}

function hasProperIntersection(a: Point, b: Point, c: Point, d: Point) {
  const o1 = orientation(a, b, c)
  const o2 = orientation(a, b, d)
  const o3 = orientation(c, d, a)
  const o4 = orientation(c, d, b)

  return o1 * o2 < -INTERSECTION_EPSILON && o3 * o4 < -INTERSECTION_EPSILON
}
function pointToSegmentDistance(point: Point, start: Point, end: Point) {
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const lengthSquared = deltaX ** 2 + deltaY ** 2

  if (lengthSquared <= INTERSECTION_EPSILON) {
    return pointDistance(point, start)
  }

  const projection = ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared
  const t = clamp(projection, 0, 1)
  const closest = {
    x: start.x + deltaX * t,
    y: start.y + deltaY * t,
  }

  return pointDistance(point, closest)
}

function orientation(a: Point, b: Point, c: Point) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}
function getFurnitureCornerSnapCandidate(room: Room, furniture: Furniture, snapStrength: number) {
  const threshold = Math.max(snapStrength, 0)

  if (threshold === 0) {
    return null
  }

  const furnitureCorners = getFurnitureCorners(furniture)
  const roomCorners = getRoomCornerPoints(room)
  let bestX = furniture.x
  let bestY = furniture.y
  let bestScore = Number.POSITIVE_INFINITY

  roomCorners.forEach((roomCorner) => {
    furnitureCorners.forEach((furnitureCorner) => {
      const delta = subtractPoints(roomCorner, furnitureCorner)
      const distance = Math.hypot(delta.x, delta.y)

      if (distance > threshold || bestScore <= distance) {
        return
      }

      bestX = round(furniture.x + delta.x, 4)
      bestY = round(furniture.y + delta.y, 4)
      bestScore = distance
    })
  })

  if (!Number.isFinite(bestScore)) {
    return null
  }

  return {
    x: bestX,
    y: bestY,
  }
}

function getFurnitureCorners(furniture: Furniture) {
  const center = {
    x: furniture.x + furniture.width / 2,
    y: furniture.y + furniture.depth / 2,
  }

  return [
    { x: furniture.x, y: furniture.y },
    { x: furniture.x + furniture.width, y: furniture.y },
    { x: furniture.x + furniture.width, y: furniture.y + furniture.depth },
    { x: furniture.x, y: furniture.y + furniture.depth },
  ].map((corner) => rotatePoint(corner, center, furniture.rotation))
}

function normalizeVector(vector: Point) {
  const length = Math.hypot(vector.x, vector.y)

  if (length <= INTERSECTION_EPSILON) {
    return null
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  }
}

function getProjectionInterval(points: Point[], axis: Point) {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY

  points.forEach((point) => {
    const projection = dotProduct(point, axis)
    min = Math.min(min, projection)
    max = Math.max(max, projection)
  })

  return { min, max }
}

function getIntervalGap(left: { min: number; max: number }, right: { min: number; max: number }) {
  if (left.max < right.min) {
    return right.min - left.max
  }

  if (right.max < left.min) {
    return left.min - right.max
  }

  return 0
}

function dotProduct(left: Point, right: Point) {
  return left.x * right.x + left.y * right.y
}

function getRoomCornerPoints(room: Room) {
  const geometry = roomToGeometry(room)
  return geometry.chains.flatMap((chain) => (chain.closed ? chain.points.slice(0, -1) : chain.points))
}
