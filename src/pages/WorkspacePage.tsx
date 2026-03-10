import { Link } from 'react-router-dom'
import { FloorplanCanvas } from '../components/FloorplanCanvas'
import { useEditor } from '../context/EditorContext'
import { formatFeet } from '../lib/geometry'
import type { CanvasTarget, Room, RoomGeometry, RoomSuggestion } from '../types'

const MODE_LABELS = {
  rooms: 'Rooms',
  furniture: 'Furniture',
  stacked: 'Stacked',
} as const

export function WorkspaceHeaderControls() {
  const { draft, actions } = useEditor()

  return (
    <>
      <div className="mode-switch compact">
        {Object.entries(MODE_LABELS).map(([mode, label]) => (
          <button
            key={mode}
            className={draft.editorMode === mode ? 'mode-pill active' : 'mode-pill'}
            onClick={() => actions.setEditorMode(mode as keyof typeof MODE_LABELS)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="workspace-toolbar-group">
        <button className="ghost-button small" onClick={() => actions.addStructure()} type="button">
          Add structure
        </button>
        <button className="ghost-button small" onClick={() => actions.addFloor()} type="button">
          Add floor
        </button>
        <button className="ghost-button small" onClick={() => actions.addRoom()} type="button">
          Add room
        </button>
        <button className="ghost-button small" onClick={() => actions.addFurniture()} type="button">
          Add furniture
        </button>
      </div>
    </>
  )
}

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
  const surveySummary =
    selectedRoom && selectedRoomGeometry
      ? buildSurveySummary(selectedRoom, selectedRoomGeometry, primaryCanvasSuggestion)
      : null

  return (
    <section className="workspace-page">
      <div className="workspace-grid">
        <div className="workspace-canvas">
          <FloorplanCanvas />
        </div>

        <aside className="workspace-rail">
          <section className="panel-card rail-card room-survey-card">
            <div className="section-heading compact">
              <div>
                <p className="panel-kicker">Active room</p>
                <h2>{selectedRoom?.name ?? 'No room selected'}</h2>
              </div>
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

            {selectedRoom && selectedRoomGeometry && surveySummary ? (
              <>
                <div className={`survey-status ${surveySummary.closed ? 'closed' : 'open'}`}>
                  <strong>{surveySummary.statusTitle}</strong>
                  <span>{surveySummary.statusDetail}</span>
                </div>

                {boxSelectionSummary ? (
                  <div className="selection-note" data-testid="box-selection-summary">
                    <strong>Multi-select:</strong> {boxSelectionSummary}
                  </div>
                ) : null}

                <div className="survey-summary-grid">
                  {surveySummary.cards.map((card) => (
                    <SurveySummaryCard detail={card.detail} key={card.label} label={card.label} value={card.value} />
                  ))}
                </div>

                <div className="selection-note survey-canvas-note">
                  <strong>Edit on the drawing:</strong> click a wall distance to type a new measurement, click a corner angle to
                  change the angle between walls, and use the wall three-dot menu for full wall settings.
                </div>

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
              {activeStructure ? (
                <button
                  className="ghost-button small"
                  onClick={() => actions.openRenameDialog('structure', { structureId: activeStructure.id })}
                  type="button"
                >
                  Rename
                </button>
              ) : null}
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

function buildSurveySummary(
  room: Room,
  geometry: RoomGeometry,
  primarySuggestion: RoomSuggestion | null,
) {
  const tracedRun = room.segments.reduce((sum, segment) => sum + segment.length, 0)
  const closureRun = getSuggestionLength(primarySuggestion)
  const hasClosurePreview = Number.isFinite(closureRun) && closureRun > 0
  const projectedPerimeter = geometry.closed ? tracedRun : tracedRun + (hasClosurePreview ? closureRun : 0)

  if (geometry.closed) {
    return {
      closed: true,
      statusTitle: 'Closed room outline',
      statusDetail: 'The outline is complete. Edit any wall or corner directly on the canvas to refine the finished plan.',
      cards: [
        {
          label: 'Traced perimeter',
          value: formatFeet(tracedRun),
          detail: `${room.segments.length} wall${room.segments.length === 1 ? '' : 's'} in the finished outline`,
        },
        {
          label: 'Enclosed area',
          value: geometry.measuredArea ? `${geometry.measuredArea.toFixed(1)} sq ft` : 'Pending',
          detail: geometry.measuredArea ? 'Calculated from the closed shape on the canvas.' : 'Close the shape to compute area.',
        },
        {
          label: 'Next step',
          value: 'Tweak onscreen',
          detail: 'Click any wall distance or corner angle to adjust the finished drawing directly.',
        },
      ],
    }
  }

  return {
    closed: false,
    statusTitle: hasClosurePreview ? 'Ready for a geometry-based closure' : 'Outline still open',
    statusDetail: hasClosurePreview
      ? `${primarySuggestion?.title ?? 'A closure'} is previewed on the canvas as dashed walls until you accept it.`
      : 'Keep tracing from any open-joint anchor, or click an existing wall to refine the dimensions you already have.',
    cards: [
      {
        label: 'Traced perimeter',
        value: formatFeet(tracedRun),
        detail: `${room.segments.length} wall${room.segments.length === 1 ? '' : 's'} traced so far`,
      },
      {
        label: hasClosurePreview ? 'Quickest closure' : 'Projected perimeter',
        value: hasClosurePreview ? `~${formatFeet(closureRun)}` : formatFeet(projectedPerimeter),
        detail: hasClosurePreview
          ? primarySuggestion?.detail ?? 'Geometry can close the outline from your current measurements.'
          : 'Continue tracing until the room closes, or accept a previewed closure when it matches the space.',
      },
      {
        label: 'Next step',
        value: hasClosurePreview ? 'Review preview' : 'Add wall',
        detail: hasClosurePreview
          ? 'Accept the dashed preview if it matches the room, or keep measuring.'
          : 'Use an open-joint anchor to keep tracing the room',
      },
    ],
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

function SurveySummaryCard({
  detail,
  label,
  value,
}: {
  detail: string
  label: string
  value: string
}) {
  return (
    <article className="survey-summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  )
}
