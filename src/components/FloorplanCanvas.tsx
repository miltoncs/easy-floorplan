import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useEditor } from '../context/EditorContext'
import {
  DEFAULT_LABEL_FONT_SIZE,
  computeFloorBounds,
  findFurnitureById,
  findRoomById,
  findSegmentById,
  getRoomSuggestions,
  getRoomLabelPoint,
  getViewBox,
} from '../lib/blueprint'
import { MAX_CAMERA_ZOOM, MIN_CAMERA_ZOOM } from '../lib/camera'
import { parseDistanceInput } from '../lib/distance'
import { MODE_LABELS } from '../lib/editorModes'
import { validateName } from '../lib/nameValidation'
import {
  addPolar,
  clamp,
  formatCornerAngleBadge,
  formatFeet,
  getCornerAngleBetweenWalls,
  getRoomCorners,
  getTurnFromCornerAngle,
  midpoint,
  normalizeAngle,
  pointsToPath,
  roomToGeometry,
  snapFurnitureToRoom,
} from '../lib/geometry'
import type {
  Bounds,
  CanvasMeasurement,
  CanvasRoomVisibilityScope,
  CanvasTarget,
  Floor,
  Point,
  Room,
  RoomGeometry,
  RoomSuggestion,
  SuggestionSegment,
} from '../types'

type DragState =
  | {
      kind: 'canvas'
      pointerId: number
      clientX: number
      clientY: number
      startOffsetX: number
      startOffsetY: number
      currentOffsetX: number
      currentOffsetY: number
      moved: boolean
    }
  | {
      kind: 'room'
      source: 'annotation' | 'room'
      pointerId: number
      clientX: number
      clientY: number
      structureId: string
      floorId: string
      roomId: string
      startX: number
      startY: number
      currentX: number
      currentY: number
      moved: boolean
    }
  | {
      kind: 'wall'
      pointerId: number
      clientX: number
      clientY: number
      structureId: string
      floorId: string
      roomId: string
      segmentId: string
      startX: number
      startY: number
      currentX: number
      currentY: number
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
      currentX: number
      currentY: number
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

type ScreenSegment = {
  id: string
  start: ScreenPoint
  end: ScreenPoint
}

type SuggestionPreview = {
  suggestion: RoomSuggestion & { segmentsToAdd: SuggestionSegment[] }
  floorId: string
  roomId: string
  showActions: boolean
  points: Point[]
  anchorPoint: Point
  heading: number
  length: number
}

type PlacedSuggestionPreview = SuggestionPreview & {
  actionPoint: Point
  actionRect: CanvasRect
  actionScreenPoint: ScreenPoint
}

type RoomGeometryEntry = {
  floorId: string
  room: Room
  geometry: RoomGeometry
}

type AnnotationKind = 'floor' | 'room' | 'furniture' | 'wall'

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
  scoreCandidate?: (candidate: {
    rect: CanvasRect
    position: ScreenPoint
    offset: ScreenPoint
    index: number
  }) => number
}

type PlacedCanvasAnnotation = CanvasAnnotation & {
  rect: CanvasRect
  position: ScreenPoint
  candidateIndex: number
}

type PlacedCanvasMeasurement = {
  measurement: CanvasMeasurement
  labelPoint: ScreenPoint
}

