/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useEffectEvent,
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
  MAX_WALL_STROKE_WIDTH_PX,
  MIN_FURNITURE_CORNER_SNAP_STRENGTH,
  MIN_FURNITURE_SNAP_STRENGTH,
  MIN_LABEL_FONT_SIZE,
  MIN_WALL_STROKE_WIDTH_PX,
  cloneImportedStructure,
  computeVisibleBounds,
  computeFloorBounds,
  createFloor,
  createFurniture,
  createRoom,
  createSegment,
  createStructure,
  findActiveFloor,
  findActiveStructure,
  findFloorById,
  findStructureById,
  findFurnitureById,
  findRoomById,
  findSelectedFurniture,
  findSelectedRoom,
  findSegmentById,
  getRoomSuggestions,
  getViewBox,
  makeId,
  saveDraftState,
  selectTargetInDraft,
} from '../lib/blueprint'
import { createInitialState, editorReducer, type MutateDraftOptions } from '../lib/editorState'
import { buildIsometricScene } from '../lib/isometric'
import { resolveViewScope } from '../lib/viewScope'
import {
  addPolar,
  angleDelta,
  angleFromPoints,
  boundsCenter,
  clamp,
  createEmptyBounds,
  deleteRoomSegmentPreservingGeometry,
  mergeBounds,
  getConnectedRoomIds,
  normalizeAngle,
  pointDistance,
  rotatePoint,
  rotateRoom as applyRoomRotation,
  roomToGeometry,
  round,
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
  serializeExportEnvelope,
} from '../lib/serialization'
import type {
  AnchoredWallDialogAnchor,
  CanvasRoomVisibilityScope,
  CanvasTarget,
  ContextMenuState,
  DraftState,
  EditorMode,
  EditorUiState,
  EntityIds,
  Furniture,
  NamedEntityKind,
  Point,
  RotationDirection,
  Room,
  RoomSuggestion,
  WallAnchorSide,
} from '../types'

type EditorContextValue = ReturnType<typeof useCreateEditorContextValue>

const EditorContext = createContext<EditorContextValue | null>(null)

