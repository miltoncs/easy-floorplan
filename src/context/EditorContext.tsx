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
  saveDraftState,
  selectTargetInDraft,
} from '../lib/blueprint'
import { createInitialState, editorReducer, type MutateDraftOptions } from '../lib/editorState'
import {
  addPolar,
  clamp,
  deleteRoomSegmentPreservingGeometry,
  normalizeAngle,
  rotateRoom as applyRoomRotation,
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
  serializeExportEnvelope,
} from '../lib/serialization'
import type {
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
} from '../types'

type EditorContextValue = ReturnType<typeof useCreateEditorContextValue>

const EditorContext = createContext<EditorContextValue | null>(null)

type WallAnchorSide = 'before' | 'after'
type AssignableCanvasTarget = Extract<CanvasTarget, { kind: 'wall' | 'furniture' }>

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

  const openRoomRotationDialog = (ids: EntityIds) =>
    dispatch({
      type: 'openDialog',
      dialog: {
        kind: 'room-rotation',
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
        .map((target) => {
          const sourceRoom = findRoomById(state.draft, target.structureId, target.floorId, target.roomId)
          const sourceSegment = findSegmentById(
            state.draft,
            target.structureId,
            target.floorId,
            target.roomId,
            target.segmentId,
          )
          const segmentGeometry = sourceRoom
            ? roomToGeometry(sourceRoom).segments.find((segment) => segment.id === target.segmentId) ?? null
            : null

          if (!sourceSegment || !segmentGeometry) {
            return [getAssignableTargetKey(target), null] as const
          }

          return [
            getAssignableTargetKey(target),
            {
              segment: createSegment({
                id: sourceSegment.id,
                label: sourceSegment.label,
                length: sourceSegment.length,
                turn: sourceSegment.turn,
                notes: sourceSegment.notes,
              }),
              placement: {
                start: { ...segmentGeometry.start },
                heading: segmentGeometry.heading,
              },
            },
          ] as const
        }),
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
    openRoomRotationDialog,
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
      downloadJsonFile(makeStructureExportFilename(activeStructure), serializeExportEnvelope(envelope))
      setStatus(`${activeStructure.name} exported as JSON.`)
    },
    exportWorkspace: () => {
      const envelope = createWorkspaceExportEnvelope(state.draft)
      downloadJsonFile(makeWorkspaceExportFilename(activeStructure?.name), serializeExportEnvelope(envelope))
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
