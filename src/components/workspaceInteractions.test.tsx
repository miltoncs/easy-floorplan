import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createSeedState } from '../data/seed'
import { createFurniture, createRoom, createSegment } from '../lib/blueprint'
import { renderEditor } from '../test/renderEditor'

describe('workspace interactions', () => {
  it('opens rename, inline wall edits, and corner dialogs from direct canvas clicks', async () => {
    const user = userEvent.setup()
    const draft = createSeedState()
    const livingRoom = draft.structures[0].floors[0].rooms[0]
    const firstWall = livingRoom.segments[0]

    renderEditor({ draft })

    fireEvent.click(screen.getByTestId(`room-label-${livingRoom.id}`))
    expect(screen.getByRole('dialog')).toHaveTextContent('Rename room')
    expect(screen.getByDisplayValue(livingRoom.name)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close' }))

    fireEvent.click(screen.getByTestId(`wall-label-${firstWall.id}`))
    const inlineLength = screen.getByRole('textbox', { name: 'Wall length' })
    expect(inlineLength).toHaveValue(String(firstWall.length))
    fireEvent.change(inlineLength, { target: { value: `10'6"` } })
    fireEvent.keyDown(inlineLength, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId(`wall-label-${firstWall.id}`)).toHaveTextContent(`10' 6"`))

    fireEvent.click(screen.getByTestId(`wall-menu-${firstWall.id}`))
    expect(screen.getByRole('dialog')).toHaveTextContent('Edit wall')
    expect(screen.getByDisplayValue(firstWall.label)).toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: 'Angle (deg)' })).not.toBeInTheDocument()
    const dialogLength = screen.getByRole('textbox', { name: 'Length (ft)' })
    fireEvent.change(dialogLength, { target: { value: `12'3"` } })
    fireEvent.click(screen.getByRole('button', { name: 'Save wall' }))
    await waitFor(() => expect(screen.getByTestId(`wall-label-${firstWall.id}`)).toHaveTextContent(`12' 3"`))

    fireEvent.click(screen.getByTestId(`corner-hit-${firstWall.id}`))
    const cornerDialog = screen.getByRole('dialog')
    expect(cornerDialog).toHaveTextContent('Edit corner angle')
    expect(screen.getByRole('spinbutton', { name: 'Angle (deg)' })).toHaveValue(90)
    expect(cornerDialog).toHaveTextContent(/\+?90° between walls, left turn/)
  })

  it('cancels dialog edits and room dragging when escape is pressed', async () => {
    const user = userEvent.setup()
    const draft = createSeedState()
    const room = draft.structures[0].floors[0].rooms[0]

    renderEditor({ draft })

    const svg = screen.getByLabelText('Interactive floorplan canvas')
    const stage = screen.getByTestId('canvas-stage')
    mockCanvasRect(svg)

    fireEvent.click(screen.getByTestId(`room-label-${room.id}`))
    const nameInput = screen.getByRole('textbox', { name: 'Name' })
    await user.clear(nameInput)
    await user.type(nameInput, 'Canceled rename')

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByTestId(`room-label-${room.id}`)).toHaveTextContent(room.name)

    const initialRoomLeft = getAnnotationLeft(`room-label-${room.id}`)

    fireEvent.pointerDown(screen.getByTestId(`room-label-${room.id}`), {
      button: 0,
      pointerId: 21,
      clientX: 160,
      clientY: 140,
    })
    fireEvent.pointerMove(svg, {
      pointerId: 21,
      clientX: 220,
      clientY: 176,
    })

    await waitFor(() => expect(getAnnotationLeft(`room-label-${room.id}`)).toBeGreaterThan(initialRoomLeft))
    expect(stage).toHaveClass('dragging')

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => expect(getAnnotationLeft(`room-label-${room.id}`)).toBeCloseTo(initialRoomLeft, 3))
    expect(stage).not.toHaveClass('dragging')

    fireEvent.pointerMove(svg, {
      pointerId: 21,
      clientX: 280,
      clientY: 220,
    })
    expect(getAnnotationLeft(`room-label-${room.id}`)).toBeCloseTo(initialRoomLeft, 3)

    fireEvent.pointerUp(svg, {
      pointerId: 21,
      clientX: 280,
      clientY: 220,
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('supports wheel zoom, room and furniture dragging, and wall anchors', async () => {
    const draft = createSeedState()
    const room = draft.structures[0].floors[0].rooms[0]
    const openEndWall = room.segments[room.segments.length - 1]
    const furniture = room.furniture[0]

    renderEditor({ draft })

    const svg = screen.getByLabelText('Interactive floorplan canvas')
    mockCanvasRect(svg)

    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 220,
      clientY: 180,
      deltaY: -120,
    })

    svg.dispatchEvent(wheelEvent)
    await waitFor(() => expect(screen.getByText('102%')).toBeInTheDocument())
    expect(wheelEvent.defaultPrevented).toBe(true)

    const roomLabel = screen.getByTestId(`room-label-${room.id}`)
    expect(screen.getByTestId(`room-hit-${room.id}`)).toBeInTheDocument()
    const initialViewBox = svg.getAttribute('viewBox')
    const initialRoomLeft = Number.parseFloat(roomLabel.getAttribute('style')?.match(/left:\s*([\d.]+)px/)?.[1] ?? '0')

    fireEvent.pointerDown(roomLabel, {
      button: 0,
      pointerId: 1,
      clientX: 160,
      clientY: 140,
    })
    fireEvent.pointerMove(svg, {
      pointerId: 1,
      clientX: 220,
      clientY: 176,
    })
    expect(svg.getAttribute('viewBox')).toBe(initialViewBox)
    fireEvent.pointerUp(svg, {
      pointerId: 1,
      clientX: 220,
      clientY: 176,
    })

    await waitFor(() =>
      expect(
        Number.parseFloat(screen.getByTestId(`room-label-${room.id}`).getAttribute('style')?.match(/left:\s*([\d.]+)px/)?.[1] ?? '0'),
      ).toBeGreaterThan(initialRoomLeft),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    const wallCount = document.querySelectorAll('[data-testid^="wall-hit-"]').length
    expect(screen.getByTestId(`anchor-start-${room.segments[0].id}`)).toBeInTheDocument()
    expect(screen.getByTestId(`anchor-${openEndWall.id}`)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId(`anchor-${openEndWall.id}`))
    expect(screen.getByRole('dialog')).toHaveTextContent('Edit wall')
    await waitFor(() =>
      expect(document.querySelectorAll('[data-testid^="wall-hit-"]').length).toBe(wallCount + 1),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: /^Furniture$/ }))
    expect(screen.queryByTestId(`anchor-start-${room.segments[0].id}`)).not.toBeInTheDocument()
    expect(screen.queryByTestId(`anchor-${openEndWall.id}`)).not.toBeInTheDocument()

    const furnitureRect = screen.getByTestId(`furniture-${furniture.id}`)
    const initialFurnitureX = Number(furnitureRect.getAttribute('x'))

    fireEvent.pointerDown(furnitureRect, {
      button: 0,
      pointerId: 2,
      clientX: 240,
      clientY: 220,
    })
    fireEvent.pointerMove(svg, {
      pointerId: 2,
      clientX: 280,
      clientY: 244,
    })
    fireEvent.pointerUp(svg, {
      pointerId: 2,
      clientX: 280,
      clientY: 244,
    })

    await waitFor(() =>
      expect(Number(screen.getByTestId(`furniture-${furniture.id}`).getAttribute('x'))).toBeGreaterThan(initialFurnitureX),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Stacked$/ }))
    expect(screen.queryByTestId(`anchor-start-${room.segments[0].id}`)).not.toBeInTheDocument()
    expect(screen.queryByTestId(`anchor-${openEndWall.id}`)).not.toBeInTheDocument()
  })

  it('snaps dragged furniture to nearby wall segments when enabled', async () => {
    const draft = createSeedState()
    const room = createRoom({
      name: 'Snap room',
      anchor: { x: 0, y: 0 },
      startHeading: 0,
      segments: [
        createSegment({ id: 'seg-a', length: 10, turn: -90 }),
        createSegment({ id: 'seg-b', length: 8, turn: -90 }),
        createSegment({ id: 'seg-c', length: 10, turn: -90 }),
        createSegment({ id: 'seg-d', length: 8, turn: -90 }),
      ],
      furniture: [
        createFurniture({ id: 'furn-chair', name: 'Chair', x: 0.35, y: -6, width: 2, depth: 2 }),
      ],
    })

    draft.structures[0].floors[0].rooms = [room]
    draft.selectedRoomId = room.id
    draft.selectedFurnitureId = room.furniture[0].id
    draft.editorMode = 'furniture'
    draft.furnitureSnapStrength = 0.75
    draft.furnitureCornerSnapStrength = 0

    renderEditor({ draft })

    const svg = screen.getByLabelText('Interactive floorplan canvas')
    mockCanvasRect(svg)

    const furnitureRect = screen.getByTestId(`furniture-${room.furniture[0].id}`)
    fireEvent.pointerDown(furnitureRect, {
      button: 0,
      pointerId: 12,
      clientX: 240,
      clientY: 220,
    })
    fireEvent.pointerMove(svg, {
      pointerId: 12,
      clientX: 246,
      clientY: 220,
    })
    fireEvent.pointerUp(svg, {
      pointerId: 12,
      clientX: 246,
      clientY: 220,
    })

    await waitFor(() =>
      expect(Number(screen.getByTestId(`furniture-${room.furniture[0].id}`).getAttribute('x'))).toBeCloseTo(0, 4),
    )
  })

  it('snaps dragged furniture corners onto room corners when enabled', async () => {
    const draft = createSeedState()
    const room = createRoom({
      name: 'Corner snap room',
      anchor: { x: 0, y: 0 },
      startHeading: 0,
      segments: [
        createSegment({ id: 'seg-a', length: 10, turn: -90 }),
        createSegment({ id: 'seg-b', length: 8, turn: -90 }),
        createSegment({ id: 'seg-c', length: 10, turn: -90 }),
        createSegment({ id: 'seg-d', length: 8, turn: -90 }),
      ],
      furniture: [
        createFurniture({ id: 'furn-desk', name: 'Desk', x: 0.35, y: -2.35, width: 2, depth: 2 }),
      ],
    })

    draft.structures[0].floors[0].rooms = [room]
    draft.selectedRoomId = room.id
    draft.selectedFurnitureId = room.furniture[0].id
    draft.editorMode = 'furniture'
    draft.furnitureSnapStrength = 0
    draft.furnitureCornerSnapStrength = 0.75

    renderEditor({ draft })

    const svg = screen.getByLabelText('Interactive floorplan canvas')
    mockCanvasRect(svg)

    const furnitureRect = screen.getByTestId(`furniture-${room.furniture[0].id}`)
    fireEvent.pointerDown(furnitureRect, {
      button: 0,
      pointerId: 13,
      clientX: 240,
      clientY: 220,
    })
    fireEvent.pointerMove(svg, {
      pointerId: 13,
      clientX: 246,
      clientY: 220,
    })
    fireEvent.pointerUp(svg, {
      pointerId: 13,
      clientX: 246,
      clientY: 220,
    })

    await waitFor(() => {
      const snappedFurniture = screen.getByTestId(`furniture-${room.furniture[0].id}`)
      expect(Number(snappedFurniture.getAttribute('x'))).toBeCloseTo(0, 4)
      expect(Number(snappedFurniture.getAttribute('y'))).toBeCloseTo(2, 4)
    })
  })

  it('hides wall anchors when the selected room has no open wall ends', () => {
    const draft = createSeedState()
    draft.selectedRoomId = draft.structures[0].floors[0].rooms[1].id

    renderEditor({ draft })

    expect(screen.queryAllByTestId(/anchor-/)).toHaveLength(0)
  })

  it('keeps the view centered during a single wheel zoom gesture', async () => {
    renderEditor({ draft: createSeedState() })

    const svg = screen.getByLabelText('Interactive floorplan canvas')
    mockCanvasRect(svg)

    const initialCenter = getViewBoxCenter(svg)

    svg.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 220,
      clientY: 180,
      deltaY: -120,
    }))

    await waitFor(() => expect(screen.getByText('102%')).toBeInTheDocument())

    svg.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 248,
      clientY: 196,
      deltaY: -120,
    }))

    await waitFor(() => expect(screen.getByText('104%')).toBeInTheDocument())

    const finalCenter = getViewBoxCenter(svg)
    expect(finalCenter.x).toBeCloseTo(initialCenter.x, 5)
    expect(finalCenter.y).toBeCloseTo(initialCenter.y, 5)
  })

  it('supports wheel zoom while hovering a room label', async () => {
    const draft = createSeedState()
    const room = draft.structures[0].floors[0].rooms[0]

    renderEditor({ draft })

    const svg = screen.getByLabelText('Interactive floorplan canvas')
    mockCanvasRect(svg)

    const roomLabel = screen.getByTestId(`room-label-${room.id}`)
    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 220,
      clientY: 180,
      deltaY: -120,
    })

    roomLabel.dispatchEvent(wheelEvent)

    await waitFor(() => expect(screen.getByText('102%')).toBeInTheDocument())
    expect(wheelEvent.defaultPrevented).toBe(true)
  })

  it('does not fling the view when wheel zoom starts near the canvas edges', async () => {
    renderEditor({ draft: createSeedState() })

    const svg = screen.getByLabelText('Interactive floorplan canvas')
    mockCanvasRect(svg)

    const initialCenter = getViewBoxCenter(svg)

    svg.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 4,
      clientY: 180,
      deltaY: -120,
    }))

    await waitFor(() => expect(screen.getByText('102%')).toBeInTheDocument())

    const leftZoomCenter = getViewBoxCenter(svg)
    expect(leftZoomCenter.x).toBeLessThan(initialCenter.x)
    expect(leftZoomCenter.x).toBeGreaterThan(initialCenter.x - 2)

    fireEvent.click(screen.getByRole('button', { name: 'Fit' }))
    await waitFor(() => expect(screen.getByText('100%')).toBeInTheDocument())

    svg.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 436,
      clientY: 180,
      deltaY: -120,
    }))

    await waitFor(() => expect(screen.getByText('102%')).toBeInTheDocument())

    const rightZoomCenter = getViewBoxCenter(svg)
    expect(rightZoomCenter.x).toBeGreaterThan(initialCenter.x)
    expect(rightZoomCenter.x).toBeLessThan(initialCenter.x + 2)
  })

  it('adds a wall from the start-side open joint of a lone wall', async () => {
    const draft = createSeedState()
    const room = createRoom({
      name: 'Closet',
      anchor: { x: 0, y: 0 },
      startHeading: 0,
      segments: [createSegment({ id: 'solo-wall', label: 'Solo wall', length: 8, turn: 90 })],
      furniture: [],
    })

    draft.structures[0].floors[0].rooms = [room]
    draft.selectedRoomId = room.id
    draft.selectedFurnitureId = null

    renderEditor({ draft })

    expect(screen.getByTestId('anchor-start-solo-wall')).toBeInTheDocument()
    expect(screen.getByTestId('anchor-solo-wall')).toBeInTheDocument()

    const wallCount = document.querySelectorAll('[data-testid^="wall-hit-"]').length
    fireEvent.click(screen.getByTestId('anchor-start-solo-wall'))

    expect(screen.getByRole('dialog')).toHaveTextContent('Edit wall')
    await waitFor(() =>
      expect(document.querySelectorAll('[data-testid^="wall-hit-"]').length).toBe(wallCount + 1),
    )
  })

  it('edits furniture dimensions using feet-based inputs', async () => {
    const user = userEvent.setup()
    const draft = createSeedState()
    const room = draft.structures[0].floors[0].rooms[0]
    const furniture = room.furniture[0]

    renderEditor({ draft })

    await user.click(screen.getByRole('button', { name: /^Furniture$/ }))
    fireEvent.click(screen.getByTestId(`furniture-${furniture.id}`))

    expect(screen.getByRole('dialog')).toHaveTextContent('Edit furniture')
    expect(screen.getByRole('textbox', { name: 'Width (ft)' })).toHaveValue(`7'`)
    expect(screen.getByRole('textbox', { name: 'Depth (ft)' })).toHaveValue(`3'`)

    await user.clear(screen.getByRole('textbox', { name: 'Width (ft)' }))
    await user.type(screen.getByRole('textbox', { name: 'Width (ft)' }), `2'6"`)
    await user.clear(screen.getByRole('textbox', { name: 'Depth (ft)' }))
    await user.type(screen.getByRole('textbox', { name: 'Depth (ft)' }), `1'6"`)
    await user.click(screen.getByRole('button', { name: 'Save furniture' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(Number(screen.getByTestId(`furniture-${furniture.id}`).getAttribute('width'))).toBeCloseTo(2.5)
    expect(Number(screen.getByTestId(`furniture-${furniture.id}`).getAttribute('height'))).toBeCloseTo(1.5)
  })

  it('renders room-closing suggestions beside inferred walls and applies them from the canvas', async () => {
    const draft = createSeedState()

    renderEditor({ draft })

    expect(screen.getAllByTestId(/canvas-suggestion-actions-/).length).toBeGreaterThan(0)
    expect(screen.getAllByTestId(/suggested-path-/).length).toBeGreaterThan(0)

    const wallCount = document.querySelectorAll('[data-testid^="wall-label-"]').length
    fireEvent.click(screen.getAllByTestId(/canvas-suggestion-accept-/)[0])

    await waitFor(() =>
      expect(document.querySelectorAll('[data-testid^="wall-label-"]').length).toBeGreaterThan(wallCount),
    )

    const wallMenus = screen.getAllByTestId(/wall-menu-/)
    fireEvent.click(wallMenus[wallMenus.length - 1])
    expect(screen.getByRole('dialog')).toHaveTextContent('Edit wall')
    expect(screen.queryByRole('combobox', { name: 'Measurement source' })).not.toBeInTheDocument()
  })

  it('separates clustered inferred wall actions into distinct visual lanes', () => {
    const draft = createSeedState()

    renderEditor({ draft })

    const svg = screen.getByLabelText('Interactive floorplan canvas')
    mockCanvasRect(svg)
    fireEvent(window, new Event('resize'))

    const positions = screen
      .getAllByTestId(/canvas-suggestion-actions-/)
      .map((element) => readSuggestionActionPosition(element, 440, 360))

    expect(positions.length).toBeGreaterThan(1)

    positions.forEach((position, index) => {
      positions.slice(index + 1).forEach((other) => {
        const deltaX = Math.abs(position.x - other.x)
        const deltaY = Math.abs(position.y - other.y)

        expect(deltaX >= 56 || deltaY >= 112).toBe(true)
      })
    })
  })

  it('keeps dismissed inferred wall previews hidden after draft recomputes and route changes', async () => {
    const user = userEvent.setup()
    const draft = createSeedState()

    renderEditor({ draft })

    const initialCount = screen.getAllByTestId(/canvas-suggestion-actions-/).length

    fireEvent.click(screen.getAllByTestId(/canvas-suggestion-dismiss-/)[0])

    expect(screen.getAllByTestId(/canvas-suggestion-actions-/)).toHaveLength(initialCount - 1)

    await user.click(screen.getByRole('checkbox', { name: 'Inference' }))
    await user.click(screen.getByRole('checkbox', { name: 'Inference' }))

    expect(screen.getAllByTestId(/canvas-suggestion-actions-/)).toHaveLength(initialCount - 1)

    await user.click(screen.getByRole('link', { name: 'Open detail page' }))

    expect(screen.queryAllByRole('button', { name: 'Apply' })).toHaveLength(initialCount - 1)
  })

  it('lets the drawing hint be dismissed permanently', async () => {
    const user = userEvent.setup()
    const draft = createSeedState()
    const firstRender = renderEditor({ draft })

    expect(screen.getByTestId('drawing-tip')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Dismiss drawing tip' }))

    expect(screen.queryByTestId('drawing-tip')).not.toBeInTheDocument()

    firstRender.unmount()
    renderEditor({ draft: createSeedState() })

    expect(screen.queryByTestId('drawing-tip')).not.toBeInTheDocument()
  })

  it('shows the grid legend using whole-foot sizing', () => {
    const draft = createSeedState()

    renderEditor({ draft })

    expect(screen.getByTestId('canvas-grid-scale')).toHaveTextContent("Grid 1' square")
    expect(screen.getByLabelText('Canvas legend')).toHaveTextContent("Bold line every 4'")
  })

  it('toggles canvas angle labels', async () => {
    const user = userEvent.setup()
    const draft = createSeedState()
    const firstCorner = draft.structures[0].floors[0].rooms[0].segments[0]

    renderEditor({ draft })

    expect(screen.getByTestId(`corner-hover-overlay-${firstCorner.id}`)).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Angles' }))

    expect(screen.queryByTestId(`corner-hover-overlay-${firstCorner.id}`)).not.toBeInTheDocument()

    fireEvent.mouseEnter(screen.getByTestId(`corner-hit-${firstCorner.id}`))

    expect(screen.getByTestId(`corner-hover-overlay-${firstCorner.id}`)).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Angles' }))

    expect(screen.getByTestId(`corner-hover-overlay-${firstCorner.id}`)).toBeInTheDocument()
  })

  it('shows an internal angle hover overlay at the corner junction', () => {
    const draft = createSeedState()
    const firstCorner = draft.structures[0].floors[0].rooms[0].segments[0]
    draft.showAngleLabels = false

    renderEditor({ draft })

    expect(screen.queryByTestId(`corner-hover-overlay-${firstCorner.id}`)).not.toBeInTheDocument()

    const cornerHit = screen.getByTestId(`corner-hit-${firstCorner.id}`)

    fireEvent.mouseEnter(cornerHit)

    expect(screen.getByTestId(`corner-hover-overlay-${firstCorner.id}`)).toHaveTextContent('90°')
    expect(screen.getByTestId(`corner-hover-arc-${firstCorner.id}`)).toBeInTheDocument()
    expect(cornerHit).not.toHaveClass('hovered')
  })

  it('toggles canvas wall distance labels', async () => {
    const user = userEvent.setup()
    const draft = createSeedState()
    const firstWall = draft.structures[0].floors[0].rooms[0].segments[0]

    renderEditor({ draft })

    expect(screen.getByTestId(`wall-label-${firstWall.id}`)).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Distances' }))

    expect(screen.queryByTestId(`wall-label-${firstWall.id}`)).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Distances' }))

    expect(screen.getByTestId(`wall-label-${firstWall.id}`)).toBeInTheDocument()
  })

  it('toggles canvas room and floor labels', async () => {
    const user = userEvent.setup()
    const draft = createSeedState()
    const floor = draft.structures[0].floors[0]
    const room = floor.rooms[0]

    renderEditor({ draft })

    expect(screen.getByTestId(`floor-label-${floor.id}`)).toBeInTheDocument()
    expect(screen.getByTestId(`room-label-${room.id}`)).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Room/Floor' }))

    expect(screen.queryByTestId(`floor-label-${floor.id}`)).not.toBeInTheDocument()
    expect(screen.queryByTestId(`room-label-${room.id}`)).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Room/Floor' }))

    expect(screen.getByTestId(`floor-label-${floor.id}`)).toBeInTheDocument()
    expect(screen.getByTestId(`room-label-${room.id}`)).toBeInTheDocument()
  })

  it('supports keyboard undo and redo for drawing changes', async () => {
    const user = userEvent.setup()
    const draft = createSeedState()
    const nextRoomName = `Room ${draft.structures[0].floors[0].rooms.length + 1}`

    renderEditor({ draft })

    await user.click(screen.getByRole('button', { name: 'Add room' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: nextRoomName })).toBeInTheDocument())

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(screen.queryByRole('heading', { name: nextRoomName })).not.toBeInTheDocument())

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })
    await waitFor(() => expect(screen.getByRole('heading', { name: nextRoomName })).toBeInTheDocument())
  })

  it('does not trigger undo while typing in text inputs', async () => {
    const user = userEvent.setup()
    const draft = createSeedState()
    const room = draft.structures[0].floors[0].rooms[0]
    const floor = draft.structures[0].floors[0]
    const expandedFloorLabel = new RegExp(`${floor.name}${floor.rooms.length + 1} rooms`)

    renderEditor({ draft })

    await user.click(screen.getByRole('button', { name: 'Add room' }))
    await waitFor(() => expect(screen.getByRole('button', { name: expandedFloorLabel })).toBeInTheDocument())

    fireEvent.click(screen.getByTestId(`room-label-${room.id}`))
    const input = screen.getByRole('textbox', { name: 'Name' })
    input.focus()

    fireEvent.keyDown(input, { key: 'z', ctrlKey: true })

    expect(screen.getByRole('dialog')).toHaveTextContent('Rename room')
    expect(screen.getByRole('button', { name: expandedFloorLabel })).toBeInTheDocument()
  })

  it('deletes the room when its last wall is deleted', async () => {
    const user = userEvent.setup()
    const draft = createSeedState()
    const floor = draft.structures[0].floors[0]
    const singleWallRoom = createRoom({
      name: 'Closet',
      anchor: { x: 26, y: 6 },
      segments: [createSegment({ label: 'Closet wall', length: 4, turn: 90 })],
    })

    floor.rooms.push(singleWallRoom)
    draft.selectedRoomId = singleWallRoom.id

    renderEditor({ draft, initialPath: '/detail' })

    expect(screen.getByRole('heading', { name: 'Closet' })).toBeInTheDocument()

    const wallRow = screen.getByText('Closet wall').closest('.measurement-row')
    if (!wallRow) {
      throw new Error('Expected wall measurement row')
    }

    await user.click(within(wallRow as HTMLElement).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Closet' })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: /First floor3 rooms/i })).toBeInTheDocument()
  })

  it('keeps the remaining wall lines fixed when deleting a wall from a closed room', async () => {
    const user = userEvent.setup()
    const draft = createSeedState()
    const room = createRoom({
      name: 'Square room',
      anchor: { x: 0, y: 0 },
      startHeading: 0,
      segments: [
        createSegment({ id: 'wall-a', label: 'Wall A', length: 10, turn: 90 }),
        createSegment({ id: 'wall-b', label: 'Wall B', length: 8, turn: 90 }),
        createSegment({ id: 'wall-c', label: 'Wall C', length: 10, turn: 90 }),
        createSegment({ id: 'wall-d', label: 'Wall D', length: 8, turn: 90 }),
      ],
      furniture: [],
    })

    draft.structures[0].floors[0].rooms = [room]
    draft.selectedRoomId = room.id

    renderEditor({ draft })

    const expectedLineMap = new Map(
      ['wall-b', 'wall-c', 'wall-d'].map((segmentId) => [segmentId, getWallLinePosition(segmentId)]),
    )

    fireEvent.contextMenu(screen.getByTestId('wall-hit-wall-a'), {
      clientX: 120,
      clientY: 120,
    })

    await user.click(screen.getByRole('menuitem', { name: 'Delete wall' }))

    await waitFor(() => expect(screen.queryByTestId('wall-hit-wall-a')).not.toBeInTheDocument())

    expect(new Map(
      ['wall-b', 'wall-c', 'wall-d'].map((segmentId) => [segmentId, getWallLinePosition(segmentId)]),
    )).toEqual(expectedLineMap)
  })

  it('supports shift-drag marquee selection on the canvas', async () => {
    const draft = createSeedState()

    renderEditor({ draft })

    const svg = screen.getByLabelText('Interactive floorplan canvas')
    const canvasEmpty = screen.getByTestId('canvas-empty')
    mockCanvasRect(svg)
    mockCanvasRect(canvasEmpty)

    fireEvent.pointerDown(canvasEmpty, {
      button: 0,
      pointerId: 7,
      clientX: 16,
      clientY: 16,
      shiftKey: true,
    })
    expect(screen.getByTestId('canvas-selection-box')).toBeInTheDocument()

    fireEvent.pointerMove(svg, {
      pointerId: 7,
      clientX: 960,
      clientY: 720,
    })
    fireEvent.pointerUp(svg, {
      pointerId: 7,
      clientX: 960,
      clientY: 720,
    })

    await waitFor(() => expect(screen.getByTestId('box-selection-summary')).toHaveTextContent('3 rooms'))
    expect(screen.getByTestId('box-selection-summary')).toHaveTextContent('2 walls')
  })

  it('opens context menus for structure, floor, room, wall, furniture, and empty canvas targets', async () => {
    const user = userEvent.setup()
    const draft = createSeedState()
    const structure = draft.structures[0]
    const floor = structure.floors[0]
    const room = floor.rooms[0]
    const wall = room.segments[0]
    const furniture = room.furniture[0]

    renderEditor({ draft })

    fireEvent.contextMenu(screen.getByTestId('structure-badge'))
    expect(screen.getByRole('menu')).toHaveTextContent('Rename structure')
    fireEvent.pointerDown(document.body)

    fireEvent.contextMenu(screen.getByTestId(`floor-label-${floor.id}`))
    expect(screen.getByRole('menu')).toHaveTextContent('Rename floor')
    fireEvent.pointerDown(document.body)

    fireEvent.contextMenu(screen.getByTestId(`room-label-${room.id}`))
    expect(screen.getByRole('menu')).toHaveTextContent('Rename room')
    fireEvent.pointerDown(document.body)

    fireEvent.contextMenu(screen.getByTestId(`wall-label-${wall.id}`))
    expect(screen.getByRole('menu')).toHaveTextContent('Edit wall measurements')
    fireEvent.pointerDown(document.body)

    fireEvent.contextMenu(screen.getByTestId(`corner-hit-${wall.id}`))
    const cornerMenu = screen.getByRole('menu')
    expect(cornerMenu).toHaveTextContent('Edit corner angle')
    expect(cornerMenu).toHaveTextContent('Edit wall measurements')
    await user.click(within(cornerMenu).getByRole('menuitem', { name: 'Edit wall measurements' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Edit wall')
    await user.click(screen.getByRole('button', { name: 'Close' }))

    fireEvent.contextMenu(screen.getByTestId('canvas-empty'))
    expect(screen.getByRole('menu')).toHaveTextContent('Fit view')
    fireEvent.pointerDown(document.body)

    await user.click(screen.getByRole('button', { name: 'Furniture' }))
    fireEvent.contextMenu(screen.getByTestId(`furniture-${furniture.id}`))
    expect(screen.getByRole('menu')).toHaveTextContent('Edit furniture')
  })

  it('keeps annotations near their geometry by hiding them once the described element is well offscreen', async () => {
    const draft = createSeedState()
    const room = draft.structures[0].floors[0].rooms[0]
    const firstWall = room.segments[0]

    renderEditor({ draft })

    const svg = screen.getByLabelText('Interactive floorplan canvas')
    const canvasEmpty = screen.getByTestId('canvas-empty')
    mockCanvasRect(svg)
    mockCanvasRect(canvasEmpty)

    expect(screen.getByTestId(`room-label-${room.id}`)).toBeInTheDocument()
    expect(screen.getByTestId(`wall-label-${firstWall.id}`)).toBeInTheDocument()

    fireEvent.pointerDown(canvasEmpty, {
      button: 0,
      pointerId: 11,
      clientX: 220,
      clientY: 180,
    })
    fireEvent.pointerMove(svg, {
      pointerId: 11,
      clientX: -720,
      clientY: 180,
    })
    fireEvent.pointerUp(svg, {
      pointerId: 11,
      clientX: -720,
      clientY: 180,
    })

    await waitFor(() => expect(screen.queryByTestId(`room-label-${room.id}`)).not.toBeInTheDocument())
    expect(screen.queryByTestId(`wall-label-${firstWall.id}`)).not.toBeInTheDocument()
  })

  it('blocks wall edits that would create intersecting walls', async () => {
    const user = userEvent.setup()
    const draft = createSeedState()
    const room = draft.structures[0].floors[0].rooms[0]
    room.anchor = { x: 0, y: 0 }
    room.startHeading = 0
    room.segments = [
      createSegment({ id: 'seg-a', label: 'A', length: 10, turn: 90 }),
      createSegment({ id: 'seg-b', label: 'B', length: 10, turn: 90 }),
      createSegment({ id: 'seg-c', label: 'C', length: 10, turn: 90 }),
      createSegment({ id: 'seg-d', label: 'D', length: 10, turn: 90 }),
    ]

    renderEditor({ draft })

    fireEvent.click(screen.getByTestId('corner-hit-seg-b'))
    expect(screen.getByRole('dialog')).toHaveTextContent('Edit corner angle')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Turn direction' }), 'right')
    const angleInput = screen.getByRole('spinbutton', { name: 'Angle (deg)' })
    await user.clear(angleInput)
    await user.type(angleInput, '0')
    await user.click(screen.getByRole('button', { name: 'Save angle' }))

    expect(screen.getByRole('dialog')).toHaveTextContent('Walls cannot intersect.')
    expect(screen.getByDisplayValue('0')).toBeInTheDocument()
  })
})

function mockCanvasRect(element: HTMLElement) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 440,
      bottom: 360,
      width: 440,
      height: 360,
      toJSON: () => ({}),
    }),
  })
}

