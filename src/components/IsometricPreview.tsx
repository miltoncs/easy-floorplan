import { useMemo } from 'react'
import { useEditor } from '../context/EditorContext'
import { summarizeViewScope } from '../lib/viewScope'
import type { IsometricFurnitureBlock, IsometricSceneRoom, Point } from '../types'

const ISO_X_SCALE = Math.cos(Math.PI / 6)
const ISO_Y_SCALE = 0.5
const ISO_Z_SCALE = 1
const VIEWBOX_PADDING = 8

export function IsometricPreview() {
  const { isometricScene, resolvedViewScope, actions } = useEditor()
  const projectedScene = useMemo(() => projectScene(isometricScene), [isometricScene])
  const roomCount = isometricScene.rooms.length
  const floorCount = isometricScene.floors.length
  const openRoomCount = isometricScene.rooms.filter((room) => room.isOpen).length
  const summaryLabel = summarizeCounts(roomCount, floorCount)

  return (
    <section className="isometric-preview panel-card" aria-label="Isometric preview">
      <div className="isometric-preview__header">
        <div className="isometric-preview__title">
          <p className="panel-kicker">Preview</p>
          <h2>Isometric Preview</h2>
          <p className="isometric-preview__summary">{summaryLabel}</p>
        </div>

        <div className="isometric-preview__actions">
          <div className="isometric-preview__scope">
            <span className="panel-kicker">Scope</span>
            <strong>{summarizeViewScope(resolvedViewScope)}</strong>
          </div>
          <button className="ghost-button" onClick={() => actions.openPlanSurface()} type="button">
            Return to plan
          </button>
        </div>
      </div>

      <div className="isometric-preview__meta">
        <span className="preview-chip">{roomCount} room{roomCount === 1 ? '' : 's'}</span>
        <span className="preview-chip">{floorCount} floor{floorCount === 1 ? '' : 's'}</span>
        <span className="preview-chip">
          {openRoomCount === 0
            ? 'Closed outlines rendered as slabs'
            : `${openRoomCount} open outline${openRoomCount === 1 ? '' : 's'} rendered without slabs`}
        </span>
      </div>

      <div className="isometric-preview__viewport">
        {projectedScene ? (
          <svg
            aria-hidden="true"
            className="isometric-preview__svg"
            viewBox={projectedScene.viewBox}
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect
              className="isometric-preview__backdrop"
              height={projectedScene.backdrop.height}
              rx="12"
              width={projectedScene.backdrop.width}
              x={projectedScene.backdrop.x}
              y={projectedScene.backdrop.y}
            />

            {projectedScene.rooms.map((room) => (
              <g className="isometric-preview__room" key={room.roomId}>
                {room.slab ? (
                  <polygon
                    className="isometric-preview__slab"
                    fill={tintColor(room.color, 0.44)}
                    points={toPointsAttribute(room.slab)}
                    stroke={tintColor(room.color, -0.26)}
                  />
                ) : null}

                {room.walls.map((wall) => (
                  <polygon
                    className="isometric-preview__wall"
                    fill={tintColor(room.color, -0.08)}
                    key={wall.id}
                    points={toPointsAttribute(wall.points)}
                    stroke={tintColor(room.color, -0.34)}
                  />
                ))}

                {room.furniture.map((item) => (
                  <g className="isometric-preview__furniture" key={item.id}>
                    <polygon
                      fill="#d3be9d"
                      points={toPointsAttribute(item.topFace)}
                      stroke="#82684d"
                    />
                    <polygon
                      fill="#b59063"
                      points={toPointsAttribute(item.rightFace)}
                      stroke="#7f5d36"
                    />
                    <polygon
                      fill="#c6a47b"
                      points={toPointsAttribute(item.leftFace)}
                      stroke="#7f5d36"
                    />
                  </g>
                ))}
              </g>
            ))}
          </svg>
        ) : (
          <div className="empty-state isometric-preview__empty">
            Nothing in this scope yet. Add a room or switch scope to preview geometry.
          </div>
        )}
      </div>
    </section>
  )
}

type ProjectedPolygon = Point[]
type ProjectedRoom = {
  roomId: string
  color: string
  slab: ProjectedPolygon | null
  walls: Array<{
    id: string
    points: ProjectedPolygon
  }>
  furniture: Array<{
    id: string
    topFace: ProjectedPolygon
    leftFace: ProjectedPolygon
    rightFace: ProjectedPolygon
  }>
}

