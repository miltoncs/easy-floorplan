import { useRef, useState, type ChangeEvent } from 'react'
import { MetricCard } from './MetricCard'
import { useEditor } from '../context/EditorContext'
import { describeCornerAngle, formatFeet, getRoomCorners } from '../lib/geometry'
import { parseImportedJson } from '../lib/serialization'
import { CockpitInspectorTabs, type InspectorTabId } from './CockpitInspectorTabs'

const JSON_PREVIEW = `{
  "kind": "workspace",
  "version": 2,
  "exportedAt": "2026-03-09T00:00:00.000Z",
  "payload": { ... }
}`

export function CockpitInspector() {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [activeTab, setActiveTab] = useState<InspectorTabId>('properties')
  const {
    activeFloor,
    activeStructure,
    draft,
    resolvedViewScope,
    roomSuggestions,
    selectedFurniture,
    selectedRoom,
    selectedRoomGeometry,
    structureRoomCount,
    ui,
    actions,
  } = useEditor()
  const roomCorners = selectedRoom ? getRoomCorners(selectedRoom) : []

  return (
    <aside className="cockpit-inspector panel-card" aria-label="Inspector">
      <input
        ref={inputRef}
        accept="application/json,.json"
        className="hidden-input"
        type="file"
        onChange={handleImport}
      />

      <div className="cockpit-inspector__section">
        <p className="panel-kicker">Selected scope</p>
        <h2>{selectedRoom?.name ?? activeFloor?.name ?? activeStructure?.name ?? 'Workspace'}</h2>
        <p className="cockpit-inspector__summary">
          {resolvedViewScope.rooms.length} room{resolvedViewScope.rooms.length === 1 ? '' : 's'} in view
        </p>
      </div>

      <CockpitInspectorTabs activeTab={activeTab} onSelect={setActiveTab} />

      <div className="cockpit-inspector__panel" role="tabpanel">
        {activeTab === 'properties' ? (
          <PropertiesPanel
            activeFloorName={activeFloor?.name ?? 'No floor'}
            activeStructure={activeStructure}
            draft={draft}
            roomCornersCount={roomCorners.length}
            selectedRoom={selectedRoom}
            selectedRoomGeometry={selectedRoomGeometry}
            structureRoomCount={structureRoomCount}
          />
        ) : null}

        {activeTab === 'measurements' ? (
          <MeasurementsPanel
            activeFloorId={activeFloor?.id ?? null}
            activeStructureId={activeStructure?.id ?? null}
            roomCornersCount={roomCorners.length}
            roomCorners={roomCorners}
            roomSuggestions={roomSuggestions}
            selectedRoom={selectedRoom}
          />
        ) : null}

        {activeTab === 'furniture' ? (
          <FurniturePanel
            activeFloorId={activeFloor?.id ?? null}
            activeStructureId={activeStructure?.id ?? null}
            selectedFurniture={selectedFurniture}
            selectedRoom={selectedRoom}
          />
        ) : null}

        {activeTab === 'preview-export' ? (
          <PreviewExportPanel
            activeStructureName={activeStructure?.name ?? 'None'}
            inputRef={inputRef}
            status={ui.status}
            surfaceMode={draft.surfaceMode}
          />
        ) : null}
      </div>
    </aside>
  )

  function PropertiesPanel({
    activeFloorName,
    activeStructure,
    draft,
    roomCornersCount,
    selectedRoom,
    selectedRoomGeometry,
    structureRoomCount,
  }: {
    activeFloorName: string
    activeStructure: typeof activeStructure
    draft: typeof draft
    roomCornersCount: number
    selectedRoom: typeof selectedRoom
    selectedRoomGeometry: typeof selectedRoomGeometry
    structureRoomCount: number
  }) {
    return (
      <div className="cockpit-inspector__stack">
        {selectedRoom && selectedRoomGeometry ? (
          <>
            <div className="stats-grid">
              <MetricCard label="Structure rooms" value={`${structureRoomCount}`} />
              <MetricCard label="Walls" value={`${selectedRoom.segments.length}`} />
              <MetricCard label="Corners" value={`${roomCornersCount}`} />
              <MetricCard
                label="Area"
                value={selectedRoomGeometry.measuredArea ? `${selectedRoomGeometry.measuredArea.toFixed(1)} sq ft` : 'Pending'}
              />
            </div>

            <div className="field-grid">
              <label>
                <span>Color</span>
                <input
                  className="color-input"
                  type="color"
                  value={selectedRoom.color}
                  onChange={(event) =>
                    actions.mutateDraft((draftState) => {
                      const room = draftState.structures
                        .find((structure) => structure.id === activeStructure?.id)
                        ?.floors.find((floor) => floor.id === activeFloor?.id)
                        ?.rooms.find((room) => room.id === selectedRoom.id)

                      if (room) {
                        room.color = event.target.value
                      }
                    })
                  }
                />
              </label>

              <label>
                <span>Elevation</span>
                <input
                  className="number-input"
                  step="1"
                  type="number"
                  value={activeFloor?.elevation ?? 0}
                  onChange={(event) =>
                    actions.mutateDraft((draftState) => {
                      const floor = draftState.structures
                        .find((structure) => structure.id === activeStructure?.id)
                        ?.floors.find((floor) => floor.id === activeFloor?.id)

                      if (floor) {
                        floor.elevation = Number(event.target.value)
                      }
                    })
                  }
                />
              </label>

              <label className="text-span">
                <span>Room notes</span>
                <textarea
                  className="text-area"
                  rows={3}
                  value={selectedRoom.notes}
                  onChange={(event) =>
                    actions.mutateDraft((draftState) => {
                      const room = draftState.structures
                        .find((structure) => structure.id === activeStructure?.id)
                        ?.floors.find((floor) => floor.id === activeFloor?.id)
                        ?.rooms.find((room) => room.id === selectedRoom.id)

                      if (room) {
                        room.notes = event.target.value
                      }
                    })
                  }
                />
              </label>
            </div>
          </>
        ) : (
          <p className="empty-state">Select a room on the canvas to inspect its properties.</p>
        )}

        <div className="cockpit-inspector__section">
          <p className="panel-kicker">Project</p>
          <h3>{activeStructure?.name ?? 'Workspace'}</h3>
          <div className="chip-list">
            {draft.structures.map((structure) => (
              <button
                className={structure.id === draft.activeStructureId ? 'floor-chip active' : 'floor-chip'}
                key={structure.id}
                onClick={() => actions.selectStructure(structure.id)}
                type="button"
              >
                <strong>{structure.name}</strong>
                <span>{structure.floors.length} floors</span>
              </button>
            ))}
          </div>
          <div className="chip-list">
            {activeStructure?.floors.map((floor) => (
              <button
                className={floor.id === draft.activeFloorId ? 'floor-chip active' : 'floor-chip'}
                key={floor.id}
                onClick={() => actions.selectFloor(activeStructure.id, floor.id)}
                type="button"
              >
                <strong>{floor.name}</strong>
                <span>{floor.rooms.length} rooms</span>
              </button>
            ))}
          </div>
          <p className="cockpit-inspector__summary">{activeFloorName}</p>
        </div>
      </div>
    )
  }

  function MeasurementsPanel({
    activeFloorId,
    activeStructureId,
    roomCorners,
    roomSuggestions,
    selectedRoom,
  }: {
    activeFloorId: string | null
    activeStructureId: string | null
    roomCorners: ReturnType<typeof getRoomCorners>
    roomSuggestions: typeof roomSuggestions
    selectedRoom: typeof selectedRoom
    roomCornersCount: number
  }) {
    return selectedRoom ? (
      <div className="cockpit-inspector__stack">
        <div className="section-actions">
          <button className="ghost-button small" onClick={() => actions.addWall()} type="button">
            Add wall
          </button>
          <button className="ghost-button small danger" onClick={() => actions.clearWalls()} type="button">
            Clear walls
          </button>
        </div>

        <section className="measurement-section">
          <div className="section-heading compact">
            <div>
              <p className="panel-kicker">Walls</p>
              <h2>Measured runs</h2>
            </div>
          </div>
          <div className="measurement-table measurement-table--walls">
            <div className="measurement-head measurement-head--walls">
              <span>Wall</span>
              <span>Length</span>
              <span />
            </div>
            {selectedRoom.segments.map((segment, index) => (
              <div className="measurement-row measurement-row--walls" key={segment.id}>
                <span className="row-label">{segment.label || `Wall ${index + 1}`}</span>
                <span>{segment.length.toFixed(1)} ft</span>
                <div className="row-actions">
                  <button
                    className="ghost-button small"
                    onClick={() =>
                      activeStructureId &&
                      activeFloorId &&
                      actions.openWallDialog({
                        structureId: activeStructureId,
                        floorId: activeFloorId,
                        roomId: selectedRoom.id,
                        segmentId: segment.id,
                      })
                    }
                    type="button"
                  >
                    Edit wall
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {roomCorners.length > 0 ? (
          <section className="measurement-section">
            <div className="section-heading compact">
              <div>
                <p className="panel-kicker">Corners</p>
                <h2>Angles between walls</h2>
              </div>
            </div>
            <div className="measurement-table measurement-table--corners">
              <div className="measurement-head measurement-head--corners">
                <span>Corner</span>
                <span>Angle</span>
                <span>Between</span>
                <span />
              </div>
              {roomCorners.map((corner, index) => (
                <div className="measurement-row measurement-row--corners" key={corner.segmentId}>
                  <span className="row-label">{`Corner ${index + 1}`}</span>
                  <span>{describeCornerAngle(corner.turn)}</span>
                  <span>{`${corner.incomingLabel} -> ${corner.outgoingLabel}`}</span>
                  <div className="row-actions">
                    <button
                      className="ghost-button small"
                      onClick={() =>
                        activeStructureId &&
                        activeFloorId &&
                        actions.openCornerDialog({
                          structureId: activeStructureId,
                          floorId: activeFloorId,
                          roomId: selectedRoom.id,
                          segmentId: corner.segmentId,
                        })
                      }
                      type="button"
                    >
                      Edit angle
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="cockpit-inspector__section">
          <p className="panel-kicker">Inference</p>
          <h3>Review queue</h3>
          {roomSuggestions.length === 0 ? (
            <p className="empty-state">No inference items yet for this room.</p>
          ) : (
            <div className="suggestion-list">
              {roomSuggestions.map((suggestion) => (
                <article className="suggestion-card" key={suggestion.id}>
                  <div>
                    <p>{suggestion.title}</p>
                    <span>{suggestion.detail}</span>
                  </div>
                  {suggestion.segmentsToAdd ? (
                    <button className="ghost-button small" onClick={() => actions.applySuggestion(suggestion)} type="button">
                      Apply
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    ) : (
      <p className="empty-state">Select a room to inspect measurements.</p>
    )
  }

  function FurniturePanel({
    activeFloorId,
    activeStructureId,
    selectedFurniture,
    selectedRoom,
  }: {
    activeFloorId: string | null
    activeStructureId: string | null
    selectedFurniture: typeof selectedFurniture
    selectedRoom: typeof selectedRoom
  }) {
    return (
      <div className="cockpit-inspector__stack">
        <div className="section-heading compact">
          <div>
            <p className="panel-kicker">Furniture</p>
            <h3>{selectedFurniture?.name ?? 'Room layout items'}</h3>
          </div>
          <button className="ghost-button small" onClick={() => actions.addFurniture()} type="button">
            Add furniture
          </button>
        </div>

        {selectedRoom ? (
          <div className="measurement-table">
            {selectedRoom.furniture.length === 0 ? (
              <p className="empty-state">No furniture yet for this room.</p>
            ) : (
              selectedRoom.furniture.map((item) => (
                <div className="measurement-row furniture-row active" key={item.id}>
                  <span className="row-label">{item.name}</span>
                  <span>
                    {formatFeet(item.width)} × {formatFeet(item.depth)}
                  </span>
                  <span>{item.rotation.toFixed(0)}°</span>
                  <div className="row-actions">
                    <button
                      className="ghost-button small"
                      onClick={() =>
                        activeStructureId &&
                        activeFloorId &&
                        actions.openFurnitureDialog({
                          structureId: activeStructureId,
                          floorId: activeFloorId,
                          roomId: selectedRoom.id,
                          furnitureId: item.id,
                        })
                      }
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      className="ghost-button small danger"
                      onClick={() =>
                        activeStructureId && activeFloorId && actions.deleteFurniture(activeStructureId, activeFloorId, selectedRoom.id, item.id)
                      }
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <p className="empty-state">Choose a room first.</p>
        )}
      </div>
    )
  }

  function PreviewExportPanel({
    activeStructureName,
    inputRef,
    status,
    surfaceMode,
  }: {
    activeStructureName: string
    inputRef: React.RefObject<HTMLInputElement | null>
    status: string
    surfaceMode: typeof draft.surfaceMode
  }) {
    return (
      <div className="cockpit-inspector__stack">
        <section className="cockpit-inspector__section">
          <p className="panel-kicker">Preview</p>
          <h3>Isometric</h3>
          <p className="cockpit-inspector__summary">
            {surfaceMode === 'isometric'
              ? 'Preview is active in the center stage.'
              : 'Open a read-only isometric view for the current scope.'}
          </p>
          <div className="workspace-toolbar-group wrap">
            <button className="primary-button" onClick={() => actions.openIsometricPreview()} type="button">
              Preview isometric
            </button>
          </div>
        </section>

        <section className="cockpit-inspector__section">
          <p className="panel-kicker">JSON workflow</p>
          <h3>Import and export</h3>
          <div className="workspace-toolbar-group wrap">
            <button className="primary-button" onClick={() => actions.exportActiveStructure()} type="button">
              Export structure JSON
            </button>
            <button className="ghost-button" onClick={() => actions.exportWorkspace()} type="button">
              Export workspace JSON
            </button>
            <button className="ghost-button" onClick={() => inputRef.current?.click()} type="button">
              Import JSON
            </button>
            <button className="ghost-button" onClick={() => actions.restoreSample()} type="button">
              Restore sample
            </button>
          </div>
          <div className="status-banner">
            <strong>Current status</strong>
            <span>{status}</span>
          </div>
          <div className="stats-grid two-up">
            <MetricCard label="Active structure" value={activeStructureName} />
            <MetricCard label="Format" value="JSON only" />
            <MetricCard label="Versioned export" value="v2 envelope" />
            <MetricCard label="Legacy import" value="Supported" />
          </div>
          <pre className="json-preview">
            <code>{JSON_PREVIEW}</code>
          </pre>
        </section>
      </div>
    )
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    try {
      const imported = parseImportedJson(await file.text())

      if (imported.kind === 'workspace') {
        actions.importWorkspace(imported.draft)
      } else {
        actions.importStructure(imported.structure)
      }
    } catch (error) {
      actions.setStatus(error instanceof Error ? error.message : 'Could not import that JSON file.')
    } finally {
      event.target.value = ''
    }
  }
}