type HoverCornerOverlay = {
  target: Extract<CanvasTarget, { kind: 'corner' }>
  arcPath: string
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

type InlineRoomEditorState = {
  structureId: string
  floorId: string
  roomId: string
  value: string
  error: string | null
}

type InlineFurnitureEditorState = {
  target: Extract<CanvasTarget, { kind: 'furniture' }>
  value: string
  error: string | null
}

type InlineCornerDirection = 'left' | 'right'

type InlineCornerEditorState = {
  target: Extract<CanvasTarget, { kind: 'corner' }>
  value: string
  direction: InlineCornerDirection
  error: string | null
}

type WheelGestureState = {
  clientX: number
  clientY: number
  timeoutId: number | null
}

const GRID_MINOR_SIZE_FEET = 1
const GRID_MAJOR_MULTIPLE = 4
const GRID_MAJOR_SIZE_FEET = GRID_MINOR_SIZE_FEET * GRID_MAJOR_MULTIPLE
const WHEEL_ZOOM_MULTIPLIER = 1.02
const WHEEL_GESTURE_IDLE_MS = 160
const WHEEL_GESTURE_ANCHOR_TOLERANCE_PX = 48
const BUTTON_ZOOM_MULTIPLIER = 1.03
const MIN_WALL_HIT_STROKE_WIDTH_PX = 16
const WALL_HIT_STROKE_WIDTH_MULTIPLIER = 4
const CORNER_HIT_RADIUS_PX = 10
const ANCHOR_ACTION_RADIUS_PX = 9
const ANCHOR_ACTION_CROSS_HALF_PX = 4
const MIN_HOVER_HITBOX_SCALE = 0.5
const MAX_HOVER_HITBOX_SCALE = 1.35
const SUGGESTION_ACTION_WIDTH_PX = 58
const SUGGESTION_ACTION_HEIGHT_PX = 29
const CORNER_ANGLE_ERROR = 'Enter an angle from 0 to 360 degrees.'
const SUGGESTION_DASH_PATTERN = '10 7'

export function FloorplanCanvas() {
  const {
    activeFloor,
    activeStructure,
    draft,
    roomSuggestions,
    selectedRoom,
    selectedRoomGeometry,
    ui,
    visibleFloors,
    actions,
  } = useEditor()
  const stageRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<DragState>(null)
  const wheelGestureRef = useRef<WheelGestureState | null>(null)
  const cancelActiveInteractionRef = useRef<(() => void) | null>(null)
  const suppressMeasurementClickRef = useRef(false)
  const suppressCanvasClickRef = useRef(false)
  const suppressTargetClickRef = useRef<CanvasTarget | null>(null)
  const suppressTargetClickTimerRef = useRef<number | null>(null)
  const inlineRoomInputRef = useRef<HTMLInputElement | null>(null)
  const inlineWallInputRef = useRef<HTMLInputElement | null>(null)
  const inlineFurnitureInputRef = useRef<HTMLInputElement | null>(null)
  const inlineCornerInputRef = useRef<HTMLInputElement | null>(null)
  const annotationPlacementRef = useRef<Record<string, number>>({})
  const [dragState, setDragState] = useState<DragState>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const [dragViewBounds, setDragViewBounds] = useState<Bounds | null>(null)
  const [selectionBox, setSelectionBox] = useState<CanvasRect | null>(null)
  const [inlineRoomEditor, setInlineRoomEditor] = useState<InlineRoomEditorState | null>(null)
  const [inlineWallEditor, setInlineWallEditor] = useState<InlineWallEditorState | null>(null)
  const [inlineFurnitureEditor, setInlineFurnitureEditor] = useState<InlineFurnitureEditorState | null>(null)
  const [inlineCornerEditor, setInlineCornerEditor] = useState<InlineCornerEditorState | null>(null)
  const [viewRotationQuarterTurns, setViewRotationQuarterTurns] = useState(0)
  const canvasAspectRatio =
    canvasSize.width > 0 && canvasSize.height > 0 ? canvasSize.width / canvasSize.height : undefined
  const framingBounds = dragViewBounds ?? ui.camera.frameBounds
  const rotatedViewBounds = rotateBoundsForView(framingBounds, viewRotationQuarterTurns)
  const viewBox = getViewBox(rotatedViewBounds, ui.camera.zoom, ui.camera.offset, canvasAspectRatio)
  const viewRotationTransform = getViewRotationTransform(viewBox, viewRotationQuarterTurns)
  const labelScale = draft.labelFontSize / DEFAULT_LABEL_FONT_SIZE
  const inlineRoomEditorRoomId = inlineRoomEditor?.roomId
  const inlineWallEditorSegmentId = inlineWallEditor?.segmentId
  const inlineFurnitureEditorFurnitureId = inlineFurnitureEditor?.target.furnitureId
  const inlineCornerEditorSegmentId = inlineCornerEditor?.target.segmentId
  const showSimplifiedDragPreview = Boolean(
    dragState?.moved && (dragState.kind === 'room' || dragState.kind === 'wall'),
  )
  const canvasAppearanceStyle = {
    '--canvas-wall-line-width': `${draft.wallStrokeWidthPx}px`,
    '--canvas-label-font-size': `${draft.labelFontSize}px`,
    '--canvas-label-scale': String(labelScale),
  } as CSSProperties

  const selectedRoomEntry = useMemo(
    () =>
      activeFloor && selectedRoom && selectedRoomGeometry
        ? {
            floorId: activeFloor.id,
            room: selectedRoom,
            geometry: selectedRoomGeometry,
          }
        : null,
    [activeFloor, selectedRoom, selectedRoomGeometry],
  )
  const showAllVisibilityRooms = draft.canvasRoomVisibilityScope === 'all'
  const scopedRoomEntries = useMemo(
    () =>
      showAllVisibilityRooms
        ? visibleFloors.flatMap((floor) =>
            floor.rooms.map((room) => ({
              floorId: floor.id,
              room,
              geometry: roomToGeometry(room),
            })),
          )
        : selectedRoomEntry
          ? [selectedRoomEntry]
          : [],
    [selectedRoomEntry, showAllVisibilityRooms, visibleFloors],
  )
  const wallLabelRooms = useMemo(
    () => (draft.showWallLabels ? scopedRoomEntries : selectedRoomEntry ? [selectedRoomEntry] : []),
    [draft.showWallLabels, scopedRoomEntries, selectedRoomEntry],
  )
  const angleOverlayRooms = useMemo(
    () =>
      draft.showAngleLabels && draft.editorMode !== 'furniture'
        ? scopedRoomEntries
        : selectedRoomEntry
          ? [selectedRoomEntry]
          : [],
    [draft.editorMode, draft.showAngleLabels, scopedRoomEntries, selectedRoomEntry],
  )
  const shapeSuggestions = useMemo(() => roomSuggestions.filter(hasSuggestedSegments), [roomSuggestions])
  const showCanvasInferencePreviews = draft.editorMode !== 'furniture' && draft.showInferred
  const canvasMetrics = getCanvasMetrics(viewBox, canvasSize)
  const hoverHitboxScale = getHoverHitboxScale(ui.camera.zoom)
  const anchorActionScale = getWorldDistanceFromPixels(canvasMetrics, 1)
  const wallHitStrokeWidthPx =
    Math.max(MIN_WALL_HIT_STROKE_WIDTH_PX, draft.wallStrokeWidthPx * WALL_HIT_STROKE_WIDTH_MULTIPLIER) *
    hoverHitboxScale
  const placedMeasurements = ui.measurements.map((measurement) =>
    placeCanvasMeasurement(measurement, viewBox, canvasMetrics, viewRotationQuarterTurns),
  )
  const pendingMeasurementScreenPoint = ui.pendingMeasurementStart
    ? worldToScreenPoint(ui.pendingMeasurementStart, viewBox, canvasMetrics, viewRotationQuarterTurns)
    : null
  const cornerHitRadius = getWorldLengthForScreenPixels(
    canvasMetrics,
    CORNER_HIT_RADIUS_PX * hoverHitboxScale,
  )
  const canvasToolbarRect = getCanvasToolbarRect(viewBox, canvasMetrics)
  const canvasModeSwitchRect = getCanvasModeSwitchRect(viewBox, canvasMetrics)
  const canvasLegendRect = getCanvasLegendRect(viewBox, canvasMetrics)
  const suggestedPreviews = useMemo(
    () =>
      !showSimplifiedDragPreview && showCanvasInferencePreviews
        ? placeSuggestionPreviews(
            [
              ...(selectedRoomEntry
                ? shapeSuggestions.map((suggestion) =>
                    buildSuggestionPreview(selectedRoomEntry.room, selectedRoomEntry.floorId, suggestion, true),
                  )
                : []),
              ...(showAllVisibilityRooms
                ? visibleFloors.flatMap((floor) =>
                    floor.rooms.flatMap((room) => {
                      if (selectedRoomEntry && floor.id === selectedRoomEntry.floorId && room.id === selectedRoomEntry.room.id) {
                        return []
                      }

                      const suggestion = getPrimaryShapeSuggestion(getRoomSuggestions(room, floor))

                      return suggestion ? [buildSuggestionPreview(room, floor.id, suggestion, false)] : []
                    }),
                  )
                : []),
            ],
            viewBox,
            canvasMetrics,
            viewRotationQuarterTurns,
            [
              expandRect(canvasToolbarRect, 0.8, 0.8),
              expandRect(canvasModeSwitchRect, 0.4, 0.4),
              expandRect(canvasLegendRect, 0.4, 0.4),
            ],
          )
        : [],
    [
      canvasLegendRect,
      canvasMetrics,
      canvasModeSwitchRect,
      canvasToolbarRect,
      selectedRoomEntry,
      shapeSuggestions,
      showCanvasInferencePreviews,
      showSimplifiedDragPreview,
      showAllVisibilityRooms,
      viewRotationQuarterTurns,
      viewBox,
      visibleFloors,
    ],
  )
  const reservedAnnotationRects = useMemo(
    () => [
      expandRect(svgRectToScreenRect(canvasToolbarRect, viewBox, canvasMetrics), 14, 14),
      expandRect(svgRectToScreenRect(canvasModeSwitchRect, viewBox, canvasMetrics), 12, 12),
      expandRect(svgRectToScreenRect(canvasLegendRect, viewBox, canvasMetrics), 12, 12),
      ...suggestedPreviews.filter((preview) => preview.showActions).map((preview) =>
        expandRect(
          makeCenteredRect(preview.actionScreenPoint.x, preview.actionScreenPoint.y, SUGGESTION_ACTION_WIDTH_PX, SUGGESTION_ACTION_HEIGHT_PX),
          12,
          12,
        ),
      ),
    ],
    [canvasLegendRect, canvasMetrics, canvasModeSwitchRect, canvasToolbarRect, suggestedPreviews, viewBox],
  )
  const placedAnnotations = useMemo(
    () =>
      showSimplifiedDragPreview
        ? []
        : buildCanvasAnnotations({
            canvasMetrics,
            viewBox,
            activeStructureId: activeStructure?.id,
            activeFloorId: activeFloor?.id ?? draft.activeFloorId,
            visibleFloors,
            wallLabelRooms,
            selectedRoomId: draft.selectedRoomId,
            selectedFurnitureId: draft.selectedFurnitureId,
            showRoomFloorLabels: draft.showRoomFloorLabels,
            showFurnitureLabels: draft.editorMode === 'furniture',
            showWallLabels: draft.showWallLabels,
            allowHoverWallLabels: draft.editorMode !== 'furniture',
            labelFontSize: draft.labelFontSize,
            reservedRects: reservedAnnotationRects,
            hoveredTarget: ui.hoveredTarget,
            focusedTarget: ui.focusedTarget,
            selectionTargets: ui.selectionTargets,
            editingWallSegmentId: inlineWallEditor?.segmentId ?? null,
            previousCandidateIndices: annotationPlacementRef.current,
            viewRotationQuarterTurns,
          }),
    [
      activeFloor?.id,
      activeStructure?.id,
      canvasMetrics,
      draft.activeFloorId,
      draft.editorMode,
      draft.labelFontSize,
      draft.selectedFurnitureId,
      draft.selectedRoomId,
      draft.showRoomFloorLabels,
      draft.showWallLabels,
      inlineWallEditor?.segmentId,
      reservedAnnotationRects,
      showSimplifiedDragPreview,
      ui.focusedTarget,
      ui.hoveredTarget,
      ui.selectionTargets,
      viewRotationQuarterTurns,
      viewBox,
      visibleFloors,
      wallLabelRooms,
    ],
  )
  const visibleCornerOverlays = showSimplifiedDragPreview
    ? []
    : getVisibleCornerOverlays({
        activeStructureId: activeStructure?.id,
        rooms: angleOverlayRooms,
        showAll: draft.showAngleLabels && draft.editorMode !== 'furniture',
        hoveredTarget: ui.hoveredTarget,
        editingSegmentId: inlineCornerEditor?.target.segmentId ?? null,
        viewBox,
        canvasMetrics,
        viewRotationQuarterTurns,
      })
  const selectableTargets = showSimplifiedDragPreview
    ? []
    : buildSelectableCanvasTargets({
        activeStructureId: activeStructure?.id,
        visibleFloors,
        viewBox,
        canvasMetrics,
        viewRotationQuarterTurns,
        showFurniture: draft.editorMode === 'furniture',
      })
  const canvasTarget: CanvasTarget = {
    kind: 'canvas',
    structureId: activeStructure?.id,
    floorId: activeFloor?.id,
  }

  const clearSelectedFurniture = () => {
    actions.mutateDraft((draftState) => {
      draftState.selectedFurnitureId = null
    }, {
      touchStructure: false,
      recordHistory: false,
    })
  }

  const handleCanvasBackgroundClick = () => {
    if (suppressCanvasClickRef.current) {
      suppressCanvasClickRef.current = false
      return
    }

    clearSelectedFurniture()
    actions.clearSelectionTargets()
    actions.setFocusedTarget(canvasTarget)
  }

  const handleCanvasBackgroundPointerDown = (event: ReactPointerEvent<SVGRectElement>) => {
    clearSelectedFurniture()

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

    actions.clearSelectionTargets()
    beginDrag(event, {
      kind: 'canvas',
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      startOffsetX: ui.camera.offset.x,
      startOffsetY: ui.camera.offset.y,
      currentOffsetX: ui.camera.offset.x,
      currentOffsetY: ui.camera.offset.y,
      moved: false,
    })
    actions.setFocusedTarget(canvasTarget)
  }

  const applyWheelZoom = useEffectEvent((clientX: number, clientY: number, deltaY: number) => {
    if (!svgRef.current) {
      return
    }

    const rect = svgRef.current.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      return
    }
    const pointerRatioX = (clientX - rect.left) / rect.width
    const pointerRatioY = (clientY - rect.top) / rect.height
    const currentViewPoint = screenToBaseSvgPoint(clientX, clientY, rect, viewBox, viewRotationQuarterTurns)
    const nextZoom = deltaY > 0 ? ui.camera.zoom / WHEEL_ZOOM_MULTIPLIER : ui.camera.zoom * WHEEL_ZOOM_MULTIPLIER
    const clampedZoom = clamp(nextZoom, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM)
    actions.setCamera(
      getCameraForScreenAnchor(
        ui.camera.frameBounds,
        clampedZoom,
        {
          x: pointerRatioX,
          y: pointerRatioY,
        },
        currentViewPoint,
        canvasAspectRatio,
        viewRotationQuarterTurns,
      ),
    )
  })

  const getBoundedWheelClientPoint = useEffectEvent((clientX: number, clientY: number) => {
    if (!svgRef.current) {
      return null
    }

    const rect = svgRef.current.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      return null
    }

    return {
      clientX: clamp(clientX, rect.left, rect.right),
      clientY: clamp(clientY, rect.top, rect.bottom),
    }
  })

  const getWheelZoomAnchor = useEffectEvent((clientX: number, clientY: number) => {
    const activeGesture = wheelGestureRef.current
    const shouldStartNewGesture =
      !activeGesture ||
      Math.hypot(activeGesture.clientX - clientX, activeGesture.clientY - clientY) > WHEEL_GESTURE_ANCHOR_TOLERANCE_PX

    if (shouldStartNewGesture) {
      wheelGestureRef.current = {
        clientX,
        clientY,
        timeoutId: null,
      }
    }

    const pendingTimeoutId = wheelGestureRef.current?.timeoutId
    if (pendingTimeoutId !== null && pendingTimeoutId !== undefined) {
      window.clearTimeout(pendingTimeoutId)
    }

    const anchor = {
      clientX: wheelGestureRef.current?.clientX ?? clientX,
      clientY: wheelGestureRef.current?.clientY ?? clientY,
    }

    const timeoutId = window.setTimeout(() => {
      wheelGestureRef.current = null
    }, WHEEL_GESTURE_IDLE_MS)

    wheelGestureRef.current = {
      clientX: anchor.clientX,
      clientY: anchor.clientY,
      timeoutId,
    }

    return anchor
  })

  useEffect(() => {
    const stage = stageRef.current

    if (!stage) {
      return
    }

    const handleWheel = (event: WheelEvent) => {
      if (shouldIgnoreWheelZoom(event.target)) {
        return
      }

      const boundedPointer = getBoundedWheelClientPoint(event.clientX, event.clientY)
      if (!boundedPointer) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      const anchor = getWheelZoomAnchor(boundedPointer.clientX, boundedPointer.clientY)
      applyWheelZoom(anchor.clientX, anchor.clientY, event.deltaY)
    }

    stage.addEventListener('wheel', handleWheel, { passive: false })
    return () => stage.removeEventListener('wheel', handleWheel)
  }, [])

  useEffect(() => () => {
    const timeoutId = wheelGestureRef.current?.timeoutId
    if (timeoutId !== null && timeoutId !== undefined) {
      window.clearTimeout(timeoutId)
    }
  }, [])

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
    if (!inlineRoomEditorRoomId) {
      return
    }

    inlineRoomInputRef.current?.focus()
    inlineRoomInputRef.current?.select()
  }, [inlineRoomEditorRoomId])

  useEffect(() => {
    if (!inlineWallEditorSegmentId) {
      return
    }

    inlineWallInputRef.current?.focus()
    inlineWallInputRef.current?.select()
  }, [inlineWallEditorSegmentId])

  useEffect(() => {
    if (!inlineFurnitureEditorFurnitureId) {
      return
    }

    inlineFurnitureInputRef.current?.focus()
    inlineFurnitureInputRef.current?.select()
  }, [inlineFurnitureEditorFurnitureId])

  useEffect(() => {
    if (!inlineCornerEditorSegmentId) {
      return
    }

    inlineCornerInputRef.current?.focus()
    inlineCornerInputRef.current?.select()
  }, [inlineCornerEditorSegmentId])

  useEffect(() => {
    if (showSimplifiedDragPreview) {
      return
    }

    annotationPlacementRef.current = Object.fromEntries(
      placedAnnotations.map((annotation) => [getAnnotationPlacementKey(annotation), annotation.candidateIndex]),
    )
  }, [placedAnnotations, showSimplifiedDragPreview])

  useEffect(() => {
    return () => {
      if (suppressTargetClickTimerRef.current !== null) {
        window.clearTimeout(suppressTargetClickTimerRef.current)
      }
    }
  }, [])

  const cancelActiveInteraction = () => {
    setInlineRoomEditor(null)
    setInlineWallEditor(null)
    setInlineFurnitureEditor(null)
    setInlineCornerEditor(null)

    const activeDrag = dragRef.current
    if (!activeDrag) {
      return
    }

    if (activeDrag.kind === 'canvas') {
      actions.setCamera({
        zoom: ui.camera.zoom,
        offset: {
          x: activeDrag.startOffsetX,
          y: activeDrag.startOffsetY,
        },
      })
      suppressCanvasClickRef.current = true
      endDrag()
      return
    }

    if (activeDrag.kind === 'selection') {
      suppressCanvasClickRef.current = true
      setSelectionBox(null)
      endDrag()
      return
    }

    if (activeDrag.kind === 'room') {
      suppressNextTargetClick({
        kind: 'room',
        structureId: activeDrag.structureId,
        floorId: activeDrag.floorId,
        roomId: activeDrag.roomId,
      }, { persistUntilConsumed: true })
      endDrag()
      return
    }

    if (activeDrag.kind === 'wall') {
      suppressNextTargetClick({
        kind: 'wall',
        structureId: activeDrag.structureId,
        floorId: activeDrag.floorId,
        roomId: activeDrag.roomId,
        segmentId: activeDrag.segmentId,
      }, { persistUntilConsumed: true })
      endDrag()
      return
    }

    actions.mutateDraft((draftState) => {
      const item = findFurnitureById(
        draftState,
        activeDrag.structureId,
        activeDrag.floorId,
        activeDrag.roomId,
        activeDrag.furnitureId,
      )
      if (!item) {
        return
      }

      item.x = activeDrag.startX
      item.y = activeDrag.startY
    }, {
      recordHistory: false,
      touchStructure: false,
    })
    suppressNextTargetClick({
      kind: 'furniture',
      structureId: activeDrag.structureId,
      floorId: activeDrag.floorId,
      roomId: activeDrag.roomId,
      furnitureId: activeDrag.furnitureId,
    }, { persistUntilConsumed: true })
    endDrag()
  }
  cancelActiveInteractionRef.current = cancelActiveInteraction

  const handleDragPointerMove = useEffectEvent((event: PointerEvent) => {
    if (!dragRef.current || !svgRef.current || dragRef.current.pointerId !== event.pointerId) {
      return
    }

    const rect = svgRef.current.getBoundingClientRect()
    const delta = screenDeltaToBaseSvgDelta(
      event.clientX - dragRef.current.clientX,
      event.clientY - dragRef.current.clientY,
      rect,
      viewBox,
      viewRotationQuarterTurns,
    )
    const deltaX = delta.x
    const deltaY = delta.y
    const moved = Math.abs(event.clientX - dragRef.current.clientX) > 4 || Math.abs(event.clientY - dragRef.current.clientY) > 4
    const activeDrag = dragRef.current

    if (activeDrag.kind === 'canvas') {
      const nextOffset = {
        x: activeDrag.startOffsetX - deltaX,
        y: activeDrag.startOffsetY - deltaY,
      }
      const nextDrag = {
        ...activeDrag,
        moved,
        currentOffsetX: nextOffset.x,
        currentOffsetY: nextOffset.y,
      }
      dragRef.current = nextDrag
      setDragState(nextDrag)
      actions.setCamera({
        zoom: ui.camera.zoom,
        offset: nextOffset,
      })
      return
    }

    if (activeDrag.kind === 'selection') {
      const nextDrag = {
        ...activeDrag,
        moved,
        currentClientX: event.clientX,
        currentClientY: event.clientY,
      }
      dragRef.current = nextDrag
      setDragState(nextDrag)
      setSelectionBox(getSelectionRect(activeDrag.clientX, activeDrag.clientY, event.clientX, event.clientY, rect))
      return
    }

    if (activeDrag.kind === 'room' || activeDrag.kind === 'wall') {
      const nextDrag = {
        ...activeDrag,
        moved,
        currentX: activeDrag.startX + deltaX,
        currentY: activeDrag.startY - deltaY,
      }
      dragRef.current = nextDrag
      setDragState(nextDrag)
      return
    }

    const nextX = activeDrag.startX + deltaX
    const nextY = activeDrag.startY - deltaY
    const nextDrag = {
      ...activeDrag,
      moved,
      currentX: nextX,
      currentY: nextY,
    }
    dragRef.current = nextDrag
    setDragState(nextDrag)
    actions.mutateDraft((draftState) => {
      const room = findRoomById(draftState, activeDrag.structureId, activeDrag.floorId, activeDrag.roomId)
      const item = findFurnitureById(
        draftState,
        activeDrag.structureId,
        activeDrag.floorId,
        activeDrag.roomId,
        activeDrag.furnitureId,
      )

      if (!room || !item) {
        return
      }

      const nextPosition = snapFurnitureToRoom(
        room,
        {
          ...item,
          x: nextX,
          y: nextY,
        },
        draftState.furnitureSnapStrength,
        draftState.furnitureCornerSnapStrength,
      )

      item.x = nextPosition.x
      item.y = nextPosition.y
    }, {
      recordHistory: false,
      touchStructure: false,
    })
  })

  const handleDragPointerUp = useEffectEvent((event: PointerEvent) => {
    if (dragRef.current?.pointerId !== event.pointerId) {
      return
    }

    const completedDrag = dragRef.current
    endDrag()

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

    if (completedDrag.moved && (completedDrag.kind === 'room' || completedDrag.kind === 'wall' || completedDrag.kind === 'furniture')) {
      const delta = {
        x: completedDrag.currentX - completedDrag.startX,
        y: completedDrag.currentY - completedDrag.startY,
      }

      if (completedDrag.kind === 'room') {
        suppressNextTargetClick({
          kind: 'room',
          structureId: completedDrag.structureId,
          floorId: completedDrag.floorId,
          roomId: completedDrag.roomId,
        })
        actions.moveRoom(completedDrag.structureId, completedDrag.floorId, completedDrag.roomId, delta)
        return
      }

      if (completedDrag.kind === 'wall') {
        suppressNextTargetClick({
          kind: 'wall',
          structureId: completedDrag.structureId,
          floorId: completedDrag.floorId,
          roomId: completedDrag.roomId,
          segmentId: completedDrag.segmentId,
        })
        actions.moveRoom(completedDrag.structureId, completedDrag.floorId, completedDrag.roomId, delta)
        return
      }

      actions.mutateDraft((draftState) => {
        const item = findFurnitureById(
          draftState,
          completedDrag.structureId,
          completedDrag.floorId,
          completedDrag.roomId,
          completedDrag.furnitureId,
        )
        if (!item) {
          return
        }

        item.x = completedDrag.startX
        item.y = completedDrag.startY
      }, {
        recordHistory: false,
        touchStructure: false,
      })
      suppressNextTargetClick({
        kind: 'furniture',
        structureId: completedDrag.structureId,
        floorId: completedDrag.floorId,
        roomId: completedDrag.roomId,
        furnitureId: completedDrag.furnitureId,
      })
      actions.moveFurniture(
        completedDrag.structureId,
        completedDrag.floorId,
        completedDrag.roomId,
        completedDrag.furnitureId,
        delta,
      )
      return
    }

    if (completedDrag.kind === 'room') {
      if (completedDrag.source === 'annotation') {
        startInlineRoomEdit({
          kind: 'room',
          structureId: completedDrag.structureId,
          floorId: completedDrag.floorId,
          roomId: completedDrag.roomId,
        })
        return
      }

      actions.selectRoom(completedDrag.structureId, completedDrag.floorId, completedDrag.roomId)
      return
    }

    if (completedDrag.kind === 'wall') {
      const target: CanvasTarget = {
        kind: 'wall',
        structureId: completedDrag.structureId,
        floorId: completedDrag.floorId,
        roomId: completedDrag.roomId,
        segmentId: completedDrag.segmentId,
      }

      selectWallTarget(target)
      suppressNextTargetClick(target)
      return
    }

    if (completedDrag.kind === 'furniture') {
      actions.openFurnitureDialog({
        structureId: completedDrag.structureId,
        floorId: completedDrag.floorId,
        roomId: completedDrag.roomId,
        furnitureId: completedDrag.furnitureId,
      })
    }
  })

  const handleDragPointerCancel = useEffectEvent((event: PointerEvent) => {
    if (dragRef.current?.pointerId !== event.pointerId) {
      return
    }

    cancelActiveInteraction()
  })

  useEffect(() => {
    window.addEventListener('pointermove', handleDragPointerMove)
    window.addEventListener('pointerup', handleDragPointerUp)
    window.addEventListener('pointercancel', handleDragPointerCancel)

    return () => {
      window.removeEventListener('pointermove', handleDragPointerMove)
      window.removeEventListener('pointerup', handleDragPointerUp)
      window.removeEventListener('pointercancel', handleDragPointerCancel)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      cancelActiveInteractionRef.current?.()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div
      className={[
        'canvas-stage',
        isDragging ? 'dragging' : '',
        showSimplifiedDragPreview ? 'canvas-stage--simplified-drag' : '',
        ui.pendingMeasurementStart ? 'canvas-stage--measuring' : '',
        selectionBox ? 'selecting' : '',
        !draft.showLabelShapes ? 'canvas-stage--plain-labels' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid="canvas-stage"
      onClickCapture={handleMeasurementClickCapture}
      onPointerDownCapture={handleMeasurementPointerDownCapture}
      ref={stageRef}
      style={canvasAppearanceStyle}
    >
      <svg
        ref={svgRef}
        aria-label="Interactive floorplan canvas"
        className="blueprint-canvas"
        tabIndex={0}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && selectedRoom && activeStructure && activeFloor) {
            startInlineRoomEdit({
              kind: 'room',
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

            const canvasPoint = getCanvasPointFromClient(rect.left + rect.width / 2, rect.top + rect.height / 2)
            actions.openContextMenu({
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
              canvasPoint,
              target: ui.focusedTarget ?? canvasTarget,
            })
          }
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
          onClick={handleCanvasBackgroundClick}
          onContextMenu={(event) => openContextMenu(event, canvasTarget)}
          onPointerDown={handleCanvasBackgroundPointerDown}
        />
        {!showSimplifiedDragPreview && draft.showGrid ? (
          <rect
            className="canvas-grid"
            x={viewBox.x}
            y={viewBox.y}
            width={viewBox.width}
            height={viewBox.height}
            fill="url(#major-grid)"
            onClick={handleCanvasBackgroundClick}
            onContextMenu={(event) => openContextMenu(event, canvasTarget)}
            onPointerDown={handleCanvasBackgroundPointerDown}
          />
        ) : null}

        <g transform={viewRotationTransform}>
        {!showSimplifiedDragPreview ? (
          <g className="origin-crosshair">
            <line x1={-1} x2={1} y1={0} y2={0} />
            <line x1={0} x2={0} y1={-1} y2={1} />
          </g>
        ) : null}

        {visibleFloors.map((floor) => (
          <FloorLayer
            key={floor.id}
            activeFloorId={draft.activeFloorId}
            floor={floor}
            isFurnitureMode={draft.editorMode === 'furniture'}
          />
        ))}

        {placedMeasurements.map(({ measurement }) => (
          <g className="canvas-measurement" data-testid={`canvas-measurement-${measurement.id}`} key={measurement.id}>
            <line
              className="canvas-measurement__line"
              data-testid={`canvas-measurement-line-${measurement.id}`}
              vectorEffect="non-scaling-stroke"
              x1={measurement.start.x}
              x2={measurement.end.x}
              y1={-measurement.start.y}
              y2={-measurement.end.y}
            />
            <circle className="canvas-measurement__point" cx={measurement.start.x} cy={-measurement.start.y} r={0.18} />
            <circle className="canvas-measurement__point" cx={measurement.end.x} cy={-measurement.end.y} r={0.18} />
          </g>
        ))}

        {ui.pendingMeasurementStart ? (
          <g className="canvas-measurement canvas-measurement--pending" data-testid="canvas-measurement-pending">
            <circle
              className="canvas-measurement__pending-ring"
              cx={ui.pendingMeasurementStart.x}
              cy={-ui.pendingMeasurementStart.y}
              r={0.34}
            />
            <circle
              className="canvas-measurement__pending-dot"
              cx={ui.pendingMeasurementStart.x}
              cy={-ui.pendingMeasurementStart.y}
              r={0.14}
            />
          </g>
        ) : null}

        {suggestedPreviews.map((preview) => (
          <g key={preview.suggestion.id}>
            <SuggestedPath dataTestId={`suggested-path-${preview.suggestion.id}`} points={preview.points} />
          </g>
        ))}
        {!showSimplifiedDragPreview && selectedRoom && selectedRoomGeometry && activeStructure && activeFloor
          ? getRoomCorners(selectedRoom).map((corner) => {
              const target: CanvasTarget = {
                kind: 'corner',
                structureId: activeStructure.id,
                floorId: activeFloor.id,
                roomId: selectedRoom.id,
                segmentId: corner.segmentId,
              }

              return (
                <circle
                  key={`${corner.segmentId}-hit`}
                  className="corner-hit"
                  cx={corner.point.x}
                  cy={-corner.point.y}
                  data-corner-segment-id={corner.segmentId}
                  data-testid={`corner-hit-${corner.segmentId}`}
                  r={cornerHitRadius}
                  onClick={() => handleCornerClick(target)}
                  onContextMenu={(event) => openContextMenu(event, target)}
                  onMouseEnter={() => actions.setHoveredTarget(target)}
                  onMouseLeave={(event) => handleCornerHoverMouseLeave(event, target)}
                />
              )
            })
          : null}

        {!showSimplifiedDragPreview &&
        draft.editorMode === 'rooms' &&
        selectedRoom &&
        selectedRoomGeometry &&
        activeStructure &&
        activeFloor &&
        selectedRoomGeometry.chains.some((chain) => !chain.closed)
          ? selectedRoomGeometry.chains
              .flatMap((chain) => {
                if (chain.closed || chain.segments.length === 0) {
                  return []
                }

                const firstSegment = chain.segments[0]
                const lastSegment = chain.segments[chain.segments.length - 1]

                return [
                  {
                    key: `${firstSegment.id}-anchor-start`,
                    testId: `anchor-start-${firstSegment.id}`,
                    point: firstSegment.start,
                    onClick: (event: ReactMouseEvent<SVGGElement>) => {
                      event.stopPropagation()
                      actions.openAnchoredWallAngleDialog({
                        structureId: activeStructure.id,
                        floorId: activeFloor.id,
                        roomId: selectedRoom.id,
                        segmentId: firstSegment.id,
                        side: 'before',
                      })
                    },
                  },
                  {
                    key: `${lastSegment.id}-anchor-end`,
                    testId: `anchor-${lastSegment.id}`,
                    point: lastSegment.end,
                    onClick: (event: ReactMouseEvent<SVGGElement>) => {
                      event.stopPropagation()
                      actions.openAnchoredWallAngleDialog({
                        structureId: activeStructure.id,
                        floorId: activeFloor.id,
                        roomId: selectedRoom.id,
                        segmentId: lastSegment.id,
                        side: 'after',
                      })
                    },
                  },
                ]
              })
              .filter(
                (
                  anchor,
                ): anchor is {
                  key: string
                  testId: string
                  point: Point
                  onClick: (event: ReactMouseEvent<SVGGElement>) => void
                } => anchor !== null,
              )
              .map((anchor) => (
                <g
                  key={anchor.key}
                  className="anchor-action"
                  data-testid={anchor.testId}
                  transform={`translate(${anchor.point.x} ${-anchor.point.y}) scale(${anchorActionScale})`}
                  onClick={anchor.onClick}
                >
                  <circle r={ANCHOR_ACTION_RADIUS_PX} vectorEffect="non-scaling-stroke" />
                  <line
                    vectorEffect="non-scaling-stroke"
                    x1={-ANCHOR_ACTION_CROSS_HALF_PX}
                    x2={ANCHOR_ACTION_CROSS_HALF_PX}
                    y1={0}
                    y2={0}
                  />
                  <line
                    vectorEffect="non-scaling-stroke"
                    x1={0}
                    x2={0}
                    y1={-ANCHOR_ACTION_CROSS_HALF_PX}
                    y2={ANCHOR_ACTION_CROSS_HALF_PX}
                  />
                </g>
              ))
          : null}
        </g>
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

      {placedMeasurements.length > 0 || pendingMeasurementScreenPoint ? (
        <div className="canvas-measurement-layer">
          {placedMeasurements.map(({ measurement, labelPoint }) => (
            <div
              className="canvas-measurement-label"
              data-testid={`canvas-measurement-label-${measurement.id}`}
              key={`label-${measurement.id}`}
              style={{
                left: `${labelPoint.x}px`,
                top: `${labelPoint.y}px`,
              }}
            >
              {formatFeet(getMeasurementDistance(measurement))}
            </div>
          ))}
          {pendingMeasurementScreenPoint ? (
            <div
              className="canvas-measurement-label canvas-measurement-label--pending"
              data-testid="canvas-measurement-pending-label"
              style={{
                left: `${pendingMeasurementScreenPoint.x}px`,
                top: `${pendingMeasurementScreenPoint.y - 18}px`,
              }}
            >
              Click endpoint
            </div>
          ) : null}
        </div>
      ) : null}

      {!showSimplifiedDragPreview
        ? visibleCornerOverlays.map((cornerOverlay) => (
            <div className="canvas-hover-layer" data-testid={`corner-hover-overlay-${cornerOverlay.target.segmentId}`} key={cornerOverlay.target.segmentId}>
              <svg
                aria-hidden="true"
                className="canvas-corner-hover-svg"
                preserveAspectRatio="none"
                viewBox={`0 0 ${canvasMetrics.widthPx} ${canvasMetrics.heightPx}`}
              >
                <path className="canvas-corner-hover-arc-shadow" d={cornerOverlay.arcPath} />
                <path
                  className="canvas-corner-hover-arc"
                  d={cornerOverlay.arcPath}
                  data-testid={`corner-hover-arc-${cornerOverlay.target.segmentId}`}
                />
              </svg>
              {inlineCornerEditor?.target.segmentId === cornerOverlay.target.segmentId ? (
                <input
                  ref={inlineCornerInputRef}
                  aria-label="Corner angle"
                  className={[
                    'canvas-corner-hover-label',
                    'canvas-corner-hover-input',
                    'editing',
                    inlineCornerEditor.error ? 'invalid' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-corner-segment-id={cornerOverlay.target.segmentId}
                  data-testid={`corner-label-${cornerOverlay.target.segmentId}`}
                  inputMode="numeric"
                  style={{
                    left: `${cornerOverlay.labelPoint.x}px`,
                    top: `${cornerOverlay.labelPoint.y}px`,
                  }}
                  type="text"
                  value={inlineCornerEditor.value}
                  onBlur={(event) => commitInlineCornerEdit(event.currentTarget.value)}
                  onChange={(event) =>
                    setInlineCornerEditor((current) =>
                      current && current.target.segmentId === cornerOverlay.target.segmentId
                        ? {
                            ...current,
                            value: event.target.value,
                            error: null,
                          }
                        : current,
                    )
                  }
                  onContextMenu={(event) => openContextMenu(event, cornerOverlay.target)}
                  onKeyDown={handleInlineCornerInputKeyDown}
                  onMouseEnter={() => actions.setHoveredTarget(cornerOverlay.target)}
                  onMouseLeave={(event) => handleCornerHoverMouseLeave(event, cornerOverlay.target)}
                />
              ) : (
                <button
                  className="canvas-corner-hover-label canvas-corner-hover-button"
                  data-corner-segment-id={cornerOverlay.target.segmentId}
                  data-testid={`corner-label-${cornerOverlay.target.segmentId}`}
                  style={{
                    left: `${cornerOverlay.labelPoint.x}px`,
                    top: `${cornerOverlay.labelPoint.y}px`,
                  }}
                  type="button"
                  onClick={() => startInlineCornerEdit(cornerOverlay.target)}
                  onContextMenu={(event) => openContextMenu(event, cornerOverlay.target)}
                  onMouseEnter={() => actions.setHoveredTarget(cornerOverlay.target)}
                  onMouseLeave={(event) => handleCornerHoverMouseLeave(event, cornerOverlay.target)}
                >
                  {cornerOverlay.text}
                </button>
              )}
            </div>
          ))
        : null}

      {!showSimplifiedDragPreview ? (
        <>
          <div aria-label="Canvas display toggles" className="canvas-toolbar canvas-toolbar--toggles">
            <div className="canvas-toolbar-group canvas-toolbar-group--toggles">
              <label className="canvas-toolbar-select">
                <select
                  aria-label="View options room scope"
                  value={draft.canvasRoomVisibilityScope}
                  onChange={(event) =>
                    actions.setCanvasRoomVisibilityScope(event.target.value as CanvasRoomVisibilityScope)
                  }
                >
                  <option value="all">All Rooms</option>
                  <option value="selected">Selected Room</option>
                </select>
              </label>
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
                <span>Labels</span>
              </label>
              <label className="toggle">
                <input
                  checked={draft.showWallLabels}
                  type="checkbox"
                  onChange={(event) => actions.toggleWallLabels(event.target.checked)}
                />
                <span>Wall Lengths</span>
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
          <div aria-label="Canvas view controls" className="canvas-toolbar canvas-toolbar--camera">
            <div className="canvas-toolbar-group canvas-toolbar-group--zoom">
              <button
                aria-label="Rotate view counterclockwise"
                className="ghost-button small icon-button canvas-toolbar-icon-button"
                onClick={() => setViewRotationQuarterTurns((current) => normalizeQuarterTurns(current - 1))}
                title="Rotate view counterclockwise"
                type="button"
              >
                <RotateViewIcon direction="counterclockwise" />
              </button>
              <button
                aria-label="Rotate view clockwise"
                className="ghost-button small icon-button canvas-toolbar-icon-button"
                onClick={() => setViewRotationQuarterTurns((current) => normalizeQuarterTurns(current + 1))}
                title="Rotate view clockwise"
                type="button"
              >
                <RotateViewIcon direction="clockwise" />
              </button>
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
          </div>
        </>
      ) : null}

      {!showSimplifiedDragPreview ? (
        <div aria-label="Canvas mode selector" className="canvas-mode-switch" data-testid="canvas-mode-switch">
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
      ) : null}

      {!showSimplifiedDragPreview ? (
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
      ) : null}

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
              !draft.showLabelShapes ? 'canvas-annotation--plain' : '',
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
                    </div>
                  )
                })()
              ) : annotation.kind === 'furniture' && annotation.target.kind === 'furniture' ? (
                (() => {
                  const furnitureTarget = annotation.target
                  const editing = inlineFurnitureEditor?.target.furnitureId === furnitureTarget.furnitureId
                  const invalid = editing && Boolean(inlineFurnitureEditor?.error)

                  return (
                    <div
                      className={[className, 'canvas-furniture-chip', editing ? 'editing' : '', invalid ? 'invalid' : '']
                        .filter(Boolean)
                        .join(' ')}
                      key={`${annotation.kind}-${annotation.id}`}
                      onContextMenu={(event) => openContextMenu(event, furnitureTarget)}
                      onMouseEnter={() => actions.setHoveredTarget(furnitureTarget)}
                      onMouseLeave={() => actions.setHoveredTarget(null)}
                      style={{
                        left: `${annotation.position.x}px`,
                        top: `${annotation.position.y}px`,
                        minWidth: `${annotation.widthPx}px`,
                      }}
                    >
                      {editing ? (
                        <input
                          ref={inlineFurnitureInputRef}
                          aria-label="Furniture name"
                          className="canvas-furniture-chip__input"
                          data-testid={`furniture-label-${annotation.id}`}
                          size={Math.max(8, inlineFurnitureEditor?.value.length ?? annotation.text.length)}
                          type="text"
                          value={inlineFurnitureEditor?.value ?? ''}
                          onBlur={(event) => commitInlineFurnitureEdit(event.currentTarget.value)}
                          onChange={(event) =>
                            setInlineFurnitureEditor((current) =>
                              current && current.target.furnitureId === furnitureTarget.furnitureId
                                ? {
                                    ...current,
                                    value: event.target.value,
                                    error: null,
                                  }
                                : current,
                            )
                          }
                          onKeyDown={handleInlineFurnitureInputKeyDown}
                        />
                      ) : (
                        <button
                          className="canvas-furniture-chip__value"
                          data-testid={`furniture-label-${annotation.id}`}
                          onClick={() => startInlineFurnitureEdit(furnitureTarget)}
                          type="button"
                        >
                          {annotation.text}
                        </button>
                      )}
                    </div>
                  )
                })()
              ) : annotation.kind === 'room' && annotation.target.kind === 'room' ? (
                (() => {
                  const roomTarget = annotation.target
                  const editing = inlineRoomEditor?.roomId === roomTarget.roomId
                  const invalid = editing && Boolean(inlineRoomEditor?.error)

                  return editing ? (
                    <div
                      className={[className, editing ? 'editing' : '', invalid ? 'invalid' : '']
                        .filter(Boolean)
                        .join(' ')}
                      key={`${annotation.kind}-${annotation.id}`}
                      onContextMenu={(event) => openContextMenu(event, roomTarget)}
                      onMouseEnter={() => actions.setHoveredTarget(roomTarget)}
                      onMouseLeave={() => actions.setHoveredTarget(null)}
                      style={{
                        left: `${annotation.position.x}px`,
                        top: `${annotation.position.y}px`,
                        minWidth: `${annotation.widthPx}px`,
                      }}
                    >
                      <input
                        ref={inlineRoomInputRef}
                        aria-label="Room name"
                        className="canvas-annotation__input"
                        data-testid={`room-label-${annotation.id}`}
                        maxLength={512}
                        type="text"
                        value={inlineRoomEditor?.value ?? ''}
                        onBlur={(event) => commitInlineRoomEdit(event.currentTarget.value)}
                        onChange={(event) =>
                          setInlineRoomEditor((current) =>
                            current && current.roomId === roomTarget.roomId
                              ? {
                                  ...current,
                                  value: event.target.value,
                                  error: null,
                                }
                              : current,
                          )
                        }
                        onKeyDown={handleInlineRoomInputKeyDown}
                      />
                    </div>
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

      {suggestedPreviews.some((preview) => preview.showActions) ? (
        <div aria-label="Canvas inference suggestions" className="canvas-suggestion-layer">
          {suggestedPreviews.filter((preview) => preview.showActions).map((preview) => {
            const position = toCanvasPercentages(preview.actionPoint, viewBox, viewRotationQuarterTurns)

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
    const selectedWallCount = ui.selectionTargets.filter((item) => item.kind === 'wall').length
    const preserveWallGroupSelection = selectedWallCount > 1 && target.kind !== 'structure'

    if (preserveWallGroupSelection && target.kind === 'canvas') {
      actions.setFocusedTarget(target)
    } else if (target.kind === 'canvas') {
      actions.setFocusedTarget(target)
    } else if (!preserveWallGroupSelection && !isTargetSelected(ui.selectionTargets, target)) {
      actions.selectTarget(target)
    }
    actions.openContextMenu({
      x: event.clientX,
      y: event.clientY,
      canvasPoint: getCanvasPointFromClient(event.clientX, event.clientY),
      target,
    })
  }

  function clearSuppressedTargetClick() {
    suppressTargetClickRef.current = null
    if (suppressTargetClickTimerRef.current !== null) {
      window.clearTimeout(suppressTargetClickTimerRef.current)
      suppressTargetClickTimerRef.current = null
    }
  }

  function suppressNextTargetClick(target: CanvasTarget, options?: { persistUntilConsumed?: boolean }) {
    suppressTargetClickRef.current = target
    if (suppressTargetClickTimerRef.current !== null) {
      window.clearTimeout(suppressTargetClickTimerRef.current)
      suppressTargetClickTimerRef.current = null
    }

    if (options?.persistUntilConsumed) {
      return
    }

    suppressTargetClickTimerRef.current = window.setTimeout(() => {
      suppressTargetClickRef.current = null
      suppressTargetClickTimerRef.current = null
    }, 0)
  }

  function consumeSuppressedTargetClick(target: CanvasTarget) {
    if (!matchesTarget(suppressTargetClickRef.current, target)) {
      return false
    }

    clearSuppressedTargetClick()
    return true
  }

  function handleWallClick(target: CanvasTarget) {
    if (target.kind !== 'wall') {
      return
    }

    if (consumeSuppressedTargetClick(target)) {
      return
    }

    selectWallTarget(target)
  }

  function selectWallTarget(target: Extract<CanvasTarget, { kind: 'wall' }>) {
    actions.selectTarget(target)
    setInlineRoomEditor(null)
    setInlineWallEditor(null)
    setInlineFurnitureEditor(null)
    setInlineCornerEditor(null)
  }

  function handleCornerClick(target: CanvasTarget) {
    if (target.kind !== 'corner') {
      return
    }

    actions.selectTarget(target)
    setInlineRoomEditor(null)
    setInlineWallEditor(null)
    setInlineFurnitureEditor(null)
    setInlineCornerEditor(null)
    actions.openCornerDialog({
      structureId: target.structureId,
      floorId: target.floorId,
      roomId: target.roomId,
      segmentId: target.segmentId,
    })
  }

  function handleAnnotationClick(annotation: PlacedCanvasAnnotation) {
    if (consumeSuppressedTargetClick(annotation.target)) {
      return
    }

    switch (annotation.target.kind) {
      case 'floor':
        actions.selectFloor(annotation.target.structureId, annotation.target.floorId)
        return
      case 'room':
        startInlineRoomEdit(annotation.target)
        return
      case 'furniture':
        startInlineFurnitureEdit(annotation.target)
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

  function startInlineRoomEdit(target: Extract<CanvasTarget, { kind: 'room' }>) {
    const room = findRoomById(draft, target.structureId, target.floorId, target.roomId)

    if (!room) {
      return
    }

    actions.selectRoom(target.structureId, target.floorId, target.roomId)
    setInlineWallEditor(null)
    setInlineCornerEditor(null)
    setInlineRoomEditor({
      structureId: target.structureId,
      floorId: target.floorId,
      roomId: target.roomId,
      value: room.name,
      error: null,
    })
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
    setInlineRoomEditor(null)
    setInlineCornerEditor(null)
    setInlineFurnitureEditor(null)
    setInlineWallEditor({
      segmentId: target.segmentId,
      value: formatEditableLength(segment.length),
      error: null,
    })
  }

  function startInlineCornerEdit(target: Extract<CanvasTarget, { kind: 'corner' }>) {
    const room = findRoomById(draft, target.structureId, target.floorId, target.roomId)
    const corner = room ? getRoomCorners(room).find((item) => item.segmentId === target.segmentId) ?? null : null

    if (!corner) {
      return
    }

    actions.selectTarget(target)
    setInlineRoomEditor(null)
    setInlineWallEditor(null)
    setInlineFurnitureEditor(null)
    setInlineCornerEditor({
      target,
      value: String(getCornerAngleBetweenWalls(corner.turn)),
      direction: corner.turn < -0.5 ? 'right' : 'left',
      error: null,
    })
  }

  function commitInlineRoomEdit(nextValue?: string) {
    if (!inlineRoomEditor) {
      return
    }

    const value = nextValue ?? inlineRoomEditor.value
    const validation = validateName(value)

    if (!validation.valid) {
      setInlineRoomEditor((current) =>
        current && current.roomId === inlineRoomEditor.roomId
          ? {
              ...current,
              error: validation.error,
            }
          : current,
      )
      if (validation.error) {
        actions.setStatus(validation.error)
      }
      return
    }

    const result = actions.renameEntity(
      'room',
      {
        structureId: inlineRoomEditor.structureId,
        floorId: inlineRoomEditor.floorId,
        roomId: inlineRoomEditor.roomId,
      },
      value,
    )

    if (!result.valid) {
      setInlineRoomEditor((current) =>
        current && current.roomId === inlineRoomEditor.roomId
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

    setInlineRoomEditor(null)
  }

  function startInlineFurnitureEdit(target: Extract<CanvasTarget, { kind: 'furniture' }>) {
    const item = findFurnitureById(draft, target.structureId, target.floorId, target.roomId, target.furnitureId)

    if (!item) {
      return
    }

    actions.selectFurniture(target.structureId, target.floorId, target.roomId, target.furnitureId)
    setInlineWallEditor(null)
    setInlineCornerEditor(null)
    setInlineFurnitureEditor({
      target,
      value: item.name,
      error: null,
    })
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

  function commitInlineFurnitureEdit(nextValue?: string) {
    if (!inlineFurnitureEditor) {
      return
    }

    const target = inlineFurnitureEditor.target
    const item = findFurnitureById(draft, target.structureId, target.floorId, target.roomId, target.furnitureId)

    if (!item) {
      setInlineFurnitureEditor(null)
      return
    }

    const value = nextValue ?? inlineFurnitureEditor.value
    const validation = validateName(value)

    if (!validation.valid) {
      setInlineFurnitureEditor((current) =>
        current && current.target.furnitureId === target.furnitureId
          ? {
              ...current,
              error: validation.error,
            }
          : current,
      )
      if (validation.error) {
        actions.setStatus(validation.error)
      }
      return
    }

    if (item.name === value) {
      setInlineFurnitureEditor(null)
      return
    }

    actions.mutateDraft((draftState) => {
      const editableItem = findFurnitureById(
        draftState,
        target.structureId,
        target.floorId,
        target.roomId,
        target.furnitureId,
      )

      if (!editableItem) {
        return
      }

      editableItem.name = value
    }, {
      status: 'Furniture renamed.',
    })

    setInlineFurnitureEditor(null)
  }

  function commitInlineCornerEdit(nextValue?: string) {
    if (!inlineCornerEditor) {
      return
    }

    const value = nextValue ?? inlineCornerEditor.value
    const numericValue = value.trim() === '' ? Number.NaN : Number(value)

    if (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > 360) {
      const error = CORNER_ANGLE_ERROR
      setInlineCornerEditor((current) =>
        current && current.target.segmentId === inlineCornerEditor.target.segmentId
          ? {
              ...current,
              error,
            }
          : current,
      )
      actions.setStatus(error)
      return
    }

    const turn = getTurnFromCornerAngle(numericValue, inlineCornerEditor.direction)
    const result = actions.updateCorner(
      {
        structureId: inlineCornerEditor.target.structureId,
        floorId: inlineCornerEditor.target.floorId,
        roomId: inlineCornerEditor.target.roomId,
        segmentId: inlineCornerEditor.target.segmentId,
      },
      { turn },
    )

    if (!result.valid) {
      setInlineCornerEditor((current) =>
        current && current.target.segmentId === inlineCornerEditor.target.segmentId
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

    setInlineCornerEditor(null)
  }

  function handleInlineRoomInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitInlineRoomEdit(event.currentTarget.value)
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setInlineRoomEditor(null)
    }
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

  function handleInlineFurnitureInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitInlineFurnitureEdit(event.currentTarget.value)
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setInlineFurnitureEditor(null)
    }
  }

  function handleInlineCornerInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitInlineCornerEdit(event.currentTarget.value)
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setInlineCornerEditor(null)
    }
  }

  function handleCornerHoverMouseLeave(
    event: ReactMouseEvent<Element>,
    target: Extract<CanvasTarget, { kind: 'corner' }>,
  ) {
    if (matchesCornerHoverElement(event.relatedTarget, target.segmentId)) {
      return
    }

    actions.setHoveredTarget(null)
  }

  function matchesCornerHoverElement(target: EventTarget | null, segmentId: string) {
    return target instanceof HTMLElement && target.dataset.cornerSegmentId === segmentId
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
        source: 'annotation',
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        structureId: target.structureId,
        floorId: target.floorId,
        roomId: target.roomId,
        startX: room.anchor.x,
        startY: room.anchor.y,
        currentX: room.anchor.x,
        currentY: room.anchor.y,
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
        currentX: item.x,
        currentY: item.y,
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

    clearSuppressedTargetClick()

    if (dragState.kind === 'room' || dragState.kind === 'furniture') {
      setDragViewBounds(ui.camera.frameBounds)
    }

    dragRef.current = dragState
    setDragState(dragState)
    setIsDragging(true)
  }

  function endDrag() {
    setDragViewBounds(null)
    dragRef.current = null
    setDragState(null)
    setIsDragging(false)
  }

  function shouldCaptureMeasurementEvent(target: EventTarget | null) {
    return !(
      target instanceof Element &&
      target.closest('.canvas-toolbar, .canvas-mode-switch, .canvas-key, .canvas-suggestion-layer')
    )
  }

  function isCanvasBackgroundTarget(target: EventTarget | null) {
    return (
      target instanceof Element &&
      (
        target.classList.contains('canvas-underlay') ||
        target.classList.contains('canvas-grid') ||
        target.classList.contains('blueprint-canvas') ||
        target.classList.contains('canvas-stage')
      )
    )
  }

  function getCanvasPointFromClient(clientX: number, clientY: number) {
    if (!svgRef.current) {
      return null
    }

    const rect = svgRef.current.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      return null
    }

    const svgPoint = screenToBaseSvgPoint(clientX, clientY, rect, viewBox, viewRotationQuarterTurns)

    return {
      x: svgPoint.x,
      y: -svgPoint.y,
    }
  }

  function handleMeasurementPointerDownCapture(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return
    }

    if (isCanvasBackgroundTarget(event.target)) {
      clearSelectedFurniture()
      actions.clearSelectionTargets()
    }

    if (!ui.pendingMeasurementStart || !shouldCaptureMeasurementEvent(event.target)) {
      return
    }

    const endpoint = getCanvasPointFromClient(event.clientX, event.clientY)

    if (!endpoint) {
      return
    }

    suppressMeasurementClickRef.current = true
    event.preventDefault()
    event.stopPropagation()
    actions.completeMeasurement(endpoint)
  }

  function handleMeasurementClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    if (suppressMeasurementClickRef.current) {
      suppressMeasurementClickRef.current = false
      event.preventDefault()
      event.stopPropagation()
      return
    }

    if (event.button !== 0 || !ui.pendingMeasurementStart || !shouldCaptureMeasurementEvent(event.target)) {
      return
    }

    const endpoint = getCanvasPointFromClient(event.clientX, event.clientY)

    if (!endpoint) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    actions.completeMeasurement(endpoint)
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
    const strokePath = geometry.chains
      .map((chain) => pointsToPath(chain.closed ? chain.points.slice(0, -1) : chain.points))
      .filter(Boolean)
      .join(' ')
    const fillPath = geometry.chains
      .filter((chain) => chain.closed)
      .map((chain) => `${pointsToPath(chain.points.slice(0, -1))} Z`)
      .join(' ')
    const openRoomHitPath =
      geometry.chains
        .filter((chain) => !chain.closed && chain.points.length >= 3)
        .map((chain) => `${pointsToPath(chain.points)} Z`)
        .join(' ') || null
    const roomTarget: CanvasTarget = {
      kind: 'room',
      structureId: activeStructure.id,
      floorId: floor.id,
      roomId: room.id,
    }
    const active = draft.selectedRoomId === room.id
    const hovered = matchesTarget(ui.hoveredTarget, roomTarget)
    const multiSelected = isTargetSelected(ui.selectionTargets, roomTarget)
    const isWallSelected = (segmentId: string) =>
      isTargetSelected(ui.selectionTargets, {
        kind: 'wall',
        structureId: activeStructure.id,
        floorId: floor.id,
        roomId: room.id,
        segmentId,
      })
    const roomDragDelta = getDraggedRoomDelta(dragState, activeStructure.id, floor.id, room.id)
    const roomTransform = roomDragDelta ? `translate(${roomDragDelta.x} ${-roomDragDelta.y})` : undefined

    const roomHandlers = {
      onPointerDown: (event: ReactPointerEvent<SVGPathElement>) => {
        actions.selectRoom(activeStructure.id, floor.id, room.id)
        beginDrag(event, {
          kind: 'room',
          source: 'room',
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          structureId: activeStructure.id,
          floorId: floor.id,
          roomId: room.id,
          startX: room.anchor.x,
          startY: room.anchor.y,
          currentX: room.anchor.x,
          currentY: room.anchor.y,
          moved: false,
        })
      },
      onClick: () => {
        if (consumeSuppressedTargetClick(roomTarget)) {
          return
        }
        actions.selectRoom(activeStructure.id, floor.id, room.id)
      },
      onContextMenu: (event: ReactMouseEvent<SVGPathElement>) => openContextMenu(event, roomTarget),
      onMouseEnter: () => actions.setHoveredTarget(roomTarget),
      onMouseLeave: () => actions.setHoveredTarget(null),
    }

    return (
      <g
        className={active || multiSelected ? 'room-layer active' : 'room-layer'}
        data-testid={`room-layer-${room.id}`}
        transform={roomTransform}
      >
        {!showSimplifiedDragPreview && openRoomHitPath ? (
          <path
            className="room-hit-area"
            d={openRoomHitPath}
            data-testid={`room-hit-${room.id}`}
            fill="transparent"
            pointerEvents="all"
            {...roomHandlers}
          />
        ) : null}
        {!showSimplifiedDragPreview && fillPath ? (
          <path
            className={['room-fill', hovered ? 'hovered' : '', multiSelected ? 'selected' : ''].filter(Boolean).join(' ')}
            d={fillPath}
            data-testid={`room-fill-${room.id}`}
            fill="#ffffff"
            fillOpacity={active || multiSelected ? 0.16 : 0.06}
            stroke="none"
            {...roomHandlers}
          />
        ) : !showSimplifiedDragPreview && strokePath ? (
          <path
            className={['room-stroke', 'open', hovered ? 'hovered' : '', multiSelected ? 'selected' : ''].filter(Boolean).join(' ')}
            d={strokePath}
            data-testid={`room-stroke-${room.id}`}
            fill="none"
            stroke="transparent"
            strokeWidth={0.92}
            {...roomHandlers}
          />
        ) : null}

        {geometry.segments.map((segment) => {
          const wallSelected = isWallSelected(segment.id)

          return (
            <line
              key={segment.id}
              className={[
                'room-segment',
                hovered ? 'hovered' : '',
                active || multiSelected ? 'active' : '',
                wallSelected ? 'selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              data-testid={`room-segment-${segment.id}`}
              vectorEffect="non-scaling-stroke"
              x1={segment.start.x}
              x2={segment.end.x}
              y1={-segment.start.y}
              y2={-segment.end.y}
            />
          )
        })}

        {!showSimplifiedDragPreview
          ? geometry.segments.map((segment) => {
              const target: CanvasTarget = {
                kind: 'wall',
                structureId: activeStructure.id,
                floorId: floor.id,
                roomId: room.id,
                segmentId: segment.id,
              }
              const wallSelected = isWallSelected(segment.id)

              return (
                <line
                  key={`${segment.id}-hit`}
                  className={[
                    'wall-hit',
                    matchesTarget(ui.hoveredTarget, target) ? 'hovered' : '',
                    wallSelected ? 'selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-testid={`wall-hit-${segment.id}`}
                  stroke="transparent"
                  strokeWidth={wallHitStrokeWidthPx}
                  vectorEffect="non-scaling-stroke"
                  x1={segment.start.x}
                  x2={segment.end.x}
                  y1={-segment.start.y}
                  y2={-segment.end.y}
                  onPointerDown={(event) => {
                    actions.selectTarget(target)
                    beginDrag(event, {
                      kind: 'wall',
                      pointerId: event.pointerId,
                      clientX: event.clientX,
                      clientY: event.clientY,
                      structureId: target.structureId,
                      floorId: target.floorId,
                      roomId: target.roomId,
                      segmentId: target.segmentId,
                      startX: room.anchor.x,
                      startY: room.anchor.y,
                      currentX: room.anchor.x,
                      currentY: room.anchor.y,
                      moved: false,
                    })
                  }}
                  onClick={() => handleWallClick(target)}
                  onContextMenu={(event) => openContextMenu(event, target)}
                  onMouseEnter={() => actions.setHoveredTarget(target)}
                  onMouseLeave={() => actions.setHoveredTarget(null)}
                />
              )
            })
          : null}

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
              const furnitureActive = draft.selectedFurnitureId === item.id || furnitureSelected
              const centerX = item.x + item.width / 2
              const centerY = item.y + item.depth / 2

              return (
                <g
                  key={item.id}
                  className={furnitureActive ? 'furniture-layer active' : 'furniture-layer'}
                  transform={`rotate(${-item.rotation} ${centerX} ${-centerY})`}
                >
                  <rect
                    className={['furniture-rect', furnitureHovered ? 'hovered' : '', furnitureActive ? 'selected' : ''].filter(Boolean).join(' ')}
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
                        currentX: item.x,
                        currentY: item.y,
                        moved: false,
                      })
                    }}
                    onClick={() => {
                      if (consumeSuppressedTargetClick(furnitureTarget)) {
                        return
                      }
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

    return (
      <path
        className="suggested-path"
        d={pointsToPath(points)}
        data-testid={dataTestId}
        style={{
          strokeDasharray: SUGGESTION_DASH_PATTERN,
          strokeLinecap: 'butt',
        }}
        vectorEffect="non-scaling-stroke"
      />
    )
  }
}

function getDraggedRoomDelta(
  dragState: DragState,
  structureId: string,
  floorId: string,
  roomId: string,
): Point | null {
  if (
    !dragState ||
    (dragState.kind !== 'room' && dragState.kind !== 'wall') ||
    dragState.structureId !== structureId ||
    dragState.floorId !== floorId ||
    dragState.roomId !== roomId
  ) {
    return null
  }

  return {
    x: dragState.currentX - dragState.startX,
    y: dragState.currentY - dragState.startY,
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
  visibleFloors,
  viewBox,
  canvasMetrics,
  viewRotationQuarterTurns,
  showFurniture,
}: {
  activeStructureId?: string
  visibleFloors: Floor[]
  viewBox: { x: number; y: number; width: number; height: number }
  canvasMetrics: CanvasMetrics
  viewRotationQuarterTurns: number
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
        rect: getScreenRectFromWorldBounds(geometry.bounds, viewBox, canvasMetrics, viewRotationQuarterTurns),
      })

      geometry.segments.forEach((segment) => {
        const start = worldToScreenPoint(segment.start, viewBox, canvasMetrics, viewRotationQuarterTurns)
        const end = worldToScreenPoint(segment.end, viewBox, canvasMetrics, viewRotationQuarterTurns)
        targets.push({
          target: {
            kind: 'wall',
            structureId: activeStructureId,
            floorId: floor.id,
            roomId: room.id,
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
              minY: item.y,
              maxY: item.y + item.depth,
            },
            viewBox,
            canvasMetrics,
            viewRotationQuarterTurns,
          ),
        })
      })
    })
  })

  return targets
}

function shouldIgnoreWheelZoom(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false
  }

  return Boolean(target.closest('input, textarea, select, .canvas-toolbar, .canvas-key, .canvas-suggestion-layer'))
}

function RotateViewIcon({ direction }: { direction: 'clockwise' | 'counterclockwise' }) {
  const isClockwise = direction === 'clockwise'

  return (
    <svg
      aria-hidden="true"
      className="canvas-toolbar-icon"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.55"
      viewBox="0 0 20 20"
    >
      {isClockwise ? (
        <>
          <path d="M14.8 8.7a5.85 5.85 0 1 1-7.1-4.15" />
          <path d="M7.15 3.95 4 4.3l1.85 2.65Z" fill="currentColor" stroke="none" />
        </>
      ) : (
        <>
          <path d="M5.2 8.7a5.85 5.85 0 1 0 7.1-4.15" />
          <path d="M12.85 3.95 16 4.3 14.15 6.95Z" fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  )
}

function hasSuggestedSegments(
  suggestion: RoomSuggestion,
): suggestion is RoomSuggestion & { segmentsToAdd: SuggestionSegment[] } {
  return Array.isArray(suggestion.segmentsToAdd) && suggestion.segmentsToAdd.length > 0
}

function getSuggestionLength(suggestion: RoomSuggestion & { segmentsToAdd: SuggestionSegment[] }) {
  return suggestion.segmentsToAdd.reduce((sum, segment) => sum + segment.length, 0)
}

function getPrimaryShapeSuggestion(suggestions: RoomSuggestion[]) {
  return suggestions.filter(hasSuggestedSegments).reduce<RoomSuggestion & { segmentsToAdd: SuggestionSegment[] } | null>(
    (best, suggestion) => {
      if (!best || getSuggestionLength(suggestion) < getSuggestionLength(best)) {
        return suggestion
      }

      return best
    },
    null,
  )
}

function buildSuggestionPreview(
  room: Room,
  floorId: string,
  suggestion: RoomSuggestion & { segmentsToAdd: SuggestionSegment[] },
  showActions: boolean,
) {
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
    floorId,
    roomId: room.id,
    showActions,
    points,
    anchorPoint: midpoint(referenceSegment.start, referenceSegment.end),
    heading: referenceSegment.heading,
    length: referenceSegment.length,
  }
}

function toCanvasPercentages(
  point: Point,
  viewBox: { x: number; y: number; width: number; height: number },
  viewRotationQuarterTurns = 0,
) {
  const rotatedPoint = rotateSvgPoint({ x: point.x, y: -point.y }, getViewBoxCenterPoint(viewBox), viewRotationQuarterTurns)

  return {
    left: ((rotatedPoint.x - viewBox.x) / viewBox.width) * 100,
    top: ((rotatedPoint.y - viewBox.y) / viewBox.height) * 100,
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

function getHoverHitboxScale(zoom: number) {
  return clamp(1 / Math.max(zoom, 0.01), MIN_HOVER_HITBOX_SCALE, MAX_HOVER_HITBOX_SCALE)
}

function getWorldLengthForScreenPixels(metrics: CanvasMetrics, pixels: number) {
  return pixels * Math.max(metrics.unitX, metrics.unitY)
}

function getCanvasToolbarRect(
  viewBox: { x: number; y: number; width: number; height: number },
  metrics: CanvasMetrics,
) {
  const right = 16 * metrics.unitX
  const top = 16 * metrics.unitY
  const width = Math.min(420, Math.max(320, metrics.widthPx * 0.4)) * metrics.unitX
  const height = (metrics.widthPx < 760 ? 172 : 152) * metrics.unitY
  const maxX = viewBox.x + viewBox.width - right
  const minY = viewBox.y + top

  return {
    minX: maxX - width,
    maxX,
    minY,
    maxY: minY + height,
  }
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

function getCanvasModeSwitchRect(
  viewBox: { x: number; y: number; width: number; height: number },
  metrics: CanvasMetrics,
) {
  const bottom = 16 * metrics.unitY
  const width = Math.min(320, Math.max(248, metrics.widthPx - 32)) * metrics.unitX
  const height = 60 * metrics.unitY
  const maxY = viewBox.y + viewBox.height - bottom

  return makeCenteredRect(viewBox.x + viewBox.width / 2, maxY - height / 2, width, height)
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

function getRectArea(rect: CanvasRect) {
  return Math.max(0, rect.maxX - rect.minX) * Math.max(0, rect.maxY - rect.minY)
}

function getRectOutsideArea(rect: CanvasRect, container: CanvasRect) {
  return Math.max(0, getRectArea(rect) - overlapArea(rect, container))
}

function getWorldDistanceFromPixels(metrics: CanvasMetrics, pixels: number) {
  return Math.max(metrics.unitX, metrics.unitY) * pixels
}

function getScreenPointDistance(left: ScreenPoint, right: ScreenPoint) {
  return Math.hypot(left.x - right.x, left.y - right.y)
}

function getPointToSegmentDistance(point: ScreenPoint, start: ScreenPoint, end: ScreenPoint) {
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const lengthSquared = deltaX ** 2 + deltaY ** 2

  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y)
  }

  const projection = ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared
  const t = clamp(projection, 0, 1)
  const closest = {
    x: start.x + deltaX * t,
    y: start.y + deltaY * t,
  }

  return Math.hypot(point.x - closest.x, point.y - closest.y)
}

function getSuggestionCandidateOffsets(
  preview: SuggestionPreview,
  metrics: CanvasMetrics,
  clusterIndex: number,
) {
  const suggestedStep = getWorldDistanceFromPixels(metrics, Math.hypot(SUGGESTION_ACTION_WIDTH_PX, SUGGESTION_ACTION_HEIGHT_PX) + 12)
  const maxOffset = Math.max(preview.length / 2 - getWorldDistanceFromPixels(metrics, 12), 0)
  const clampOffset = (distance: number) => clamp(distance, -maxOffset, maxOffset)
  const direction = clusterIndex % 2 === 0 ? 1 : -1
  const preferredOffsets = [0, suggestedStep * direction, -suggestedStep * direction, suggestedStep * 2 * direction, -suggestedStep * 2 * direction]

  return preferredOffsets.map((offset) => clampOffset(offset))
}

function estimateSuggestionActionRect(point: Point, metrics: CanvasMetrics) {
  return makeCenteredRect(
    point.x,
    -point.y,
    SUGGESTION_ACTION_WIDTH_PX * metrics.unitX,
    SUGGESTION_ACTION_HEIGHT_PX * metrics.unitY,
  )
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
  viewRotationQuarterTurns: number,
  reservedRects: CanvasRect[],
): PlacedSuggestionPreview[] {
  const occupied = [...reservedRects]
  const placements = new Map<string, PlacedSuggestionPreview>()
  const placedReferences: Array<{
    anchorScreenPoint: ScreenPoint
    actionScreenPoint: ScreenPoint
  }> = []
  const occupiedPaddingX = getWorldDistanceFromPixels(metrics, 28)
  const occupiedPaddingY = getWorldDistanceFromPixels(metrics, 34)
  const clusterRadiusPx = 112
  const preferredActionSpacingPx = 118
  const stackedLaneWidthPx = SUGGESTION_ACTION_WIDTH_PX
  const stackedLaneHeightPx = SUGGESTION_ACTION_HEIGHT_PX

  const orderedPreviews = previews
    .map((preview, originalIndex) => ({
      preview,
      originalIndex,
      anchorScreenPoint: worldToScreenPoint(preview.anchorPoint, viewBox, metrics, viewRotationQuarterTurns),
    }))
    .sort(
      (left, right) =>
        left.anchorScreenPoint.y - right.anchorScreenPoint.y ||
        left.anchorScreenPoint.x - right.anchorScreenPoint.x ||
        left.originalIndex - right.originalIndex,
    )

  orderedPreviews.forEach(({ preview, anchorScreenPoint }) => {
    const clusterIndex = placedReferences.filter(
      (reference) => getScreenPointDistance(reference.anchorScreenPoint, anchorScreenPoint) < clusterRadiusPx,
    ).length
    const candidateOffsets = getSuggestionCandidateOffsets(preview, metrics, clusterIndex)
    const candidates = candidateOffsets.map((offset, offsetIndex) => {
      const actionPoint = clampSuggestionActionPoint(addPolar(preview.anchorPoint, offset, preview.heading), viewBox, metrics)
      const actionRect = estimateSuggestionActionRect(actionPoint, metrics)
      const actionScreenPoint = worldToScreenPoint(actionPoint, viewBox, metrics, viewRotationQuarterTurns)
      const overlap = occupied.reduce((sum, rect) => sum + overlapArea(actionRect, rect), 0)
      const crowdingPenalty = placedReferences.reduce((sum, reference) => {
        const distance = getScreenPointDistance(actionScreenPoint, reference.actionScreenPoint)
        if (distance >= preferredActionSpacingPx) {
          return sum
        }

        return sum + (preferredActionSpacingPx - distance) ** 2
      }, 0)
      const lanePenalty = placedReferences.reduce((sum, reference) => {
        const deltaX = Math.abs(actionScreenPoint.x - reference.actionScreenPoint.x)
        const deltaY = Math.abs(actionScreenPoint.y - reference.actionScreenPoint.y)

        if (deltaX >= stackedLaneWidthPx || deltaY >= stackedLaneHeightPx) {
          return sum
        }

        return sum + (stackedLaneWidthPx - deltaX) * 140 + (stackedLaneHeightPx - deltaY) * 60
      }, 0)

      return {
        actionPoint,
        actionRect,
        actionScreenPoint,
        overlap,
        score: overlap * 1_000_000 + crowdingPenalty + lanePenalty + offsetIndex,
      }
    })

    const selectedCandidate = candidates.reduce((best, candidate) =>
      candidate.score < best.score ? candidate : best,
    )

    occupied.push(expandRect(selectedCandidate.actionRect, occupiedPaddingX, occupiedPaddingY))
    placedReferences.push({
      anchorScreenPoint,
      actionScreenPoint: selectedCandidate.actionScreenPoint,
    })
    placements.set(preview.suggestion.id, {
      ...preview,
      actionPoint: selectedCandidate.actionPoint,
      actionRect: selectedCandidate.actionRect,
      actionScreenPoint: selectedCandidate.actionScreenPoint,
    })
  })

  return previews.map((preview) => placements.get(preview.suggestion.id) ?? {
    ...preview,
    actionPoint: preview.anchorPoint,
    actionRect: estimateSuggestionActionRect(preview.anchorPoint, metrics),
    actionScreenPoint: worldToScreenPoint(preview.anchorPoint, viewBox, metrics, viewRotationQuarterTurns),
  })
}

function normalizeQuarterTurns(turns: number) {
  const normalized = turns % 4
  return normalized < 0 ? normalized + 4 : normalized
}

function rotateBoundsForView(bounds: Bounds, viewRotationQuarterTurns: number): Bounds {
  if (normalizeQuarterTurns(viewRotationQuarterTurns) % 2 === 0) {
    return bounds
  }

  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerY = (bounds.minY + bounds.maxY) / 2
  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY

  return {
    minX: centerX - height / 2,
    maxX: centerX + height / 2,
    minY: centerY - width / 2,
    maxY: centerY + width / 2,
  }
}

function getViewBoxCenterPoint(viewBox: { x: number; y: number; width: number; height: number }) {
  return {
    x: viewBox.x + viewBox.width / 2,
    y: viewBox.y + viewBox.height / 2,
  }
}

function getViewRotationTransform(
  viewBox: { x: number; y: number; width: number; height: number },
  viewRotationQuarterTurns: number,
) {
  const degrees = normalizeQuarterTurns(viewRotationQuarterTurns) * 90

  if (degrees === 0) {
    return undefined
  }

  const center = getViewBoxCenterPoint(viewBox)
  return `rotate(${degrees} ${center.x} ${center.y})`
}

function rotateSvgPoint(
  point: { x: number; y: number },
  center: { x: number; y: number },
  viewRotationQuarterTurns: number,
) {
  const dx = point.x - center.x
  const dy = point.y - center.y

  switch (normalizeQuarterTurns(viewRotationQuarterTurns)) {
    case 1:
      return {
        x: center.x - dy,
        y: center.y + dx,
      }
    case 2:
      return {
        x: center.x - dx,
        y: center.y - dy,
      }
    case 3:
      return {
        x: center.x + dy,
        y: center.y - dx,
      }
    default:
      return point
  }
}

function rotateSvgVector(
  vector: { x: number; y: number },
  viewRotationQuarterTurns: number,
) {
  switch (normalizeQuarterTurns(viewRotationQuarterTurns)) {
    case 1:
      return {
        x: -vector.y,
        y: vector.x,
      }
    case 2:
      return {
        x: -vector.x,
        y: -vector.y,
      }
    case 3:
      return {
        x: vector.y,
        y: -vector.x,
      }
    default:
      return vector
  }
}

function screenToSvgPoint(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  viewBox: { x: number; y: number; width: number; height: number },
) {
  return {
    x: viewBox.x + ((clientX - rect.left) / rect.width) * viewBox.width,
    y: viewBox.y + ((clientY - rect.top) / rect.height) * viewBox.height,
  }
}

function screenToBaseSvgPoint(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  viewBox: { x: number; y: number; width: number; height: number },
  viewRotationQuarterTurns: number,
) {
  return rotateSvgPoint(
    screenToSvgPoint(clientX, clientY, rect, viewBox),
    getViewBoxCenterPoint(viewBox),
    -viewRotationQuarterTurns,
  )
}

function screenDeltaToBaseSvgDelta(
  deltaClientX: number,
  deltaClientY: number,
  rect: DOMRect,
  viewBox: { x: number; y: number; width: number; height: number },
  viewRotationQuarterTurns: number,
) {
  return rotateSvgVector(
    {
      x: deltaClientX * (viewBox.width / rect.width),
      y: deltaClientY * (viewBox.height / rect.height),
    },
    -viewRotationQuarterTurns,
  )
}

function getCameraForScreenAnchor(
  bounds: Bounds,
  zoom: number,
  anchorRatio: { x: number; y: number },
  anchorPoint: { x: number; y: number },
  aspectRatio?: number,
  viewRotationQuarterTurns = 0,
) {
  const rotatedBounds = rotateBoundsForView(bounds, viewRotationQuarterTurns)
  const baseViewBox = getViewBox(rotatedBounds, zoom, { x: 0, y: 0 }, aspectRatio)
  const anchoredPointWithoutOffset = rotateSvgPoint(
    {
      x: baseViewBox.x + anchorRatio.x * baseViewBox.width,
      y: baseViewBox.y + anchorRatio.y * baseViewBox.height,
    },
    getViewBoxCenterPoint(baseViewBox),
    -viewRotationQuarterTurns,
  )

  return {
    zoom,
    offset: {
      x: anchorPoint.x - anchoredPointWithoutOffset.x,
      y: anchorPoint.y - anchoredPointWithoutOffset.y,
    },
  }
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
  viewRotationQuarterTurns = 0,
): ScreenPoint {
  return svgToScreenPoint(
    rotateSvgPoint({ x: point.x, y: -point.y }, getViewBoxCenterPoint(viewBox), viewRotationQuarterTurns),
    viewBox,
    metrics,
  )
}

function placeCanvasMeasurement(
  measurement: CanvasMeasurement,
  viewBox: { x: number; y: number; width: number; height: number },
  metrics: CanvasMetrics,
  viewRotationQuarterTurns = 0,
): PlacedCanvasMeasurement {
  const start = worldToScreenPoint(measurement.start, viewBox, metrics, viewRotationQuarterTurns)
  const end = worldToScreenPoint(measurement.end, viewBox, metrics, viewRotationQuarterTurns)
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const length = Math.hypot(deltaX, deltaY)
  const normal =
    length > 0
      ? {
          x: -deltaY / length,
          y: deltaX / length,
        }
      : {
          x: 0,
          y: -1,
        }

  return {
    measurement,
    labelPoint: {
      x: (start.x + end.x) / 2 + normal.x * 14,
      y: (start.y + end.y) / 2 + normal.y * 14,
    },
  }
}

function getMeasurementDistance(measurement: CanvasMeasurement) {
  return Math.hypot(measurement.end.x - measurement.start.x, measurement.end.y - measurement.start.y)
}

function getScreenRectFromWorldBounds(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  viewBox: { x: number; y: number; width: number; height: number },
  metrics: CanvasMetrics,
  viewRotationQuarterTurns = 0,
) {
  const corners = [
    { x: bounds.minX, y: bounds.maxY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.minX, y: bounds.minY },
  ].map((point) => worldToScreenPoint(point, viewBox, metrics, viewRotationQuarterTurns))

  return {
    minX: Math.min(...corners.map((point) => point.x)),
    maxX: Math.max(...corners.map((point) => point.x)),
    minY: Math.min(...corners.map((point) => point.y)),
    maxY: Math.max(...corners.map((point) => point.y)),
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

function estimateAnnotationSize(kind: AnnotationKind, text: string, labelFontSize: number) {
  const characters = countGraphemes(text)
  const scale = labelFontSize / DEFAULT_LABEL_FONT_SIZE

  switch (kind) {
    case 'floor':
      return {
        widthPx: Math.min(220 * scale, Math.max(92 * scale, (characters * 8.2 + 24) * scale)),
        heightPx: 26 * scale,
      }
    case 'room':
      return {
        widthPx: Math.min(260 * scale, Math.max(92 * scale, (characters * 9.1 + 28) * scale)),
        heightPx: 30 * scale,
      }
    case 'furniture':
      return {
        widthPx: Math.min(212 * scale, Math.max(78 * scale, (characters * 8 + 24) * scale)),
        heightPx: 26 * scale,
      }
    case 'wall':
      return {
        widthPx: Math.min(172 * scale, Math.max(108 * scale, (characters * 8.1 + 58) * scale)),
        heightPx: 28 * scale,
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
  const tangentExtent = Math.max(length / 2 - 28, 0)
  const tangentOffsets = [
    0,
    clamp(length * 0.18, 0, tangentExtent),
    clamp(-length * 0.18, -tangentExtent, 0),
    clamp(length * 0.32, 0, tangentExtent),
    clamp(-length * 0.32, -tangentExtent, 0),
  ]
  const normalOffsets = [22, -22, 34, -34]
  const offsets: ScreenPoint[] = []
  const seen = new Set<string>()

  normalOffsets.forEach((normalOffset) => {
    tangentOffsets.forEach((tangentOffset) => {
      const offset = {
        x: normal.x * normalOffset + tangent.x * tangentOffset,
        y: normal.y * normalOffset + tangent.y * tangentOffset,
      }
      const key = `${Math.round(offset.x * 1000)}:${Math.round(offset.y * 1000)}`

      if (seen.has(key)) {
        return
      }

      seen.add(key)
      offsets.push(offset)
    })
  })

  if (tangentExtent > 0) {
    ;[tangentExtent, -tangentExtent].forEach((tangentOffset) => {
      const offset = {
        x: tangent.x * tangentOffset,
        y: tangent.y * tangentOffset,
      }
      const key = `${Math.round(offset.x * 1000)}:${Math.round(offset.y * 1000)}`

      if (seen.has(key)) {
        return
      }

      seen.add(key)
      offsets.push(offset)
    })
  }

  return offsets
}

function getWallAnnotationCandidatePenalty(
  position: ScreenPoint,
  ownSegment: ScreenSegment,
  allSegments: ScreenSegment[],
) {
  const ownDistance = getPointToSegmentDistance(position, ownSegment.start, ownSegment.end)
  let nearestOtherDistance = Number.POSITIVE_INFINITY

  allSegments.forEach((segment) => {
    if (segment.id === ownSegment.id) {
      return
    }

    nearestOtherDistance = Math.min(
      nearestOtherDistance,
      getPointToSegmentDistance(position, segment.start, segment.end),
    )
  })

  if (!Number.isFinite(nearestOtherDistance)) {
    return 0
  }

  const desiredClearancePx = 12
  const otherWallCloserPenalty = Math.max(0, ownDistance - nearestOtherDistance + 1) * 1_000
  const tightClearancePenalty = Math.max(0, ownDistance + desiredClearancePx - nearestOtherDistance) * 40

  return otherWallCloserPenalty + tightClearancePenalty
}

function getScreenAngleDegrees(origin: ScreenPoint, point: ScreenPoint) {
  return normalizeAngle((Math.atan2(point.y - origin.y, point.x - origin.x) * 180) / Math.PI)
}

function getPointFromScreenAngle(origin: ScreenPoint, radius: number, angle: number): ScreenPoint {
  const radians = (angle * Math.PI) / 180

  return {
    x: origin.x + Math.cos(radians) * radius,
    y: origin.y + Math.sin(radians) * radius,
  }
}

function buildCornerHoverArc({
  corner,
  incomingStart,
  outgoingEnd,
}: {
  corner: ScreenPoint
  incomingStart: ScreenPoint
  outgoingEnd: ScreenPoint
}) {
  const incomingLength = Math.hypot(incomingStart.x - corner.x, incomingStart.y - corner.y)
  const outgoingLength = Math.hypot(outgoingEnd.x - corner.x, outgoingEnd.y - corner.y)
  const radius = clamp(Math.min(incomingLength, outgoingLength) * 0.28, 10, 14)
  const startAngle = getScreenAngleDegrees(corner, incomingStart)
  const endAngle = getScreenAngleDegrees(corner, outgoingEnd)
  const clockwiseDelta = normalizeAngle(endAngle - startAngle)
  const sweepClockwise = clockwiseDelta <= 180
  const arcDegrees = sweepClockwise ? clockwiseDelta : 360 - clockwiseDelta
  const midAngle = normalizeAngle(startAngle + (sweepClockwise ? 1 : -1) * arcDegrees * 0.5)
  const start = getPointFromScreenAngle(corner, radius, startAngle)
  const end = getPointFromScreenAngle(corner, radius, endAngle)

  return {
    arcPath: `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 ${sweepClockwise ? 1 : 0} ${end.x} ${end.y}`,
    labelPoint: getPointFromScreenAngle(corner, radius + 18, midAngle),
  }
}

function buildCanvasAnnotations({
  canvasMetrics,
  viewBox,
  activeStructureId,
  activeFloorId,
  visibleFloors,
  wallLabelRooms,
  selectedRoomId,
  selectedFurnitureId,
  showRoomFloorLabels,
  showFurnitureLabels,
  showWallLabels,
  allowHoverWallLabels,
  labelFontSize,
  reservedRects,
  hoveredTarget,
  focusedTarget,
  selectionTargets,
  editingWallSegmentId,
  previousCandidateIndices,
  viewRotationQuarterTurns,
}: {
  canvasMetrics: CanvasMetrics
  viewBox: { x: number; y: number; width: number; height: number }
  activeStructureId?: string
  activeFloorId: string
  visibleFloors: Floor[]
  wallLabelRooms: RoomGeometryEntry[]
  selectedRoomId: string | null
  selectedFurnitureId: string | null
  showRoomFloorLabels: boolean
  showFurnitureLabels: boolean
  showWallLabels: boolean
  allowHoverWallLabels: boolean
  labelFontSize: number
  reservedRects: CanvasRect[]
  hoveredTarget: CanvasTarget | null
  focusedTarget: CanvasTarget | null
  selectionTargets: CanvasTarget[]
  editingWallSegmentId: string | null
  previousCandidateIndices: Record<string, number>
  viewRotationQuarterTurns: number
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
    { x: 0, y: 0 },
    { x: 0, y: -18 },
    { x: 0, y: 18 },
    { x: -32, y: 0 },
    { x: 32, y: 0 },
    { x: -24, y: -18 },
    { x: 24, y: -18 },
    { x: -24, y: 18 },
    { x: 24, y: 18 },
  ]

  visibleFloors.forEach((floor) => {
    if (!activeStructureId) {
      return
    }

    const floorBounds = computeFloorBounds(floor)
    const floorAnchor = worldToScreenPoint(
      { x: floorBounds.minX + 1, y: floorBounds.maxY + 1.6 },
      viewBox,
      canvasMetrics,
      viewRotationQuarterTurns,
    )
    const floorSize = estimateAnnotationSize('floor', floor.name, labelFontSize)
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
      const roomAnchor = worldToScreenPoint(getRoomLabelPoint(room), viewBox, canvasMetrics, viewRotationQuarterTurns)
      const roomSize = estimateAnnotationSize('room', room.name, labelFontSize)
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
          { x: item.x + item.width / 2, y: item.y + item.depth / 2 },
          viewBox,
          canvasMetrics,
          viewRotationQuarterTurns,
        )
        const furnitureScreenRect = expandRect(
          getScreenRectFromWorldBounds(
            {
              minX: item.x,
              maxX: item.x + item.width,
              minY: item.y,
              maxY: item.y + item.depth,
            },
            viewBox,
            canvasMetrics,
            viewRotationQuarterTurns,
          ),
          4,
          4,
        )
        const furnitureSize = estimateAnnotationSize('furniture', item.name, labelFontSize)
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
          priority: item.id === selectedFurnitureId ? 104 : matchesTarget(hoveredTarget, furnitureTarget) ? 92 : 66,
          required: item.id === selectedFurnitureId,
          candidateOffsets: furnitureOffsets,
          scoreCandidate: ({ rect }) => getRectOutsideArea(rect, furnitureScreenRect) * 2.5,
        })
      })
    })
  })

  if (allowHoverWallLabels && activeStructureId) {
    wallLabelRooms.forEach(({ floorId, room, geometry }) => {
      const wallScreenSegments = geometry.segments.map((segment) => ({
        id: segment.id,
        start: worldToScreenPoint(segment.start, viewBox, canvasMetrics, viewRotationQuarterTurns),
        end: worldToScreenPoint(segment.end, viewBox, canvasMetrics, viewRotationQuarterTurns),
      }))
      const wallScreenSegmentsById = new Map(wallScreenSegments.map((segment) => [segment.id, segment]))

      geometry.segments.forEach((segment) => {
        const midpointScreen = worldToScreenPoint(midpoint(segment.start, segment.end), viewBox, canvasMetrics, viewRotationQuarterTurns)
        const wallScreenSegment = wallScreenSegmentsById.get(segment.id)

        if (!wallScreenSegment) {
          return
        }

        const wallTarget: CanvasTarget = {
          kind: 'wall',
          structureId: activeStructureId,
          floorId,
          roomId: room.id,
          segmentId: segment.id,
        }
        const wallEditing = editingWallSegmentId === segment.id
        const wallHovered = matchesTarget(hoveredTarget, wallTarget)
        const shouldRenderWallLabel = showWallLabels || wallHovered || wallEditing

        if (!shouldRenderWallLabel) {
          return
        }

        const wallSize = estimateAnnotationSize('wall', formatFeet(segment.length), labelFontSize)
        const wallSelected = isTargetSelected(selectionTargets, wallTarget)
        const wallFocused = matchesTarget(focusedTarget, wallTarget)

        descriptors.push({
          id: segment.id,
          kind: 'wall',
          text: formatFeet(segment.length),
          target: wallTarget,
          anchor: midpointScreen,
          widthPx: wallSize.widthPx,
          heightPx: wallSize.heightPx,
          priority: wallEditing ? 99 : wallSelected || wallFocused ? 94 : wallHovered ? 88 : 76,
          required: showWallLabels || wallHovered || wallEditing,
          candidateOffsets: buildWallAnnotationOffsets(wallScreenSegment.start, wallScreenSegment.end),
          scoreCandidate: ({ position }) =>
            getWallAnnotationCandidatePenalty(position, wallScreenSegment, wallScreenSegments),
        })
      })
    })
  }

  return placeCanvasAnnotations(descriptors, reservedRects, {
    minX: 10,
    maxX: canvasMetrics.widthPx - 10,
    minY: 10,
    maxY: canvasMetrics.heightPx - 10,
  }, previousCandidateIndices)
}

function buildCornerHoverOverlay({
  activeStructureId,
  roomEntry,
  segmentId,
  viewBox,
  canvasMetrics,
  viewRotationQuarterTurns,
}: {
  activeStructureId?: string
  roomEntry: RoomGeometryEntry
  segmentId: string
  viewBox: { x: number; y: number; width: number; height: number }
  canvasMetrics: CanvasMetrics
  viewRotationQuarterTurns: number
}): HoverCornerOverlay | null {
  if (!activeStructureId) {
    return null
  }

  const { floorId, room, geometry } = roomEntry
  const corners = getRoomCorners(room)
  const cornerIndex = corners.findIndex((corner) => corner.segmentId === segmentId)

  if (cornerIndex < 0) {
    return null
  }

  const corner = corners[cornerIndex]
  const previousSegment = geometry.segments.find((segment) => segment.id === segmentId)

  if (!previousSegment) {
    return null
  }

  const nextSegment = corner.isExit ? null : getConnectedNextSegment(geometry, segmentId)
  const point = worldToScreenPoint(corner.point, viewBox, canvasMetrics, viewRotationQuarterTurns)
  const incomingStart = worldToScreenPoint(previousSegment.start, viewBox, canvasMetrics, viewRotationQuarterTurns)
  const outgoingEnd = nextSegment
    ? worldToScreenPoint(nextSegment.end, viewBox, canvasMetrics, viewRotationQuarterTurns)
    : worldToScreenPoint(
        addPolar(
          corner.point,
          clamp(previousSegment.length * 0.6, 2, 6),
          normalizeAngle(previousSegment.heading + corner.turn),
        ),
        viewBox,
        canvasMetrics,
        viewRotationQuarterTurns,
      )
  const hoverArc = buildCornerHoverArc({
    corner: point,
    incomingStart,
    outgoingEnd,
  })

  return {
    target: {
      kind: 'corner',
      structureId: activeStructureId,
      floorId,
      roomId: room.id,
      segmentId,
    },
    arcPath: hoverArc.arcPath,
    labelPoint: hoverArc.labelPoint,
    text: formatCornerAngleBadge(corner.turn),
  }
}

function getConnectedNextSegment(geometry: ReturnType<typeof roomToGeometry>, segmentId: string) {
  for (const chain of geometry.chains) {
    const segmentIndex = chain.segments.findIndex((segment) => segment.id === segmentId)

    if (segmentIndex < 0) {
      continue
    }

    return chain.segments[segmentIndex + 1] ?? (chain.closed ? chain.segments[0] : null)
  }

  return null
}

function getVisibleCornerOverlays({
  activeStructureId,
  rooms,
  showAll,
  hoveredTarget,
  editingSegmentId,
  viewBox,
  canvasMetrics,
  viewRotationQuarterTurns,
}: {
  activeStructureId?: string
  rooms: RoomGeometryEntry[]
  showAll: boolean
  hoveredTarget: CanvasTarget | null
  editingSegmentId: string | null
  viewBox: { x: number; y: number; width: number; height: number }
  canvasMetrics: CanvasMetrics
  viewRotationQuarterTurns: number
}) {
  if (!activeStructureId || rooms.length === 0) {
    return []
  }

  if (showAll) {
    return rooms
      .flatMap((roomEntry) =>
        getRoomCorners(roomEntry.room).map((corner) =>
          buildCornerHoverOverlay({
            activeStructureId,
            roomEntry,
            segmentId: corner.segmentId,
            viewBox,
            canvasMetrics,
            viewRotationQuarterTurns,
          }),
        ),
      )
      .filter((overlay): overlay is HoverCornerOverlay => Boolean(overlay))
  }

  return rooms
    .flatMap((roomEntry) =>
      getRoomCorners(roomEntry.room)
        .filter((corner) => {
          const hoveredCorner =
            hoveredTarget?.kind === 'corner' &&
            hoveredTarget.floorId === roomEntry.floorId &&
            hoveredTarget.roomId === roomEntry.room.id &&
            hoveredTarget.segmentId === corner.segmentId
          const editingCorner = editingSegmentId === corner.segmentId

          return hoveredCorner || editingCorner
        })
        .map((corner) =>
          buildCornerHoverOverlay({
            activeStructureId,
            roomEntry,
            segmentId: corner.segmentId,
            viewBox,
            canvasMetrics,
            viewRotationQuarterTurns,
          }),
        ),
    )
    .filter((overlay): overlay is HoverCornerOverlay => Boolean(overlay))
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
        const position = {
          x: (rect.minX + rect.maxX) / 2,
          y: (rect.minY + rect.maxY) / 2,
        }

        return {
          rect,
          position,
          index,
          penalty: descriptor.scoreCandidate?.({ rect, position, offset, index }) ?? 0,
          overlap: occupied.reduce((sum, occupiedRect) => sum + overlapArea(rect, occupiedRect), 0),
          distance: Math.hypot(position.x - descriptor.anchor.x, position.y - descriptor.anchor.y),
        }
      })

      const zeroOverlap = candidates.filter((candidate) => candidate.overlap === 0)
      const compareCandidates = (
        left: { penalty: number; distance: number; index: number },
        right: { penalty: number; distance: number; index: number },
      ) => left.penalty - right.penalty || left.distance - right.distance || left.index - right.index
      const idealCandidate =
        zeroOverlap.sort(compareCandidates)[0] ??
        (descriptor.required
          ? candidates.reduce((best, candidate) => {
              if (candidate.overlap !== best.overlap) {
                return candidate.overlap < best.overlap ? candidate : best
              }

              if (candidate.penalty !== best.penalty) {
                return candidate.penalty < best.penalty ? candidate : best
              }

              if (candidate.distance !== best.distance) {
                return candidate.distance < best.distance ? candidate : best
              }

              return candidate.index < best.index ? candidate : best
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

      placed.push({
        ...descriptor,
        rect: selectedCandidate.rect,
        position: selectedCandidate.position,
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
  previousCandidate: { overlap: number; penalty: number; distance: number },
  idealCandidate: { overlap: number; penalty: number; distance: number },
) {
  const penaltyTolerance = 140
  const distanceTolerance = 12

  if (previousCandidate.overlap === 0) {
    return (
      previousCandidate.penalty <= idealCandidate.penalty + penaltyTolerance &&
      previousCandidate.distance <= idealCandidate.distance + distanceTolerance
    )
  }

  const overlapTolerance = 180
  const overlapDistanceTolerance = 28

  return (
    previousCandidate.overlap <= idealCandidate.overlap + overlapTolerance &&
    previousCandidate.penalty <= idealCandidate.penalty + penaltyTolerance &&
    previousCandidate.distance <= idealCandidate.distance + overlapDistanceTolerance
  )
}
