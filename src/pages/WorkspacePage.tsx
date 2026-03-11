import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FloorplanCanvas } from '../components/FloorplanCanvas'
import { useEditor } from '../context/EditorContext'
import { MODE_LABELS } from '../lib/editorModes'
import { formatFeet, roomToGeometry } from '../lib/geometry'
import type { CanvasTarget, Room, RoomGeometry, RoomSuggestion } from '../types'

export function WorkspaceHeaderControls() {
  const { activeStructure, actions } = useEditor()

  return (
    <>
      <div
        className="workspace-structure-title"
        data-testid="structure-header"
        onContextMenu={(event) => {
          if (!activeStructure) {
            return
          }

          event.preventDefault()
          actions.openContextMenu({
            x: event.clientX,
            y: event.clientY,
            target: {
              kind: 'structure',
              structureId: activeStructure.id,
            },
          })
        }}
      >
        <div className="workspace-structure-title__row">
          <strong>{activeStructure?.name ?? 'No structure'}</strong>
          {activeStructure ? (
            <button
              aria-label="Rename structure"
              className="workspace-structure-title__edit"
              onClick={() => actions.openRenameDialog('structure', { structureId: activeStructure.id })}
              type="button"
            >
              <PencilIcon />
            </button>
          ) : null}
        </div>
      </div>
    </>
  )
}

const DISMISSED_DRAWING_TIP_KEY = 'incremental-blueprint/dismissed-workspace-drawing-tip'