type AssignableCanvasTarget = Extract<CanvasTarget, { kind: 'wall' | 'furniture' }>
type WallTarget = Extract<CanvasTarget, { kind: 'wall' }>
type RoomTarget = Extract<CanvasTarget, { kind: 'room' }>
type WallRunSnapshot = {
  structureId: string
  floorId: string
  roomId: string
  segmentIds: string[]
  segments: Room['segments']
  start: Point
  heading: number
}
type WallSelectionSnapshot = {
  wallTargets: WallTarget[]
  runs: WallRunSnapshot[]
  bounds: ReturnType<typeof createEmptyBounds> | null
}
function useCreateEditorContextValue(initialDraft?: DraftState) {
  const [state, dispatch] = useReducer(editorReducer, initialDraft, createInitialState)
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState<string[]>([])

  useEffect(() => {
    saveDraftState(state.draft)
  }, [state.draft])
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
  const resolvedViewScope = useMemo(
    () => resolveViewScope(state.draft, state.ui.selectionTargets, state.draft.viewScope),
    [state.draft, state.ui.selectionTargets],
  )
  const visibleFloors = useMemo(
    () => {
      if (!activeStructure) {
        return []
      }

      if (state.draft.viewScope.kind === 'house') {
        return [...activeStructure.floors].sort((left, right) =>
          left.id === state.draft.activeFloorId ? 1 : right.id === state.draft.activeFloorId ? -1 : 0,
        )
      }

      if (state.draft.viewScope.kind === 'floor') {
        const scopeFloor = findFloorById(state.draft, activeStructure.id, state.draft.viewScope.floorId) ?? activeFloor
        return scopeFloor ? [scopeFloor] : []
      }

      return activeFloor ? [activeFloor] : []
    },
    [activeFloor, activeStructure, state.draft],
  )
  const isometricScene = useMemo(
    () =>
      buildIsometricScene({
        draft: state.draft,
        resolvedScope: resolvedViewScope,
      }),
    [resolvedViewScope, state.draft],
  )
  const visibleWallTargets = useMemo<WallTarget[]>(
    () =>
      !activeStructure
        ? []
        : visibleFloors.flatMap((floor) =>
            floor.rooms.flatMap((room) =>
              room.segments.map((segment) => ({
                kind: 'wall',
                structureId: activeStructure.id,
                floorId: floor.id,
                roomId: room.id,
                segmentId: segment.id,
              })),
            ),
          ),
    [activeStructure, visibleFloors],
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
  const setSurfaceMode = (surfaceMode: DraftState['surfaceMode']) =>
    mutateDraft((draft) => {
      draft.surfaceMode = surfaceMode
    }, {
      touchStructure: false,
      recordHistory: false,
    })
  const openIsometricPreview = () => setSurfaceMode('isometric')
  const openPlanSurface = () => setSurfaceMode('plan')
  const resetCamera = () => dispatch({ type: 'resetCamera' })

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

  const getPreferredWallPrimaryTarget = (targets: WallTarget[]) => {
    const focusedTarget = state.ui.focusedTarget

    if (focusedTarget?.kind === 'wall') {
      const matchingTarget = targets.find((target) => isSameWallTarget(target, focusedTarget))

      if (matchingTarget) {
        return matchingTarget
      }
    }

    if (selectedRoom) {
      const selectedRoomWall = targets.find((target) => target.roomId === selectedRoom.id)

      if (selectedRoomWall) {
        return selectedRoomWall
      }
    }

    return targets[0] ?? null
  }

  const preferredSelectAllWallTarget = getPreferredWallPrimaryTarget(visibleWallTargets)

  const selectAllWalls = () => {
    if (visibleWallTargets.length === 0) {
      setStatus('No walls available to select.')
      return
    }

    setSelectionTargets(visibleWallTargets, {
      primaryTarget: preferredSelectAllWallTarget,
      status: `Selected all ${visibleWallTargets.length} wall${visibleWallTargets.length === 1 ? '' : 's'}.`,
    })
  }

  const deleteSelectedWalls = (targets: WallTarget[]) => {
    const snapshot = getWallSelectionSnapshot(state.draft, targets)

    if (!snapshot || snapshot.wallTargets.length === 0) {
      setStatus('No walls available to delete.')
      return
    }

    mutateDraft((draft) => {
      deleteSelectedWallTargets(draft, snapshot.wallTargets)
    }, {
      status: `Removed ${snapshot.wallTargets.length} wall${snapshot.wallTargets.length === 1 ? '' : 's'}.`,
    })

    setSelectionTargets([], {
      primaryTarget: null,
    })
  }

  const rotateSelectedWalls = (targets: WallTarget[], values: { degrees: number; direction: RotationDirection }) => {
    const snapshot = getWallSelectionSnapshot(state.draft, targets)

    if (!snapshot || snapshot.wallTargets.length === 0 || !snapshot.bounds) {
      setStatus('No walls available to rotate.')
      return
    }

    const clampedDegrees = clamp(values.degrees, 0, 360)
    const effectiveDegrees = clampedDegrees % 360

    if (effectiveDegrees === 0) {
      setStatus('Wall rotation unchanged.')
      return
    }

    const signedDegrees = values.direction === 'clockwise' ? -effectiveDegrees : effectiveDegrees
    const center = boundsCenter(snapshot.bounds)
    const placements = snapshot.runs.map((run) => ({
      ...run,
      start: (() => {
        const rotatedStart = rotatePoint(run.start, center, signedDegrees)
        return {
          x: round(rotatedStart.x, 4),
          y: round(rotatedStart.y, 4),
        }
      })(),
      heading: normalizeAngle(run.heading + signedDegrees),
    }))
    const preview = structuredClone(state.draft)
    const validation = validateWallRunPlacement(preview, snapshot.wallTargets, placements)

    if (!validation.valid) {
      setStatus(validation.error)
      return
    }

    mutateDraft((draft) => {
      applyWallRunPlacements(draft, snapshot.wallTargets, placements)
    }, {
      status:
        effectiveDegrees === 180
          ? `Rotated ${snapshot.wallTargets.length} walls 180°.`
          : `Rotated ${snapshot.wallTargets.length} walls ${effectiveDegrees}° ${values.direction}.`,
    })

    setSelectionTargets(snapshot.wallTargets, {
      primaryTarget: getPreferredWallPrimaryTarget(snapshot.wallTargets),
    })
  }

  const assignSelectedWallsToRoom = (targets: WallTarget[], destination: RoomTarget) => {
    const destinationRoom = findRoomById(state.draft, destination.structureId, destination.floorId, destination.roomId)
    const snapshot = getWallSelectionSnapshot(state.draft, targets)

    if (!destinationRoom) {
      setStatus('Destination room could not be found.')
      return
    }

    if (!snapshot || snapshot.wallTargets.length === 0) {
      setStatus('No walls available to assign.')
      return
    }

    const movableWallTargets = snapshot.wallTargets.filter(
      (target) => !isSameRoomTarget(target, destination),
    )
    const placements = snapshot.runs
      .filter((run) => !isSameRoomTarget(run, destination))
      .map((run) => ({
        ...run,
        structureId: destination.structureId,
        floorId: destination.floorId,
        roomId: destination.roomId,
      }))

    if (movableWallTargets.length === 0) {
      setStatus(`${destinationRoom.name} already owns those walls.`)
      return
    }

    const preview = structuredClone(state.draft)
    const validation = validateWallRunPlacement(preview, movableWallTargets, placements)

    if (!validation.valid) {
      setStatus(validation.error)
      return
    }

    mutateDraft((draft) => {
      applyWallRunPlacements(draft, movableWallTargets, placements)
    }, {
      status: `Assigned ${movableWallTargets.length} wall${movableWallTargets.length === 1 ? '' : 's'} to ${destinationRoom.name}.`,
    })

    const nextSelectionTargets = snapshot.wallTargets.map((target) =>
      isSameRoomTarget(target, destination)
        ? target
        : {
            ...target,
            structureId: destination.structureId,
            floorId: destination.floorId,
            roomId: destination.roomId,
          },
    )

    setSelectionTargets(nextSelectionTargets, {
      primaryTarget: getPreferredWallPrimaryTarget(nextSelectionTargets),
    })
  }

  const handleGlobalKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      if (state.draft.surfaceMode === 'isometric') {
        event.preventDefault()
        openPlanSurface()
        return
      }

      dispatch({ type: 'dismissTransientUi' })
      dispatch({ type: 'clearSelection' })
      return
    }

    if (event.defaultPrevented || event.isComposing || isEditableEventTarget(event.target)) {
      return
    }

    if (!event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key === '0') {
      event.preventDefault()
      resetCamera()
      return
    }

    if (!(event.metaKey || event.ctrlKey) || event.altKey) {
      return
    }

    const key = event.key.toLowerCase()

    if (key === 'p' && event.shiftKey) {
      event.preventDefault()
      openIsometricPreview()
      return
    }

    if (key === 'a' && !event.shiftKey) {
      event.preventDefault()
      selectAllWalls()
      return
    }

    if (key === 'z') {
      event.preventDefault()
      dispatch({ type: event.shiftKey ? 'redo' : 'undo' })
      return
    }

    if (key === 'y' && !event.shiftKey) {
      event.preventDefault()
      dispatch({ type: 'redo' })
    }
  })

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

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

      const nextStart = segment.startPoint ? { ...segment.startPoint } : addPolar(anchor, segment.length, normalizeAngle(heading + 180))
      const nextHeading = typeof segment.startHeading === 'number' ? segment.startHeading : heading
      if (segmentIndex === 0) {
        segment.startPoint = undefined
        segment.startHeading = undefined
      } else {
        segment.startPoint = { ...nextStart }
        segment.startHeading = nextHeading
      }
      room.segments.splice(segmentIndex, 0, segment)

      if (segmentIndex === 0) {
        room.anchor = nextStart
        room.startHeading = nextHeading
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

  const openRoomRotationDialog = (ids: EntityIds) =>
    dispatch({
      type: 'openDialog',
      dialog: {
        kind: 'room-rotation',
        ids,
      },
    })

  const openAnchoredWallAngleDialog = (anchor: AnchoredWallDialogAnchor) =>
    dispatch({
      type: 'openDialog',
      dialog: {
        kind: 'anchored-wall-angle',
        anchor,
      },
    })

  const openAnchoredWallDialog = (anchor: AnchoredWallDialogAnchor, turn: number) =>
    dispatch({
      type: 'openDialog',
      dialog: {
        kind: 'anchored-wall',
        anchor,
        turn,
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

  const updateWall = (
    ids: EntityIds,
    values: Pick<Room['segments'][number], 'label' | 'length' | 'notes'> & {
      roomId?: string | null
    },
  ) => {
    if (!ids.structureId || !ids.floorId || !ids.roomId || !ids.segmentId) {
      return {
        valid: false,
        error: 'Wall could not be found.',
      }
    }

    const { structureId, floorId, roomId, segmentId } = ids

    const nextRoomId = values.roomId ?? roomId

    if (nextRoomId === roomId) {
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

    const destinationRoom = findRoomById(state.draft, structureId, floorId, nextRoomId)
    const wallPlacement = getWallPlacementForTarget(
      state.draft,
      { kind: 'wall', structureId, floorId, roomId, segmentId },
      values,
    )
    if (!destinationRoom || !wallPlacement) {
      return {
        valid: false,
        error: 'Wall could not be reassigned.',
      }
    }

    const previewDraft = structuredClone(state.draft)
    const previewFloor = findFloorById(previewDraft, structureId, floorId)
    const previewSourceRoom = findRoomById(previewDraft, structureId, floorId, roomId)
    const previewDestinationRoom = findRoomById(previewDraft, structureId, floorId, nextRoomId)

    if (!previewFloor || !previewSourceRoom || !previewDestinationRoom) {
      return {
        valid: false,
        error: 'Room could not be found.',
      }
    }

    const previewDeletionResult = deleteRoomSegmentPreservingGeometry(previewSourceRoom, segmentId)
    if (!previewDeletionResult.deleted) {
      return {
        valid: false,
        error: 'Wall could not be reassigned.',
      }
    }

    appendWallToRoom(previewDestinationRoom, wallPlacement.segment, wallPlacement.placement)
    const deletedRoomIdSet = new Set<string>()

    if (previewSourceRoom.segments.length === 0 && previewSourceRoom.furniture.length === 0) {
      deletedRoomIdSet.add(roomId)
      previewFloor.rooms = previewFloor.rooms.filter((room) => room.id !== roomId)
    }

    const validation = validateRoomWalls(previewDestinationRoom)
    if (!validation.valid) {
      return validation
    }

    const nextFocusedTarget: CanvasTarget = {
      kind: 'wall',
      structureId,
      floorId,
      roomId: nextRoomId,
      segmentId,
    }
    const remappedSelectionTargets = state.ui.selectionTargets
      .map((selectionTarget) =>
        isWallTarget(selectionTarget, { structureId, floorId, roomId, segmentId })
          ? nextFocusedTarget
          : selectionTarget,
      )
      .filter((selectionTarget) => !targetReferencesDeletedRoom(selectionTarget, deletedRoomIdSet))
    const nextSelectionTargets = remappedSelectionTargets.some((selectionTarget) =>
      isWallTarget(selectionTarget, { structureId, floorId, roomId: nextRoomId, segmentId }),
    )
      ? remappedSelectionTargets
      : [nextFocusedTarget]

    startTransition(() => {
      dispatch({
        type: 'mutateDraft',
        recipe: (draft) => {
          const editableFloor = findFloorById(draft, structureId, floorId)
          const editableSourceRoom = findRoomById(draft, structureId, floorId, roomId)
          const editableDestinationRoom = findRoomById(draft, structureId, floorId, nextRoomId)

          if (!editableFloor || !editableSourceRoom || !editableDestinationRoom) {
            return
          }

          const deletionResult = deleteRoomSegmentPreservingGeometry(editableSourceRoom, segmentId)
          if (!deletionResult.deleted) {
            return
          }

          appendWallToRoom(editableDestinationRoom, wallPlacement.segment, wallPlacement.placement)

          if (deletedRoomIdSet.size > 0) {
            editableFloor.rooms = editableFloor.rooms.filter((room) => !deletedRoomIdSet.has(room.id))
          }

          selectTargetInDraft(draft, nextFocusedTarget)
        },
        options: {
          status: `Wall updated and assigned to ${destinationRoom.name}.`,
        },
      })
      dispatch({
        type: 'setSelectionTargets',
        targets: nextSelectionTargets.length > 0 ? nextSelectionTargets : [nextFocusedTarget],
      })
      dispatch({ type: 'setFocusedTarget', target: nextFocusedTarget })
      dispatch({ type: 'closeDialog' })
    })

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

  const rotateRoom = (ids: EntityIds, values: { degrees: number; direction: RotationDirection }) => {
    if (!ids.structureId || !ids.floorId || !ids.roomId) {
      return {
        valid: false,
        error: 'Room could not be found.',
      }
    }

    const clampedDegrees = clamp(values.degrees, 0, 360)
    const effectiveDegrees = clampedDegrees % 360

    if (effectiveDegrees === 0) {
      dispatch({ type: 'closeDialog' })
      setStatus('Room rotation unchanged.')
      return {
        valid: true,
        error: null,
      }
    }

    const { structureId, floorId, roomId } = ids
    const signedDegrees = values.direction === 'clockwise' ? -effectiveDegrees : effectiveDegrees

    mutateDraft((draft) => {
      const room = findRoomById(draft, structureId, floorId, roomId)
      if (!room) {
        return
      }

      applyRoomRotation(room, signedDegrees)
    }, {
      status:
        effectiveDegrees === 180
          ? 'Room rotated 180°.'
          : `Room rotated ${effectiveDegrees}° ${values.direction}.`,
    })

    dispatch({ type: 'closeDialog' })
    return {
      valid: true,
      error: null,
    }
  }

  const moveRoom = (structureId: string, floorId: string, roomId: string, delta: { x: number; y: number }) => {
    const floor = findFloorById(state.draft, structureId, floorId)
    const connectedRoomIds = floor ? getConnectedRoomIds(floor, roomId) : []
    const roomIdSet = new Set(connectedRoomIds.length > 0 ? connectedRoomIds : [roomId])

    mutateDraft((draft) => {
      const editableFloor = findFloorById(draft, structureId, floorId)
      if (!editableFloor) {
        return
      }

      editableFloor.rooms.forEach((room) => {
        if (!roomIdSet.has(room.id)) {
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
        room.furniture.forEach((item) => {
          item.x += delta.x
          item.y += delta.y
        })
      })
    }, {
      status: roomIdSet.size > 1 ? `${roomIdSet.size} connected rooms moved.` : 'Room moved.',
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
    anchor: AnchoredWallDialogAnchor,
    values: Pick<Room['segments'][number], 'label' | 'length' | 'notes'> & { turn: number },
  ) => {
    const { structureId, floorId, roomId, segmentId, side } = anchor
    const segment = createSegment({
      label: values.label,
      length: values.length,
      notes: values.notes,
      turn: side === 'before' ? values.turn : undefined,
    })
    const validation = validateProspectiveRoom(state.draft, structureId, floorId, roomId, (room) => {
      const targetSegment = room.segments.find((item) => item.id === segmentId)
      if (!targetSegment) {
        return false
      }

      if (side === 'after') {
        targetSegment.turn = values.turn
      }

      return insertWallAtAnchor(room, segmentId, side, segment)
    })

    if (!validation.valid) {
      setStatus(validation.error)
      return validation
    }

    mutateDraft((draft) => {
      const room = findRoomById(draft, structureId, floorId, roomId)
      if (!room) {
        return
      }

      const targetSegment = room.segments.find((item) => item.id === segmentId)
      if (!targetSegment) {
        return
      }

      if (side === 'after') {
        targetSegment.turn = values.turn
      }

      if (!insertWallAtAnchor(room, segmentId, side, segment)) {
        return
      }

      draft.activeStructureId = structureId
      draft.activeFloorId = floorId
      draft.selectedRoomId = roomId
      draft.selectedFurnitureId = null
    }, {
      status: 'New wall anchored to the selected corner.',
    })

    dispatch({ type: 'closeDialog' })

    return validation
  }

  const resolveAnchoredWallTrace = (room: Room, anchor: AnchoredWallDialogAnchor) => {
    const geometry = roomToGeometry(room)
    const targetSegment = geometry.segments.find((segment) => segment.id === anchor.segmentId)
    const chain = geometry.chains.find((item) => item.segments.some((segment) => segment.id === anchor.segmentId))

    if (!targetSegment || !chain) {
      return null
    }

    return {
      point: anchor.side === 'before' ? targetSegment.start : targetSegment.end,
      heading: targetSegment.heading,
      chainStartSegmentId: chain.segments[0]?.id ?? anchor.segmentId,
      chainEndSegmentId: chain.segments[chain.segments.length - 1]?.id ?? anchor.segmentId,
    }
  }

  const traceWallFromAnchor = (
    anchor: AnchoredWallDialogAnchor,
    endpoint: Point,
    snappedAnchor?: AnchoredWallDialogAnchor | null,
  ) => {
    const { structureId, floorId, roomId, segmentId, side } = anchor
    const room = findRoomById(state.draft, structureId, floorId, roomId)

    if (!room) {
      setStatus('Room could not be found.')
      return
    }

    const sourceAnchor = resolveAnchoredWallTrace(room, anchor)
    const resolvedSnapAnchor =
      snappedAnchor &&
      snappedAnchor.structureId === structureId &&
      snappedAnchor.floorId === floorId &&
      snappedAnchor.roomId === roomId
        ? resolveAnchoredWallTrace(room, snappedAnchor)
        : null
    const effectiveEndpoint = resolvedSnapAnchor?.point ?? endpoint
    const length = round(pointDistance(sourceAnchor?.point ?? endpoint, effectiveEndpoint), 4)

    if (!sourceAnchor) {
      setStatus('Wall could not be found.')
      return
    }

    if (length <= 0.1) {
      setStatus('Drag farther from the joint to trace a wall.')
      return
    }

    const nextSegmentId = makeId('seg')
    const nextTarget: CanvasTarget = {
      kind: 'wall',
      structureId,
      floorId,
      roomId,
      segmentId: nextSegmentId,
    }
    const segmentTemplate = {
      id: nextSegmentId,
      label: `${room.name} wall ${room.segments.length + 1}`,
      length,
      notes: '',
      turn: 90,
    }

    const applyTraceToRoom = (editableRoom: Room) => {
      if (side === 'after') {
        const nextHeading = angleFromPoints(sourceAnchor.point, effectiveEndpoint)
        const targetSegment = editableRoom.segments.find((item) => item.id === segmentId)
        if (!targetSegment) {
          return false
        }

        targetSegment.turn = round(angleDelta(sourceAnchor.heading, nextHeading), 1)

        const closingTurn =
          resolvedSnapAnchor && snappedAnchor?.side === 'before' && snappedAnchor.segmentId === sourceAnchor.chainStartSegmentId
            ? round(angleDelta(nextHeading, resolvedSnapAnchor.heading), 1)
            : 90

        return insertWallAtAnchor(
          editableRoom,
          segmentId,
          side,
          createSegment({
            ...segmentTemplate,
            turn: closingTurn,
          }),
        )
      }

      const nextHeading = angleFromPoints(effectiveEndpoint, sourceAnchor.point)
      const closingTargetSegment =
        resolvedSnapAnchor && snappedAnchor?.side === 'after' && snappedAnchor.segmentId === sourceAnchor.chainEndSegmentId
          ? editableRoom.segments.find((item) => item.id === snappedAnchor.segmentId)
          : null

      if (resolvedSnapAnchor && snappedAnchor?.side === 'after' && snappedAnchor.segmentId === sourceAnchor.chainEndSegmentId) {
        if (!closingTargetSegment) {
          return false
        }

        closingTargetSegment.turn = round(angleDelta(resolvedSnapAnchor.heading, nextHeading), 1)
      }

      return insertWallAtAnchor(
        editableRoom,
        segmentId,
        side,
        createSegment({
          ...segmentTemplate,
          startPoint: { ...effectiveEndpoint },
          startHeading: nextHeading,
          turn: round(angleDelta(nextHeading, sourceAnchor.heading), 1),
        }),
      )
    }

    const validation = validateProspectiveRoom(state.draft, structureId, floorId, roomId, applyTraceToRoom)

    if (!validation.valid) {
      setStatus(validation.error)
      return
    }

    mutateDraft((draft) => {
      const editableRoom = findRoomById(draft, structureId, floorId, roomId)
      if (!editableRoom || !applyTraceToRoom(editableRoom)) {
        return
      }

      draft.activeStructureId = structureId
      draft.activeFloorId = floorId
      draft.selectedRoomId = roomId
      draft.selectedFurnitureId = null
    }, {
      status: resolvedSnapAnchor ? 'Wall traced and snapped to an open joint.' : 'Wall traced.',
    })

    dispatch({ type: 'setFocusedTarget', target: nextTarget })
    dispatch({ type: 'setSelectionTargets', targets: [nextTarget] })
  }

  const appendWallToRoom = (
    room: Room,
    segment: Room['segments'][number],
    placement: {
      start: Point
      heading: number
    },
  ) => {
    const nextSegment = createSegment({
      id: segment.id,
      label: segment.label,
      length: segment.length,
      turn: segment.turn,
      notes: segment.notes,
    })

    if (room.segments.length === 0) {
      room.anchor = { ...placement.start }
      room.startHeading = placement.heading
    } else {
      nextSegment.startPoint = { ...placement.start }
      nextSegment.startHeading = placement.heading
    }

    room.segments.push(nextSegment)
  }

  const getWallPlacementForTarget = (
    draft: DraftState,
    target: Extract<AssignableCanvasTarget, { kind: 'wall' }>,
    overrides?: Partial<Pick<Room['segments'][number], 'label' | 'length' | 'turn' | 'notes'>>,
  ) => {
    const sourceRoom = findRoomById(draft, target.structureId, target.floorId, target.roomId)
    const sourceSegment = findSegmentById(
      draft,
      target.structureId,
      target.floorId,
      target.roomId,
      target.segmentId,
    )
    const segmentGeometry = sourceRoom
      ? roomToGeometry(sourceRoom).segments.find((segment) => segment.id === target.segmentId) ?? null
      : null

    if (!sourceSegment || !segmentGeometry) {
      return null
    }

    return {
      segment: createSegment({
        id: sourceSegment.id,
        label: overrides?.label ?? sourceSegment.label,
        length: overrides?.length ?? sourceSegment.length,
        turn: overrides?.turn ?? sourceSegment.turn,
        notes: overrides?.notes ?? sourceSegment.notes,
      }),
      placement: {
        start: { ...segmentGeometry.start },
        heading: segmentGeometry.heading,
      },
    }
  }

  const assignTargetsToRoom = (
    targets: AssignableCanvasTarget[],
    nextRoomId: string,
    primaryTarget?: AssignableCanvasTarget,
  ) => {
    const uniqueTargets = Array.from(
      new Map(targets.map((target) => [getAssignableTargetKey(target), target])).values(),
    )

    if (uniqueTargets.length === 0) {
      setStatus('No selected walls or furniture could be reassigned.')
      return
    }

    const { structureId, floorId } = uniqueTargets[0]
    if (uniqueTargets.some((target) => target.structureId !== structureId || target.floorId !== floorId)) {
      setStatus('Select walls and furniture from the same floor to assign them together.')
      return
    }

    const destinationRoom = findRoomById(state.draft, structureId, floorId, nextRoomId)
    if (!destinationRoom) {
      setStatus('Room could not be found.')
      return
    }

    const targetsToMove = uniqueTargets.filter((target) => target.roomId !== nextRoomId)
    if (targetsToMove.length === 0) {
      setStatus(`${describeAssignableTargets(uniqueTargets)} already belong to ${destinationRoom.name}.`)
      return
    }

    const wallPlacements = new Map(
      targetsToMove
        .filter((target): target is Extract<AssignableCanvasTarget, { kind: 'wall' }> => target.kind === 'wall')
        .map((target) => [getAssignableTargetKey(target), getWallPlacementForTarget(state.draft, target)] as const),
    )

    if (
      targetsToMove.some(
        (target) => target.kind === 'wall' && !wallPlacements.get(getAssignableTargetKey(target)),
      )
    ) {
      setStatus('Wall could not be reassigned.')
      return
    }

    const previewDraft = structuredClone(state.draft)
    const sourceRoomIdSet = new Set(targetsToMove.map((target) => target.roomId))
    const previewFloor = findFloorById(previewDraft, structureId, floorId)
    const previewDestinationRoom = findRoomById(previewDraft, structureId, floorId, nextRoomId)
    if (!previewFloor || !previewDestinationRoom) {
      setStatus('Room could not be found.')
      return
    }

    for (const target of targetsToMove) {
      if (target.kind === 'wall') {
        const previewSourceRoom = findRoomById(previewDraft, target.structureId, target.floorId, target.roomId)
        const wallPlacement = wallPlacements.get(getAssignableTargetKey(target))

        if (!previewSourceRoom || !wallPlacement) {
          setStatus('Wall could not be reassigned.')
          return
        }

        const deletionResult = deleteRoomSegmentPreservingGeometry(previewSourceRoom, target.segmentId)
        if (!deletionResult.deleted) {
          setStatus('Wall could not be reassigned.')
          return
        }

        appendWallToRoom(previewDestinationRoom, wallPlacement.segment, wallPlacement.placement)
        continue
      }

      const previewSourceRoom = findRoomById(previewDraft, target.structureId, target.floorId, target.roomId)
      if (!previewSourceRoom) {
        setStatus('Furniture could not be reassigned.')
        return
      }

      const furnitureIndex = previewSourceRoom.furniture.findIndex((item) => item.id === target.furnitureId)
      if (furnitureIndex < 0) {
        setStatus('Furniture could not be reassigned.')
        return
      }

      const [movedFurniture] = previewSourceRoom.furniture.splice(furnitureIndex, 1)
      previewDestinationRoom.furniture.push(movedFurniture)
    }

    const deletedRoomIdSet = new Set(
      Array.from(sourceRoomIdSet).filter((roomId) => {
        if (roomId === nextRoomId) {
          return false
        }

        const room = previewFloor.rooms.find((candidate) => candidate.id === roomId)
        return Boolean(room && room.segments.length === 0 && room.furniture.length === 0)
      }),
    )

    if (deletedRoomIdSet.size > 0) {
      previewFloor.rooms = previewFloor.rooms.filter((room) => !deletedRoomIdSet.has(room.id))
    }

    const validation = validateRoomWalls(previewDestinationRoom)
    if (!validation.valid) {
      setStatus(validation.error)
      return
    }

    const nextFocusedTarget = mapAssignableTargetToRoom(primaryTarget ?? targetsToMove[0], nextRoomId)
    const movedTargetKeySet = new Set(targetsToMove.map((target) => getAssignableTargetKey(target)))
    const mappedSelectionTargets = state.ui.selectionTargets.map((selectionTarget) => {
      if ((selectionTarget.kind !== 'wall' && selectionTarget.kind !== 'furniture') || !movedTargetKeySet.has(getAssignableTargetKey(selectionTarget))) {
        return selectionTarget
      }

      return mapAssignableTargetToRoom(selectionTarget, nextRoomId)
    }).filter((selectionTarget) => !targetReferencesDeletedRoom(selectionTarget, deletedRoomIdSet))
    const nextSelectionTargets =
      mappedSelectionTargets.length > 0 ? mappedSelectionTargets : [nextFocusedTarget]

    startTransition(() => {
      dispatch({
        type: 'mutateDraft',
        recipe: (draft) => {
          const editableFloor = findFloorById(draft, structureId, floorId)
          const editableDestinationRoom = findRoomById(draft, structureId, floorId, nextRoomId)
          if (!editableFloor || !editableDestinationRoom) {
            return
          }

          for (const target of targetsToMove) {
            if (target.kind === 'wall') {
              const editableSourceRoom = findRoomById(draft, target.structureId, target.floorId, target.roomId)
              const wallPlacement = wallPlacements.get(getAssignableTargetKey(target))

              if (!editableSourceRoom || !wallPlacement) {
                return
              }

              const deletionResult = deleteRoomSegmentPreservingGeometry(editableSourceRoom, target.segmentId)
              if (!deletionResult.deleted) {
                return
              }

              appendWallToRoom(editableDestinationRoom, wallPlacement.segment, wallPlacement.placement)
              continue
            }

            const editableSourceRoom = findRoomById(draft, target.structureId, target.floorId, target.roomId)
            if (!editableSourceRoom) {
              return
            }

            const furnitureIndex = editableSourceRoom.furniture.findIndex((item) => item.id === target.furnitureId)
            if (furnitureIndex < 0) {
              return
            }

            const [movedFurniture] = editableSourceRoom.furniture.splice(furnitureIndex, 1)
            editableDestinationRoom.furniture.push(movedFurniture)
          }

          if (deletedRoomIdSet.size > 0) {
            editableFloor.rooms = editableFloor.rooms.filter((room) => !deletedRoomIdSet.has(room.id))
          }

          selectTargetInDraft(draft, nextFocusedTarget)
        },
        options: {
          status: `${describeAssignableTargets(targetsToMove)} assigned to ${destinationRoom.name}.`,
        },
      })
      dispatch({ type: 'setSelectionTargets', targets: nextSelectionTargets })
      dispatch({ type: 'setFocusedTarget', target: nextFocusedTarget })
    })
  }

  const assignFurnitureToRoom = (
    structureId: string,
    floorId: string,
    roomId: string,
    furnitureId: string,
    nextRoomId: string,
  ) =>
    assignTargetsToRoom(
      [{ kind: 'furniture', structureId, floorId, roomId, furnitureId }],
      nextRoomId,
      { kind: 'furniture', structureId, floorId, roomId, furnitureId },
    )

  const assignWallToRoom = (
    structureId: string,
    floorId: string,
    roomId: string,
    segmentId: string,
    nextRoomId: string,
  ) =>
    assignTargetsToRoom(
      [{ kind: 'wall', structureId, floorId, roomId, segmentId }],
      nextRoomId,
      { kind: 'wall', structureId, floorId, roomId, segmentId },
    )

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
    setCanvasRoomVisibilityScope: (scope: CanvasRoomVisibilityScope) =>
      mutateDraft(
        (draft) => {
          draft.canvasRoomVisibilityScope = scope
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
    setWallStrokeWidthPx: (value: number) =>
      mutateDraft(
        (draft) => {
          draft.wallStrokeWidthPx = clamp(value, MIN_WALL_STROKE_WIDTH_PX, MAX_WALL_STROKE_WIDTH_PX)
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
    deleteSelectedWalls,
    rotateSelectedWalls,
    assignSelectedWallsToRoom,
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
    openRoomRotationDialog,
    openAnchoredWallAngleDialog,
    openAnchoredWallDialog,
    closeDialog: () => dispatch({ type: 'closeDialog' }),
    renameEntity,
    updateWall,
    updateCorner,
    updateFurniture,
    rotateRoom,
    moveRoom,
    moveFurniture,
    assignTargetsToRoom,
    assignFurnitureToRoom,
    assignWallToRoom,
    addWallFromAnchor,
    traceWallFromAnchor,
    openContextMenu: (menu: NonNullable<ContextMenuState>) => dispatch({ type: 'openContextMenu', menu }),
    closeContextMenu: () => dispatch({ type: 'closeContextMenu' }),
    startMeasurement: (point: Point) => dispatch({ type: 'startMeasurement', point }),
    completeMeasurement: (point: Point) => dispatch({ type: 'completeMeasurement', point }),
    clearMeasurements: () => dispatch({ type: 'clearMeasurements' }),
    setHoveredTarget: (target: CanvasTarget | null) => dispatch({ type: 'setHoveredTarget', target }),
    setFocusedTarget: (target: CanvasTarget | null) => dispatch({ type: 'setFocusedTarget', target }),
    setSelectionTargets,
    clearSelectionTargets: (status?: string) => {
      dispatch({ type: 'setSelectionTargets', targets: [] })
      if (status) {
        dispatch({ type: 'setStatus', status })
      }
    },
    clearSelection: (options?: { status?: string; focusedTarget?: CanvasTarget | null }) =>
      dispatch({
        type: 'clearSelection',
        status: options?.status,
        focusedTarget: options?.focusedTarget,
      }),
    setCamera: (camera: Omit<EditorUiState['camera'], 'frameBounds'> & { frameBounds?: EditorUiState['camera']['frameBounds'] }) =>
      dispatch({ type: 'setCamera', camera }),
    resetCamera,
    undo: () => dispatch({ type: 'undo' }),
    redo: () => dispatch({ type: 'redo' }),
    exportActiveStructure: () => {
      if (!activeStructure) {
        return
      }

      const envelope = createStructureExportEnvelope(activeStructure)
      downloadJsonFile(makeStructureExportFilename(activeStructure), serializeExportEnvelope(envelope))
      setStatus(`${activeStructure.name} exported as JSON.`)
    },
    exportWorkspace: () => {
      const envelope = createWorkspaceExportEnvelope(state.draft)
      downloadJsonFile(makeWorkspaceExportFilename(activeStructure?.name), serializeExportEnvelope(envelope))
      setStatus('Workspace exported as JSON.')
    },
    setViewScope: (viewScope: DraftState['viewScope']) =>
      mutateDraft((draft) => {
        draft.viewScope = viewScope
      }, {
        touchStructure: false,
        recordHistory: false,
        resetCamera: true,
      }),
    setSurfaceMode,
    openIsometricPreview,
    openPlanSurface,
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
    resolvedViewScope,
    isometricScene,
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

function getAssignableTargetKey(target: AssignableCanvasTarget) {
  switch (target.kind) {
    case 'wall':
      return `wall:${target.structureId}:${target.floorId}:${target.roomId}:${target.segmentId}`
    case 'furniture':
      return `furniture:${target.structureId}:${target.floorId}:${target.roomId}:${target.furnitureId}`
  }
}

function mapAssignableTargetToRoom(target: AssignableCanvasTarget, roomId: string): AssignableCanvasTarget {
  return {
    ...target,
    roomId,
  }
}

function describeAssignableTargets(targets: AssignableCanvasTarget[]) {
  const walls = targets.filter((target) => target.kind === 'wall').length
  const furniture = targets.filter((target) => target.kind === 'furniture').length
  const parts = [
    walls > 0 ? `${walls} wall${walls === 1 ? '' : 's'}` : '',
    furniture > 0 ? `${furniture} furniture item${furniture === 1 ? '' : 's'}` : '',
  ].filter(Boolean)

  return parts.join(' and ')
}

function targetReferencesDeletedRoom(target: CanvasTarget, deletedRoomIdSet: Set<string>) {
  if (deletedRoomIdSet.size === 0) {
    return false
  }

  switch (target.kind) {
    case 'room':
    case 'wall':
    case 'corner':
    case 'furniture':
      return deletedRoomIdSet.has(target.roomId)
    default:
      return false
  }
}

function isSameWallTarget(left: WallTarget, right: WallTarget) {
  return (
    left.structureId === right.structureId &&
    left.floorId === right.floorId &&
    left.roomId === right.roomId &&
    left.segmentId === right.segmentId
  )
}

function isSameRoomTarget(
  left: { structureId: string; floorId: string; roomId: string },
  right: { structureId: string; floorId: string; roomId: string },
) {
  return left.structureId === right.structureId && left.floorId === right.floorId && left.roomId === right.roomId
}

function getRoomTargetKey(target: { structureId: string; floorId: string; roomId: string }) {
  return `${target.structureId}:${target.floorId}:${target.roomId}`
}

function getWallTargetKey(target: WallTarget) {
  return `${getRoomTargetKey(target)}:${target.segmentId}`
}

function getWallSelectionSnapshot(draft: DraftState, targets: WallTarget[]): WallSelectionSnapshot | null {
  const uniqueTargets = Array.from(new Map(targets.map((target) => [getWallTargetKey(target), target])).values())
  const targetsByRoom = new Map<string, { target: RoomTarget; selectedSegmentIds: Set<string> }>()
  let bounds: WallSelectionSnapshot['bounds'] = null

  uniqueTargets.forEach((target) => {
    const key = getRoomTargetKey(target)
    const existing = targetsByRoom.get(key)

    if (existing) {
      existing.selectedSegmentIds.add(target.segmentId)
      return
    }

    targetsByRoom.set(key, {
      target: {
        kind: 'room',
        structureId: target.structureId,
        floorId: target.floorId,
        roomId: target.roomId,
      },
      selectedSegmentIds: new Set([target.segmentId]),
    })
  })

  const runs: WallRunSnapshot[] = []

  for (const { target, selectedSegmentIds } of targetsByRoom.values()) {
    const room = findRoomById(draft, target.structureId, target.floorId, target.roomId)

    if (!room) {
      return null
    }

    const geometryById = new Map(roomToGeometry(room).segments.map((segment) => [segment.id, segment]))
    let currentRun: WallRunSnapshot | null = null

    room.segments.forEach((segment, index) => {
      const selected = selectedSegmentIds.has(segment.id)

      if (!selected) {
        if (currentRun) {
          runs.push(currentRun)
          currentRun = null
        }
        return
      }

      const geometrySegment = geometryById.get(segment.id)

      if (!geometrySegment) {
        currentRun = null
        return
      }

      const segmentBounds = {
        minX: Math.min(geometrySegment.start.x, geometrySegment.end.x),
        minY: Math.min(geometrySegment.start.y, geometrySegment.end.y),
        maxX: Math.max(geometrySegment.start.x, geometrySegment.end.x),
        maxY: Math.max(geometrySegment.start.y, geometrySegment.end.y),
      }
      bounds = bounds ? mergeBounds(bounds, segmentBounds) : segmentBounds

      const previousSegmentSelected = index > 0 && selectedSegmentIds.has(room.segments[index - 1].id)
      const startsNewRun = !currentRun || Boolean(segment.startPoint) || !previousSegmentSelected

      if (startsNewRun) {
        if (currentRun) {
          runs.push(currentRun)
        }

        currentRun = {
          structureId: target.structureId,
          floorId: target.floorId,
          roomId: target.roomId,
          segmentIds: [segment.id],
          segments: [structuredClone(segment)],
          start: { ...geometrySegment.start },
          heading: geometrySegment.heading,
        }
        return
      }

      if (!currentRun) {
        return
      }

      currentRun.segmentIds.push(segment.id)
      currentRun.segments.push(structuredClone(segment))
    })

    if (currentRun) {
      runs.push(currentRun)
    }
  }

  return {
    wallTargets: uniqueTargets,
    runs,
    bounds,
  }
}

function removeWallTargetsFromRoom(room: Room, segmentIds: string[]) {
  const removableIds = new Set(segmentIds)
  const orderedSegmentIds = room.segments.filter((segment) => removableIds.has(segment.id)).map((segment) => segment.id)

  orderedSegmentIds.forEach((segmentId) => {
    deleteRoomSegmentPreservingGeometry(room, segmentId)
  })
}

function appendWallRunToRoom(room: Room, run: WallRunSnapshot) {
  if (run.segments.length === 0) {
    return
  }

  const nextSegments = run.segments.map((segment, index) => {
    const nextSegment = createSegment(segment)

    if (index === 0) {
      if (room.segments.length === 0) {
        delete nextSegment.startPoint
        delete nextSegment.startHeading
      } else {
        nextSegment.startPoint = { ...run.start }
        nextSegment.startHeading = run.heading
      }
    } else {
      delete nextSegment.startPoint
      delete nextSegment.startHeading
    }

    return nextSegment
  })

  if (room.segments.length === 0) {
    room.anchor = { ...run.start }
    room.startHeading = run.heading
  }

  room.segments.push(...nextSegments)
}

function deleteSelectedWallTargets(draft: DraftState, wallTargetsToRemove: WallTarget[]) {
  const removableTargetsByRoom = new Map<string, { target: RoomTarget; segmentIds: string[] }>()

  wallTargetsToRemove.forEach((target) => {
    const key = getRoomTargetKey(target)
    const existing = removableTargetsByRoom.get(key)

    if (existing) {
      existing.segmentIds.push(target.segmentId)
      return
    }

    removableTargetsByRoom.set(key, {
      target: {
        kind: 'room',
        structureId: target.structureId,
        floorId: target.floorId,
        roomId: target.roomId,
      },
      segmentIds: [target.segmentId],
    })
  })

  removableTargetsByRoom.forEach(({ target, segmentIds }) => {
    const floor = findFloorById(draft, target.structureId, target.floorId)
    const room = findRoomById(draft, target.structureId, target.floorId, target.roomId)

    if (!floor || !room) {
      return
    }

    const removableIds = new Set(segmentIds)
    const removesWholeRoom = room.segments.length > 0 && room.segments.every((segment) => removableIds.has(segment.id))

    if (removesWholeRoom) {
      floor.rooms = floor.rooms.filter((item) => item.id !== room.id)
      return
    }

    removeWallTargetsFromRoom(room, segmentIds)
  })
}

function applyWallRunPlacements(draft: DraftState, wallTargetsToRemove: WallTarget[], placements: WallRunSnapshot[]) {
  const removableTargetsByRoom = new Map<string, { target: RoomTarget; segmentIds: string[] }>()

  wallTargetsToRemove.forEach((target) => {
    const key = getRoomTargetKey(target)
    const existing = removableTargetsByRoom.get(key)

    if (existing) {
      existing.segmentIds.push(target.segmentId)
      return
    }

    removableTargetsByRoom.set(key, {
      target: {
        kind: 'room',
        structureId: target.structureId,
        floorId: target.floorId,
        roomId: target.roomId,
      },
      segmentIds: [target.segmentId],
    })
  })

  removableTargetsByRoom.forEach(({ target, segmentIds }) => {
    const room = findRoomById(draft, target.structureId, target.floorId, target.roomId)

    if (!room) {
      return
    }

    removeWallTargetsFromRoom(room, segmentIds)
  })

  placements.forEach((placement) => {
    const room = findRoomById(draft, placement.structureId, placement.floorId, placement.roomId)

    if (!room) {
      return
    }

    appendWallRunToRoom(room, placement)
  })
}

function validateWallRunPlacement(draft: DraftState, wallTargetsToRemove: WallTarget[], placements: WallRunSnapshot[]) {
  applyWallRunPlacements(draft, wallTargetsToRemove, placements)

  const affectedRoomKeys = new Set<string>([
    ...wallTargetsToRemove.map((target) => getRoomTargetKey(target)),
    ...placements.map((placement) => getRoomTargetKey(placement)),
  ])

  for (const key of affectedRoomKeys) {
    const [structureId, floorId, roomId] = key.split(':')
    const room = findRoomById(draft, structureId, floorId, roomId)

    if (!room) {
      continue
    }

    const validation = validateRoomWalls(room)

    if (!validation.valid) {
      return validation
    }
  }

  return {
    valid: true as const,
    error: null,
  }
}

function isWallTarget(
  target: CanvasTarget,
  ids: {
    structureId: string
    floorId: string
    roomId: string
    segmentId: string
  },
) {
  return (
    target.kind === 'wall' &&
    target.structureId === ids.structureId &&
    target.floorId === ids.floorId &&
    target.roomId === ids.roomId &&
    target.segmentId === ids.segmentId
  )
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
