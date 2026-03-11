/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type PropsWithChildren,
} from 'react'
import { createSeedState } from '../data/seed'
import {
  MAX_FURNITURE_CORNER_SNAP_STRENGTH,
  MAX_FURNITURE_SNAP_STRENGTH,
  MAX_LABEL_FONT_SIZE,
  MAX_WALL_STROKE_SCALE,
  MIN_FURNITURE_CORNER_SNAP_STRENGTH,
  MIN_FURNITURE_SNAP_STRENGTH,
  MIN_LABEL_FONT_SIZE,
  MIN_WALL_STROKE_SCALE,
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
  findFloorById,
  findFurnitureById,
  findRoomById,
  findSelectedFurniture,
  findSelectedRoom,
  findSegmentById,
  getRoomSuggestions,
  getViewBox,
  loadDraftState,
  saveDraftState,
  selectTargetInDraft,
  touchStructure,
} from '../lib/blueprint'
import {
  addPolar,
  clamp,
  deleteRoomSegmentPreservingGeometry,
  normalizeAngle,
  roomToGeometry,
  snapFurnitureToRoom,
  validateRoomWalls,
} from '../lib/geometry'
import { validateName } from '../lib/nameValidation'
import {
  createStructureExportEnvelope,
  createWorkspaceExportEnvelope,
  downloadJsonFile,
  makeStructureExportFilename,
  makeWorkspaceExportFilename,
} from '../lib/serialization'
import type {
  Bounds,
  CanvasTarget,
  ContextMenuState,
  DialogState,
  DraftState,
  EditorMode,
  EditorState,
  EditorUiState,
  EntityIds,
  Furniture,
  NamedEntityKind,
  Room,
  RoomSuggestion,
} from '../types'

const DEFAULT_STATUS = 'Autosaving locally. Use the Data page for JSON import and export.'
const DEFAULT_CAMERA = {
  zoom: 1,
  offset: { x: 0, y: 0 },
}
const HISTORY_LIMIT = 100

function getVisibleFloorsForDraft(draft: DraftState) {
  const activeStructure = findActiveStructure(draft)
  const activeFloor = findActiveFloor(draft)

  if (!activeStructure) {
    return []
  }

  if (draft.editorMode === 'stacked') {
    return [...activeStructure.floors].sort((left, right) =>
      left.id === draft.activeFloorId ? 1 : right.id === draft.activeFloorId ? -1 : 0,
    )
  }

  return activeFloor ? [activeFloor] : []
}

function getViewBoundsForDraft(draft: DraftState) {
  return computeVisibleBounds(getVisibleFloorsForDraft(draft))
}

function createCamera(frameBounds: Bounds): EditorUiState['camera'] {
  return {
    ...DEFAULT_CAMERA,
    frameBounds,
  }
}

function shouldRefreshCameraFrame(previousDraft: DraftState, nextDraft: DraftState) {
  return (
    previousDraft.activeStructureId !== nextDraft.activeStructureId ||
    previousDraft.activeFloorId !== nextDraft.activeFloorId ||
    previousDraft.editorMode !== nextDraft.editorMode
  )
}

type MutateDraftOptions = {
  status?: string
  touchStructure?: boolean
  resetCamera?: boolean
  recordHistory?: boolean
}

type EditorAction =
  | {
      type: 'mutateDraft'
      recipe: (draft: DraftState) => void
      options?: MutateDraftOptions
    }
  | {
      type: 'replaceDraft'
      draft: DraftState
      status: string
      recordHistory?: boolean
    }
  | {
      type: 'setStatus'
      status: string
    }
  | {
      type: 'openDialog'
      dialog: Exclude<DialogState, null>
    }
  | {
      type: 'closeDialog'
    }
  | {
      type: 'openContextMenu'
      menu: NonNullable<ContextMenuState>
    }
  | {
      type: 'closeContextMenu'
    }
  | {
      type: 'setHoveredTarget'
      target: CanvasTarget | null
    }
  | {
      type: 'setFocusedTarget'
      target: CanvasTarget | null
    }
  | {
      type: 'setSelectionTargets'
      targets: CanvasTarget[]
    }
  | {
      type: 'setCamera'
      camera: Omit<EditorUiState['camera'], 'frameBounds'> & { frameBounds?: EditorUiState['camera']['frameBounds'] }
    }
  | {
      type: 'resetCamera'
    }
  | {
      type: 'undo'
    }
  | {
      type: 'redo'
    }
  | {
      type: 'dismissTransientUi'
    }

