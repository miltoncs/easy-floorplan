import type { DraftState } from '../types'
import {
  DEFAULT_FURNITURE_CORNER_SNAP_STRENGTH,
  DEFAULT_FURNITURE_SNAP_STRENGTH,
  DEFAULT_LABEL_FONT_SIZE,
  DEFAULT_SHOW_LABEL_SHAPES,
  DEFAULT_WALL_STROKE_WIDTH_PX,
  createFloor,
  createFurniture,
  createRoom,
  createSegment,
  createStructure,
} from '../lib/blueprint'

export function createSeedState(): DraftState {
  const firstFloor = createFloor({
    name: 'First floor',
    elevation: 0,
    rooms: [
      createRoom({
        name: 'Living room',
        color: '#3066d0',
        anchor: { x: 0, y: 0 },
        startHeading: 0,
        notes: 'Two walls measured, rectangle completion suggested.',
        segments: [
          createSegment({ label: 'Window wall', length: 18, turn: 90 }),
          createSegment({ label: 'Hall wall', length: 14, turn: 90 }),
        ],
        furniture: [
          createFurniture({ name: 'Sofa', x: 4, y: -4, width: 7, depth: 3 }),
          createFurniture({ name: 'Coffee table', x: 8.5, y: -7, width: 3, depth: 2 }),
        ],
      }),
      createRoom({
        name: 'Hall',
        color: '#879f64',
        anchor: { x: 18.46, y: 0 },
        startHeading: 90,
        notes: 'Offset from living room reveals likely wall cavity thickness.',
        segments: [
          createSegment({ label: 'Shared wall run', length: 12, turn: -90 }),
          createSegment({ label: 'Stair wall', length: 4, turn: -90 }),
          createSegment({ label: 'Exterior wall', length: 12, turn: -90 }),
          createSegment({ label: 'Entry return', length: 4, turn: -90 }),
        ],
      }),
      createRoom({
        name: 'Kitchen',
        color: '#d47746',
        anchor: { x: 0, y: -14.46 },
        startHeading: 0,
        notes: 'Completed room below living room for stacked plan context.',
        segments: [
          createSegment({ label: 'Cabinet run', length: 16, turn: -90 }),
          createSegment({ label: 'Breakfast wall', length: 11, turn: -90 }),
          createSegment({ label: 'Exterior wall', length: 16, turn: -90 }),
          createSegment({ label: 'Passage wall', length: 11, turn: -90 }),
        ],
        furniture: [createFurniture({ name: 'Island', x: 6, y: -18, width: 5, depth: 3 })],
      }),
    ],
  })

  const secondFloor = createFloor({
    name: 'Second floor',
    elevation: 10,
    rooms: [
      createRoom({
        name: 'Bedroom',
        color: '#6f5fd8',
        anchor: { x: 0, y: 0 },
        startHeading: 0,
        segments: [
          createSegment({ label: 'Dormer wall', length: 16, turn: 90 }),
          createSegment({ label: 'Closet wall', length: 12, turn: 90 }),
          createSegment({ label: 'Exterior wall', length: 16, turn: 90 }),
          createSegment({ label: 'Landing wall', length: 12, turn: 90 }),
        ],
      }),
      createRoom({
        name: 'Study nook',
        color: '#d6507f',
        anchor: { x: 16.46, y: 0 },
        startHeading: 90,
        segments: [
          createSegment({ label: 'Shared wall', length: 8, turn: -90 }),
          createSegment({ label: 'Balcony wall', length: 5, turn: -90 }),
          createSegment({ label: 'Exterior wall', length: 8, turn: -90 }),
          createSegment({ label: 'Return wall', length: 5, turn: -90 }),
        ],
      }),
    ],
  })

  const structure = createStructure({
    name: 'Cedar House',
    notes: 'Local-first sample showing incremental room capture and stacked floor alignment.',
    floors: [firstFloor, secondFloor],
  })

  return {
    structures: [structure],
    activeStructureId: structure.id,
    activeFloorId: firstFloor.id,
    selectedRoomId: firstFloor.rooms[0].id,
    selectedFurnitureId: null,
    editorMode: 'rooms',
    showGrid: true,
    showInferred: true,
    showRoomFloorLabels: true,
    showWallLabels: true,
    showAngleLabels: true,
    wallStrokeWidthPx: DEFAULT_WALL_STROKE_WIDTH_PX,
    labelFontSize: DEFAULT_LABEL_FONT_SIZE,
    showLabelShapes: DEFAULT_SHOW_LABEL_SHAPES,
    furnitureSnapStrength: DEFAULT_FURNITURE_SNAP_STRENGTH,
    furnitureCornerSnapStrength: DEFAULT_FURNITURE_CORNER_SNAP_STRENGTH,
  }
}
