export type EditorMode = 'rooms' | 'furniture' | 'stacked'

export type NamedEntityKind = 'structure' | 'floor' | 'room' | 'furniture'

export type Point = {
  x: number
  y: number
}

export type OutlineSegment = {
  id: string
  label: string
  length: number
  turn: number
  notes: string
}

export type Furniture = {
  id: string
  name: string
  x: number
  y: number
  width: number
  depth: number
  rotation: number
}

export type Room = {
  id: string
  name: string
  color: string
  anchor: Point
  startHeading: number
  notes: string
  segments: OutlineSegment[]
  furniture: Furniture[]
}

export type Floor = {
  id: string
  name: string
  elevation: number
  rooms: Room[]
}

export type Structure = {
  id: string
  name: string
  notes: string
  createdAt: string
  updatedAt: string
  floors: Floor[]
}

export type DraftState = {
  structures: Structure[]
  activeStructureId: string
  activeFloorId: string
  selectedRoomId: string | null
  selectedFurnitureId: string | null
  editorMode: EditorMode
  showGrid: boolean
  showInferred: boolean
  showRoomFloorLabels: boolean
  showWallLabels: boolean
  showAngleLabels: boolean
}

export type EntityIds = {
  structureId: string
  floorId?: string
  roomId?: string
  furnitureId?: string
  segmentId?: string
}

export type CanvasTarget =
  | ({
      kind: 'canvas'
      structureId?: string
      floorId?: string
    })
  | ({
      kind: 'structure'
      structureId: string
    })
  | ({
      kind: 'floor'
      structureId: string
      floorId: string
    })
  | ({
      kind: 'room'
      structureId: string
      floorId: string
      roomId: string
    })
  | ({
      kind: 'wall'
      structureId: string
      floorId: string
      roomId: string
      segmentId: string
    })
  | ({
      kind: 'corner'
      structureId: string
      floorId: string
      roomId: string
      segmentId: string
    })
  | ({
      kind: 'furniture'
      structureId: string
      floorId: string
      roomId: string
      furnitureId: string
    })

export type ContextMenuState = {
  x: number
  y: number
  target: CanvasTarget
} | null

export type RenameDialogState = {
  kind: 'rename'
  entityKind: NamedEntityKind
  ids: EntityIds
}

export type WallDialogState = {
  kind: 'wall'
  ids: EntityIds
}

export type CornerDialogState = {
  kind: 'corner'
  ids: EntityIds
}

export type FurnitureDialogState = {
  kind: 'furniture'
  ids: EntityIds
}

export type DialogState = RenameDialogState | WallDialogState | CornerDialogState | FurnitureDialogState | null

export type CameraState = {
  zoom: number
  offset: Point
}

export type EditorUiState = {
  status: string
  camera: CameraState
  dialog: DialogState
  contextMenu: ContextMenuState
  hoveredTarget: CanvasTarget | null
  focusedTarget: CanvasTarget | null
  selectionTargets: CanvasTarget[]
}

export type EditorHistoryState = {
  past: DraftState[]
  future: DraftState[]
}

export type EditorState = {
  draft: DraftState
  ui: EditorUiState
  history: EditorHistoryState
}

export type SegmentGeometry = {
  id: string
  label: string
  length: number
  turn: number
  heading: number
  start: Point
  end: Point
}

export type Bounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export type RoomGeometry = {
  points: Point[]
  segments: SegmentGeometry[]
  endPoint: Point
  exitHeading: number
  closed: boolean
  measuredArea: number | null
  inferredArea: number | null
  bounds: Bounds
}

export type CornerGeometry = {
  segmentId: string
  point: Point
  turn: number
  incomingLabel: string
  outgoingLabel: string | null
  isExit: boolean
}

export type SuggestionSegment = Pick<OutlineSegment, 'label' | 'length' | 'turn'>

export type RoomSuggestion = {
  id: string
  kind: 'closure' | 'orthogonal' | 'rectangle' | 'gap'
  title: string
  detail: string
  roomId: string
  relatedRoomId?: string
  gapFeet?: number
  segmentsToAdd?: SuggestionSegment[]
}

export type ExportEnvelopeKind = 'structure' | 'workspace'

export type StructureExportEnvelope = {
  kind: 'structure'
  version: 2
  exportedAt: string
  payload: Structure
}

export type WorkspaceExportEnvelope = {
  kind: 'workspace'
  version: 2
  exportedAt: string
  payload: DraftState
}

export type ExportEnvelope = StructureExportEnvelope | WorkspaceExportEnvelope
