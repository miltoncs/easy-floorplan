import { useEditor } from '../context/EditorContext'
import { describeCornerAngle, formatFeet, getRoomCorners } from '../lib/geometry'

export function DetailPage() {
  const {
    activeFloor,
    activeStructure,
    draft,
    roomSuggestions,
    selectedFurniture,
    selectedRoom,
    selectedRoomGeometry,
    structureRoomCount,
    actions,
  } = useEditor()
  const roomCorners = selectedRoom ? getRoomCorners(selectedRoom) : []

  return (
    <section className="detail-page">
      <div className="detail-grid">
        <aside className="detail-sidebar">
          <section className="panel-card detail-card">
            <div className="section-heading compact">
              <div>
                <p className="panel-kicker">Structures</p>
                <h2>Workspace</h2>
              </div>
              <button className="ghost-button small" onClick={() => actions.addStructure()} type="button">
                Add
              </button>
            </div>
            <div className="structure-list">
              {draft.structures.map((structure) => (
                <div
                  key={structure.id}
                  className={draft.activeStructureId === structure.id ? 'structure-card active' : 'structure-card'}
                >
                  <button className="card-select" onClick={() => actions.selectStructure(structure.id)} type="button">
                    <div>
                      <p>{structure.name}</p>
                      <span>
                        {structure.floors.length} floors ·{' '}
                        {structure.floors.reduce((sum, floor) => sum + floor.rooms.length, 0)} rooms
                      </span>
                    </div>
                  </button>
                  <div className="card-inline-actions">
                    <button
                      className="card-action"
                      onClick={() => actions.openRenameDialog('structure', { structureId: structure.id })}
                      type="button"
                    >
                      Rename
                    </button>
                    {draft.structures.length > 1 ? (
                      <button className="card-action danger" onClick={() => actions.deleteStructure(structure.id)} type="button">
                        Delete
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {activeStructure ? (
            <section className="panel-card detail-card">
              <div className="section-heading compact">
                <div>
                  <p className="panel-kicker">Floors</p>
                  <h2>{activeStructure.name}</h2>
                </div>
                <button className="ghost-button small" onClick={() => actions.addFloor()} type="button">
                  Add
                </button>
              </div>
              <div className="chip-list">
                {activeStructure.floors.map((floor) => (
                  <div key={floor.id} className={draft.activeFloorId === floor.id ? 'floor-chip active' : 'floor-chip'}>
                    <button className="card-select" onClick={() => actions.selectFloor(activeStructure.id, floor.id)} type="button">
                      <strong>{floor.name}</strong>
                      <span>{floor.rooms.length} rooms</span>
                    </button>
                    <div className="card-inline-actions">
                      <button
                        className="card-action"
                        onClick={() =>
                          actions.openRenameDialog('floor', {
                            structureId: activeStructure.id,
                            floorId: floor.id,
                          })
                        }
                        type="button"
                      >
                        Rename
                      </button>
                      {activeStructure.floors.length > 1 ? (
                        <button
                          className="card-action danger"
                          onClick={() => actions.deleteFloor(activeStructure.id, floor.id)}
                          type="button"
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </aside>

        <div className="detail-main">
          <section className="panel-card detail-card">
            <div className="section-heading">
              <div>
                <p className="panel-kicker">Selected room</p>
                <h2>{selectedRoom?.name ?? 'Choose a room'}</h2>
              </div>
              {selectedRoom && activeStructure && activeFloor ? (
                <div className="section-actions">
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
                  <button className="ghost-button small" onClick={() => actions.addWall()} type="button">
                    Add wall
                  </button>
                  <button className="ghost-button small danger" onClick={() => actions.clearWalls()} type="button">
                    Clear walls
                  </button>
                </div>
              ) : null}
            </div>

            {selectedRoom && selectedRoomGeometry ? (
              <>
                <div className="stats-grid">
                  <MetricCard label="Structure rooms" value={`${structureRoomCount}`} />
                  <MetricCard label="Walls" value={`${selectedRoom.segments.length}`} />
                  <MetricCard label="Corners" value={`${roomCorners.length}`} />
                  <MetricCard
                    label="Area"
                    value={
                      selectedRoomGeometry.measuredArea
                        ? `${selectedRoomGeometry.measuredArea.toFixed(1)} sq ft`
                        : 'Pending'
                    }
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
                          if (!activeStructure || !activeFloor || !selectedRoom) {
                            return
                          }

                          const room = draftState.structures
                            .find((structure) => structure.id === activeStructure.id)
                            ?.floors.find((floor) => floor.id === activeFloor.id)
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
                          if (!activeStructure || !activeFloor) {
                            return
                          }

                          const floor = draftState.structures
                            .find((structure) => structure.id === activeStructure.id)
                            ?.floors.find((item) => item.id === activeFloor.id)

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
                          if (!activeStructure || !activeFloor || !selectedRoom) {
                            return
                          }

                          const room = draftState.structures
                            .find((structure) => structure.id === activeStructure.id)
                            ?.floors.find((floor) => floor.id === activeFloor.id)
                            ?.rooms.find((room) => room.id === selectedRoom.id)

                          if (room) {
                            room.notes = event.target.value
                          }
                        })
                      }
                    />
                  </label>
                </div>

                <div className="detail-measurements">
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
                                actions.openWallDialog({
                                  structureId: activeStructure!.id,
                                  floorId: activeFloor!.id,
                                  roomId: selectedRoom.id,
                                  segmentId: segment.id,
                                })
                              }
                              type="button"
                            >
                              Edit wall
                            </button>
                            <button
                              className="ghost-button small danger"
                              onClick={() => actions.deleteWall(activeStructure!.id, activeFloor!.id, selectedRoom.id, segment.id)}
                              type="button"
                            >
                              Delete
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
                                  actions.openCornerDialog({
                                    structureId: activeStructure!.id,
                                    floorId: activeFloor!.id,
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
                </div>
              </>
            ) : (
              <p className="empty-state">Select a room from the Workspace page to inspect its measurements.</p>
            )}
          </section>

          <section className="panel-card detail-card">
            <div className="section-heading">
              <div>
                <p className="panel-kicker">Furniture</p>
                <h2>{selectedFurniture?.name ?? 'Room layout items'}</h2>
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
                      <span>{formatFeet(item.width)} × {formatFeet(item.depth)}</span>
                      <span>{item.rotation.toFixed(0)}°</span>
                      <div className="row-actions">
                        <button
                          className="ghost-button small"
                          onClick={() =>
                            activeStructure &&
                            activeFloor &&
                            actions.openFurnitureDialog({
                              structureId: activeStructure.id,
                              floorId: activeFloor.id,
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
                            activeStructure &&
                            activeFloor &&
                            actions.deleteFurniture(activeStructure.id, activeFloor.id, selectedRoom.id, item.id)
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
          </section>

          <section className="panel-card detail-card">
            <div className="section-heading">
              <div>
                <p className="panel-kicker">Inference</p>
                <h2>Manual review queue</h2>
              </div>
            </div>
            {roomSuggestions.length === 0 ? (
              <p className="empty-state">No inference items yet for the current room.</p>
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
      </div>
    </section>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}
