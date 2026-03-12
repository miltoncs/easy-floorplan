import { createSeedState } from '../data/seed'
import type {
  Bounds,
  CanvasTarget,
  ContextMenuState,
  DialogState,
  DraftState,
  EditorState,
  EditorUiState,
} from '../types'
import {
  computeVisibleBounds,
  ensureSelections,
  findActiveFloor,
  findActiveStructure,
  loadDraftState,
  touchStructure,
} from './blueprint'
import { clamp } from './geometry'

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

export type MutateDraftOptions = {
  status?: string
  touchStructure?: boolean
  resetCamera?: boolean
  recordHistory?: boolean
}

export type EditorAction =
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

export function createInitialState(initialDraft?: DraftState): EditorState {
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

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
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
        history:
          action.recordHistory === false
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

function pushHistorySnapshot(history: DraftState[], draft: DraftState) {
  const nextHistory = [...history, structuredClone(draft)]
  return nextHistory.length > HISTORY_LIMIT ? nextHistory.slice(nextHistory.length - HISTORY_LIMIT) : nextHistory
}
