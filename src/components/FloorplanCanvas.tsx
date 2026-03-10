import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useEditor } from '../context/EditorContext'
import { computeFloorBounds, findSegmentById, getRoomLabelPoint, getViewBox } from '../lib/blueprint'
import { parseDistanceInput } from '../lib/distance'
import {
  addPolar,
  clamp,
  formatCornerAngleBadge,
  formatFeet,
  getRoomCorners,
  midpoint,
  normalizeAngle,
  pointsToPath,
  roomToGeometry,
} from '../lib/geometry'
import type { CanvasTarget, Floor, Point, Room, RoomSuggestion, SuggestionSegment } from '../types'

type DragState =
  | {
      kind: 'canvas'
      pointerId: number
      clientX: number
      clientY: number
      startOffsetX: number
      startOffsetY: number
      moved: boolean
    }
  | {
      kind: 'room'
      pointerId: number
      clientX: number
      clientY: number
      structureId: string
      floorId: string
      roomId: string
      startX: number
      startY: number
      moved: boolean
    }
  | {
      kind: 'furniture'
      pointerId: number
      clientX: number
      clientY: number
      structureId: string
      floorId: string
      roomId: string
      furnitureId: string
      startX: number
      startY: number
      moved: boolean
    }
  | {
      kind: 'selection'
      pointerId: number
      clientX: number
      clientY: number
      currentClientX: number
      currentClientY: number
      moved: boolean
    }
  | null

type CanvasRect = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

type CanvasMetrics = {
  widthPx: number
  heightPx: number
  unitX: number
  unitY: number
}

type ScreenPoint = {
  x: number
  y: number
}

type SuggestionPreview = {
  suggestion: RoomSuggestion & { segmentsToAdd: SuggestionSegment[] }
  points: Point[]
  anchorPoint: Point
  heading: number
  length: number
}

type PlacedSuggestionPreview = SuggestionPreview & {
  actionPoint: Point
  actionRect: CanvasRect
}

type AnnotationKind = 'floor' | 'room' | 'furniture' | 'wall' | 'corner'

type CanvasAnnotation = {
  id: string
  kind: AnnotationKind
  text: string
  target: CanvasTarget
  anchor: ScreenPoint
  widthPx: number
  heightPx: number
  priority: number
  required?: boolean
  candidateOffsets: ScreenPoint[]
}

type PlacedCanvasAnnotation = CanvasAnnotation & {
  rect: CanvasRect
  position: ScreenPoint
  candidateIndex: number
}

type HoverCornerOverlay = {
  target: Extract<CanvasTarget, { kind: 'corner' }>
  point: ScreenPoint
  labelPoint: ScreenPoint
  text: string
}

type SelectableCanvasTarget = {
  target: CanvasTarget
  rect: CanvasRect
}

type InlineWallEditorState = {
  segmentId: string
  value: string
  error: string | null
}

const GRID_MINOR_SIZE_FEET = 1
const GRID_MAJOR_MULTIPLE = 4
const GRID_MAJOR_SIZE_FEET = GRID_MINOR_SIZE_FEET * GRID_MAJOR_MULTIPLE
const WHEEL_ZOOM_MULTIPLIER = 1.02
const BUTTON_ZOOM_MULTIPLIER = 1.03