function createInitialState(initialDraft?: DraftState): EditorState {
  const draft = ensureSelections(initialDraft ?? loadDraftState() ?? createSeedState())
  const viewBounds = getViewBoundsForDraft(draft)

  return {
    draft,
    ui: {
      status: DEFAULT_STATUS,
      camera: createCamera(viewBounds),
      dialog: null,
      contextMenu: null,
      hoveredTarget: null,
      focusedTarget: null,
      selectionTargets: [],
    },
    history: {
      past: [],
      future: [],
    },
  }
}

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'mutateDraft': {
      const nextDraft = structuredClone(state.draft)
      action.recipe(nextDraft)
      const prepared = ensureSelections(nextDraft)
      const nextViewBounds = getViewBoundsForDraft(prepared)

      if (action.options?.touchStructure !== false) {
        const structure = findActiveStructure(prepared)
        if (structure) {
          touchStructure(structure)
        }
      }

      const shouldRecordHistory = action.options?.recordHistory ?? true
      const nextCamera = action.options?.resetCamera
        ? createCamera(nextViewBounds)
        : {
            ...state.ui.camera,
            frameBounds: shouldRefreshCameraFrame(state.draft, prepared) ? nextViewBounds : state.ui.camera.frameBounds,
          }

      return {
        draft: prepared,
        ui: {
          ...state.ui,
          status: action.options?.status ?? state.ui.status,
          camera: nextCamera,
          contextMenu: null,
        },
        history: shouldRecordHistory
          ? {
              past: pushHistorySnapshot(state.history.past, state.draft),
              future: [],
            }
          : state.history,
      }
    }
    case 'replaceDraft': {
      const nextDraft = ensureSelections(action.draft)
      const nextViewBounds = getViewBoundsForDraft(nextDraft)

      return {
        draft: nextDraft,
        ui: {
          ...state.ui,
          status: action.status,
          camera: createCamera(nextViewBounds),
          dialog: null,
          contextMenu: null,
          focusedTarget: null,
          selectionTargets: [],
        },
        history: action.recordHistory === false
          ? state.history
          : {
              past: pushHistorySnapshot(state.history.past, state.draft),
              future: [],
            },
      }
    }
    case 'setStatus':
      return {
        ...state,
        ui: {
          ...state.ui,
          status: action.status,
        },
      }
    case 'openDialog':
      return {
        ...state,
        ui: {
          ...state.ui,
          dialog: action.dialog,
          contextMenu: null,
        },
      }
    case 'closeDialog':
      return {
        ...state,
        ui: {
          ...state.ui,
          dialog: null,
        },
      }
    case 'openContextMenu':
      return {
        ...state,
        ui: {
          ...state.ui,
          contextMenu: action.menu,
          dialog: null,
          focusedTarget: action.menu.target,
        },
      }
    case 'closeContextMenu':
      return {
        ...state,
        ui: {
          ...state.ui,
          contextMenu: null,
        },
      }
    case 'setHoveredTarget':
      return {
        ...state,
        ui: {
          ...state.ui,
          hoveredTarget: action.target,
        },
      }
    case 'setFocusedTarget':
      return {
        ...state,
        ui: {
          ...state.ui,
          focusedTarget: action.target,
        },
      }
    case 'setSelectionTargets':
      return {
        ...state,
        ui: {
          ...state.ui,
          selectionTargets: action.targets,
        },
      }
    case 'setCamera':
      return {
        ...state,
        ui: {
          ...state.ui,
          camera: {
            zoom: clamp(action.camera.zoom, 0.45, 3.5),
            offset: action.camera.offset,
            frameBounds: action.camera.frameBounds ?? state.ui.camera.frameBounds,
          },
        },
      }
    case 'resetCamera':
      return {
        ...state,
        ui: {
          ...state.ui,
          camera: createCamera(getViewBoundsForDraft(state.draft)),
        },
      }
    case 'undo': {
      const previousDraft = state.history.past[state.history.past.length - 1]

      if (!previousDraft) {
        return state
      }

      const nextDraft = ensureSelections(structuredClone(previousDraft))
      const nextViewBounds = getViewBoundsForDraft(nextDraft)

      return {
        draft: nextDraft,
        ui: {
          ...state.ui,
          status: 'Undid last change.',
          camera: {
            ...state.ui.camera,
            frameBounds: shouldRefreshCameraFrame(state.draft, nextDraft) ? nextViewBounds : state.ui.camera.frameBounds,
          },
          dialog: null,
          contextMenu: null,
          hoveredTarget: null,
          focusedTarget: null,
          selectionTargets: [],
        },
        history: {
          past: state.history.past.slice(0, -1),
          future: [structuredClone(state.draft), ...state.history.future],
        },
      }
    }
    case 'redo': {
      const nextDraft = state.history.future[0]

      if (!nextDraft) {
        return state
      }

      const prepared = ensureSelections(structuredClone(nextDraft))
      const nextViewBounds = getViewBoundsForDraft(prepared)

      return {
        draft: prepared,
        ui: {
          ...state.ui,
          status: 'Redid last change.',
          camera: {
            ...state.ui.camera,
            frameBounds: shouldRefreshCameraFrame(state.draft, prepared) ? nextViewBounds : state.ui.camera.frameBounds,
          },
          dialog: null,
          contextMenu: null,
          hoveredTarget: null,
          focusedTarget: null,
          selectionTargets: [],
        },
        history: {
          past: pushHistorySnapshot(state.history.past, state.draft),
          future: state.history.future.slice(1),
        },
      }
    }
    case 'dismissTransientUi':
      return {
        ...state,
        ui: {
          ...state.ui,
          dialog: null,
          contextMenu: null,
          selectionTargets: [],
        },
      }
  }
}

