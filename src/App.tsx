import { startTransition, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import './App.css'
import { createSeedState } from './data/seed'
import {
  cloneImportedStructure,
  computeFloorBounds,
  computeVisibleBounds,
  createFloor,
  createFurniture,
  createRoom,
  createSegment,
  createStructure,
  ensureSelections,
  findActiveFloor,
  findActiveStructure,
  findSelectedRoom,
  getRoomCompletion,
  getRoomLabelPoint,
  getRoomSuggestions,
  getViewBox,
  loadDraftState,
  saveDraftState,
  touchStructure,
} from './lib/blueprint'
import {
  addPolar,
  clamp,
  formatDegrees,
  formatFeet,
  midpoint,
  normalizeAngle,
  pointsToPath,
  roomToGeometry,
} from './lib/geometry'
import type {
  DraftState,
  EditorMode,
  Floor,
  Furniture,
  Room,
  RoomSuggestion,
  Structure,
  SuggestionSegment,
} from './types'

const MODE_LABELS: Record<EditorMode, string> = {
  rooms: 'Room survey',
  furniture: 'Furniture',
  stacked: 'Floor stack',
}

function App() {
  const [draft, setDraft] = useState<DraftState>(() => loadDraftState() ?? createSeedState())
  const [zoom, setZoom] = useState(1)
  const [status, setStatus] = useState('Autosaving locally. Export a structure when you want a portable snapshot.')
  const importRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    saveDraftState(draft)
  }, [draft])

  const activeStructure = useMemo(() => findActiveStructure(draft), [draft])
  const activeFloor = useMemo(() => findActiveFloor(draft), [draft])
  const selectedRoom = useMemo(() => findSelectedRoom(draft), [draft])
  const selectedRoomGeometry = useMemo(
    () => (selectedRoom ? roomToGeometry(selectedRoom) : null),
    [selectedRoom],
  )
  const roomSuggestions = useMemo(
    () => (selectedRoom && activeFloor ? getRoomSuggestions(selectedRoom, activeFloor) : []),
    [activeFloor, selectedRoom],
  )
  const visibleFloors = useMemo(
    () =>
      !activeStructure
        ? []
        : draft.editorMode === 'stacked'
          ? [...activeStructure.floors].sort((left, right) =>
              left.id === draft.activeFloorId ? 1 : right.id === draft.activeFloorId ? -1 : 0,
            )
          : activeFloor
            ? [activeFloor]
            : [],
    [activeFloor, activeStructure, draft.activeFloorId, draft.editorMode],
  )
  const viewBounds = useMemo(() => computeVisibleBounds(visibleFloors), [visibleFloors])
  const viewBox = useMemo(() => getViewBox(viewBounds, zoom), [viewBounds, zoom])

  const structureRoomCount =
    activeStructure?.floors.reduce((sum, floor) => sum + floor.rooms.length, 0) ?? 0
  const selectedSuggestionWithSegments = roomSuggestions.find((suggestion) => suggestion.segmentsToAdd)

  const mutateDraft = (recipe: (next: DraftState) => void) => {
    startTransition(() => {
      setDraft((current) => {
        const next = structuredClone(current)
        recipe(next)
        const prepared = ensureSelections(next)
        const structure = findActiveStructure(prepared)
        if (structure) {
          touchStructure(structure)
        }
        return prepared
      })
    })
  }

  const updateSelectedRoom = (recipe: (room: Room) => void) => {
    mutateDraft((next) => {
      const room = findSelectedRoom(next)
      if (room) {
        recipe(room)
      }
    })
  }

  const updateSelectedFurniture = (recipe: (furniture: Furniture) => void) => {
    updateSelectedRoom((room) => {
      const selectedFurniture =
        room.furniture.find((item) => item.id === draft.selectedFurnitureId) ?? room.furniture[0]
      if (selectedFurniture) {
        recipe(selectedFurniture)
      }
    })
  }

  const selectStructure = (structureId: string) => {
    mutateDraft((next) => {
      const structure = next.structures.find((item) => item.id === structureId)
      if (!structure) {
        return
      }
      next.activeStructureId = structure.id
      next.activeFloorId = structure.floors[0]?.id ?? ''
      next.selectedRoomId = structure.floors[0]?.rooms[0]?.id ?? null
      next.selectedFurnitureId = null
    })
  }

  const selectFloor = (floorId: string) => {
    mutateDraft((next) => {
      const structure = findActiveStructure(next)
      const floor = structure?.floors.find((item) => item.id === floorId)
      if (!floor) {
        return
      }
      next.activeFloorId = floor.id
      next.selectedRoomId = floor.rooms[0]?.id ?? null
      next.selectedFurnitureId = null
    })
  }

  const selectRoom = (roomId: string) => {
    mutateDraft((next) => {
      next.selectedRoomId = roomId
      next.selectedFurnitureId = null
    })
  }

  const addStructure = () => {
    mutateDraft((next) => {
      const room = createRoom({ name: `Room 1` })
      const floor = createFloor({ name: 'First floor', elevation: 0, rooms: [room] })
      const structure = createStructure({
        name: `Structure ${next.structures.length + 1}`,
        floors: [floor],
      })
      next.structures.push(structure)
      next.activeStructureId = structure.id
      next.activeFloorId = floor.id
      next.selectedRoomId = room.id
      next.selectedFurnitureId = null
    })
    setStatus('New structure added with a starter room so you can begin measuring immediately.')
  }

  const deleteStructure = (structureId: string) => {
    if (draft.structures.length <= 1) {
      setStatus('At least one structure stays in the workspace. Export it first if you want an external archive.')
      return
    }

    mutateDraft((next) => {
      next.structures = next.structures.filter((structure) => structure.id !== structureId)
    })
    setStatus('Structure removed from the workspace.')
  }

  const addFloor = () => {
    mutateDraft((next) => {
      const structure = findActiveStructure(next)
      if (!structure) {
        return
      }
      const room = createRoom({ name: 'Surveyed room' })
      const floor = createFloor({
        name: `Floor ${structure.floors.length + 1}`,
        elevation: structure.floors.length * 10,
        rooms: [room],
      })
      structure.floors.push(floor)
      next.activeFloorId = floor.id
      next.selectedRoomId = room.id
      next.selectedFurnitureId = null
    })
    setStatus('New floor added and aligned to the same structure origin.')
  }

  const deleteFloor = (floorId: string) => {
    if (!activeStructure || activeStructure.floors.length <= 1) {
      setStatus('A structure keeps at least one floor.')
      return
    }

    mutateDraft((next) => {
      const structure = findActiveStructure(next)
      if (!structure) {
        return
      }
      structure.floors = structure.floors.filter((floor) => floor.id !== floorId)
    })
    setStatus('Floor removed.')
  }

  const addRoom = () => {
    mutateDraft((next) => {
      const floor = findActiveFloor(next)
      if (!floor) {
        return
      }
      const bounds = computeFloorBounds(floor)
      const room = createRoom({
        name: `Room ${floor.rooms.length + 1}`,
        anchor: {
          x: Math.round(bounds.maxX + 3),
          y: Math.round((bounds.maxY + bounds.minY) / 2),
        },
      })
      floor.rooms.push(room)
      next.selectedRoomId = room.id
      next.selectedFurnitureId = null
    })
    setStatus('Room added. Adjust its anchor and wall chain as measurements come in.')
  }

  const deleteRoom = (roomId: string) => {
    mutateDraft((next) => {
      const floor = findActiveFloor(next)
      if (!floor) {
        return
      }
      floor.rooms = floor.rooms.filter((room) => room.id !== roomId)
    })
    setStatus('Room removed from the current floor.')
  }

  const applySuggestion = (suggestion: RoomSuggestion) => {
    if (!suggestion.segmentsToAdd) {
      return
    }

    updateSelectedRoom((room) => {
      suggestion.segmentsToAdd?.forEach((segment) => {
        room.segments.push(createSegment(segment))
      })
    })
    setStatus(`${suggestion.title} applied to ${selectedRoom?.name ?? 'the room'}.`)
  }

  const exportActiveStructure = () => {
    if (!activeStructure) {
      return
    }

    const blob = new Blob([JSON.stringify(activeStructure, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const slug = activeStructure.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')

    link.href = url
    link.download = `${slug || 'structure'}.blueprint.json`
    link.click()
    URL.revokeObjectURL(url)
    setStatus(`${activeStructure.name} exported as a portable structure file.`)
  }

  const restoreSample = () => {
    startTransition(() => {
      setDraft(createSeedState())
      setZoom(1)
    })
    setStatus('Sample workspace restored.')
  }

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const raw = JSON.parse(await file.text()) as DraftState | Structure

      if (looksLikeWorkspace(raw)) {
        startTransition(() => {
          setDraft(ensureSelections(raw))
          setZoom(1)
        })
        setStatus(`Workspace loaded from ${file.name}.`)
      } else if (looksLikeStructure(raw)) {
        const importedStructure = cloneImportedStructure(raw)
        mutateDraft((next) => {
          next.structures.push(importedStructure)
          next.activeStructureId = importedStructure.id
          next.activeFloorId = importedStructure.floors[0]?.id ?? ''
          next.selectedRoomId = importedStructure.floors[0]?.rooms[0]?.id ?? null
          next.selectedFurnitureId = null
        })
        setStatus(`Structure loaded from ${file.name}.`)
      } else {
        setStatus('File format not recognized. Load a structure export or a workspace snapshot.')
      }
    } catch {
      setStatus('Could not read that file. Expecting JSON exported by this app.')
    } finally {
      event.target.value = ''
    }
  }

  const setEditorMode = (mode: EditorMode) => {
    mutateDraft((next) => {
      next.editorMode = mode
    })
  }

  const fitView = () => setZoom(1)

  return (
    <div className="app-shell">
      <input
        ref={importRef}
        className="hidden-input"
        type="file"
        accept="application/json,.json,.blueprint.json"
        onChange={handleImport}
      />

      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Incremental Blueprint</p>
          <h1>Measure one wall at a time and let the floorplan catch up.</h1>
          <p className="hero-text">
            Build floorplans from partial observations, expand structures room-by-room, and keep
            refining the same saved model as measurements improve.
          </p>
        </div>

        <div className="hero-tools">
          <div className="mode-switch">
            {Object.entries(MODE_LABELS).map(([mode, label]) => (
              <button
                key={mode}
                className={draft.editorMode === mode ? 'mode-pill active' : 'mode-pill'}
                onClick={() => setEditorMode(mode as EditorMode)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          <div className="hero-actions">
            <button className="primary-button" onClick={exportActiveStructure} type="button">
              Export structure
            </button>
            <button className="ghost-button" onClick={() => importRef.current?.click()} type="button">
              Load file
            </button>
            <button className="ghost-button" onClick={restoreSample} type="button">
              Restore sample
            </button>
          </div>

          <div className="status-strip">
            <span className="status-led" />
            <span>{status}</span>
          </div>
        </div>
      </header>

      <main className="workspace">
        <aside className="panel left-panel">
          <section className="panel-section">
            <div className="section-heading">
              <div>
                <p className="section-kicker">Structures</p>
                <h2>Workspace</h2>
              </div>
              <button className="ghost-button small" onClick={addStructure} type="button">
                Add structure
              </button>
            </div>

            <div className="structure-list">
              {draft.structures.map((structure) => {
                const roomCount = structure.floors.reduce((sum, floor) => sum + floor.rooms.length, 0)

                return (
                  <div
                    key={structure.id}
                    className={draft.activeStructureId === structure.id ? 'structure-card active' : 'structure-card'}
                  >
                    <button className="card-select" onClick={() => selectStructure(structure.id)} type="button">
                      <div>
                        <p>{structure.name}</p>
                        <span>
                          {structure.floors.length} floor{structure.floors.length === 1 ? '' : 's'} · {roomCount}{' '}
                          room{roomCount === 1 ? '' : 's'}
                        </span>
                      </div>
                    </button>
                    {draft.structures.length > 1 ? (
                      <button className="card-action" onClick={() => deleteStructure(structure.id)} type="button">
                        Remove
                      </button>
                    ) : (
                      <span className="card-tag">Pinned</span>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          {activeStructure ? (
            <>
              <section className="panel-section summary-card">
                <p className="section-kicker">Current structure</p>
                <input
                  className="text-input title-input"
                  type="text"
                  value={activeStructure.name}
                  onChange={(event) =>
                    mutateDraft((next) => {
                      const structure = findActiveStructure(next)
                      if (structure) {
                        structure.name = event.target.value
                      }
                    })
                  }
                />
                <textarea
                  className="text-area"
                  rows={3}
                  value={activeStructure.notes}
                  onChange={(event) =>
                    mutateDraft((next) => {
                      const structure = findActiveStructure(next)
                      if (structure) {
                        structure.notes = event.target.value
                      }
                    })
                  }
                />

                <div className="stats-grid">
                  <MetricCard label="Floors" value={`${activeStructure.floors.length}`} />
                  <MetricCard label="Rooms" value={`${structureRoomCount}`} />
                  <MetricCard label="Mode" value={MODE_LABELS[draft.editorMode]} />
                </div>
              </section>

              <section className="panel-section">
                <div className="section-heading">
                  <div>
                    <p className="section-kicker">Floors</p>
                    <h2>Aligned stack</h2>
                  </div>
                  <button className="ghost-button small" onClick={addFloor} type="button">
                    Add floor
                  </button>
                </div>

                <div className="floor-list">
                  {activeStructure.floors.map((floor) => (
                    <div
                      key={floor.id}
                      className={draft.activeFloorId === floor.id ? 'floor-chip active' : 'floor-chip'}
                    >
                      <button className="card-select" onClick={() => selectFloor(floor.id)} type="button">
                        <div>
                          <p>{floor.name}</p>
                          <span>{floor.rooms.length} rooms</span>
                        </div>
                      </button>
                      {activeStructure.floors.length > 1 ? (
                        <button className="card-action" onClick={() => deleteFloor(floor.id)} type="button">
                          Remove
                        </button>
                      ) : (
                        <span className="card-tag">Base</span>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {activeFloor ? (
                <section className="panel-section">
                  <div className="section-heading">
                    <div>
                      <p className="section-kicker">Rooms on {activeFloor.name}</p>
                      <h2>Surveyed spaces</h2>
                    </div>
                    <button className="ghost-button small" onClick={addRoom} type="button">
                      Add room
                    </button>
                  </div>

                  <div className="room-list">
                    {activeFloor.rooms.map((room) => {
                      const completion = getRoomCompletion(room)
                      const geometry = roomToGeometry(room)
                      return (
                        <button
                          key={room.id}
                          className={draft.selectedRoomId === room.id ? 'room-card active' : 'room-card'}
                          onClick={() => selectRoom(room.id)}
                          type="button"
                        >
                          <div className="room-card-head">
                            <div className="room-color" style={{ backgroundColor: room.color }} />
                            <div>
                              <p>{room.name}</p>
                              <span>
                                {room.segments.length} measurements ·{' '}
                                {geometry.measuredArea
                                  ? `${geometry.measuredArea.toFixed(0)} sq ft`
                                  : 'open outline'}
                              </span>
                            </div>
                          </div>
                          <div className="progress-track">
                            <span className="progress-fill" style={{ width: `${completion * 100}%` }} />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ) : null}
            </>
          ) : null}
        </aside>

        <section className="panel canvas-panel">
          <div className="canvas-toolbar">
            <div className="toolbar-group">
              <button className="ghost-button small" onClick={() => setZoom((value) => clamp(value / 1.2, 0.5, 3))} type="button">
                -
              </button>
              <span className="toolbar-pill">{Math.round(zoom * 100)}%</span>
              <button className="ghost-button small" onClick={() => setZoom((value) => clamp(value * 1.2, 0.5, 3))} type="button">
                +
              </button>
              <button className="ghost-button small" onClick={fitView} type="button">
                Fit
              </button>
            </div>

            <div className="toolbar-group">
              <label className="toggle">
                <input
                  checked={draft.showGrid}
                  type="checkbox"
                  onChange={(event) =>
                    mutateDraft((next) => {
                      next.showGrid = event.target.checked
                    })
                  }
                />
                <span>Grid</span>
              </label>
              <label className="toggle">
                <input
                  checked={draft.showInferred}
                  type="checkbox"
                  onChange={(event) =>
                    mutateDraft((next) => {
                      next.showInferred = event.target.checked
                    })
                  }
                />
                <span>Inference</span>
              </label>
            </div>
          </div>

          <div className="canvas-frame">
            <svg
              aria-label="Drafting canvas"
              className="blueprint-canvas"
              viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
            >
              <defs>
                <pattern id="minor-grid" width="1" height="1" patternUnits="userSpaceOnUse">
                  <path d="M 1 0 L 0 0 0 1" className="grid-minor" fill="none" />
                </pattern>
                <pattern id="major-grid" width="4" height="4" patternUnits="userSpaceOnUse">
                  <rect width="4" height="4" fill="url(#minor-grid)" />
                  <path d="M 4 0 L 0 0 0 4" className="grid-major" fill="none" />
                </pattern>
              </defs>

              <rect
                className="canvas-underlay"
                x={viewBox.x}
                y={viewBox.y}
                width={viewBox.width}
                height={viewBox.height}
              />
              {draft.showGrid ? (
                <rect
                  className="canvas-grid"
                  x={viewBox.x}
                  y={viewBox.y}
                  width={viewBox.width}
                  height={viewBox.height}
                  fill="url(#major-grid)"
                />
              ) : null}

              <g className="origin-crosshair">
                <line x1={-1} x2={1} y1={0} y2={0} />
                <line x1={0} x2={0} y1={-1} y2={1} />
              </g>

              {visibleFloors.map((floor) => (
                <FloorOverlay
                  key={floor.id}
                  activeFloorId={draft.activeFloorId}
                  activeMode={draft.editorMode}
                  floor={floor}
                  selectedRoomId={draft.selectedRoomId}
                  showFurniture={draft.editorMode === 'furniture'}
                  onRoomSelect={selectRoom}
                />
              ))}

              {draft.showInferred && selectedRoom && selectedSuggestionWithSegments ? (
                <SuggestedPath room={selectedRoom} segments={selectedSuggestionWithSegments.segmentsToAdd ?? []} />
              ) : null}

              {selectedRoom && selectedRoomGeometry ? (
                <>
                  <circle
                    className="anchor-node"
                    cx={selectedRoom.anchor.x}
                    cy={-selectedRoom.anchor.y}
                    r={0.28}
                  />
                  {!selectedRoomGeometry.closed ? (
                    <circle
                      className="open-node"
                      cx={selectedRoomGeometry.endPoint.x}
                      cy={-selectedRoomGeometry.endPoint.y}
                      r={0.22}
                    />
                  ) : null}

                  {selectedRoomGeometry.segments.map((segment) => {
                    const labelPoint = midpoint(segment.start, segment.end)
                    return (
                      <g
                        key={segment.id}
                        className="dimension-chip"
                        transform={`translate(${labelPoint.x} ${-labelPoint.y})`}
                      >
                        <rect x={-1.65} y={-0.48} width={3.3} height={0.96} rx={0.24} />
                        <text textAnchor="middle" y={0.05}>
                          {formatFeet(segment.length)}
                        </text>
                      </g>
                    )
                  })}
                </>
              ) : null}
            </svg>
          </div>

          <div className="canvas-notes">
            <MetricCard
              label="Visible floors"
              value={`${visibleFloors.length}`}
              detail={
                draft.editorMode === 'stacked'
                  ? 'Floors share the same origin so exterior walls line up in the overlay.'
                  : 'Focus mode keeps the current floor isolated.'
              }
            />
            <MetricCard
              label="Selected room"
              value={selectedRoom?.name ?? 'None'}
              detail={
                selectedRoomGeometry?.closed
                  ? 'Closed polygon measured.'
                  : 'Open chain, inference available from the current endpoint.'
              }
            />
            <MetricCard
              label="Inference"
              value={`${roomSuggestions.length}`}
              detail="Closure paths and likely wall cavities are recalculated from the current geometry."
            />
          </div>
        </section>

        <aside className="panel right-panel">
          {selectedRoom && activeFloor && selectedRoomGeometry ? (
            <>
              <section className="panel-section">
                <div className="section-heading">
                  <div>
                    <p className="section-kicker">Inspector</p>
                    <h2>{selectedRoom.name}</h2>
                  </div>
                  <button className="ghost-button small danger" onClick={() => deleteRoom(selectedRoom.id)} type="button">
                    Remove room
                  </button>
                </div>

                <div className="field-grid">
                  <label>
                    <span>Name</span>
                    <input
                      className="text-input"
                      type="text"
                      value={selectedRoom.name}
                      onChange={(event) => updateSelectedRoom((room) => void (room.name = event.target.value))}
                    />
                  </label>
                  <label>
                    <span>Color</span>
                    <input
                      className="color-input"
                      type="color"
                      value={selectedRoom.color}
                      onChange={(event) => updateSelectedRoom((room) => void (room.color = event.target.value))}
                    />
                  </label>
                  <NumericField
                    label="Anchor X"
                    step="0.1"
                    value={selectedRoom.anchor.x}
                    onChange={(value) => updateSelectedRoom((room) => void (room.anchor.x = value))}
                  />
                  <NumericField
                    label="Anchor Y"
                    step="0.1"
                    value={selectedRoom.anchor.y}
                    onChange={(value) => updateSelectedRoom((room) => void (room.anchor.y = value))}
                  />
                  <NumericField
                    label="Start heading"
                    step="1"
                    value={selectedRoom.startHeading}
                    onChange={(value) => updateSelectedRoom((room) => void (room.startHeading = value))}
                  />
                  <label className="text-span">
                    <span>Notes</span>
                    <textarea
                      className="text-area"
                      rows={2}
                      value={selectedRoom.notes}
                      onChange={(event) => updateSelectedRoom((room) => void (room.notes = event.target.value))}
                    />
                  </label>
                </div>

                <div className="stats-grid">
                  <MetricCard
                    label="Measurements"
                    value={`${selectedRoom.segments.length}`}
                    detail="Distance + turn per wall segment."
                  />
                  <MetricCard
                    label="Area"
                    value={
                      selectedRoomGeometry.measuredArea
                        ? `${selectedRoomGeometry.measuredArea.toFixed(1)} sq ft`
                        : selectedRoomGeometry.inferredArea
                          ? `${selectedRoomGeometry.inferredArea.toFixed(1)} sq ft*`
                          : 'Pending'
                    }
                    detail={selectedRoomGeometry.closed ? 'Closed from measured corners.' : 'Estimated using inferred closure.'}
                  />
                  <MetricCard
                    label="Exit heading"
                    value={formatDegrees(normalizeAngle(selectedRoomGeometry.exitHeading))}
                    detail="Useful when a room is still open."
                  />
                </div>
              </section>

              <section className="panel-section">
                <div className="section-heading">
                  <div>
                    <p className="section-kicker">Measurements</p>
                    <h2>Wall chain</h2>
                  </div>
                  <div className="section-actions">
                    <button
                      className="ghost-button small"
                      onClick={() =>
                        updateSelectedRoom((room) => {
                          room.segments.push(
                            createSegment({
                              label: `${room.name} wall ${room.segments.length + 1}`,
                            }),
                          )
                        })
                      }
                      type="button"
                    >
                      Add wall
                    </button>
                    <button
                      className="ghost-button small danger"
                      onClick={() => updateSelectedRoom((room) => void (room.segments = []))}
                      type="button"
                    >
                      Clear all
                    </button>
                  </div>
                </div>

                <div className="measurement-table">
                  <div className="measurement-head">
                    <span>Wall</span>
                    <span>Length</span>
                    <span>Turn</span>
                    <span />
                  </div>
                  {selectedRoom.segments.length === 0 ? (
                    <p className="empty-state">
                      No walls yet. Add the first measured edge and the canvas will start to reveal the room.
                    </p>
                  ) : (
                    selectedRoom.segments.map((segment) => (
                      <div className="measurement-row" key={segment.id}>
                        <input
                          className="text-input"
                          type="text"
                          value={segment.label}
                          onChange={(event) =>
                            updateSelectedRoom((room) => {
                              const editable = room.segments.find((item) => item.id === segment.id)
                              if (editable) {
                                editable.label = event.target.value
                              }
                            })
                          }
                        />
                        <input
                          className="number-input"
                          type="number"
                          step="0.1"
                          value={segment.length}
                          onChange={(event) =>
                            updateSelectedRoom((room) => {
                              const editable = room.segments.find((item) => item.id === segment.id)
                              if (editable) {
                                editable.length = readNumber(event.target.value, editable.length)
                              }
                            })
                          }
                        />
                        <input
                          className="number-input"
                          type="number"
                          step="1"
                          value={segment.turn}
                          onChange={(event) =>
                            updateSelectedRoom((room) => {
                              const editable = room.segments.find((item) => item.id === segment.id)
                              if (editable) {
                                editable.turn = readNumber(event.target.value, editable.turn)
                              }
                            })
                          }
                        />
                        <button
                          className="ghost-button small danger"
                          onClick={() =>
                            updateSelectedRoom((room) => {
                              room.segments = room.segments.filter((item) => item.id !== segment.id)
                            })
                          }
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="panel-section">
                <div className="section-heading">
                  <div>
                    <p className="section-kicker">Inference</p>
                    <h2>Suggested next moves</h2>
                  </div>
                </div>

                <div className="suggestion-list">
                  {roomSuggestions.length === 0 ? (
                    <p className="empty-state">
                      No inference yet. Once the room has at least two measured walls, closure suggestions appear here.
                    </p>
                  ) : (
                    roomSuggestions.map((suggestion) => (
                      <article className="suggestion-card" key={suggestion.id}>
                        <div>
                          <p>{suggestion.title}</p>
                          <span>{suggestion.detail}</span>
                        </div>
                        {suggestion.segmentsToAdd ? (
                          <button className="ghost-button small" onClick={() => applySuggestion(suggestion)} type="button">
                            Apply
                          </button>
                        ) : suggestion.relatedRoomId ? (
                          <button className="ghost-button small" onClick={() => selectRoom(suggestion.relatedRoomId ?? '')} type="button">
                            Inspect related room
                          </button>
                        ) : null}
                      </article>
                    ))
                  )}
                </div>
              </section>

              <section className="panel-section">
                <div className="section-heading">
                  <div>
                    <p className="section-kicker">Furniture mode</p>
                    <h2>Interior outlines</h2>
                  </div>
                  <div className="section-actions">
                    <button
                      className="ghost-button small"
                      onClick={() => {
                        setEditorMode('furniture')
                        updateSelectedRoom((room) => {
                          const furniture = createFurniture({
                            name: `Item ${room.furniture.length + 1}`,
                            x: room.anchor.x + 2,
                            y: room.anchor.y - 2,
                          })
                          room.furniture.push(furniture)
                        })
                      }}
                      type="button"
                    >
                      Add furniture
                    </button>
                    <button className="ghost-button small" onClick={() => setEditorMode('furniture')} type="button">
                      Switch mode
                    </button>
                  </div>
                </div>

                <div className="measurement-table">
                  <div className="measurement-head furniture-head">
                    <span>Item</span>
                    <span>W</span>
                    <span>D</span>
                    <span />
                  </div>
                  {selectedRoom.furniture.length === 0 ? (
                    <p className="empty-state">
                      Furniture is optional. Use it for layout planning after the room perimeter is reliable.
                    </p>
                  ) : (
                    selectedRoom.furniture.map((item) => (
                      <div
                        className={
                          draft.selectedFurnitureId === item.id ? 'measurement-row furniture-row active' : 'measurement-row furniture-row'
                        }
                        key={item.id}
                      >
                        <input
                          className="text-input"
                          type="text"
                          value={item.name}
                          onFocus={() =>
                            mutateDraft((next) => {
                              next.selectedFurnitureId = item.id
                            })
                          }
                          onChange={(event) =>
                            updateSelectedRoom((room) => {
                              const editable = room.furniture.find((furniture) => furniture.id === item.id)
                              if (editable) {
                                editable.name = event.target.value
                              }
                            })
                          }
                        />
                        <input
                          className="number-input"
                          type="number"
                          step="0.1"
                          value={item.width}
                          onFocus={() =>
                            mutateDraft((next) => {
                              next.selectedFurnitureId = item.id
                            })
                          }
                          onChange={(event) =>
                            updateSelectedRoom((room) => {
                              const editable = room.furniture.find((furniture) => furniture.id === item.id)
                              if (editable) {
                                editable.width = readNumber(event.target.value, editable.width)
                              }
                            })
                          }
                        />
                        <input
                          className="number-input"
                          type="number"
                          step="0.1"
                          value={item.depth}
                          onFocus={() =>
                            mutateDraft((next) => {
                              next.selectedFurnitureId = item.id
                            })
                          }
                          onChange={(event) =>
                            updateSelectedRoom((room) => {
                              const editable = room.furniture.find((furniture) => furniture.id === item.id)
                              if (editable) {
                                editable.depth = readNumber(event.target.value, editable.depth)
                              }
                            })
                          }
                        />
                        <button
                          className="ghost-button small danger"
                          onClick={() =>
                            updateSelectedRoom((room) => {
                              room.furniture = room.furniture.filter((furniture) => furniture.id !== item.id)
                            })
                          }
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {draft.editorMode === 'furniture' && selectedRoom.furniture.length > 0 ? (
                  <div className="field-grid compact">
                    <NumericField
                      label="Item X"
                      step="0.1"
                      value={
                        selectedRoom.furniture.find((item) => item.id === draft.selectedFurnitureId)?.x ??
                        selectedRoom.furniture[0].x
                      }
                      onChange={(value) => updateSelectedFurniture((item) => void (item.x = value))}
                    />
                    <NumericField
                      label="Item Y"
                      step="0.1"
                      value={
                        selectedRoom.furniture.find((item) => item.id === draft.selectedFurnitureId)?.y ??
                        selectedRoom.furniture[0].y
                      }
                      onChange={(value) => updateSelectedFurniture((item) => void (item.y = value))}
                    />
                    <NumericField
                      label="Rotation"
                      step="1"
                      value={
                        selectedRoom.furniture.find((item) => item.id === draft.selectedFurnitureId)?.rotation ??
                        selectedRoom.furniture[0].rotation
                      }
                      onChange={(value) => updateSelectedFurniture((item) => void (item.rotation = value))}
                    />
                  </div>
                ) : null}
              </section>
            </>
          ) : (
            <section className="panel-section">
              <p className="empty-state">Select or create a room to inspect measurements.</p>
            </section>
          )}
        </aside>
      </main>
    </div>
  )
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <p>{detail}</p> : null}
    </article>
  )
}

function NumericField({
  label,
  step,
  value,
  onChange,
}: {
  label: string
  step: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        className="number-input"
        type="number"
        step={step}
        value={value}
        onChange={(event) => onChange(readNumber(event.target.value, value))}
      />
    </label>
  )
}

function FloorOverlay({
  floor,
  activeFloorId,
  activeMode,
  selectedRoomId,
  showFurniture,
  onRoomSelect,
}: {
  floor: Floor
  activeFloorId: string
  activeMode: EditorMode
  selectedRoomId: string | null
  showFurniture: boolean
  onRoomSelect: (roomId: string) => void
}) {
  const bounds = computeFloorBounds(floor)
  const labelPoint = { x: bounds.minX + 1, y: bounds.maxY + 1.75 }
  const isGhostFloor = activeMode === 'stacked' && floor.id !== activeFloorId

  return (
    <g className={isGhostFloor ? 'floor-layer ghost' : 'floor-layer'}>
      <text className="floor-tag" x={labelPoint.x} y={-labelPoint.y}>
        {floor.name}
      </text>
      {floor.rooms.map((room) => {
        const geometry = roomToGeometry(room)
        const path = pointsToPath(geometry.closed ? geometry.points.slice(0, -1) : geometry.points)
        const label = getRoomLabelPoint(room)

        return (
          <g key={room.id} className={selectedRoomId === room.id ? 'room-layer active' : 'room-layer'}>
            {geometry.closed ? (
              <path
                className="room-fill"
                d={`${path} Z`}
                fill={room.color}
                fillOpacity={selectedRoomId === room.id ? 0.18 : 0.1}
                stroke={room.color}
                strokeWidth={selectedRoomId === room.id ? 0.38 : 0.24}
                onClick={() => onRoomSelect(room.id)}
              />
            ) : (
              <path
                className="room-stroke open"
                d={path}
                fill="none"
                stroke={room.color}
                strokeWidth={selectedRoomId === room.id ? 0.38 : 0.24}
                onClick={() => onRoomSelect(room.id)}
              />
            )}

            <text className="room-label" textAnchor="middle" x={label.x} y={-label.y}>
              {room.name}
            </text>

            {showFurniture
              ? room.furniture.map((item) => (
                  <FurnitureOutline key={item.id} furniture={item} highlighted={selectedRoomId === room.id} />
                ))
              : null}
          </g>
        )
      })}
    </g>
  )
}

function FurnitureOutline({ furniture, highlighted }: { furniture: Furniture; highlighted: boolean }) {
  const centerX = furniture.x + furniture.width / 2
  const centerY = furniture.y - furniture.depth / 2
  return (
    <g
      className={highlighted ? 'furniture-layer active' : 'furniture-layer'}
      transform={`rotate(${-furniture.rotation} ${centerX} ${-centerY})`}
    >
      <rect
        x={furniture.x}
        y={-(furniture.y)}
        width={furniture.width}
        height={furniture.depth}
        transform={`translate(0 ${-furniture.depth})`}
      />
      <text x={centerX} y={-(centerY)} textAnchor="middle">
        {furniture.name}
      </text>
    </g>
  )
}

function SuggestedPath({
  room,
  segments,
}: {
  room: Room
  segments: SuggestionSegment[]
}) {
  const geometry = roomToGeometry(room)
  const points = [geometry.endPoint]
  let heading = geometry.exitHeading
  let cursor = geometry.endPoint

  segments.forEach((segment) => {
    const next = addPolar(cursor, segment.length, heading)
    points.push(next)
    cursor = next
    heading = normalizeAngle(heading + segment.turn)
  })

  return <path className="suggested-path" d={pointsToPath(points)} />
}

function looksLikeWorkspace(value: DraftState | Structure): value is DraftState {
  return Array.isArray((value as DraftState).structures)
}

function looksLikeStructure(value: DraftState | Structure): value is Structure {
  return Array.isArray((value as Structure).floors)
}

function readNumber(value: string, fallback: number) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

export default App