function getViewBoxCenter(element: HTMLElement) {
  const viewBox = element.getAttribute('viewBox')

  if (!viewBox) {
    throw new Error('Expected viewBox attribute')
  }

  const [x, y, width, height] = viewBox.split(' ').map((value) => Number.parseFloat(value))
  return {
    x: x + width / 2,
    y: y + height / 2,
  }
}

function getAnnotationLeft(testId: string) {
  return Number.parseFloat(screen.getByTestId(testId).getAttribute('style')?.match(/left:\s*([\d.]+)px/)?.[1] ?? '0')
}

function getWallLinePosition(segmentId: string) {
  const line = screen.getByTestId(`wall-hit-${segmentId}`)

  return {
    x1: Number(line.getAttribute('x1')),
    x2: Number(line.getAttribute('x2')),
    y1: Number(line.getAttribute('y1')),
    y2: Number(line.getAttribute('y2')),
  }
}

function readSuggestionActionPosition(element: HTMLElement, width: number, height: number) {
  const style = element.getAttribute('style') ?? ''
  const left = Number.parseFloat(style.match(/left:\s*([\d.]+)%/)?.[1] ?? '0')
  const top = Number.parseFloat(style.match(/top:\s*([\d.]+)%/)?.[1] ?? '0')

  return {
    x: (left / 100) * width,
    y: (top / 100) * height,
  }
}