function projectScene(scene: ReturnType<typeof useEditor>['isometricScene']) {
  const projectedRooms = scene.rooms.map(projectRoom)
  const projectedPoints = projectedRooms.flatMap((room) => [
    ...(room.slab ?? []),
    ...room.walls.flatMap((wall) => wall.points),
    ...room.furniture.flatMap((item) => [...item.topFace, ...item.leftFace, ...item.rightFace]),
  ])

  if (projectedPoints.length === 0) {
    return null
  }

  const bounds = projectedPoints.reduce(
    (current, point) => ({
      minX: Math.min(current.minX, point.x),
      minY: Math.min(current.minY, point.y),
      maxX: Math.max(current.maxX, point.x),
      maxY: Math.max(current.maxY, point.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  )

  const width = bounds.maxX - bounds.minX + VIEWBOX_PADDING * 2
  const height = bounds.maxY - bounds.minY + VIEWBOX_PADDING * 2

  return {
    rooms: projectedRooms,
    viewBox: `${bounds.minX - VIEWBOX_PADDING} ${bounds.minY - VIEWBOX_PADDING} ${width} ${height}`,
    backdrop: {
      x: bounds.minX - VIEWBOX_PADDING * 0.25,
      y: bounds.minY - VIEWBOX_PADDING * 0.25,
      width: bounds.maxX - bounds.minX + VIEWBOX_PADDING * 0.5,
      height: bounds.maxY - bounds.minY + VIEWBOX_PADDING * 0.5,
    },
  }
}

function projectRoom(room: IsometricSceneRoom): ProjectedRoom {
  return {
    roomId: room.roomId,
    color: room.color,
    slab: room.slab ? room.slab.points.map((point) => projectPoint(point, room.slab!.elevation)) : null,
    walls: room.walls
      .map((wall) => ({
        id: wall.id,
        depth: wall.start.x + wall.start.y + wall.baseElevation,
        points: [
          projectPoint(wall.start, wall.baseElevation),
          projectPoint(wall.end, wall.baseElevation),
          projectPoint(wall.end, wall.topElevation),
          projectPoint(wall.start, wall.topElevation),
        ],
      }))
      .sort((left, right) => left.depth - right.depth)
      .map(({ depth: _depth, ...wall }) => wall),
    furniture: room.furniture
      .map((item) => projectFurniture(item))
      .sort((left, right) => getPolygonDepth(left.leftFace) - getPolygonDepth(right.leftFace)),
  }
}

function projectFurniture(item: IsometricFurnitureBlock) {
  const topFace = item.corners.map((corner) => projectPoint(corner, item.baseElevation + item.height))
  const baseFace = item.corners.map((corner) => projectPoint(corner, item.baseElevation))

  return {
    id: item.id,
    topFace,
    leftFace: [baseFace[0], baseFace[3], topFace[3], topFace[0]],
    rightFace: [baseFace[3], baseFace[2], topFace[2], topFace[3]],
  }
}

function projectPoint(point: Point, elevation: number): Point {
  return {
    x: roundTo((point.x - point.y) * ISO_X_SCALE, 4),
    y: roundTo((point.x + point.y) * ISO_Y_SCALE - elevation * ISO_Z_SCALE, 4),
  }
}

function toPointsAttribute(points: ProjectedPolygon) {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}

function getPolygonDepth(points: ProjectedPolygon) {
  return points.reduce((sum, point) => sum + point.x + point.y, 0) / Math.max(points.length, 1)
}

function summarizeCounts(roomCount: number, floorCount: number) {
  return `${roomCount} room${roomCount === 1 ? '' : 's'} across ${floorCount} floor${floorCount === 1 ? '' : 's'}`
}

function roundTo(value: number, digits: number) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function tintColor(hex: string, amount: number) {
  const normalized = hex.replace('#', '')

  if (!/^[\da-f]{6}$/i.test(normalized)) {
    return hex
  }

  const channels = normalized.match(/.{2}/g)?.map((channel) => Number.parseInt(channel, 16)) ?? [0, 0, 0]
  const adjusted = channels.map((channel) => {
    const target = amount >= 0 ? 255 : 0
    return Math.max(0, Math.min(255, Math.round(channel + (target - channel) * Math.abs(amount))))
  })

  return `#${adjusted.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}
