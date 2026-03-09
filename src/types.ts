export type EditorMode = 'rooms' | 'furniture' | 'stacked'

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