type EditorContextValue = ReturnType<typeof useCreateEditorContextValue>

const EditorContext = createContext<EditorContextValue | null>(null)

type WallAnchorSide = 'before' | 'after'

function useCreateEditorContextValue(initialDraft?: DraftState) {
  const [state, dispatch] = useReducer(editorReducer, initialDraft, createInitialState)
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState<string[]>([])

  useEffect(() => {
    saveDraftState(state.draft)
  }, [state.draft])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dispatch({ type: 'dismissTransientUi' })
        return
      }

      if (event.defaultPrevented || event.isComposing || isEditableEventTarget(event.target)) {
        return
      }

      if (!(event.metaKey || event.ctrlKey) || event.altKey) {
        return
      }

      const key = event.key.toLowerCase()

      if (key === 'z') {
        event.preventDefault()
        dispatch({ type: event.shiftKey ? 'redo' : 'undo' })
        return
      }

      if (key === 'y' && !event.shiftKey) {
        event.preventDefault()
        dispatch({ type: 'redo' })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const activeStructure = useMemo(() => findActiveStructure(state.draft), [state.draft])
  const activeFloor = useMemo(() => findActiveFloor(state.draft), [state.draft])
  const selectedRoom = useMemo(() => findSelectedRoom(state.draft), [state.draft])
  const selectedFurniture = useMemo(() => findSelectedFurniture(state.draft), [state.draft])
  const selectedRoomGeometry = useMemo(
    () => (selectedRoom ? roomToGeometry(selectedRoom) : null),
    [selectedRoom],
  )
  const rawRoomSuggestions = useMemo(
    () => (selectedRoom && activeFloor ? getRoomSuggestions(selectedRoom, activeFloor) : []),
    [activeFloor, selectedRoom],
  )
  const dismissedSuggestionIdSet = useMemo(() => new Set(dismissedSuggestionIds), [dismissedSuggestionIds])
  const roomSuggestions = useMemo(
    () => rawRoomSuggestions.filter((suggestion) => !dismissedSuggestionIdSet.has(suggestion.id)),
    [dismissedSuggestionIdSet, rawRoomSuggestions],
  )
  const visibleFloors = useMemo(
    () =>
      !activeStructure
        ? []
        : state.draft.editorMode === 'stacked'
          ? [...activeStructure.floors].sort((left, right) =>
              left.id === state.draft.activeFloorId ? 1 : right.id === state.draft.activeFloorId ? -1 : 0,
            )
          : activeFloor
            ? [activeFloor]
            : [],
    [activeFloor, activeStructure, state.draft.activeFloorId, state.draft.editorMode],
  )
  const viewBounds = useMemo(() => computeVisibleBounds(visibleFloors), [visibleFloors])
  const viewBox = useMemo(
    () => getViewBox(state.ui.camera.frameBounds, state.ui.camera.zoom, state.ui.camera.offset),
    [state.ui.camera.frameBounds, state.ui.camera.offset, state.ui.camera.zoom],
  )
  const structureRoomCount =
    activeStructure?.floors.reduce((sum, floor) => sum + floor.rooms.length, 0) ?? 0

  const mutateDraft = (recipe: (draft: DraftState) => void, options?: MutateDraftOptions) => {
    startTransition(() => {
      dispatch({ type: 'mutateDraft', recipe, options })
    })
  }

  const validateProspectiveRoom = (
    draft: DraftState,
    structureId: string,
    floorId: string,
    roomId: string,
    recipe: (room: Room) => boolean,
  ) => {
    const nextRoom = structuredClone(findRoomById(draft, structureId, floorId, roomId))

    if (!nextRoom) {
      return {
        valid: false,
        error: 'Room could not be found.',
      }
    }

    if (!recipe(nextRoom)) {
      return {
        valid: false,
        error: 'Wall could not be found.',
      }
    }

    return validateRoomWalls(nextRoom)
  }

  const setStatus = (status: string) => dispatch({ type: 'setStatus', status })

  const selectTarget = (target: CanvasTarget, options?: { status?: string }) => {
    mutateDraft(
      (draft) => {
        selectTargetInDraft(draft, target)
      },
      {
        touchStructure: false,
        status: options?.status,
        recordHistory: false,
      },
    )
    dispatch({ type: 'setSelectionTargets', targets: [target] })
    dispatch({ type: 'setFocusedTarget', target })
  }

  const setSelectionTargets = (targets: CanvasTarget[], options?: { status?: string; primaryTarget?: CanvasTarget | null }) => {
    const [primaryTarget] = targets
    const nextPrimary = options?.primaryTarget ?? primaryTarget ?? null

    if (nextPrimary) {
      mutateDraft(
        (draft) => {
          selectTargetInDraft(draft, nextPrimary)
        },
        {
          touchStructure: false,
          status: options?.status,
          recordHistory: false,
        },
      )
    } else if (options?.status) {
      dispatch({ type: 'setStatus', status: options.status })
    }

    dispatch({ type: 'setSelectionTargets', targets })
    dispatch({ type: 'setFocusedTarget', target: nextPrimary })
  }

  const selectStructure = (structureId: string) =>
    selectTarget({ kind: 'structure', structureId })

  const selectFloor = (structureId: string, floorId: string) =>
    selectTarget({ kind: 'floor', structureId, floorId })

  const selectRoom = (structureId: string, floorId: string, roomId: string) =>
    selectTarget({ kind: 'room', structureId, floorId, roomId })

  const selectFurniture = (structureId: string, floorId: string, roomId: string, furnitureId: string) =>
    selectTarget({ kind: 'furniture', structureId, floorId, roomId, furnitureId })

  const insertWallAtAnchor = (
    room: Room,
    segmentId: string,
    side: WallAnchorSide,
    segment: Room['segments'][number],
  ) => {
    const segmentIndex = room.segments.findIndex((item) => item.id === segmentId)
    if (segmentIndex < 0) {
      return false
    }

    if (side === 'before') {
      const targetSegment = room.segments[segmentIndex]
      const anchor = segmentIndex === 0 ? room.anchor : targetSegment.startPoint
      const heading = segmentIndex === 0 ? room.startHeading : targetSegment.startHeading

      if (!anchor || typeof heading !== 'number') {
        return false
      }

      const nextStart = addPolar(anchor, segment.length, normalizeAngle(heading + 180))
      if (segmentIndex === 0) {
        segment.startPoint = undefined
        segment.startHeading = undefined
      } else {
        segment.startPoint = { ...nextStart }
        segment.startHeading = heading
      }
      room.segments.splice(segmentIndex, 0, segment)

      if (segmentIndex === 0) {
        room.anchor = nextStart
      } else {
        targetSegment.startPoint = undefined
        targetSegment.startHeading = undefined
      }

      return true
    }

    room.segments.splice(segmentIndex + 1, 0, segment)
    return true
  }

  const openRenameDialog = (entityKind: NamedEntityKind, ids: EntityIds) =>
    dispatch({
      type: 'openDialog',
      dialog: {
        kind: 'rename',
        entityKind,
        ids,
      },
    })

  const openWallDialog = (ids: EntityIds) =>
    dispatch({
      type: 'openDialog',
      dialog: {
        kind: 'wall',
        ids,
      },
    })

  const openCornerDialog = (ids: EntityIds) =>
    dispatch({
      type: 'openDialog',
      dialog: {
        kind: 'corner',
        ids,
      },
    })

  const openFurnitureDialog = (ids: EntityIds) =>
    dispatch({
      type: 'openDialog',
      dialog: {
        kind: 'furniture',
        ids,
      },
    })

  const renameEntity = (entityKind: NamedEntityKind, ids: EntityIds, nextName: string) => {
    const validation = validateName(nextName)

    if (!validation.valid) {
      return validation
    }

    mutateDraft((draft) => {
      if (entityKind === 'structure' && ids.structureId) {
        const structure = draft.structures.find((item) => item.id === ids.structureId)
        if (structure) {
          structure.name = nextName
        }
      }

      if (entityKind === 'floor' && ids.structureId && ids.floorId) {
        const floor = findFloorById(draft, ids.structureId, ids.floorId)
        if (floor) {
          floor.name = nextName
        }
      }

      if (entityKind === 'room' && ids.structureId && ids.floorId && ids.roomId) {
        const room = findRoomById(draft, ids.structureId, ids.floorId, ids.roomId)
        if (room) {
          room.name = nextName
        }
      }

      if (entityKind === 'furniture' && ids.structureId && ids.floorId && ids.roomId && ids.furnitureId) {
        const item = findFurnitureById(draft, ids.structureId, ids.floorId, ids.roomId, ids.furnitureId)
        if (item) {
          item.name = nextName
        }
      }
    }, {
      status: `${capitalize(entityKind)} renamed.`,
    })

    dispatch({ type: 'closeDialog' })
    return validation
  }

  const updateWall = (ids: EntityIds, values: Pick<Room['segments'][number], 'label' | 'length' | 'notes'>) => {
    if (!ids.structureId || !ids.floorId || !ids.roomId || !ids.segmentId) {
      return {
        valid: false,
        error: 'Wall could not be found.',
      }
    }

    const { structureId, floorId, roomId, segmentId } = ids

    const validation = validateProspectiveRoom(state.draft, structureId, floorId, roomId, (room) => {
      const segment = room.segments.find((item) => item.id === segmentId)
      if (!segment) {
        return false
      }

      segment.label = values.label
      segment.length = values.length
      segment.notes = values.notes
      return true
    })

    if (!validation.valid) {
      return validation
    }

    mutateDraft((draft) => {
      const segment = findSegmentById(draft, structureId, floorId, roomId, segmentId)
      if (segment) {
        segment.label = values.label
        segment.length = values.length
        segment.notes = values.notes
      }
    }, {
      status: 'Wall measurements updated.',
    })

    dispatch({ type: 'closeDialog' })
    return validation
  }

  const updateCorner = (ids: EntityIds, values: { turn: number }) => {
    if (!ids.structureId || !ids.floorId || !ids.roomId || !ids.segmentId) {
      return {
        valid: false,
        error: 'Corner could not be found.',
      }
    }

    const { structureId, floorId, roomId, segmentId } = ids
    const validation = validateProspectiveRoom(state.draft, structureId, floorId, roomId, (room) => {
      const segment = room.segments.find((item) => item.id === segmentId)
      if (!segment) {
        return false
      }

      segment.turn = values.turn
      return true
    })

    if (!validation.valid) {
      return validation
    }

    mutateDraft((draft) => {
      const segment = findSegmentById(draft, structureId, floorId, roomId, segmentId)
      if (segment) {
        segment.turn = values.turn
      }
    }, {
      status: 'Corner angle updated.',
    })

    dispatch({ type: 'closeDialog' })
    return validation
  }

  const updateFurniture = (
    ids: EntityIds,
    values: Pick<Furniture, 'name' | 'x' | 'y' | 'width' | 'depth' | 'rotation'>,
  ) => {
    const validation = validateName(values.name)

    if (!validation.valid) {
      return validation
    }

    mutateDraft((draft) => {
      if (!ids.structureId || !ids.floorId || !ids.roomId || !ids.furnitureId) {
        return
      }

      const item = findFurnitureById(draft, ids.structureId, ids.floorId, ids.roomId, ids.furnitureId)
      if (item) {
        item.name = values.name
        item.x = values.x
        item.y = values.y
        item.width = values.width
        item.depth = values.depth
        item.rotation = values.rotation
      }
    }, {
      status: 'Furniture updated.',
    })

    dispatch({ type: 'closeDialog' })
    return validation
  }

  const moveRoom = (structureId: string, floorId: string, roomId: string, delta: { x: number; y: number }) => {
    mutateDraft((draft) => {
      const room = findRoomById(draft, structureId, floorId, roomId)
      if (!room) {
        return
      }

      room.anchor.x += delta.x
      room.anchor.y += delta.y
      room.segments.forEach((segment) => {
        if (!segment.startPoint) {
          return
        }

        segment.startPoint.x += delta.x
        segment.startPoint.y += delta.y
      })
    }, {
      status: 'Room moved.',
    })
  }

  const moveFurniture = (
    structureId: string,
    floorId: string,
    roomId: string,
    furnitureId: string,
    delta: { x: number; y: number },
  ) => {
    mutateDraft((draft) => {
      const room = findRoomById(draft, structureId, floorId, roomId)
      const item = findFurnitureById(draft, structureId, floorId, roomId, furnitureId)
      if (!room || !item) {
        return
      }

      const nextPosition = snapFurnitureToRoom(
        room,
        {
          ...item,
          x: item.x + delta.x,
          y: item.y + delta.y,
        },
        draft.furnitureSnapStrength,
        draft.furnitureCornerSnapStrength,
      )

      item.x = nextPosition.x
      item.y = nextPosition.y
    }, {
      status: 'Furniture moved.',
    })
  }

  const addWallFromAnchor = (
    structureId: string,
    floorId: string,
    roomId: string,
    segmentId: string,
    side: WallAnchorSide = 'after',
  ) => {
    const segment = createSegment({
      label: 'Anchored wall',
      turn: side === 'before' ? 0 : undefined,
    })
    const validation = validateProspectiveRoom(state.draft, structureId, floorId, roomId, (room) => {
      return insertWallAtAnchor(room, segmentId, side, segment)
    })

    if (!validation.valid) {
      setStatus(validation.error)
      return validation
    }

    startTransition(() => {
      dispatch({
        type: 'mutateDraft',
        recipe: (draft) => {
          const room = findRoomById(draft, structureId, floorId, roomId)
          if (!room) {
            return
          }

          if (!insertWallAtAnchor(room, segmentId, side, segment)) {
            return
          }
          draft.activeStructureId = structureId
          draft.activeFloorId = floorId
          draft.selectedRoomId = roomId
          draft.selectedFurnitureId = null
        },
        options: {
          status: 'New wall anchored to the selected corner.',
        },
      })
      dispatch({
        type: 'openDialog',
        dialog: {
          kind: 'wall',
          ids: {
            structureId,
            floorId,
            roomId,
            segmentId: segment.id,
          },
        },
      })
    })

    return validation
  }

  const actions = {
    mutateDraft,
    setStatus,
    setEditorMode: (mode: EditorMode) =>
      mutateDraft(
        (draft) => {
          draft.editorMode = mode
        },
        { touchStructure: false, recordHistory: false },
      ),
    toggleGrid: (checked: boolean) =>
      mutateDraft(
        (draft) => {
          draft.showGrid = checked
        },
        { touchStructure: false, recordHistory: false },
      ),
    toggleInferred: (checked: boolean) =>
      mutateDraft(
        (draft) => {
          draft.showInferred = checked
        },
        { touchStructure: false, recordHistory: false },
      ),
    toggleRoomFloorLabels: (checked: boolean) =>
      mutateDraft(
        (draft) => {
          draft.showRoomFloorLabels = checked
        },
        { touchStructure: false, recordHistory: false },
      ),
    toggleWallLabels: (checked: boolean) =>
      mutateDraft(
        (draft) => {
          draft.showWallLabels = checked
        },
        { touchStructure: false, recordHistory: false },
      ),
    toggleAngleLabels: (checked: boolean) =>
      mutateDraft(
        (draft) => {
          draft.showAngleLabels = checked
        },
        { touchStructure: false, recordHistory: false },
      ),
    setWallStrokeScale: (value: number) =>
      mutateDraft(
        (draft) => {
          draft.wallStrokeScale = clamp(value, MIN_WALL_STROKE_SCALE, MAX_WALL_STROKE_SCALE)
        },
        { touchStructure: false, recordHistory: false },
      ),
    setLabelFontSize: (value: number) =>
      mutateDraft(
        (draft) => {
          draft.labelFontSize = clamp(value, MIN_LABEL_FONT_SIZE, MAX_LABEL_FONT_SIZE)
        },
        { touchStructure: false, recordHistory: false },
      ),
    toggleLabelShapes: (checked: boolean) =>
      mutateDraft(
        (draft) => {
          draft.showLabelShapes = checked
        },
        { touchStructure: false, recordHistory: false },
      ),
    setFurnitureSnapStrength: (value: number) =>
      mutateDraft(
        (draft) => {
          draft.furnitureSnapStrength = clamp(
            value,
            MIN_FURNITURE_SNAP_STRENGTH,
            MAX_FURNITURE_SNAP_STRENGTH,
          )
        },
        { touchStructure: false, recordHistory: false },
      ),
    setFurnitureCornerSnapStrength: (value: number) =>
      mutateDraft(
        (draft) => {
          draft.furnitureCornerSnapStrength = clamp(
            value,
            MIN_FURNITURE_CORNER_SNAP_STRENGTH,
            MAX_FURNITURE_CORNER_SNAP_STRENGTH,
          )
        },
        { touchStructure: false, recordHistory: false },
      ),
    selectTarget,
    selectStructure,
    selectFloor,
    selectRoom,
    selectFurniture,
    addStructure: () => {
      mutateDraft((draft) => {
        const room = createRoom({ name: 'Room 1' })
        const floor = createFloor({ name: 'First floor', elevation: 0, rooms: [room] })
        const structure = createStructure({
          name: `Structure ${draft.structures.length + 1}`,
          floors: [floor],
        })

        draft.structures.push(structure)
        draft.activeStructureId = structure.id
        draft.activeFloorId = floor.id
        draft.selectedRoomId = room.id
        draft.selectedFurnitureId = null
      }, {
        status: 'New structure added.',
      })
    },
    deleteStructure: (structureId: string) => {
      if (state.draft.structures.length <= 1) {
        setStatus('At least one structure must remain in the workspace.')
        return
      }

      mutateDraft((draft) => {
        draft.structures = draft.structures.filter((structure) => structure.id !== structureId)
      }, {
        status: 'Structure removed.',
      })
    },
    addFloor: () => {
      mutateDraft((draft) => {
        const structure = findActiveStructure(draft)
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
        draft.activeFloorId = floor.id
        draft.selectedRoomId = room.id
        draft.selectedFurnitureId = null
      }, {
        status: 'New floor added.',
      })
    },
    deleteFloor: (structureId: string, floorId: string) => {
      const structure = findStructureById(state.draft, structureId)

      if (!structure || structure.floors.length <= 1) {
        setStatus('A structure must keep at least one floor.')
        return
      }

      mutateDraft((draft) => {
        const editable = findStructureById(draft, structureId)
        if (!editable) {
          return
        }

        editable.floors = editable.floors.filter((floor) => floor.id !== floorId)
      }, {
        status: 'Floor removed.',
      })
    },
    addRoom: () => {
      mutateDraft((draft) => {
        const floor = findActiveFloor(draft)
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
        draft.selectedRoomId = room.id
        draft.selectedFurnitureId = null
      }, {
        status: 'Room added.',
      })
    },
    deleteRoom: (structureId: string, floorId: string, roomId: string) =>
      mutateDraft((draft) => {
        const floor = findFloorById(draft, structureId, floorId)
        if (!floor) {
          return
        }

        floor.rooms = floor.rooms.filter((room) => room.id !== roomId)
      }, {
        status: 'Room removed.',
      }),
    addFurniture: () => {
      mutateDraft((draft) => {
        const room = findSelectedRoom(draft)
        if (!room) {
          return
        }

        const item = createFurniture({
          name: `Item ${room.furniture.length + 1}`,
          x: room.anchor.x + 2,
          y: room.anchor.y - 2,
        })

        room.furniture.push(item)
        draft.selectedFurnitureId = item.id
      }, {
        status: 'Furniture added.',
      })
    },
    deleteFurniture: (structureId: string, floorId: string, roomId: string, furnitureId: string) =>
      mutateDraft((draft) => {
        const room = findRoomById(draft, structureId, floorId, roomId)
        if (!room) {
          return
        }

        room.furniture = room.furniture.filter((item) => item.id !== furnitureId)
        if (draft.selectedFurnitureId === furnitureId) {
          draft.selectedFurnitureId = room.furniture[0]?.id ?? null
        }
      }, {
        status: 'Furniture removed.',
      }),
    addWall: () => {
      const room = findSelectedRoom(state.draft)
      if (!room || !activeStructure || !activeFloor) {
        return
      }

      const validation = validateProspectiveRoom(state.draft, activeStructure.id, activeFloor.id, room.id, (editableRoom) => {
        editableRoom.segments.push(
          createSegment({
            label: `${editableRoom.name} wall ${editableRoom.segments.length + 1}`,
          }),
        )
        return true
      })

      if (!validation.valid) {
        setStatus(validation.error)
        return
      }

      mutateDraft((draft) => {
        const room = findSelectedRoom(draft)
        if (!room) {
          return
        }

        room.segments.push(
          createSegment({
            label: `${room.name} wall ${room.segments.length + 1}`,
          }),
        )
      }, {
        status: 'Wall added.',
      })
    },
    insertWallAfter: (structureId: string, floorId: string, roomId: string, segmentId: string) => {
      const validation = validateProspectiveRoom(state.draft, structureId, floorId, roomId, (room) => {
        const segmentIndex = room.segments.findIndex((segment) => segment.id === segmentId)
        if (segmentIndex < 0) {
          return false
        }

        room.segments.splice(
          segmentIndex + 1,
          0,
          createSegment({
            label: `${room.name} wall ${room.segments.length + 1}`,
          }),
        )
        return true
      })

      if (!validation.valid) {
        setStatus(validation.error)
        return
      }

      mutateDraft((draft) => {
        const room = findRoomById(draft, structureId, floorId, roomId)
        if (!room) {
          return
        }

        const segmentIndex = room.segments.findIndex((segment) => segment.id === segmentId)
        if (segmentIndex < 0) {
          return
        }

        room.segments.splice(
          segmentIndex + 1,
          0,
          createSegment({
            label: `${room.name} wall ${room.segments.length + 1}`,
          }),
        )
      }, {
        status: 'Wall inserted.',
      })
    },
    deleteWall: (structureId: string, floorId: string, roomId: string, segmentId: string) => {
      const room = findRoomById(state.draft, structureId, floorId, roomId)
      if (!room || !room.segments.some((segment) => segment.id === segmentId)) {
        setStatus('Wall could not be found.')
        return
      }

      const previewRoom = structuredClone(room)
      const deletionResult = deleteRoomSegmentPreservingGeometry(previewRoom, segmentId)
      if (!deletionResult.deleted) {
        setStatus('Wall could not be removed.')
        return
      }

      mutateDraft((draft) => {
        const editableRoom = findRoomById(draft, structureId, floorId, roomId)
        if (!editableRoom) {
          return
        }

        deleteRoomSegmentPreservingGeometry(editableRoom, segmentId)
      }, {
        status: 'Wall removed.',
      })
    },
    clearWalls: () =>
      mutateDraft((draft) => {
        const room = findSelectedRoom(draft)
        if (room) {
          room.segments = []
        }
      }, {
        status: 'Wall chain cleared.',
      }),
    dismissSuggestion: (suggestionId: string) =>
      setDismissedSuggestionIds((current) =>
        current.includes(suggestionId) ? current : [...current, suggestionId],
      ),
    applySuggestion: (suggestion: RoomSuggestion) => {
      const room = findSelectedRoom(state.draft)
      if (!room || !activeStructure || !activeFloor) {
        return
      }

      const validation = validateProspectiveRoom(state.draft, activeStructure.id, activeFloor.id, room.id, (editableRoom) => {
        suggestion.segmentsToAdd?.forEach((segment) => {
          editableRoom.segments.push(createSegment(segment))
        })
        return true
      })

      if (!validation.valid) {
        setStatus(validation.error)
        return
      }

      mutateDraft((draft) => {
        const room = findSelectedRoom(draft)
        if (!room) {
          return
        }

        suggestion.segmentsToAdd?.forEach((segment) => {
          room.segments.push(createSegment(segment))
        })
      }, {
        status: `${suggestion.title} applied.`,
      })
    },
    restoreSample: () =>
      dispatch({
        type: 'replaceDraft',
        draft: createSeedState(),
        status: 'Sample workspace restored.',
      }),
    importWorkspace: (draft: DraftState) =>
      dispatch({
        type: 'replaceDraft',
        draft,
        status: 'Workspace loaded.',
      }),
    importStructure: (structure: Parameters<typeof cloneImportedStructure>[0]) =>
      mutateDraft((draft) => {
        const imported = cloneImportedStructure(structure)
        draft.structures.push(imported)
        draft.activeStructureId = imported.id
        draft.activeFloorId = imported.floors[0]?.id ?? ''
        draft.selectedRoomId = imported.floors[0]?.rooms[0]?.id ?? null
        draft.selectedFurnitureId = null
      }, {
        status: `${structure.name} loaded into the workspace.`,
      }),
    openRenameDialog,
    openWallDialog,
    openCornerDialog,
    openFurnitureDialog,
    closeDialog: () => dispatch({ type: 'closeDialog' }),
    renameEntity,
    updateWall,
    updateCorner,
    updateFurniture,
    moveRoom,
    moveFurniture,
    addWallFromAnchor,
    openContextMenu: (menu: NonNullable<ContextMenuState>) => dispatch({ type: 'openContextMenu', menu }),
    closeContextMenu: () => dispatch({ type: 'closeContextMenu' }),
    setHoveredTarget: (target: CanvasTarget | null) => dispatch({ type: 'setHoveredTarget', target }),
    setFocusedTarget: (target: CanvasTarget | null) => dispatch({ type: 'setFocusedTarget', target }),
    setSelectionTargets,
    clearSelectionTargets: (status?: string) => {
      dispatch({ type: 'setSelectionTargets', targets: [] })
      if (status) {
        dispatch({ type: 'setStatus', status })
      }
    },
    setCamera: (camera: Omit<EditorUiState['camera'], 'frameBounds'> & { frameBounds?: EditorUiState['camera']['frameBounds'] }) =>
      dispatch({ type: 'setCamera', camera }),
    resetCamera: () => dispatch({ type: 'resetCamera' }),
    undo: () => dispatch({ type: 'undo' }),
    redo: () => dispatch({ type: 'redo' }),
    exportActiveStructure: () => {
      if (!activeStructure) {
        return
      }

      const envelope = createStructureExportEnvelope(activeStructure)
      downloadJsonFile(makeStructureExportFilename(activeStructure), JSON.stringify(envelope, null, 2))
      setStatus(`${activeStructure.name} exported as JSON.`)
    },
    exportWorkspace: () => {
      const envelope = createWorkspaceExportEnvelope(state.draft)
      downloadJsonFile(
        makeWorkspaceExportFilename(activeStructure?.name),
        JSON.stringify(envelope, null, 2),
      )
      setStatus('Workspace exported as JSON.')
    },
  }

  return {
    state,
    draft: state.draft,
    ui: state.ui,
    canUndo: state.history.past.length > 0,
    canRedo: state.history.future.length > 0,
    activeStructure,
    activeFloor,
    selectedRoom,
    selectedFurniture,
    selectedRoomGeometry,
    roomSuggestions,
    visibleFloors,
    viewBounds,
    viewBox,
    structureRoomCount,
    actions,
  }
}

export function EditorProvider({
  children,
  initialDraft,
}: PropsWithChildren<{
  initialDraft?: DraftState
}>) {
  const value = useCreateEditorContextValue(initialDraft)
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
}

export function useEditor() {
  const context = useContext(EditorContext)

  if (!context) {
    throw new Error('useEditor must be used within an EditorProvider')
  }

  return context
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function findStructureById(draft: DraftState, structureId: string) {
  return draft.structures.find((structure) => structure.id === structureId)
}

function pushHistorySnapshot(history: DraftState[], draft: DraftState) {
  const nextHistory = [...history, structuredClone(draft)]
  return nextHistory.length > HISTORY_LIMIT ? nextHistory.slice(nextHistory.length - HISTORY_LIMIT) : nextHistory
}

function isEditableEventTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}
