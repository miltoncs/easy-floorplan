import type { Bounds, CornerGeometry, Point, Room, RoomGeometry, SegmentGeometry } from '../types'

const CLOSE_EPSILON = 0.45
const INTERSECTION_EPSILON = 1e-6

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
  const points: Point[] = [room.anchor]
  const segments: SegmentGeometry[] = []
  let cursor = room.anchor
  let heading = room.startHeading
  let bounds = createEmptyBounds(room.anchor)

  room.segments.forEach((segment) => {
    const next = addPolar(cursor, segment.length, heading)
    segments.push({
      id: segment.id,
      label: segment.label,
      length: segment.length,
      turn: segment.turn,
      heading,
      start: cursor,
      end: next,
    })
    points.push(next)
    bounds = expandBounds(bounds, next)
    cursor = next
    heading = normalizeAngle(heading + segment.turn)
  })

  const endPoint = points[points.length - 1]
  const closed = room.segments.length >= 3 && pointDistance(endPoint, room.anchor) <= CLOSE_EPSILON
  const closedLoop = closed ? points.slice(0, -1) : points
  const measuredArea = closed ? polygonArea(closedLoop) : null
  const inferredArea = points.length >= 3 ? polygonArea([...points, room.anchor]) : null

  return {
    points,
    segments,
    endPoint,
    exitHeading: heading,
    closed,
    measuredArea,
    inferredArea,
    bounds,
  }
}

export function getRoomCorners(room: Room): CornerGeometry[] {
  const geometry = roomToGeometry(room)

  return geometry.segments.map((segment, index) => {
    const nextSegment = geometry.segments[index + 1] ?? (geometry.closed ? geometry.segments[0] : null)
    const incomingLabel = segment.label || `Wall ${index + 1}`
    const outgoingLabel = nextSegment ? nextSegment.label || `Wall ${(index + 1) % geometry.segments.length + 1}` : null

    return {
      segmentId: segment.id,
      point: segment.end,
      turn: segment.turn,
      incomingLabel,
      outgoingLabel,
      isExit: nextSegment === null,
    }
  })
}

export function validateRoomWalls(room: Room): RoomWallValidation {
  const geometry = roomToGeometry(room)
  const segments = geometry.segments

  for (let leftIndex = 0; leftIndex < segments.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < segments.length; rightIndex += 1) {
      const left = segments[leftIndex]
      const right = segments[rightIndex]

      if (segmentsConflict(left, right, {
        allowSharedEndpoint:
          rightIndex === leftIndex + 1 ||
          (leftIndex === 0 &&
            rightIndex === segments.length - 1 &&
            pointDistance(left.start, right.end) <= CLOSE_EPSILON),
      })) {
        return {
          valid: false,
          error: 'Walls cannot intersect.',
          segmentIds: [left.id, right.id],
        }
      }
    }
  }

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
  const normalizedAngle = clamp(angleBetweenWalls, 0, 180)

  if (direction === 'straight' || normalizedAngle >= 179.5) {
    return 0
  }

  const turnMagnitude = 180 - normalizedAngle
  return direction === 'left' ? turnMagnitude : -turnMagnitude
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

export function emptyBounds(): Bounds {
  return {
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0,
  }
}

function segmentsConflict(
  left: Pick<SegmentGeometry, 'start' | 'end'>,
  right: Pick<SegmentGeometry, 'start' | 'end'>,
  options: {
    allowSharedEndpoint: boolean
  },
) {
  const sharedEndpoint =
    findSharedEndpoint(left.start, right.start) ??
    findSharedEndpoint(left.start, right.end) ??
    findSharedEndpoint(left.end, right.start) ??
    findSharedEndpoint(left.end, right.end)

  if (segmentsCollinear(left.start, left.end, right.start, right.end)) {
    return Boolean(sharedEndpoint) && !options.allowSharedEndpoint
  }

  if (hasProperIntersection(left.start, left.end, right.start, right.end)) {
    return true
  }

  const endpointTouches = [
    pointOnSegment(left.start, right.start, right.end),
    pointOnSegment(left.end, right.start, right.end),
    pointOnSegment(right.start, left.start, left.end),
    pointOnSegment(right.end, left.start, left.end),
  ]

  if (!endpointTouches.some(Boolean)) {
    return false
  }

  return !sharedEndpoint || !options.allowSharedEndpoint
}

function hasProperIntersection(a: Point, b: Point, c: Point, d: Point) {
  const o1 = orientation(a, b, c)
  const o2 = orientation(a, b, d)
  const o3 = orientation(c, d, a)
  const o4 = orientation(c, d, b)

  return o1 * o2 < -INTERSECTION_EPSILON && o3 * o4 < -INTERSECTION_EPSILON
}

function segmentsCollinear(a: Point, b: Point, c: Point, d: Point) {
  return (
    Math.abs(orientation(a, b, c)) <= INTERSECTION_EPSILON &&
    Math.abs(orientation(a, b, d)) <= INTERSECTION_EPSILON
  )
}

function findSharedEndpoint(left: Point, right: Point) {
  return pointsEqual(left, right) ? left : null
}

function pointsEqual(left: Point, right: Point) {
  return pointDistance(left, right) <= CLOSE_EPSILON * 0.02
}

function pointOnSegment(point: Point, start: Point, end: Point) {
  return (
    Math.abs(orientation(start, end, point)) <= INTERSECTION_EPSILON &&
    point.x >= Math.min(start.x, end.x) - INTERSECTION_EPSILON &&
    point.x <= Math.max(start.x, end.x) + INTERSECTION_EPSILON &&
    point.y >= Math.min(start.y, end.y) - INTERSECTION_EPSILON &&
    point.y <= Math.max(start.y, end.y) + INTERSECTION_EPSILON
  )
}

function orientation(a: Point, b: Point, c: Point) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}