export function WorkspacePage() {
  const {
    activeFloor,
    activeStructure,
    draft,
    roomSuggestions,
    selectedFurniture,
    selectedRoom,
    selectedRoomGeometry,
    structureRoomCount,
    ui,
    actions,
  } = useEditor()
  const canvasSuggestions = [...roomSuggestions.filter((suggestion) => Boolean(suggestion.segmentsToAdd?.length))].sort(
    (left, right) => getSuggestionLength(left) - getSuggestionLength(right),
  )
  const railSuggestions = roomSuggestions.filter((suggestion) => !suggestion.segmentsToAdd?.length)
  const primaryCanvasSuggestion = canvasSuggestions[0] ?? null
  const showCanvasSuggestionNote = draft.showInferred && canvasSuggestions.length > 0
  const showInferenceToggleNote = !draft.showInferred && canvasSuggestions.length > 0
  const boxSelectionSummary = summarizeBoxSelection(ui.selectionTargets)
  const [showDrawingTip, setShowDrawingTip] = useState(() => !isDrawingTipDismissed())
  const roomOverview =
    selectedRoom && selectedRoomGeometry && activeFloor
      ? buildRoomOverview(selectedRoom, activeFloor.name, activeFloor.elevation, selectedRoomGeometry, primaryCanvasSuggestion)
      : null

  return (
    <section className="workspace-page">
      <div className="workspace-grid">
        <div className="workspace-canvas">
          <FloorplanCanvas />
        </div>

        <aside className="workspace-rail">
          <section className="panel-card rail-card room-survey-card">
            <div className="section-heading compact room-survey-heading">
              <h2>{selectedRoom?.name ?? 'No room selected'}</h2>
              {selectedRoom && activeStructure && activeFloor ? (
                <button
                  className="ghost-button small"
                  onClick={() =>
                    actions.openRenameDialog('room', {
                      structureId: activeStructure.id,
                      floorId: activeFloor.id,
                      roomId: selectedRoom.id,
                    })
                  }
                  type="button"
                >
                  Rename
                </button>
              ) : null}
            </div>

            {selectedRoom && selectedRoomGeometry && roomOverview ? (
              <>
                <div className="room-property-grid">
                  {roomOverview.properties.map((property) => (
                    <RoomPropertyCard
                      detail={property.detail}
                      featured={property.featured}
                      key={property.label}
                      label={property.label}
                      swatch={property.swatch}
                      tone={property.tone}
                      value={property.value}
                    />
                  ))}
                </div>

                {boxSelectionSummary ? (
                  <div className="selection-note" data-testid="box-selection-summary">
                    <strong>Multi-select:</strong> {boxSelectionSummary}
                  </div>
                ) : null}

                {showDrawingTip ? (
                  <div className="selection-note survey-canvas-note" data-testid="drawing-tip">
                    <p className="survey-canvas-note__copy">
                      <strong>Edit on the drawing:</strong> click a wall distance to type a new measurement, click a corner angle
                      to change the angle between walls, and use the wall three-dot menu for full wall settings.
                    </p>
                    <button
                      aria-label="Dismiss drawing tip"
                      className="survey-canvas-note__dismiss"
                      onClick={() => dismissDrawingTip(setShowDrawingTip)}
                      type="button"
                    >
                      <span aria-hidden="true">&times;</span>
                    </button>
                  </div>
                ) : null}

                <div className="workspace-toolbar-group">
                  <button className="ghost-button small" onClick={() => actions.addWall()} type="button">
                    Add wall
                  </button>
                  <button className="ghost-button small" onClick={() => actions.addFurniture()} type="button">
                    Add furniture
                  </button>
                  <Link className="ghost-link" to="/detail">
                    Open detail page
                  </Link>
                </div>

                {selectedFurniture ? (
                  <div className="selection-note">
                    <strong>Furniture in focus:</strong> {selectedFurniture.name}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="empty-state">Choose a room or add one from the canvas to start tracing measurements.</p>
            )}
          </section>

          <section className="panel-card rail-card">
            <div className="section-heading compact">
              <div>
                <p className="panel-kicker">Project</p>
                <h2>{activeStructure?.name ?? 'No structure'}</h2>
              </div>
            </div>
            <div className="stats-grid two-up">
              <MetricCard label="Floors" value={`${activeStructure?.floors.length ?? 0}`} />
              <MetricCard label="Rooms" value={`${structureRoomCount}`} />
              <MetricCard label="View" value={MODE_LABELS[draft.editorMode]} />
              <MetricCard label="Autosave" value="Local JSON" subdued />
            </div>
            <div className="chip-list">
              {activeStructure?.floors.map((floor) => (
                <button
                  key={floor.id}
                  className={draft.activeFloorId === floor.id ? 'floor-chip active' : 'floor-chip'}
                  onClick={() => actions.selectFloor(activeStructure.id, floor.id)}
                  type="button"
                >
                  <strong>{floor.name}</strong>
                  <span>{floor.rooms.length} rooms</span>
                </button>
              ))}
            </div>
          </section>

          <section className="panel-card rail-card">
            <div className="section-heading compact">
              <div>
                <p className="panel-kicker">Room completion</p>
                <h2>Suggested closure</h2>
              </div>
            </div>
            {roomSuggestions.length === 0 ? (
              <p className="empty-state">Measure at least two walls to unlock geometry-based closure suggestions.</p>
            ) : (
              <>
                {primaryCanvasSuggestion ? (
                  <div className="survey-status suggestion">
                    <strong>{primaryCanvasSuggestion.title}</strong>
                    <span>{primaryCanvasSuggestion.detail}</span>
                  </div>
                ) : null}

                {showCanvasSuggestionNote ? (
                  <div className="selection-note">
                    <strong>On canvas:</strong> dashed preview walls show what can be inferred from the measurements you already took.
                  </div>
                ) : null}

                {showInferenceToggleNote ? (
                  <div className="selection-note">
                    <strong>Preview hidden:</strong> turn inference back on to show the dashed closure walls on the canvas.
                  </div>
                ) : null}

                {railSuggestions.length > 0 ? (
                  <div className="suggestion-list">
                    {railSuggestions.map((suggestion) => (
                      <article className="suggestion-card" key={suggestion.id}>
                        <div>
                          <p>{suggestion.title}</p>
                          <span>{suggestion.detail}</span>
                        </div>
                        <Link className="ghost-link" to="/detail">
                          Inspect
                        </Link>
                      </article>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </section>
        </aside>
      </div>
    </section>
  )
}

function getSuggestionLength(suggestion?: RoomSuggestion | null) {
  return suggestion?.segmentsToAdd?.reduce((sum, segment) => sum + segment.length, 0) ?? Number.POSITIVE_INFINITY
}

function PencilIcon() {
  return (
    <svg aria-hidden="true" className="pencil-icon" fill="none" viewBox="0 0 16 16">
      <path
        d="M10.85 2.65a1.75 1.75 0 0 1 2.5 0l.01.01a1.77 1.77 0 0 1 0 2.5l-7.3 7.29-2.92.63.64-2.92 7.07-7.51Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
      <path d="m10.25 3.25 2.5 2.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2" />
    </svg>
  )
}

function summarizeBoxSelection(targets: CanvasTarget[]) {
  if (targets.length <= 1) {
    return ''
  }

  const rooms = targets.filter((target) => target.kind === 'room').length
  const furniture = targets.filter((target) => target.kind === 'furniture').length
  const walls = targets.filter((target) => target.kind === 'wall').length
  const parts = [
    rooms > 0 ? `${rooms} room${rooms === 1 ? '' : 's'}` : '',
    furniture > 0 ? `${furniture} furniture item${furniture === 1 ? '' : 's'}` : '',
    walls > 0 ? `${walls} wall${walls === 1 ? '' : 's'}` : '',
  ].filter(Boolean)

  return parts.join(', ')
}

type RoomOverviewProperty = {
  label: string
  value: string
  detail: string
  featured?: boolean
  swatch?: string
  tone?: 'default' | 'accent' | 'pending' | 'success'
}

function buildRoomOverview(
  room: Room,
  floorName: string,
  floorElevation: number,
  geometry: RoomGeometry,
  primarySuggestion: RoomSuggestion | null,
) {
  const tracedRun = room.segments.reduce((sum, segment) => sum + segment.length, 0)
  const closureRun = getSuggestionLength(primarySuggestion)
  const hasClosurePreview = Number.isFinite(closureRun) && closureRun > 0
  const projectedPerimeter = geometry.closed ? tracedRun : hasClosurePreview ? tracedRun + closureRun : tracedRun
  const previewGeometry = getPreviewRoomGeometry(room, primarySuggestion)
  const previewArea = previewGeometry?.closed ? previewGeometry.measuredArea : null
  const footprintGeometry = previewGeometry?.closed ? previewGeometry : geometry

  let areaValue = 'Pending'
  let areaDetail = 'Close the outline to calculate area.'

  if (geometry.closed && geometry.measuredArea !== null) {
    areaValue = `${geometry.measuredArea.toFixed(1)} sq ft`
    areaDetail = 'Calculated from the finished room outline.'
  } else if (previewArea !== null) {
    areaValue = `~${previewArea.toFixed(1)} sq ft`
    areaDetail = 'Estimated from the previewed closure on the canvas.'
  } else if (room.segments.length >= 3 && geometry.inferredArea !== null) {
    areaValue = `~${geometry.inferredArea.toFixed(1)} sq ft`
    areaDetail = 'Loose estimate from the current open outline.'
  }

  const outlineValue = geometry.closed ? 'Closed' : hasClosurePreview ? 'Preview ready' : 'Open'
  const outlineDetail = geometry.closed
    ? 'The room is fully enclosed. Wall lengths and corner angles can be refined directly on the canvas.'
    : hasClosurePreview
      ? `${primarySuggestion?.title ?? 'A closure'} is shown as dashed walls until you accept it or keep tracing.`
      : 'Keep tracing from a wall-end anchor, or click a wall to refine a measured distance.'

  const perimeterDetail = geometry.closed
    ? 'Measured around the finished outline.'
    : hasClosurePreview
      ? `${formatFeet(tracedRun)} traced plus ${formatFeet(closureRun)} previewed to close the room.`
      : `${room.segments.length} wall${room.segments.length === 1 ? '' : 's'} traced so far.`

  const furnitureDetail =
    room.furniture.length === 0
      ? 'No furniture placed in this room yet.'
      : room.furniture.length === 1
        ? `${room.furniture[0].name} is currently placed here.`
        : `${room.furniture[0].name} plus ${room.furniture.length - 1} more items are placed here.`

  const properties: RoomOverviewProperty[] = [
    {
      label: 'Floor',
      value: floorName,
      detail: `Elevation ${formatFeetValue(floorElevation)}.`,
    },
    {
      label: 'Outline',
      value: outlineValue,
      detail: outlineDetail,
      tone: geometry.closed ? 'success' : hasClosurePreview ? 'accent' : 'pending',
    },
    {
      label: 'Color',
      value: room.color.toUpperCase(),
      detail: 'Used for the room fill and label on the canvas.',
      swatch: room.color,
    },
    {
      label: 'Perimeter',
      value: geometry.closed ? formatFeet(tracedRun) : hasClosurePreview ? `~${formatFeet(projectedPerimeter)}` : formatFeet(tracedRun),
      detail: perimeterDetail,
      featured: true,
    },
    {
      label: 'Walls',
      value: `${room.segments.length}`,
      detail:
        room.segments.length === 0
          ? 'Add the first wall to start tracing the outline.'
          : geometry.closed
            ? `${room.segments.length} measured runs form the closed loop.`
            : `${room.segments.length} measured run${room.segments.length === 1 ? '' : 's'} traced so far.`,
    },
    {
      label: 'Area',
      value: areaValue,
      detail: areaDetail,
      featured: true,
    },
    {
      label: 'Furniture',
      value: `${room.furniture.length}`,
      detail: furnitureDetail,
    },
    {
      label: 'Footprint',
      value: `${formatFeet(footprintGeometry.bounds.maxX - footprintGeometry.bounds.minX)} × ${formatFeet(footprintGeometry.bounds.maxY - footprintGeometry.bounds.minY)}`,
      detail: geometry.closed
        ? 'Overall room span from the finished plan.'
        : hasClosurePreview
          ? 'Estimated finished footprint with the previewed closure.'
          : 'Current traced footprint.',
    },
  ]

  return {
    properties,
  }
}

function MetricCard({
  label,
  value,
  subdued,
}: {
  label: string
  value: string
  subdued?: boolean
}) {
  return (
    <article className={subdued ? 'metric-card subdued' : 'metric-card'}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function RoomPropertyCard({
  detail,
  featured,
  label,
  swatch,
  tone = 'default',
  value,
}: {
  detail: string
  featured?: boolean
  label: string
  swatch?: string
  tone?: 'default' | 'accent' | 'pending' | 'success'
  value: string
}) {
  return (
    <article className={`room-property-card tone-${tone}${featured ? ' featured' : ''}`}>
      <span className="room-property-label">{label}</span>
      <strong className="room-property-value">
        {swatch ? <span aria-hidden="true" className="room-property-swatch" style={{ backgroundColor: swatch }} /> : null}
        {value}
      </strong>
      <p>{detail}</p>
    </article>
  )
}

function getPreviewRoomGeometry(room: Room, suggestion: RoomSuggestion | null) {
  if (!suggestion?.segmentsToAdd?.length) {
    return null
  }

  return roomToGeometry({
    ...room,
    segments: [
      ...room.segments,
      ...suggestion.segmentsToAdd.map((segment, index) => ({
        id: `${suggestion.id}-preview-${index}`,
        label: segment.label,
        length: segment.length,
        turn: segment.turn,
        notes: '',
      })),
    ],
  })
}

function formatFeetValue(value: number) {
  const rounded = Math.round(value * 10) / 10

  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)} ft`
}

function isDrawingTipDismissed() {
  try {
    return window.localStorage.getItem(DISMISSED_DRAWING_TIP_KEY) === '1'
  } catch {
    return false
  }
}

function dismissDrawingTip(setShowDrawingTip: (visible: boolean) => void) {
  setShowDrawingTip(false)

  try {
    window.localStorage.setItem(DISMISSED_DRAWING_TIP_KEY, '1')
  } catch {
    // Ignore storage failures and still hide the note for the current session.
  }
}