export function FloorplanCanvas() {
  const {
    activeFloor,
    activeStructure,
    draft,
    roomSuggestions,
    selectedRoom,
    selectedRoomGeometry,
    ui,
    viewBounds,
    visibleFloors,
    actions,
  } = useEditor()
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<DragState>(null)
  const suppressCanvasClickRef = useRef(false)
  const inlineWallInputRef = useRef<HTMLInputElement | null>(null)
  const annotationPlacementRef = useRef<Record<string, number>>({})
  const [isDragging, setIsDragging] = useState(false)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const [selectionBox, setSelectionBox] = useState<CanvasRect | null>(null)
  const [inlineWallEditor, setInlineWallEditor] = useState<InlineWallEditorState | null>(null)
  const canvasAspectRatio =
    canvasSize.width > 0 && canvasSize.height > 0 ? canvasSize.width / canvasSize.height : undefined
  const viewBox = getViewBox(viewBounds, ui.camera.zoom, ui.camera.offset, canvasAspectRatio)

  const shapeSuggestions = roomSuggestions.filter(hasSuggestedSegments)
  const canvasMetrics = getCanvasMetrics(viewBox, canvasSize)
  const structureBadgeRect = getCanvasStructureChipRect(viewBox, canvasMetrics)
  const canvasToolbarRect = getCanvasToolbarRect(viewBox, canvasMetrics)
  const canvasLegendRect = getCanvasLegendRect(viewBox, canvasMetrics)
  const suggestedPreviews =
    draft.showInferred && selectedRoom
      ? placeSuggestionPreviews(
          shapeSuggestions.map((suggestion) => buildSuggestionPreview(selectedRoom, suggestion)),
          viewBox,
          canvasMetrics,
          [
            expandRect(structureBadgeRect, 0.4, 0.4),
            expandRect(canvasToolbarRect, 0.8, 0.8),
            expandRect(canvasLegendRect, 0.4, 0.4),
          ],
        )
      : []
  const reservedAnnotationRects = [
    expandRect(svgRectToScreenRect(structureBadgeRect, viewBox, canvasMetrics), 10, 10),
    expandRect(svgRectToScreenRect(canvasToolbarRect, viewBox, canvasMetrics), 14, 14),
    expandRect(svgRectToScreenRect(canvasLegendRect, viewBox, canvasMetrics), 12, 12),
    ...suggestedPreviews.map((preview) => expandRect(svgRectToScreenRect(preview.actionRect, viewBox, canvasMetrics), 12, 12)),
  ]
  const placedAnnotations = buildCanvasAnnotations({
    canvasMetrics,
    viewBox,
    activeStructureId: activeStructure?.id,
    activeFloorId: activeFloor?.id ?? draft.activeFloorId,
    visibleFloors,
    selectedRoom,
    selectedRoomGeometry,
    selectedRoomId: draft.selectedRoomId,
    selectedFurnitureId: draft.selectedFurnitureId,
    showRoomFloorLabels: draft.showRoomFloorLabels,
    showFurnitureLabels: draft.editorMode === 'furniture',
    showWallLabels: draft.showWallLabels && draft.editorMode !== 'furniture',
    showCornerLabels: draft.showAngleLabels && draft.editorMode !== 'furniture',
    reservedRects: reservedAnnotationRects,
    hoveredTarget: ui.hoveredTarget,
    focusedTarget: ui.focusedTarget,
    selectionTargets: ui.selectionTargets,
    editingWallSegmentId: inlineWallEditor?.segmentId ?? null,
    previousCandidateIndices: annotationPlacementRef.current,
  })
  const hoveredCornerOverlay = getHoveredCornerOverlay({
    activeStructureId: activeStructure?.id,
    activeFloorId: activeFloor?.id ?? draft.activeFloorId,
    selectedRoom,
    selectedRoomGeometry,
    hoveredTarget: ui.hoveredTarget,
    viewBox,
    canvasMetrics,
  })
  const selectableTargets = buildSelectableCanvasTargets({
    activeStructureId: activeStructure?.id,
    activeFloorId: activeFloor?.id ?? draft.activeFloorId,
    visibleFloors,
    selectedRoomGeometry,
    selectedRoomId: draft.selectedRoomId,
    viewBox,
    canvasMetrics,
    showFurniture: draft.editorMode === 'furniture',
  })

  const canvasTarget: CanvasTarget = {
    kind: 'canvas',
    structureId: activeStructure?.id,
    floorId: activeFloor?.id,
  }

  const applyWheelZoom = useEffectEvent((clientX: number, clientY: number, deltaY: number) => {
    if (!svgRef.current) {
      return
    }

    const rect = svgRef.current.getBoundingClientRect()
    const pointerRatioX = (clientX - rect.left) / rect.width
    const pointerRatioY = (clientY - rect.top) / rect.height
    const currentViewX = viewBox.x + pointerRatioX * viewBox.width
    const currentViewY = viewBox.y + pointerRatioY * viewBox.height
    const nextZoom = deltaY > 0 ? ui.camera.zoom / WHEEL_ZOOM_MULTIPLIER : ui.camera.zoom * WHEEL_ZOOM_MULTIPLIER
    const clampedZoom = Math.max(0.45, Math.min(3.5, nextZoom))
    const nextViewBox = getViewBox(viewBounds, clampedZoom)

    actions.setCamera({
      zoom: clampedZoom,
      offset: {
        x: currentViewX - pointerRatioX * nextViewBox.width - nextViewBox.x,
        y: currentViewY - pointerRatioY * nextViewBox.height - nextViewBox.y,
      },
    })
  })

  useEffect(() => {
    const svg = svgRef.current

    if (!svg) {
      return
    }

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()
      applyWheelZoom(event.clientX, event.clientY, event.deltaY)
    }

    svg.addEventListener('wheel', handleWheel, { passive: false })
    return () => svg.removeEventListener('wheel', handleWheel)
  }, [ui.camera.zoom, viewBox, viewBounds])

  useEffect(() => {
    const svg = svgRef.current

    if (!svg) {
      return
    }

    const updateSize = () => {
      const rect = svg.getBoundingClientRect()
      setCanvasSize({
        width: Math.max(rect.width, 0),
        height: Math.max(rect.height, 0),
      })
    }

    updateSize()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize)
      return () => window.removeEventListener('resize', updateSize)
    }

    const observer = new ResizeObserver(updateSize)
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!inlineWallEditor) {
      return
    }

    inlineWallInputRef.current?.focus()
    inlineWallInputRef.current?.select()
  }, [inlineWallEditor])

  useEffect(() => {
    annotationPlacementRef.current = Object.fromEntries(
      placedAnnotations.map((annotation) => [getAnnotationPlacementKey(annotation), annotation.candidateIndex]),
    )
  }, [placedAnnotations])

  return (
    <div className={[ 'canvas-stage', isDragging ? 'dragging' : '', selectionBox ? 'selecting' : '' ].filter(Boolean).join(' ')}>
      <svg
        ref={svgRef}
        aria-label="Interactive floorplan canvas"
        className="blueprint-canvas"
        tabIndex={0}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && selectedRoom && activeStructure && activeFloor) {
            actions.openRenameDialog('room', {
              structureId: activeStructure.id,
              floorId: activeFloor.id,
              roomId: selectedRoom.id,
            })
            return
          }

          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault()
            const rect = svgRef.current?.getBoundingClientRect()
            if (!rect) {
              return
            }

            actions.openContextMenu({
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
              target: ui.focusedTarget ?? canvasTarget,
            })
          }
        }}
        onPointerMove={(event) => {
          if (!dragRef.current || !svgRef.current || dragRef.current.pointerId !== event.pointerId) {
            return
          }

          const rect = svgRef.current.getBoundingClientRect()
          const scaleX = viewBox.width / rect.width
          const scaleY = viewBox.height / rect.height
          const deltaX = (event.clientX - dragRef.current.clientX) * scaleX
          const deltaY = (event.clientY - dragRef.current.clientY) * scaleY
          const moved = Math.abs(event.clientX - dragRef.current.clientX) > 4 || Math.abs(event.clientY - dragRef.current.clientY) > 4
          const activeDrag = dragRef.current

          if (activeDrag.kind === 'canvas') {
            activeDrag.moved = moved
            actions.setCamera({
              zoom: ui.camera.zoom,
              offset: {
                x: activeDrag.startOffsetX - deltaX,
                y: activeDrag.startOffsetY - deltaY,
              },
            })
            return
          }

          if (activeDrag.kind === 'selection') {
            activeDrag.moved = moved
            activeDrag.currentClientX = event.clientX
            activeDrag.currentClientY = event.clientY
            setSelectionBox(getSelectionRect(activeDrag.clientX, activeDrag.clientY, event.clientX, event.clientY, rect))
            return
          }

          if (activeDrag.kind === 'room') {
            activeDrag.moved = moved
            actions.mutateDraft((draftState) => {
              const room = draftState.structures
                .find((structure) => structure.id === activeDrag.structureId)
                ?.floors.find((floor) => floor.id === activeDrag.floorId)
                ?.rooms.find((room) => room.id === activeDrag.roomId)

              if (!room) {
                return
              }

              room.anchor.x = activeDrag.startX + deltaX
              room.anchor.y = activeDrag.startY - deltaY
            })
            return
          }

          activeDrag.moved = moved
          actions.mutateDraft((draftState) => {
            const item = draftState.structures
              .find((structure) => structure.id === activeDrag.structureId)
              ?.floors.find((floor) => floor.id === activeDrag.floorId)
              ?.rooms.find((room) => room.id === activeDrag.roomId)
              ?.furniture.find((furniture) => furniture.id === activeDrag.furnitureId)

            if (!item) {
              return
            }

            item.x = activeDrag.startX + deltaX
            item.y = activeDrag.startY - deltaY
          })
        }}
        onPointerUp={(event) => {
          if (dragRef.current?.pointerId !== event.pointerId) {
            return
          }

          const completedDrag = dragRef.current
          endDrag(event.pointerId)

          if (completedDrag.kind === 'selection') {
            suppressCanvasClickRef.current = true
            setSelectionBox(null)

            if (completedDrag.moved && svgRef.current) {
              const rect = svgRef.current.getBoundingClientRect()
              const marqueeRect = getSelectionRect(
                completedDrag.clientX,
                completedDrag.clientY,
                completedDrag.currentClientX,
                completedDrag.currentClientY,
                rect,
              )
              const targets = selectableTargets
                .filter((item) => rectContainsRect(marqueeRect, item.rect))
                .map((item) => item.target)

              actions.setSelectionTargets(targets, {
                status:
                  targets.length > 0
                    ? `Box selected ${targets.length} canvas element${targets.length === 1 ? '' : 's'}.`
                    : 'No canvas elements were fully inside the selection box.',
              })
            }
            return
          }

          if (completedDrag.kind === 'room' && !completedDrag.moved) {
            actions.openRenameDialog('room', {
              structureId: completedDrag.structureId,
              floorId: completedDrag.floorId,
              roomId: completedDrag.roomId,
            })
          }

          if (completedDrag.kind === 'furniture' && !completedDrag.moved) {
            actions.openFurnitureDialog({
              structureId: completedDrag.structureId,
              floorId: completedDrag.floorId,
              roomId: completedDrag.roomId,
              furnitureId: completedDrag.furnitureId,
            })
          }
        }}
        onPointerCancel={(event) => {
          if (dragRef.current?.pointerId !== event.pointerId) {
            return
          }

          endDrag(event.pointerId)
        }}
        onLostPointerCapture={() => {
          dragRef.current = null
          setIsDragging(false)
          setSelectionBox(null)
        }}
      >
        <defs>
          <pattern
            id="minor-grid"
            width={GRID_MINOR_SIZE_FEET}
            height={GRID_MINOR_SIZE_FEET}
            patternUnits="userSpaceOnUse"
          >
            <path d={`M ${GRID_MINOR_SIZE_FEET} 0 L 0 0 0 ${GRID_MINOR_SIZE_FEET}`} className="grid-minor" fill="none" />
          </pattern>
          <pattern
            id="major-grid"
            width={GRID_MAJOR_SIZE_FEET}
            height={GRID_MAJOR_SIZE_FEET}
            patternUnits="userSpaceOnUse"
          >
            <rect fill="url(#minor-grid)" height={GRID_MAJOR_SIZE_FEET} width={GRID_MAJOR_SIZE_FEET} />
            <path d={`M ${GRID_MAJOR_SIZE_FEET} 0 L 0 0 0 ${GRID_MAJOR_SIZE_FEET}`} className="grid-major" fill="none" />
          </pattern>
        </defs>

        <rect
          className="canvas-underlay"
          data-testid="canvas-empty"
          x={viewBox.x}
          y={viewBox.y}
          width={viewBox.width}
          height={viewBox.height}
          onClick={() => {
            if (suppressCanvasClickRef.current) {
              suppressCanvasClickRef.current = false
              return
            }
            actions.clearSelectionTargets()
            actions.setFocusedTarget(canvasTarget)
          }}
          onContextMenu={(event) => openContextMenu(event, canvasTarget)}
          onPointerDown={(event) => {
            if (event.shiftKey) {
              actions.clearSelectionTargets()
              beginDrag(event, {
                kind: 'selection',
                pointerId: event.pointerId,
                clientX: event.clientX,
                clientY: event.clientY,
                currentClientX: event.clientX,
                currentClientY: event.clientY,
                moved: false,
              })
              setSelectionBox(getSelectionRect(event.clientX, event.clientY, event.clientX, event.clientY, event.currentTarget.getBoundingClientRect()))
              return
            }

            beginDrag(event, {
              kind: 'canvas',
              pointerId: event.pointerId,
              clientX: event.clientX,
              clientY: event.clientY,
              startOffsetX: ui.camera.offset.x,
              startOffsetY: ui.camera.offset.y,
              moved: false,
            })
            actions.setFocusedTarget(canvasTarget)
          }}
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
          <FloorLayer
            key={floor.id}
            activeFloorId={draft.activeFloorId}
            floor={floor}
            isFurnitureMode={draft.editorMode === 'furniture'}
          />
        ))}

        {suggestedPreviews.map((preview) => (
          <g key={preview.suggestion.id}>
            <SuggestedPath dataTestId={`suggested-path-${preview.suggestion.id}`} points={preview.points} />
            <line
              className="suggested-connector"
              x1={preview.anchorPoint.x}
              x2={preview.actionPoint.x}
              y1={-preview.anchorPoint.y}
              y2={-preview.actionPoint.y}
            />
            <circle
              className="suggested-connector-dot"
              cx={preview.actionPoint.x}
              cy={-preview.actionPoint.y}
              r={0.18}
            />
          </g>
        ))}

        {selectedRoom && selectedRoomGeometry
          ? selectedRoomGeometry.segments.map((segment) => {
              const target: CanvasTarget =
                activeStructure && activeFloor
                  ? {
                      kind: 'wall',
                      structureId: activeStructure.id,
                      floorId: activeFloor.id,
                      roomId: selectedRoom.id,
                      segmentId: segment.id,
                    }
                  : { kind: 'canvas' }

              return (
                <g key={segment.id}>
                  <line
                    className={[
                      'wall-hit',
                      matchesTarget(ui.hoveredTarget, target) ? 'hovered' : '',
                      isTargetSelected(ui.selectionTargets, target) ? 'selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    data-testid={`wall-hit-${segment.id}`}
                    stroke="transparent"
                    strokeWidth={1.2}
                    x1={segment.start.x}
                    x2={segment.end.x}
                    y1={-segment.start.y}
                    y2={-segment.end.y}
                    onClick={() => handleWallClick(target)}
                    onContextMenu={(event) => openContextMenu(event, target)}
                    onMouseEnter={() => actions.setHoveredTarget(target)}
                    onMouseLeave={() => actions.setHoveredTarget(null)}
                  />
                </g>
              )
            })
          : null}

        {selectedRoom && selectedRoomGeometry && activeStructure && activeFloor
          ? getRoomCorners(selectedRoom).map((corner) => {
              const target: CanvasTarget = {
                kind: 'corner',
                structureId: activeStructure.id,
                floorId: activeFloor.id,
                roomId: selectedRoom.id,
                segmentId: corner.segmentId,
              }
              const hovered = matchesTarget(ui.hoveredTarget, target)

              return (
                <circle
                  key={`${corner.segmentId}-hit`}
                  className={hovered ? 'corner-hit hovered' : 'corner-hit'}
                  cx={corner.point.x}
                  cy={-corner.point.y}
                  data-testid={`corner-hit-${corner.segmentId}`}
                  r={0.6}
                  onClick={() => handleCornerClick(target)}
                  onContextMenu={(event) => openContextMenu(event, target)}
                  onMouseEnter={() => actions.setHoveredTarget(target)}
                  onMouseLeave={() => actions.setHoveredTarget(null)}
                />
              )
            })
          : null}

        {selectedRoom && selectedRoomGeometry && activeStructure && activeFloor
          ? selectedRoomGeometry.segments.map((segment) => (
              <g
                key={`${segment.id}-anchor`}
                className="anchor-action"
                data-testid={`anchor-${segment.id}`}
                transform={`translate(${segment.end.x} ${-segment.end.y})`}
                onClick={(event) => {
                  event.stopPropagation()
                  actions.addWallFromAnchor(activeStructure.id, activeFloor.id, selectedRoom.id, segment.id)
                }}
              >
                <circle r={0.34} />
                <line x1={-0.14} x2={0.14} y1={0} y2={0} />
                <line x1={0} x2={0} y1={-0.14} y2={0.14} />
              </g>
            ))
          : null}
      </svg>

      {selectionBox ? (
        <div
          className="canvas-selection-box"
          data-testid="canvas-selection-box"
          style={{
            left: `${selectionBox.minX}px`,
            top: `${selectionBox.minY}px`,
            width: `${selectionBox.maxX - selectionBox.minX}px`,
            height: `${selectionBox.maxY - selectionBox.minY}px`,
          }}
        />
      ) : null}

      {hoveredCornerOverlay ? (
        <div className="canvas-hover-layer" data-testid={`corner-hover-overlay-${hoveredCornerOverlay.target.segmentId}`}>
          <div
            className="canvas-corner-hover-marker"
            style={{
              left: `${hoveredCornerOverlay.point.x}px`,
              top: `${hoveredCornerOverlay.point.y}px`,
            }}
          >
            <span />
            <span />
          </div>
          <div
            className="canvas-corner-hover-label"
            style={{
              left: `${hoveredCornerOverlay.labelPoint.x}px`,
              top: `${hoveredCornerOverlay.labelPoint.y}px`,
            }}
          >
            {hoveredCornerOverlay.text}
          </div>
        </div>
      ) : null}

      {activeStructure ? (
        <button
          className={
            ui.hoveredTarget?.kind === 'structure' ? 'canvas-structure-chip hovered' : 'canvas-structure-chip'
          }
          data-testid="structure-badge"
          onClick={() => actions.openRenameDialog('structure', { structureId: activeStructure.id })}
          onContextMenu={(event) =>
            openContextMenu(event, {
              kind: 'structure',
              structureId: activeStructure.id,
            })
          }
          onMouseEnter={() =>
            actions.setHoveredTarget({
              kind: 'structure',
              structureId: activeStructure.id,
            })
          }
          onMouseLeave={() => actions.setHoveredTarget(null)}
          type="button"
        >
          <span className="canvas-structure-chip__label">Structure</span>
          <strong>{activeStructure.name}</strong>
        </button>
      ) : null}

      <div aria-label="Canvas view controls" className="canvas-toolbar">
        <div className="canvas-toolbar-row">
          <p className="canvas-toolbar-kicker">View</p>
          <button
            className="ghost-button small"
            onClick={() =>
              actions.setCamera({
                zoom: ui.camera.zoom / BUTTON_ZOOM_MULTIPLIER,
                offset: ui.camera.offset,
              })
            }
            type="button"
          >
            -
          </button>
          <span className="toolbar-pill">{Math.round(ui.camera.zoom * 100)}%</span>
          <button
            className="ghost-button small"
            onClick={() =>
              actions.setCamera({
                zoom: ui.camera.zoom * BUTTON_ZOOM_MULTIPLIER,
                offset: ui.camera.offset,
              })
            }
            type="button"
          >
            +
          </button>
          <button className="ghost-button small" onClick={() => actions.resetCamera()} type="button">
            Fit
          </button>
        </div>
        <div className="canvas-toolbar-row canvas-toolbar-row--toggles">
          <label className="toggle">
            <input checked={draft.showGrid} type="checkbox" onChange={(event) => actions.toggleGrid(event.target.checked)} />
            <span>Grid</span>
          </label>
          <label className="toggle">
            <input
              checked={draft.showInferred}
              type="checkbox"
              onChange={(event) => actions.toggleInferred(event.target.checked)}
            />
            <span>Inference</span>
          </label>
          <label className="toggle">
            <input
              checked={draft.showRoomFloorLabels}
              type="checkbox"
              onChange={(event) => actions.toggleRoomFloorLabels(event.target.checked)}
            />
            <span>Room/Floor</span>
          </label>
          <label className="toggle">
            <input
              checked={draft.showWallLabels}
              type="checkbox"
              onChange={(event) => actions.toggleWallLabels(event.target.checked)}
            />
            <span>Distances</span>
          </label>
          <label className="toggle">
            <input
              checked={draft.showAngleLabels}
              type="checkbox"
              onChange={(event) => actions.toggleAngleLabels(event.target.checked)}
            />
            <span>Angles</span>
          </label>
        </div>
      </div>

      <div aria-label="Canvas legend" className="canvas-key">
        <div className="canvas-key__item">
          <span className="canvas-key__line" />
          <span>Wall</span>
        </div>
        <div className="canvas-key__item">
          <span className="canvas-key__line canvas-key__line--preview" />
          <span>Suggested wall preview</span>
        </div>
        <div className="canvas-key__item" data-testid="canvas-grid-scale">
          <span className="canvas-key__square" />
          <span>{`Grid ${formatFeet(GRID_MINOR_SIZE_FEET)} square`}</span>
        </div>
        <p className="canvas-key__note">{`Bold line every ${formatFeet(GRID_MAJOR_SIZE_FEET)}`}</p>
      </div>

      {placedAnnotations.length > 0 ? (
        <div className="canvas-annotation-layer">
          {placedAnnotations.map((annotation) => {
            const hovered = matchesTarget(ui.hoveredTarget, annotation.target)
            const active =
              (annotation.kind === 'floor' && annotation.target.kind === 'floor' && annotation.target.floorId === draft.activeFloorId) ||
              (annotation.kind === 'room' && annotation.target.kind === 'room' && annotation.target.roomId === draft.selectedRoomId) ||
              (annotation.kind === 'furniture' &&
                annotation.target.kind === 'furniture' &&
                annotation.target.furnitureId === draft.selectedFurnitureId)
            const multiSelected = isTargetSelected(ui.selectionTargets, annotation.target)
            const className = [
              'canvas-annotation',
              `canvas-annotation--${annotation.kind}`,
              hovered ? 'hovered' : '',
              active || multiSelected ? 'active' : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              annotation.kind === 'wall' && annotation.target.kind === 'wall' ? (
                (() => {
                  const wallTarget = annotation.target
                  const editing = inlineWallEditor?.segmentId === wallTarget.segmentId
                  const invalid = editing && Boolean(inlineWallEditor?.error)

                  return (
                    <div
                      className={[className, 'canvas-wall-chip', editing ? 'editing' : '', invalid ? 'invalid' : '']
                        .filter(Boolean)
                        .join(' ')}
                      key={`${annotation.kind}-${annotation.id}`}
                      onContextMenu={(event) => openContextMenu(event, wallTarget)}
                      onMouseEnter={() => actions.setHoveredTarget(wallTarget)}
                      onMouseLeave={() => actions.setHoveredTarget(null)}
                      style={{
                        left: `${annotation.position.x}px`,
                        top: `${annotation.position.y}px`,
                        minWidth: `${annotation.widthPx}px`,
                      }}
                    >
                      {editing ? (
                        <input
                          ref={inlineWallInputRef}
                          aria-label="Wall length"
                          className="canvas-wall-chip__input"
                          data-testid={`wall-label-${annotation.id}`}
                          inputMode="decimal"
                          type="text"
                          value={inlineWallEditor?.value ?? ''}
                          onBlur={(event) => commitInlineWallEdit(event.currentTarget.value)}
                          onChange={(event) =>
                            setInlineWallEditor((current) =>
                              current && current.segmentId === wallTarget.segmentId
                                ? {
                                    segmentId: current.segmentId,
                                    value: event.target.value,
                                    error: null,
                                  }
                                : current,
                            )
                          }
                          onKeyDown={handleInlineWallInputKeyDown}
                        />
                      ) : (
                        <button
                          className="canvas-wall-chip__value"
                          data-testid={`wall-label-${annotation.id}`}
                          onClick={() => startInlineWallEdit(wallTarget)}
                          type="button"
                        >
                          {annotation.text}
                        </button>
                      )}
                      <button
                        aria-label="Open full wall editor"
                        className="canvas-wall-chip__menu"
                        data-testid={`wall-menu-${annotation.id}`}
                        onClick={() => openFullWallEditor(wallTarget)}
                        type="button"
                      >
                        <span className="canvas-wall-chip__menu-icon" aria-hidden="true">
                          <span />
                          <span />
                          <span />
                        </span>
                      </button>
                    </div>
                  )
                })()
              ) : (
                <button
                  className={className}
                  data-testid={`${annotation.kind}-label-${annotation.id}`}
                  key={`${annotation.kind}-${annotation.id}`}
                  onClick={() => handleAnnotationClick(annotation)}
                  onContextMenu={(event) => openContextMenu(event, annotation.target)}
                  onMouseEnter={() => actions.setHoveredTarget(annotation.target)}
                  onMouseLeave={() => actions.setHoveredTarget(null)}
                  onPointerDown={(event) => beginAnnotationDrag(event, annotation)}
                  style={{
                    left: `${annotation.position.x}px`,
                    top: `${annotation.position.y}px`,
                    minWidth: `${annotation.widthPx}px`,
                  }}
                  tabIndex={-1}
                  type="button"
                >
                  {annotation.text}
                </button>
              )
            )
          })}
        </div>
      ) : null}

      {suggestedPreviews.length > 0 ? (
        <div aria-label="Canvas inference suggestions" className="canvas-suggestion-layer">
          {suggestedPreviews.map((preview) => {
            const position = toCanvasPercentages(preview.actionPoint, viewBox)

            return (
              <div
                className="canvas-suggestion-actions"
                data-testid={`canvas-suggestion-actions-${preview.suggestion.id}`}
                key={`actions-${preview.suggestion.id}`}
                style={{ left: `${position.left}%`, top: `${position.top}%` }}
              >
                <button
                  aria-label="Accept inferred wall"
                  className="canvas-suggestion-action canvas-suggestion-action--accept"
                  data-testid={`canvas-suggestion-accept-${preview.suggestion.id}`}
                  onClick={() => actions.applySuggestion(preview.suggestion)}
                  type="button"
                >
                  ✓
                </button>
                <button
                  aria-label="Dismiss inferred wall"
                  className="canvas-suggestion-action canvas-suggestion-action--dismiss"
                  data-testid={`canvas-suggestion-dismiss-${preview.suggestion.id}`}
                  onClick={() => actions.dismissSuggestion(preview.suggestion.id)}
                  type="button"
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )

  function openContextMenu(event: ReactMouseEvent<Element>, target: CanvasTarget) {
    event.preventDefault()
    actions.selectTarget(target)
    actions.openContextMenu({
      x: event.clientX,
      y: event.clientY,
      target,
    })
  }

  function handleWallClick(target: CanvasTarget) {
    if (target.kind !== 'wall') {
      return
    }

    actions.selectTarget(target)
    setInlineWallEditor(null)
    actions.openWallDialog({
      structureId: target.structureId,
      floorId: target.floorId,
      roomId: target.roomId,
      segmentId: target.segmentId,
    })
  }

  function handleCornerClick(target: CanvasTarget) {
    if (target.kind !== 'corner') {
      return
    }

    actions.selectTarget(target)
    actions.openCornerDialog({
      structureId: target.structureId,
      floorId: target.floorId,
      roomId: target.roomId,
      segmentId: target.segmentId,
    })
  }

  function handleAnnotationClick(annotation: PlacedCanvasAnnotation) {
    switch (annotation.target.kind) {
      case 'floor':
        actions.selectFloor(annotation.target.structureId, annotation.target.floorId)
        return
      case 'room':
        actions.selectRoom(annotation.target.structureId, annotation.target.floorId, annotation.target.roomId)
        actions.openRenameDialog('room', {
          structureId: annotation.target.structureId,
          floorId: annotation.target.floorId,
          roomId: annotation.target.roomId,
        })
        return
      case 'furniture':
        actions.selectFurniture(
          annotation.target.structureId,
          annotation.target.floorId,
          annotation.target.roomId,
          annotation.target.furnitureId,
        )
        actions.openFurnitureDialog({
          structureId: annotation.target.structureId,
          floorId: annotation.target.floorId,
          roomId: annotation.target.roomId,
          furnitureId: annotation.target.furnitureId,
        })
        return
      case 'wall':
        handleWallClick(annotation.target)
        return
      case 'corner':
        handleCornerClick(annotation.target)
        return
      default:
        return
    }
  }

  function startInlineWallEdit(target: CanvasTarget) {
    if (target.kind !== 'wall') {
      return
    }

    const segment = findSegmentById(draft, target.structureId, target.floorId, target.roomId, target.segmentId)

    if (!segment) {
      return
    }

    actions.selectTarget(target)
    setInlineWallEditor({
      segmentId: target.segmentId,
      value: formatEditableLength(segment.length),
      error: null,
    })
  }

  function openFullWallEditor(target: CanvasTarget) {
    if (target.kind !== 'wall') {
      return
    }

    setInlineWallEditor(null)
    handleWallClick(target)
  }

  function commitInlineWallEdit(nextValue?: string) {
    if (!inlineWallEditor) {
      return
    }

    const target =
      ui.selectionTargets.find(
        (item): item is Extract<CanvasTarget, { kind: 'wall' }> =>
          item.kind === 'wall' && item.segmentId === inlineWallEditor.segmentId,
      ) ??
      (ui.focusedTarget?.kind === 'wall' && ui.focusedTarget.segmentId === inlineWallEditor.segmentId
        ? ui.focusedTarget
        : null)

    if (!target) {
      setInlineWallEditor(null)
      return
    }

    const segment = findSegmentById(draft, target.structureId, target.floorId, target.roomId, target.segmentId)

    if (!segment) {
      setInlineWallEditor(null)
      return
    }

    const value = nextValue ?? inlineWallEditor.value
    const nextLength = parseDistanceInput(value)

    if (nextLength === null || nextLength <= 0) {
      const error = 'Enter a distance in feet, or feet and inches such as 10\'6".'
      setInlineWallEditor((current) =>
        current && current.segmentId === inlineWallEditor.segmentId
          ? {
              ...current,
              error,
            }
          : current,
      )
      actions.setStatus(error)
      return
    }

    const result = actions.updateWall(
      {
        structureId: target.structureId,
        floorId: target.floorId,
        roomId: target.roomId,
        segmentId: target.segmentId,
      },
      {
        label: segment.label,
        length: nextLength,
        notes: segment.notes,
      },
    )

    if (!result.valid) {
      setInlineWallEditor((current) =>
        current && current.segmentId === inlineWallEditor.segmentId
          ? {
              ...current,
              error: result.error,
            }
          : current,
      )
      if (result.error) {
        actions.setStatus(result.error)
      }
      return
    }

    setInlineWallEditor(null)
  }

  function handleInlineWallInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitInlineWallEdit(event.currentTarget.value)
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setInlineWallEditor(null)
    }
  }

  function beginAnnotationDrag(event: ReactPointerEvent<HTMLButtonElement>, annotation: PlacedCanvasAnnotation) {
    const target = annotation.target

    if (target.kind === 'room') {
      const room = visibleFloors
        .find((floor) => floor.id === target.floorId)
        ?.rooms.find((item) => item.id === target.roomId)

      if (!room) {
        return
      }

      actions.selectRoom(target.structureId, target.floorId, target.roomId)
      beginDrag(event, {
        kind: 'room',
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        structureId: target.structureId,
        floorId: target.floorId,
        roomId: target.roomId,
        startX: room.anchor.x,
        startY: room.anchor.y,
        moved: false,
      })
      return
    }

    if (target.kind === 'furniture') {
      const item = visibleFloors
        .find((floor) => floor.id === target.floorId)
        ?.rooms.find((room) => room.id === target.roomId)
        ?.furniture.find((furniture) => furniture.id === target.furnitureId)

      if (!item) {
        return
      }

      actions.selectFurniture(target.structureId, target.floorId, target.roomId, target.furnitureId)
      beginDrag(event, {
        kind: 'furniture',
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        structureId: target.structureId,
        floorId: target.floorId,
        roomId: target.roomId,
        furnitureId: target.furnitureId,
        startX: item.x,
        startY: item.y,
        moved: false,
      })
    }
  }

  function beginDrag(
    event: ReactPointerEvent<Element>,
    dragState: Exclude<DragState, null>,
  ) {
    if (event.button !== 0 || !svgRef.current) {
      return
    }

    svgRef.current.setPointerCapture?.(event.pointerId)
    dragRef.current = dragState
    setIsDragging(true)
  }

  function endDrag(pointerId: number) {
    if (svgRef.current?.hasPointerCapture?.(pointerId)) {
      svgRef.current.releasePointerCapture(pointerId)
    }

    dragRef.current = null
    setIsDragging(false)
  }

  function FloorLayer({
    floor,
    activeFloorId,
    isFurnitureMode,
  }: {
    floor: Floor
    activeFloorId: string
    isFurnitureMode: boolean
  }) {
    const isGhostFloor = draft.editorMode === 'stacked' && floor.id !== activeFloorId

    return (
      <g className={isGhostFloor ? 'floor-layer ghost' : 'floor-layer'}>
        {floor.rooms.map((room) => (
          <RoomLayer key={room.id} floor={floor} isFurnitureMode={isFurnitureMode} room={room} />
        ))}
      </g>
    )
  }

  function RoomLayer({
    floor,
    room,
    isFurnitureMode,
  }: {
    floor: Floor
    room: Room
    isFurnitureMode: boolean
  }) {
    if (!activeStructure) {
      return null
    }

    const geometry = roomToGeometry(room)
    const path = pointsToPath(geometry.closed ? geometry.points.slice(0, -1) : geometry.points)
    const roomTarget: CanvasTarget = {
      kind: 'room',
      structureId: activeStructure.id,
      floorId: floor.id,
      roomId: room.id,
    }
    const active = draft.selectedRoomId === room.id
    const hovered = matchesTarget(ui.hoveredTarget, roomTarget)
    const multiSelected = isTargetSelected(ui.selectionTargets, roomTarget)

    const roomHandlers = {
      onPointerDown: (event: ReactPointerEvent<SVGPathElement>) => {
        actions.selectRoom(activeStructure.id, floor.id, room.id)
        beginDrag(event, {
          kind: 'room',
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          structureId: activeStructure.id,
          floorId: floor.id,
          roomId: room.id,
          startX: room.anchor.x,
          startY: room.anchor.y,
          moved: false,
        })
      },
      onClick: () => {
        actions.selectRoom(activeStructure.id, floor.id, room.id)
        actions.openRenameDialog('room', {
          structureId: activeStructure.id,
          floorId: floor.id,
          roomId: room.id,
        })
      },
      onContextMenu: (event: ReactMouseEvent<SVGPathElement>) => openContextMenu(event, roomTarget),
      onMouseEnter: () => actions.setHoveredTarget(roomTarget),
      onMouseLeave: () => actions.setHoveredTarget(null),
    }

    return (
      <g className={active || multiSelected ? 'room-layer active' : 'room-layer'}>
        {geometry.closed ? (
          <path
            className={['room-fill', hovered ? 'hovered' : '', multiSelected ? 'selected' : ''].filter(Boolean).join(' ')}
            d={`${path} Z`}
            data-testid={`room-fill-${room.id}`}
            fill="#ffffff"
            fillOpacity={active || multiSelected ? 0.16 : 0.06}
            stroke="none"
            {...roomHandlers}
          />
        ) : (
          <path
            className={['room-stroke', 'open', hovered ? 'hovered' : '', multiSelected ? 'selected' : ''].filter(Boolean).join(' ')}
            d={path}
            data-testid={`room-stroke-${room.id}`}
            fill="none"
            stroke="transparent"
            strokeWidth={0.92}
            {...roomHandlers}
          />
        )}

        {geometry.segments.map((segment) => (
          <line
            key={segment.id}
            className={[
              'room-segment',
              hovered ? 'hovered' : '',
              active || multiSelected ? 'active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            data-testid={`room-segment-${segment.id}`}
            x1={segment.start.x}
            x2={segment.end.x}
            y1={-segment.start.y}
            y2={-segment.end.y}
          />
        ))}

        {isFurnitureMode
          ? room.furniture.map((item) => {
              const furnitureTarget: CanvasTarget = {
                kind: 'furniture',
                structureId: activeStructure.id,
                floorId: floor.id,
                roomId: room.id,
                furnitureId: item.id,
              }
              const furnitureHovered = matchesTarget(ui.hoveredTarget, furnitureTarget)
              const furnitureSelected = isTargetSelected(ui.selectionTargets, furnitureTarget)
              const centerX = item.x + item.width / 2
              const centerY = item.y - item.depth / 2

              return (
                <g
                  key={item.id}
                  className={draft.selectedFurnitureId === item.id || furnitureSelected ? 'furniture-layer active' : 'furniture-layer'}
                  transform={`rotate(${-item.rotation} ${centerX} ${-centerY})`}
                >
                  <rect
                    className={['furniture-rect', furnitureHovered ? 'hovered' : '', furnitureSelected ? 'selected' : ''].filter(Boolean).join(' ')}
                    data-testid={`furniture-${item.id}`}
                    x={item.x}
                    y={-(item.y)}
                    width={item.width}
                    height={item.depth}
                    transform={`translate(0 ${-item.depth})`}
                    onPointerDown={(event) => {
                      actions.selectFurniture(activeStructure.id, floor.id, room.id, item.id)
                      beginDrag(event, {
                        kind: 'furniture',
                        pointerId: event.pointerId,
                        clientX: event.clientX,
                        clientY: event.clientY,
                        structureId: activeStructure.id,
                        floorId: floor.id,
                        roomId: room.id,
                        furnitureId: item.id,
                        startX: item.x,
                        startY: item.y,
                        moved: false,
                      })
                    }}
                    onClick={() => {
                      actions.selectFurniture(activeStructure.id, floor.id, room.id, item.id)
                      actions.openFurnitureDialog({
                        structureId: activeStructure.id,
                        floorId: floor.id,
                        roomId: room.id,
                        furnitureId: item.id,
                      })
                    }}
                    onContextMenu={(event) => openContextMenu(event, furnitureTarget)}
                    onMouseEnter={() => actions.setHoveredTarget(furnitureTarget)}
                    onMouseLeave={() => actions.setHoveredTarget(null)}
                  />
                </g>
              )
            })
          : null}
      </g>
    )
  }

  function SuggestedPath({
    dataTestId,
    points,
  }: {
    dataTestId: string
    points: Point[]
  }) {
    if (points.length <= 1) {
      return null
    }

    return <path className="suggested-path" d={pointsToPath(points)} data-testid={dataTestId} />
  }
}

function matchesTarget(left: CanvasTarget | null, right: CanvasTarget | null) {
  if (!left || !right || left.kind !== right.kind) {
    return false
  }

  return JSON.stringify(left) === JSON.stringify(right)
}

function isTargetSelected(targets: CanvasTarget[], target: CanvasTarget) {
  return targets.some((item) => matchesTarget(item, target))
}

function getSelectionRect(startClientX: number, startClientY: number, endClientX: number, endClientY: number, bounds: DOMRect | Pick<DOMRect, 'left' | 'top'>) {
  const startX = startClientX - bounds.left
  const startY = startClientY - bounds.top
  const endX = endClientX - bounds.left
  const endY = endClientY - bounds.top

  return {
    minX: Math.min(startX, endX),
    maxX: Math.max(startX, endX),
    minY: Math.min(startY, endY),
    maxY: Math.max(startY, endY),
  }
}

function rectContainsRect(outer: CanvasRect, inner: CanvasRect) {
  return (
    inner.minX >= outer.minX &&
    inner.maxX <= outer.maxX &&
    inner.minY >= outer.minY &&
    inner.maxY <= outer.maxY
  )
}

function buildSelectableCanvasTargets({
  activeStructureId,
  activeFloorId,
  visibleFloors,
  selectedRoomGeometry,
  selectedRoomId,
  viewBox,
  canvasMetrics,
  showFurniture,
}: {
  activeStructureId?: string
  activeFloorId: string
  visibleFloors: Floor[]
  selectedRoomGeometry: ReturnType<typeof roomToGeometry> | null
  selectedRoomId: string | null
  viewBox: { x: number; y: number; width: number; height: number }
  canvasMetrics: CanvasMetrics
  showFurniture: boolean
}): SelectableCanvasTarget[] {
  if (!activeStructureId) {
    return []
  }

  const targets: SelectableCanvasTarget[] = []

  visibleFloors.forEach((floor) => {
    floor.rooms.forEach((room) => {
      const geometry = roomToGeometry(room)
      targets.push({
        target: {
          kind: 'room',
          structureId: activeStructureId,
          floorId: floor.id,
          roomId: room.id,
        },
        rect: getScreenRectFromWorldBounds(geometry.bounds, viewBox, canvasMetrics),
      })

      if (!showFurniture) {
        return
      }

      room.furniture.forEach((item) => {
        targets.push({
          target: {
            kind: 'furniture',
            structureId: activeStructureId,
            floorId: floor.id,
            roomId: room.id,
            furnitureId: item.id,
          },
          rect: getScreenRectFromWorldBounds(
            {
              minX: item.x,
              maxX: item.x + item.width,
              minY: item.y - item.depth,
              maxY: item.y,
            },
            viewBox,
            canvasMetrics,
          ),
        })
      })
    })
  })

  if (selectedRoomGeometry && selectedRoomId) {
    selectedRoomGeometry.segments.forEach((segment) => {
      const start = worldToScreenPoint(segment.start, viewBox, canvasMetrics)
      const end = worldToScreenPoint(segment.end, viewBox, canvasMetrics)
      targets.push({
        target: {
          kind: 'wall',
          structureId: activeStructureId,
          floorId: activeFloorId,
          roomId: selectedRoomId,
          segmentId: segment.id,
        },
        rect: expandRect(
          {
            minX: Math.min(start.x, end.x),
            maxX: Math.max(start.x, end.x),
            minY: Math.min(start.y, end.y),
            maxY: Math.max(start.y, end.y),
          },
          8,
          8,
        ),
      })
    })
  }

  return targets
}

function hasSuggestedSegments(
  suggestion: RoomSuggestion,
): suggestion is RoomSuggestion & { segmentsToAdd: SuggestionSegment[] } {
  return Array.isArray(suggestion.segmentsToAdd) && suggestion.segmentsToAdd.length > 0
}

function buildSuggestionPreview(room: Room, suggestion: RoomSuggestion & { segmentsToAdd: SuggestionSegment[] }) {
  const geometry = roomToGeometry(room)
  const points = [geometry.endPoint]
  let heading = geometry.exitHeading
  let cursor = geometry.endPoint
  let anchorSegment:
    | {
        start: Point
        end: Point
        heading: number
        length: number
      }
    | undefined

  suggestion.segmentsToAdd.forEach((segment) => {
    const next = addPolar(cursor, segment.length, heading)
    points.push(next)

    if (!anchorSegment || segment.length >= anchorSegment.length) {
      anchorSegment = {
        start: cursor,
        end: next,
        heading,
        length: segment.length,
      }
    }

    cursor = next
    heading = normalizeAngle(heading + segment.turn)
  })

  const referenceSegment = anchorSegment ?? {
    start: geometry.endPoint,
    end: geometry.endPoint,
    heading: geometry.exitHeading,
    length: 0,
  }

  return {
    suggestion,
    points,
    anchorPoint: midpoint(referenceSegment.start, referenceSegment.end),
    heading: referenceSegment.heading,
    length: referenceSegment.length,
  }
}

function toCanvasPercentages(point: Point, viewBox: { x: number; y: number; width: number; height: number }) {
  const svgY = -point.y

  return {
    left: ((point.x - viewBox.x) / viewBox.width) * 100,
    top: ((svgY - viewBox.y) / viewBox.height) * 100,
  }
}

function getCanvasMetrics(viewBox: { width: number; height: number }, canvasSize: { width: number; height: number }): CanvasMetrics {
  const widthPx = canvasSize.width > 32 ? canvasSize.width : 960
  const heightPx = canvasSize.height > 32 ? canvasSize.height : 720

  return {
    widthPx,
    heightPx,
    unitX: viewBox.width / widthPx,
    unitY: viewBox.height / heightPx,
  }
}

function getCanvasToolbarRect(
  viewBox: { x: number; y: number; width: number; height: number },
  metrics: CanvasMetrics,
) {
  const right = 16 * metrics.unitX
  const top = 16 * metrics.unitY
  const width = Math.min(352, Math.max(250, metrics.widthPx * 0.34)) * metrics.unitX
  const height = (metrics.widthPx < 760 ? 102 : 62) * metrics.unitY
  const maxX = viewBox.x + viewBox.width - right
  const minY = viewBox.y + top

  return {
    minX: maxX - width,
    maxX,
    minY,
    maxY: minY + height,
  }
}

function getCanvasStructureChipRect(
  viewBox: { x: number; y: number; width: number; height: number },
  metrics: CanvasMetrics,
) {
  const left = 16 * metrics.unitX
  const top = 16 * metrics.unitY
  const width = Math.min(280, Math.max(188, metrics.widthPx * 0.27)) * metrics.unitX
  const height = 58 * metrics.unitY

  return makeRectFromTopLeft(viewBox.x + left, viewBox.y + top, width, height)
}

function getCanvasLegendRect(
  viewBox: { x: number; y: number; width: number; height: number },
  metrics: CanvasMetrics,
) {
  const left = 16 * metrics.unitX
  const bottom = 16 * metrics.unitY
  const width = Math.min(248, Math.max(176, metrics.widthPx * 0.22)) * metrics.unitX
  const height = 56 * metrics.unitY
  const maxY = viewBox.y + viewBox.height - bottom

  return {
    minX: viewBox.x + left,
    maxX: viewBox.x + left + width,
    minY: maxY - height,
    maxY,
  }
}

function makeRectFromTopLeft(x: number, y: number, width: number, height: number): CanvasRect {
  return {
    minX: x,
    maxX: x + width,
    minY: y,
    maxY: y + height,
  }
}

function makeCenteredRect(x: number, y: number, width: number, height: number): CanvasRect {
  return {
    minX: x - width / 2,
    maxX: x + width / 2,
    minY: y - height / 2,
    maxY: y + height / 2,
  }
}

function expandRect(rect: CanvasRect, paddingX: number, paddingY: number) {
  return {
    minX: rect.minX - paddingX,
    maxX: rect.maxX + paddingX,
    minY: rect.minY - paddingY,
    maxY: rect.maxY + paddingY,
  }
}

function rectsIntersect(left: CanvasRect, right: CanvasRect) {
  return left.minX < right.maxX && left.maxX > right.minX && left.minY < right.maxY && left.maxY > right.minY
}

function overlapArea(left: CanvasRect, right: CanvasRect) {
  if (!rectsIntersect(left, right)) {
    return 0
  }

  return (
    Math.min(left.maxX, right.maxX) - Math.max(left.minX, right.minX)
  ) * (
    Math.min(left.maxY, right.maxY) - Math.max(left.minY, right.minY)
  )
}

function estimateSuggestionActionRect(point: Point, metrics: CanvasMetrics) {
  const widthPx = 82
  const heightPx = 34

  return makeCenteredRect(point.x, -point.y, widthPx * metrics.unitX, heightPx * metrics.unitY)
}

function clampSuggestionActionPoint(
  point: Point,
  viewBox: { x: number; y: number; width: number; height: number },
  metrics: CanvasMetrics,
) {
  const rect = estimateSuggestionActionRect(point, metrics)
  const marginX = Math.max(metrics.unitX * 12, viewBox.width * 0.02)
  const marginY = Math.max(metrics.unitY * 12, viewBox.height * 0.02)
  const x = clamp(point.x, viewBox.x + marginX + (rect.maxX - rect.minX) / 2, viewBox.x + viewBox.width - marginX - (rect.maxX - rect.minX) / 2)
  const svgY = clamp(-point.y, viewBox.y + marginY + (rect.maxY - rect.minY) / 2, viewBox.y + viewBox.height - marginY - (rect.maxY - rect.minY) / 2)

  return {
    x,
    y: -svgY,
  }
}

function placeSuggestionPreviews(
  previews: SuggestionPreview[],
  viewBox: { x: number; y: number; width: number; height: number },
  metrics: CanvasMetrics,
  reservedRects: CanvasRect[],
): PlacedSuggestionPreview[] {
  const occupied = [...reservedRects]

  return previews.map((preview, index) => {
    const distance = Math.max(preview.length * 0.35, 3.4)
    const candidateAngles = [90, -90, 50, -50, 0, 180]
    const candidates = candidateAngles.map((offset, offsetIndex) => {
      const spread = index > 0 ? index * 1.4 : 0
      const basePoint = addPolar(preview.anchorPoint, distance + spread, preview.heading + offset)
      const driftedPoint = offsetIndex >= 2 ? addPolar(basePoint, spread, preview.heading) : basePoint
      const actionPoint = clampSuggestionActionPoint(driftedPoint, viewBox, metrics)
      const actionRect = estimateSuggestionActionRect(actionPoint, metrics)

      return {
        actionPoint,
        actionRect,
        overlap: occupied.reduce((sum, rect) => sum + overlapArea(actionRect, rect), 0),
      }
    })

    const selectedCandidate =
      candidates.find((candidate) => candidate.overlap === 0) ??
      candidates.reduce((best, candidate) => (candidate.overlap < best.overlap ? candidate : best))

    occupied.push(expandRect(selectedCandidate.actionRect, metrics.unitX * 18, metrics.unitY * 18))

    return {
      ...preview,
      actionPoint: selectedCandidate.actionPoint,
      actionRect: selectedCandidate.actionRect,
    }
  })
}

function countGraphemes(text: string) {
  return Array.from(text).length
}

function svgToScreenPoint(
  point: { x: number; y: number },
  viewBox: { x: number; y: number; width: number; height: number },
  metrics: CanvasMetrics,
): ScreenPoint {
  return {
    x: ((point.x - viewBox.x) / viewBox.width) * metrics.widthPx,
    y: ((point.y - viewBox.y) / viewBox.height) * metrics.heightPx,
  }
}

function worldToScreenPoint(
  point: Point,
  viewBox: { x: number; y: number; width: number; height: number },
  metrics: CanvasMetrics,
): ScreenPoint {
  return svgToScreenPoint({ x: point.x, y: -point.y }, viewBox, metrics)
}

function getScreenRectFromWorldBounds(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  viewBox: { x: number; y: number; width: number; height: number },
  metrics: CanvasMetrics,
) {
  const topLeft = worldToScreenPoint({ x: bounds.minX, y: bounds.maxY }, viewBox, metrics)
  const bottomRight = worldToScreenPoint({ x: bounds.maxX, y: bounds.minY }, viewBox, metrics)

  return {
    minX: Math.min(topLeft.x, bottomRight.x),
    maxX: Math.max(topLeft.x, bottomRight.x),
    minY: Math.min(topLeft.y, bottomRight.y),
    maxY: Math.max(topLeft.y, bottomRight.y),
  }
}

function svgRectToScreenRect(
  rect: CanvasRect,
  viewBox: { x: number; y: number; width: number; height: number },
  metrics: CanvasMetrics,
) {
  const topLeft = svgToScreenPoint({ x: rect.minX, y: rect.minY }, viewBox, metrics)
  const bottomRight = svgToScreenPoint({ x: rect.maxX, y: rect.maxY }, viewBox, metrics)

  return {
    minX: topLeft.x,
    maxX: bottomRight.x,
    minY: topLeft.y,
    maxY: bottomRight.y,
  }
}

function clampRectWithinBounds(rect: CanvasRect, bounds: CanvasRect) {
  let deltaX = 0
  let deltaY = 0

  if (rect.minX < bounds.minX) {
    deltaX = bounds.minX - rect.minX
  } else if (rect.maxX > bounds.maxX) {
    deltaX = bounds.maxX - rect.maxX
  }

  if (rect.minY < bounds.minY) {
    deltaY = bounds.minY - rect.minY
  } else if (rect.maxY > bounds.maxY) {
    deltaY = bounds.maxY - rect.maxY
  }

  return {
    minX: rect.minX + deltaX,
    maxX: rect.maxX + deltaX,
    minY: rect.minY + deltaY,
    maxY: rect.maxY + deltaY,
  }
}

function isPointNearRect(point: ScreenPoint, rect: CanvasRect, margin: number) {
  return (
    point.x >= rect.minX - margin &&
    point.x <= rect.maxX + margin &&
    point.y >= rect.minY - margin &&
    point.y <= rect.maxY + margin
  )
}

function createAnnotationRect(anchor: ScreenPoint, widthPx: number, heightPx: number) {
  return makeCenteredRect(anchor.x, anchor.y, widthPx, heightPx)
}

function estimateAnnotationSize(kind: AnnotationKind, text: string) {
  const characters = countGraphemes(text)

  switch (kind) {
    case 'floor':
      return {
        widthPx: Math.min(220, Math.max(92, characters * 8.2 + 24)),
        heightPx: 26,
      }
    case 'room':
      return {
        widthPx: Math.min(260, Math.max(92, characters * 9.1 + 28)),
        heightPx: 30,
      }
    case 'furniture':
      return {
        widthPx: Math.min(212, Math.max(78, characters * 8 + 24)),
        heightPx: 26,
      }
    case 'wall':
      return {
        widthPx: Math.min(172, Math.max(108, characters * 8.1 + 58)),
        heightPx: 28,
      }
    case 'corner':
      return {
        widthPx: Math.min(104, Math.max(62, characters * 7.6 + 20)),
        heightPx: 26,
      }
  }
}

function formatEditableLength(value: number) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
}

function buildWallAnnotationOffsets(start: ScreenPoint, end: ScreenPoint): ScreenPoint[] {
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const length = Math.max(Math.hypot(deltaX, deltaY), 1)
  const tangent = { x: deltaX / length, y: deltaY / length }
  const normal = { x: -deltaY / length, y: deltaX / length }

  return [
    { x: normal.x * 22, y: normal.y * 22 },
    { x: -normal.x * 22, y: -normal.y * 22 },
    { x: normal.x * 34 + tangent.x * 14, y: normal.y * 34 + tangent.y * 14 },
    { x: -normal.x * 34 + tangent.x * 14, y: -normal.y * 34 + tangent.y * 14 },
    { x: normal.x * 34 - tangent.x * 14, y: normal.y * 34 - tangent.y * 14 },
    { x: -normal.x * 34 - tangent.x * 14, y: -normal.y * 34 - tangent.y * 14 },
    { x: tangent.x * 30, y: tangent.y * 30 },
    { x: -tangent.x * 30, y: -tangent.y * 30 },
  ]
}

function normalizeScreenVector(vector: ScreenPoint) {
  const length = Math.hypot(vector.x, vector.y)

  if (length <= 1e-6) {
    return { x: 0, y: 0 }
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  }
}

function buildCornerAnnotationOffsets({
  corner,
  incomingStart,
  outgoingEnd,
}: {
  corner: ScreenPoint
  incomingStart: ScreenPoint
  outgoingEnd: ScreenPoint | null
}): ScreenPoint[] {
  const incoming = normalizeScreenVector({
    x: incomingStart.x - corner.x,
    y: incomingStart.y - corner.y,
  })

  if (!outgoingEnd) {
    const normal = { x: -incoming.y, y: incoming.x }

    return [
      { x: normal.x * 26, y: normal.y * 26 },
      { x: -normal.x * 26, y: -normal.y * 26 },
      { x: incoming.x * 30, y: incoming.y * 30 },
      { x: normal.x * 38 + incoming.x * 16, y: normal.y * 38 + incoming.y * 16 },
      { x: -normal.x * 38 + incoming.x * 16, y: -normal.y * 38 + incoming.y * 16 },
    ]
  }

  const outgoing = normalizeScreenVector({
    x: outgoingEnd.x - corner.x,
    y: outgoingEnd.y - corner.y,
  })
  const bisector = normalizeScreenVector({
    x: incoming.x + outgoing.x,
    y: incoming.y + outgoing.y,
  })
  const fallback = { x: -incoming.y, y: incoming.x }
  const primary = Math.hypot(bisector.x, bisector.y) > 0 ? bisector : fallback
  const opposite = { x: -primary.x, y: -primary.y }

  return [
    { x: primary.x * 26, y: primary.y * 26 },
    { x: opposite.x * 26, y: opposite.y * 26 },
    { x: primary.x * 38 + fallback.x * 14, y: primary.y * 38 + fallback.y * 14 },
    { x: primary.x * 38 - fallback.x * 14, y: primary.y * 38 - fallback.y * 14 },
    { x: opposite.x * 38 + fallback.x * 14, y: opposite.y * 38 + fallback.y * 14 },
    { x: opposite.x * 38 - fallback.x * 14, y: opposite.y * 38 - fallback.y * 14 },
  ]
}

function getCornerHoverOffset({
  corner,
  incomingStart,
  outgoingEnd,
}: {
  corner: ScreenPoint
  incomingStart: ScreenPoint
  outgoingEnd: ScreenPoint | null
}) {
  return buildCornerAnnotationOffsets({
    corner,
    incomingStart,
    outgoingEnd,
  })[0] ?? { x: 0, y: -30 }
}

function buildCanvasAnnotations({
  canvasMetrics,
  viewBox,
  activeStructureId,
  activeFloorId,
  visibleFloors,
  selectedRoom,
  selectedRoomGeometry,
  selectedRoomId,
  selectedFurnitureId,
  showRoomFloorLabels,
  showFurnitureLabels,
  showWallLabels,
  showCornerLabels,
  reservedRects,
  hoveredTarget,
  focusedTarget,
  selectionTargets,
  editingWallSegmentId,
  previousCandidateIndices,
}: {
  canvasMetrics: CanvasMetrics
  viewBox: { x: number; y: number; width: number; height: number }
  activeStructureId?: string
  activeFloorId: string
  visibleFloors: Floor[]
  selectedRoom: Room | null
  selectedRoomGeometry: ReturnType<typeof roomToGeometry> | null
  selectedRoomId: string | null
  selectedFurnitureId: string | null
  showRoomFloorLabels: boolean
  showFurnitureLabels: boolean
  showWallLabels: boolean
  showCornerLabels: boolean
  reservedRects: CanvasRect[]
  hoveredTarget: CanvasTarget | null
  focusedTarget: CanvasTarget | null
  selectionTargets: CanvasTarget[]
  editingWallSegmentId: string | null
  previousCandidateIndices: Record<string, number>
}): PlacedCanvasAnnotation[] {
  const descriptors: CanvasAnnotation[] = []
  const roomOffsets: ScreenPoint[] = [
    { x: 0, y: 0 },
    { x: 0, y: -24 },
    { x: 0, y: 24 },
    { x: -28, y: 0 },
    { x: 28, y: 0 },
    { x: -20, y: -20 },
    { x: 20, y: -20 },
    { x: -20, y: 20 },
    { x: 20, y: 20 },
    { x: 0, y: -42 },
    { x: 0, y: 42 },
    { x: -48, y: 0 },
    { x: 48, y: 0 },
    { x: -34, y: -34 },
    { x: 34, y: -34 },
    { x: -34, y: 34 },
    { x: 34, y: 34 },
    { x: 0, y: -60 },
    { x: 0, y: 60 },
    { x: -64, y: 0 },
    { x: 64, y: 0 },
  ]
  const floorOffsets: ScreenPoint[] = [
    { x: 0, y: 0 },
    { x: 84, y: 0 },
    { x: 0, y: 28 },
    { x: 84, y: 26 },
    { x: 0, y: -28 },
  ]
  const furnitureOffsets: ScreenPoint[] = [
    { x: 0, y: -28 },
    { x: 0, y: 28 },
    { x: -62, y: 0 },
    { x: 62, y: 0 },
    { x: -52, y: -24 },
    { x: 52, y: -24 },
    { x: -52, y: 24 },
    { x: 52, y: 24 },
  ]

  visibleFloors.forEach((floor) => {
    if (!activeStructureId) {
      return
    }

    const floorBounds = computeFloorBounds(floor)
    const floorAnchor = worldToScreenPoint({ x: floorBounds.minX + 1, y: floorBounds.maxY + 1.6 }, viewBox, canvasMetrics)
    const floorSize = estimateAnnotationSize('floor', floor.name)
    const floorTarget: CanvasTarget = {
      kind: 'floor',
      structureId: activeStructureId,
      floorId: floor.id,
    }

    if (showRoomFloorLabels) {
      descriptors.push({
        id: floor.id,
        kind: 'floor',
        text: floor.name,
        target: floorTarget,
        anchor: floorAnchor,
        widthPx: floorSize.widthPx,
        heightPx: floorSize.heightPx,
        priority: floor.id === activeFloorId ? 90 : 34,
        required: floor.id === activeFloorId,
        candidateOffsets: floorOffsets,
      })
    }

    floor.rooms.forEach((room) => {
      const roomAnchor = worldToScreenPoint(getRoomLabelPoint(room), viewBox, canvasMetrics)
      const roomSize = estimateAnnotationSize('room', room.name)
      const roomTarget: CanvasTarget = {
        kind: 'room',
        structureId: activeStructureId,
        floorId: floor.id,
        roomId: room.id,
      }
      const roomPriority =
        room.id === selectedRoomId ? 96 : matchesTarget(hoveredTarget, roomTarget) ? 78 : 58

      if (showRoomFloorLabels) {
        descriptors.push({
          id: room.id,
          kind: 'room',
          text: room.name,
          target: roomTarget,
          anchor: roomAnchor,
          widthPx: roomSize.widthPx,
          heightPx: roomSize.heightPx,
          priority: roomPriority,
          required: room.id === selectedRoomId,
          candidateOffsets: roomOffsets,
        })
      }

      if (!showFurnitureLabels) {
        return
      }

      room.furniture.forEach((item) => {
        const furnitureAnchor = worldToScreenPoint(
          { x: item.x + item.width / 2, y: item.y - item.depth / 2 },
          viewBox,
          canvasMetrics,
        )
        const furnitureSize = estimateAnnotationSize('furniture', item.name)
        const furnitureTarget: CanvasTarget = {
          kind: 'furniture',
          structureId: activeStructureId,
          floorId: floor.id,
          roomId: room.id,
          furnitureId: item.id,
        }

        descriptors.push({
          id: item.id,
          kind: 'furniture',
          text: item.name,
          target: furnitureTarget,
          anchor: furnitureAnchor,
          widthPx: furnitureSize.widthPx,
          heightPx: furnitureSize.heightPx,
          priority: item.id === selectedFurnitureId ? 84 : matchesTarget(hoveredTarget, furnitureTarget) ? 72 : 42,
          required: item.id === selectedFurnitureId,
          candidateOffsets: furnitureOffsets,
        })
      })
    })
  })

  if (showWallLabels && selectedRoomGeometry && selectedRoom && activeStructureId && selectedRoomId) {
    selectedRoomGeometry.segments.forEach((segment) => {
      const midpointScreen = worldToScreenPoint(midpoint(segment.start, segment.end), viewBox, canvasMetrics)
      const start = worldToScreenPoint(segment.start, viewBox, canvasMetrics)
      const end = worldToScreenPoint(segment.end, viewBox, canvasMetrics)
      const wallTarget: CanvasTarget = {
        kind: 'wall',
        structureId: activeStructureId,
        floorId: activeFloorId,
        roomId: selectedRoomId,
        segmentId: segment.id,
      }
      const wallSize = estimateAnnotationSize('wall', formatFeet(segment.length))
      const wallSelected = isTargetSelected(selectionTargets, wallTarget)
      const wallFocused = matchesTarget(focusedTarget, wallTarget)
      const wallEditing = editingWallSegmentId === segment.id
      const wallHovered = matchesTarget(hoveredTarget, wallTarget)

      descriptors.push({
        id: segment.id,
        kind: 'wall',
        text: formatFeet(segment.length),
        target: wallTarget,
        anchor: midpointScreen,
        widthPx: wallSize.widthPx,
        heightPx: wallSize.heightPx,
        priority: wallEditing ? 99 : wallSelected || wallFocused ? 94 : wallHovered ? 88 : 76,
        required: true,
        candidateOffsets: buildWallAnnotationOffsets(start, end),
      })
    })

    if (showCornerLabels) {
      const corners = getRoomCorners(selectedRoom)

      corners.forEach((corner, index) => {
        const previousSegment = selectedRoomGeometry.segments[index]
        const nextSegment = corner.isExit
          ? null
          : selectedRoomGeometry.segments[index + 1] ?? (selectedRoomGeometry.closed ? selectedRoomGeometry.segments[0] : null)
        const cornerTarget: CanvasTarget = {
          kind: 'corner',
          structureId: activeStructureId,
          floorId: activeFloorId,
          roomId: selectedRoomId,
          segmentId: corner.segmentId,
        }
        const anchor = worldToScreenPoint(corner.point, viewBox, canvasMetrics)
        const text = formatCornerAngleBadge(corner.turn)
        const cornerSize = estimateAnnotationSize('corner', text)

        descriptors.push({
          id: corner.segmentId,
          kind: 'corner',
          text,
          target: cornerTarget,
          anchor,
          widthPx: cornerSize.widthPx,
          heightPx: cornerSize.heightPx,
          priority: matchesTarget(hoveredTarget, cornerTarget) ? 82 : 68,
          candidateOffsets: buildCornerAnnotationOffsets({
            corner: anchor,
            incomingStart: worldToScreenPoint(previousSegment.start, viewBox, canvasMetrics),
            outgoingEnd: nextSegment ? worldToScreenPoint(nextSegment.end, viewBox, canvasMetrics) : null,
          }),
        })
      })
    }
  }

  return placeCanvasAnnotations(descriptors, reservedRects, {
    minX: 10,
    maxX: canvasMetrics.widthPx - 10,
    minY: 10,
    maxY: canvasMetrics.heightPx - 10,
  }, previousCandidateIndices)
}

function getHoveredCornerOverlay({
  activeStructureId,
  activeFloorId,
  selectedRoom,
  selectedRoomGeometry,
  hoveredTarget,
  viewBox,
  canvasMetrics,
}: {
  activeStructureId?: string
  activeFloorId: string
  selectedRoom: Room | null
  selectedRoomGeometry: ReturnType<typeof roomToGeometry> | null
  hoveredTarget: CanvasTarget | null
  viewBox: { x: number; y: number; width: number; height: number }
  canvasMetrics: CanvasMetrics
}): HoverCornerOverlay | null {
  if (
    !activeStructureId ||
    !selectedRoom ||
    !selectedRoomGeometry ||
    !hoveredTarget ||
    hoveredTarget.kind !== 'corner' ||
    hoveredTarget.floorId !== activeFloorId ||
    hoveredTarget.roomId !== selectedRoom.id
  ) {
    return null
  }

  const corners = getRoomCorners(selectedRoom)
  const cornerIndex = corners.findIndex((corner) => corner.segmentId === hoveredTarget.segmentId)

  if (cornerIndex < 0) {
    return null
  }

  const corner = corners[cornerIndex]
  const previousSegment = selectedRoomGeometry.segments[cornerIndex]
  const nextSegment = corner.isExit
    ? null
    : selectedRoomGeometry.segments[cornerIndex + 1] ?? (selectedRoomGeometry.closed ? selectedRoomGeometry.segments[0] : null)
  const point = worldToScreenPoint(corner.point, viewBox, canvasMetrics)
  const offset = getCornerHoverOffset({
    corner: point,
    incomingStart: worldToScreenPoint(previousSegment.start, viewBox, canvasMetrics),
    outgoingEnd: nextSegment ? worldToScreenPoint(nextSegment.end, viewBox, canvasMetrics) : null,
  })

  return {
    target: hoveredTarget,
    point,
    labelPoint: {
      x: point.x + offset.x,
      y: point.y + offset.y,
    },
    text: formatCornerAngleBadge(corner.turn),
  }
}

function placeCanvasAnnotations(
  descriptors: CanvasAnnotation[],
  reservedRects: CanvasRect[],
  bounds: CanvasRect,
  previousCandidateIndices: Record<string, number>,
) {
  const occupied = [...reservedRects]
  const placed: PlacedCanvasAnnotation[] = []

  descriptors
    .sort((left, right) => right.priority - left.priority)
    .forEach((descriptor) => {
      const visibilityMargin = descriptor.required ? 96 : 48
      if (!isPointNearRect(descriptor.anchor, bounds, visibilityMargin)) {
        return
      }

      const previousCandidateIndex = previousCandidateIndices[getAnnotationPlacementKey(descriptor)]
      const candidates = descriptor.candidateOffsets.map((offset, index) => {
        const rect = clampRectWithinBounds(
          createAnnotationRect(
            {
              x: descriptor.anchor.x + offset.x,
              y: descriptor.anchor.y + offset.y,
            },
            descriptor.widthPx,
            descriptor.heightPx,
          ),
          bounds,
        )

        return {
          rect,
          index,
          overlap: occupied.reduce((sum, occupiedRect) => sum + overlapArea(rect, occupiedRect), 0),
          distance: Math.hypot(offset.x, offset.y),
        }
      })

      const zeroOverlap = candidates.filter((candidate) => candidate.overlap === 0)
      const idealCandidate =
        zeroOverlap.sort((left, right) => left.distance - right.distance || left.index - right.index)[0] ??
        (descriptor.required
          ? candidates.reduce((best, candidate) => {
              if (candidate.overlap !== best.overlap) {
                return candidate.overlap < best.overlap ? candidate : best
              }

              return candidate.distance < best.distance ? candidate : best
            })
          : null)

      if (!idealCandidate) {
        return
      }

      const previousCandidate = candidates.find((candidate) => candidate.index === previousCandidateIndex)
      const selectedCandidate =
        previousCandidate && shouldKeepPreviousAnnotationPlacement(previousCandidate, idealCandidate)
          ? previousCandidate
          : idealCandidate

      const position = {
        x: (selectedCandidate.rect.minX + selectedCandidate.rect.maxX) / 2,
        y: (selectedCandidate.rect.minY + selectedCandidate.rect.maxY) / 2,
      }

      placed.push({
        ...descriptor,
        rect: selectedCandidate.rect,
        position,
        candidateIndex: selectedCandidate.index,
      })
      occupied.push(expandRect(selectedCandidate.rect, 8, 8))
    })

  return placed.sort((left, right) => left.priority - right.priority)
}

function getAnnotationPlacementKey(annotation: Pick<CanvasAnnotation, 'kind' | 'id'>) {
  return `${annotation.kind}:${annotation.id}`
}

function shouldKeepPreviousAnnotationPlacement(
  previousCandidate: { overlap: number; distance: number },
  idealCandidate: { overlap: number; distance: number },
) {
  if (previousCandidate.overlap === 0) {
    return true
  }

  const overlapTolerance = 180
  const distanceTolerance = 28

  return (
    previousCandidate.overlap <= idealCandidate.overlap + overlapTolerance &&
    previousCandidate.distance <= idealCandidate.distance + distanceTolerance
  )
}
