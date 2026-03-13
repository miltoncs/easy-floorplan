import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createSeedState } from '../data/seed'
import { createFloor, createFurniture, createRoom, createSegment } from '../lib/blueprint'
import { MAX_CAMERA_ZOOM } from '../lib/camera'
import { formatFeet } from '../lib/geometry'
import { renderEditor } from '../test/renderEditor'

describe('workspace interactions', () => {
  it('keeps room naming inline on labels while direct canvas clicks edit walls and corners', async () => {
    const draft = createSeedState()
    const livingRoom = draft.structures[0].floors[0].rooms[0]
    const kitchen = draft.structures[0].floors[0].rooms[2]
    const firstWall = livingRoom.segments[0]

    renderEditor({ draft })

    fireEvent.click(screen.getByTestId(`room-fill-${kitchen.id}`))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: kitchen.name })).toBeInTheDocument()

    fireEvent.click(screen.getByTestId(`room-label-${livingRoom.id}`))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Room name' })).toHaveValue(livingRoom.name)

    fireEvent.click(screen.getByTestId(`wall-label-${firstWall.id}`))
    const inlineLength = screen.getByRole('textbox', { name: 'Wall length' })
    expect(inlineLength).toHaveValue(String(firstWall.length))
    fireEvent.change(inlineLength, { target: { value: `10'6"` } })
    fireEvent.keyDown(inlineLength, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId(`wall-label-${firstWall.id}`)).toHaveTextContent(`10' 6"`))

    fireEvent.click(screen.getByTestId(`wall-hit-${firstWall.id}`))
    expect(screen.getByTestId(`wall-hit-${firstWall.id}`)).toHaveClass('selected')
    expect(screen.getByTestId(`room-segment-${firstWall.id}`)).toHaveClass('selected')
    expect(screen.getByRole('dialog')).toHaveTextContent('Edit wall')
    expect(screen.getByDisplayValue(firstWall.label)).toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: 'Angle (deg)' })).not.toBeInTheDocument()
    const dialogLength = screen.getByRole('textbox', { name: 'Length (ft)' })
    fireEvent.change(dialogLength, { target: { value: `12'3"` } })
    fireEvent.click(screen.getByRole('button', { name: 'Save wall' }))
    await waitFor(() => expect(screen.getByTestId(`wall-label-${firstWall.id}`)).toHaveTextContent(`12' 3"`))

    fireEvent.click(screen.getByTestId(`corner-label-${firstWall.id}`))
    const inlineAngle = screen.getByRole('textbox', { name: 'Corner angle' }) as HTMLInputElement
    expect(inlineAngle).toHaveValue('90')
    fireEvent.change(inlineAngle, { target: { value: '1' } })
    expect(inlineAngle).toHaveValue('1')
    expect(inlineAngle.selectionStart).toBe(1)
    expect(inlineAngle.selectionEnd).toBe(1)
    fireEvent.change(inlineAngle, { target: { value: '120' } })
    expect(inlineAngle).toHaveValue('120')
    fireEvent.keyDown(inlineAngle, { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId(`corner-label-${firstWall.id}`)).toHaveTextContent('120°'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId(`corner-hit-${firstWall.id}`))
    const cornerDialog = screen.getByRole('dialog')
    expect(cornerDialog).toHaveTextContent('Edit corner angle')
    expect(screen.getByRole('spinbutton', { name: 'Angle (deg)' })).toHaveValue(120)
    expect(cornerDialog).toHaveTextContent(/\+?120° between walls, left turn/)
  })

  it('rotates rooms from the room context menu, including the custom rotation dialog', async () => {
    const user = userEvent.setup()
    const draft = createSeedState()
    const kitchen = draft.structures[0].floors[0].rooms[2]
    const kitchenFurniture = kitchen.furniture[0]

    renderEditor({ draft })

    fireEvent.contextMenu(screen.getByTestId(`room-fill-${kitchen.id}`))
    await user.click(screen.getByRole('menuitem', { name: 'Rotate' }))
    await waitFor(() => expect(screen.getByRole('menuitem', { name: '90° ↻' })).toBeInTheDocument())
    await user.click(screen.getByRole('menuitem', { name: '90° ↻' }))

    await waitFor(() => {
      const rotatedKitchen = readSavedDraft().structures[0].floors[0].rooms.find((room: { id: string }) => room.id === kitchen.id)
      expect(rotatedKitchen?.startHeading).toBe(270)
      expect(rotatedKitchen?.anchor.x).not.toBe(kitchen.anchor.x)
      expect(rotatedKitchen?.anchor.y).not.toBe(kitchen.anchor.y)
      expect(rotatedKitchen?.furniture[0]).toEqual(
        expect.objectContaining({
          id: kitchenFurniture.id,
          rotation: 270,
        }),
      )
      expect(rotatedKitchen?.furniture[0].x).not.toBe(kitchenFurniture.x)
      expect(rotatedKitchen?.furniture[0].y).not.toBe(kitchenFurniture.y)
    })

    fireEvent.contextMenu(screen.getByTestId(`room-label-${kitchen.id}`))
    await user.click(screen.getByRole('menuitem', { name: 'Rotate' }))
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Custom' })).toBeInTheDocument())
    await user.click(screen.getByRole('menuitem', { name: 'Custom' }))

    expect(screen.getByRole('dialog')).toHaveTextContent('Rotate room')
    const degreesInput = screen.getByRole('spinbutton', { name: 'Degrees' })
    await user.clear(degreesInput)
    await user.type(degreesInput, '45')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Spin direction' }), 'counterclockwise')
    await user.click(screen.getByRole('button', { name: 'Apply' }))

    await waitFor(() => {
      const rotatedKitchen = readSavedDraft().structures[0].floors[0].rooms.find((room: { id: string }) => room.id === kitchen.id)
      expect(rotatedKitchen?.startHeading).toBe(315)
      expect(rotatedKitchen?.furniture[0]).toEqual(
        expect.objectContaining({
          id: kitchenFurniture.id,
          rotation: 315,
        }),
      )
      expect(rotatedKitchen?.anchor.x).not.toBe(kitchen.anchor.x)
      expect(rotatedKitchen?.anchor.y).not.toBe(kitchen.anchor.y)
      expect(rotatedKitchen?.furniture[0].x).not.toBe(kitchenFurniture.x)
      expect(rotatedKitchen?.furniture[0].y).not.toBe(kitchenFurniture.y)
    })
  })

  it('accepts reflex corner angles in the corner dialog', async () => {
    const user = userEvent.setup()
    const draft = createSeedState()
    const room = draft.structures[0].floors[0].rooms[0]
    const segment = room.segments[0]

    renderEditor({ draft })

    fireEvent.click(screen.getByTestId(`corner-hit-${segment.id}`))
    expect(screen.getByRole('dialog')).toHaveTextContent('Edit corner angle')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Turn direction' }), 'right')
    const angleInput = screen.getByRole('spinbutton', { name: 'Angle (deg)' })
    await user.clear(angleInput)
    await user.type(angleInput, '270')
    expect(screen.getByRole('dialog')).toHaveTextContent('270° right is equivalent to 90° left.')

    await user.click(screen.getByRole('button', { name: 'Save angle' }))

    await waitFor(() => {
      const savedSegment = readSavedDraft().structures[0].floors[0].rooms[0].segments.find(
        (item: { id: string }) => item.id === segment.id,
      )
      expect(savedSegment?.turn).toBe(90)
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('rejects corner angles above 360 degrees in the corner dialog', async () => {
    const user = userEvent.setup()
    const draft = createSeedState()
    const room = draft.structures[0].floors[0].rooms[0]
    const segment = room.segments[0]

    renderEditor({ draft })

    fireEvent.click(screen.getByTestId(`corner-hit-${segment.id}`))
    expect(screen.getByRole('dialog')).toHaveTextContent('Edit corner angle')

    const angleInput = screen.getByRole('spinbutton', { name: 'Angle (deg)' })
    await user.clear(angleInput)
    await user.type(angleInput, '361')
    await user.click(screen.getByRole('button', { name: 'Save angle' }))

    expect(screen.getByRole('dialog')).toHaveTextContent('Enter an angle from 0 to 360 degrees.')
    expect(readSavedDraft().structures[0].floors[0].rooms[0].segments[0].turn).toBe(90)
  })

  it('accepts reflex corner angles in inline canvas edits', async () => {
    const draft = createSeedState()
    const room = draft.structures[0].floors[0].rooms[0]
    const segment = room.segments[0]
    segment.turn = -90

    renderEditor({ draft })

    fireEvent.click(screen.getByTestId(`corner-label-${segment.id}`))
    const inlineAngle = screen.getByRole('textbox', { name: 'Corner angle' })
    fireEvent.change(inlineAngle, { target: { value: '270' } })
    fireEvent.keyDown(inlineAngle, { key: 'Enter' })

    await waitFor(() => {
      const savedSegment = readSavedDraft().structures[0].floors[0].rooms[0].segments.find(
        (item: { id: string }) => item.id === segment.id,
      )
      expect(savedSegment?.turn).toBe(90)
    })
    expect(screen.getByTestId(`corner-label-${segment.id}`)).toHaveTextContent('90°')
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
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const nameInput = screen.getByRole('textbox', { name: 'Room name' })
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
    fireEvent.pointerMove(window, {
      pointerId: 21,
      clientX: 220,
      clientY: 176,
    })

    await waitFor(() => expect(stage).toHaveClass('canvas-stage--simplified-drag'))
    expect(screen.queryByTestId(`room-label-${room.id}`)).not.toBeInTheDocument()
    expect(getGroupTranslate(`room-layer-${room.id}`).x).toBeGreaterThan(0)
    expect(stage).toHaveClass('dragging')

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => expect(screen.getByTestId(`room-label-${room.id}`)).toBeInTheDocument())
    expect(getAnnotationLeft(`room-label-${room.id}`)).toBeCloseTo(initialRoomLeft, 3)
    expect(stage).not.toHaveClass('dragging')

    fireEvent.pointerMove(window, {
      pointerId: 21,
      clientX: 280,
      clientY: 220,
    })
    expect(getAnnotationLeft(`room-label-${room.id}`)).toBeCloseTo(initialRoomLeft, 3)

    fireEvent.pointerUp(window, {
      pointerId: 21,
      clientX: 280,
      clientY: 220,
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('deselects the current room on escape but keeps canvas labels visible on empty-canvas clicks', async () => {
    const draft = createSeedState()
    const room = draft.structures[0].floors[0].rooms[0]

    renderEditor({ draft })

    expect(screen.getByRole('heading', { name: room.name })).toBeInTheDocument()
    expect(screen.getByTestId(`room-layer-${room.id}`)).toHaveClass('active')

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => expect(screen.getByRole('heading', { name: 'No room selected' })).toBeInTheDocument())
    expect(screen.getByTestId(`room-layer-${room.id}`)).not.toHaveClass('active')

    fireEvent.click(screen.getByTestId(`room-hit-${room.id}`))

    await waitFor(() => expect(screen.getByRole('heading', { name: room.name })).toBeInTheDocument())
    expect(screen.getByTestId(`room-layer-${room.id}`)).toHaveClass('active')
    expect(screen.getByTestId(`wall-label-${room.segments[0].id}`)).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('canvas-empty'))

    await waitFor(() => expect(screen.getByRole('heading', { name: room.name })).toBeInTheDocument())
    expect(screen.getByTestId(`room-layer-${room.id}`)).toHaveClass('active')
    expect(screen.getByTestId(`wall-label-${room.segments[0].id}`)).toBeInTheDocument()
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
    fireEvent.pointerMove(window, {
      pointerId: 1,
      clientX: 220,
      clientY: 176,
    })
    expect(svg.getAttribute('viewBox')).toBe(initialViewBox)
    await waitFor(() => expect(screen.getByTestId('canvas-stage')).toHaveClass('canvas-stage--simplified-drag'))
    expect(screen.queryByTestId(`room-label-${room.id}`)).not.toBeInTheDocument()
    fireEvent.pointerUp(window, {
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
    expect(screen.getByRole('dialog')).toHaveTextContent('Edit corner angle')
    expect(document.querySelectorAll('[data-testid^="wall-hit-"]').length).toBe(wallCount)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Edit wall')
    expect(document.querySelectorAll('[data-testid^="wall-hit-"]').length).toBe(wallCount)
    fireEvent.click(screen.getByRole('button', { name: 'Save wall' }))
    await waitFor(() =>
      expect(document.querySelectorAll('[data-testid^="wall-hit-"]').length).toBe(wallCount + 1),
    )

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

  it('keeps the current viewBox when walls are added or deleted', async () => {
    const user = userEvent.setup()
    const draft = createSeedState()
    const room = draft.structures[0].floors[0].rooms[0]

    renderEditor({ draft })

    const svg = screen.getByLabelText('Interactive floorplan canvas')
    mockCanvasRect(svg)

    svg.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 220,
      clientY: 180,
      deltaY: -120,
    }))

    await waitFor(() => expect(screen.getByText('102%')).toBeInTheDocument())

    const initialWallCount = document.querySelectorAll('[data-testid^="wall-hit-"]').length
    const viewBoxBeforeAdd = getViewBoxRect(svg)

    await user.click(screen.getByRole('button', { name: 'Add wall' }))
    await waitFor(() =>
      expect(document.querySelectorAll('[data-testid^="wall-hit-"]').length).toBe(initialWallCount + 1),
    )
    expect(getViewBoxRect(svg)).toEqual(viewBoxBeforeAdd)

    const viewBoxBeforeDelete = getViewBoxRect(svg)
    fireEvent.contextMenu(screen.getByTestId(`wall-label-${room.segments[0].id}`))
    const menu = screen.getByRole('menu')
    expect(menu).toHaveTextContent('Delete wall')
    await user.click(within(menu).getByRole('menuitem', { name: 'Delete wall' }))

    await waitFor(() =>
      expect(document.querySelectorAll('[data-testid^="wall-hit-"]').length).toBe(initialWallCount),
    )
    expect(getViewBoxRect(svg)).toEqual(viewBoxBeforeDelete)
  })

  it('keeps wheel zoom centered after moving a room', async () => {
    const draft = createSeedState()
    const room = draft.structures[0].floors[0].rooms[0]

    renderEditor({ draft })

    const svg = screen.getByLabelText('Interactive floorplan canvas')
    mockCanvasRect(svg)

    const roomLabel = screen.getByTestId(`room-label-${room.id}`)
    const initialRoomLeft = getAnnotationLeft(`room-label-${room.id}`)

    fireEvent.pointerDown(roomLabel, {
      button: 0,
      pointerId: 18,
      clientX: 160,
      clientY: 140,
    })
    fireEvent.pointerMove(window, {
      pointerId: 18,
      clientX: 188,
      clientY: 140,
    })
    fireEvent.pointerUp(window, {
      pointerId: 18,
      clientX: 188,
      clientY: 140,
    })

    await waitFor(() => expect(getAnnotationLeft(`room-label-${room.id}`)).toBeGreaterThan(initialRoomLeft))

    const centerBeforeWheel = getViewBoxCenter(svg)
    svg.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 220,
      clientY: 180,
      deltaY: -120,
    }))

    await waitFor(() => expect(screen.getByText('102%')).toBeInTheDocument())

    const centerAfterWheel = getViewBoxCenter(svg)
    expect(centerAfterWheel.x).toBeCloseTo(centerBeforeWheel.x, 5)
    expect(centerAfterWheel.y).toBeCloseTo(centerBeforeWheel.y, 5)
  })

  it('keeps wall clicks editable while allowing wall drags to move the connected room outline', async () => {
    const user = userEvent.setup()
    const draft = createSeedState()
    const room = draft.structures[0].floors[0].rooms[0]
    const wall = room.segments[0]

    renderEditor({ draft })

    const svg = screen.getByLabelText('Interactive floorplan canvas')
    const stage = screen.getByTestId('canvas-stage')
    mockCanvasRect(svg)

    fireEvent.click(screen.getByTestId(`wall-hit-${wall.id}`))
    expect(screen.getByRole('dialog')).toHaveTextContent('Edit wall')
    await user.click(screen.getByRole('button', { name: 'Close' }))

    const initialRoomLeft = getAnnotationLeft(`room-label-${room.id}`)

    fireEvent.pointerDown(screen.getByTestId(`wall-hit-${wall.id}`), {
      button: 0,
      pointerId: 32,
      clientX: 144,
      clientY: 128,
    })
    fireEvent.pointerMove(window, {
      pointerId: 32,
      clientX: 204,
      clientY: 164,
    })

    await waitFor(() => expect(stage).toHaveClass('canvas-stage--simplified-drag'))
    expect(screen.queryByTestId(`room-label-${room.id}`)).not.toBeInTheDocument()
    expect(getGroupTranslate(`room-layer-${room.id}`).x).toBeGreaterThan(0)

    fireEvent.pointerUp(window, {
      pointerId: 32,
      clientX: 204,
      clientY: 164,
    })

    await waitFor(() => expect(getAnnotationLeft(`room-label-${room.id}`)).toBeGreaterThan(initialRoomLeft))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
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
    expect(furnitureRect).toHaveClass('selected')
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

  it('rotates the canvas view clockwise and back in quarter turns', async () => {
    const user = userEvent.setup()
    const draft = createSeedState()
    const room = draft.structures[0].floors[0].rooms[0]

    renderEditor({ draft })

    const svg = screen.getByLabelText('Interactive floorplan canvas')
    mockCanvasRect(svg)
    fireEvent(window, new Event('resize'))

    const roomLabel = screen.getByTestId(`room-label-${room.id}`)
    const initialPosition = readAbsolutePosition(roomLabel)

    await user.click(screen.getByRole('button', { name: 'Rotate view clockwise' }))

    await waitFor(() => {
      const rotatedPosition = readAbsolutePosition(screen.getByTestId(`room-label-${room.id}`))
      expect(rotatedPosition.left).not.toBeCloseTo(initialPosition.left, 1)
      expect(rotatedPosition.top).not.toBeCloseTo(initialPosition.top, 1)
    })

    await user.click(screen.getByRole('button', { name: 'Rotate view counterclockwise' }))

    await waitFor(() => {
      const resetPosition = readAbsolutePosition(screen.getByTestId(`room-label-${room.id}`))
      expect(resetPosition.left).toBeCloseTo(initialPosition.left, 1)
      expect(resetPosition.top).toBeCloseTo(initialPosition.top, 1)
    })
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

  it('clamps wheel zoom anchors to the canvas bounds during wall drags', async () => {
    const draft = createSeedState()
    const room = draft.structures[0].floors[0].rooms[0]
    const wall = room.segments[0]

    renderEditor({ draft })

    const svg = screen.getByLabelText('Interactive floorplan canvas')
    mockCanvasRect(svg)
    const initialCenter = getViewBoxCenter(svg)

    fireEvent.pointerDown(screen.getByTestId(`wall-hit-${wall.id}`), {
      button: 0,
      pointerId: 44,
      clientX: 144,
      clientY: 128,
    })

    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 220,
      clientY: 4000,
      deltaY: -120,
    })

    svg.dispatchEvent(wheelEvent)

    await waitFor(() => expect(screen.getByText('102%')).toBeInTheDocument())

    const finalCenter = getViewBoxCenter(svg)
    expect(wheelEvent.defaultPrevented).toBe(true)
    expect(Math.abs(finalCenter.y - initialCenter.y)).toBeLessThan(2)

    fireEvent.pointerUp(window, {
      pointerId: 44,
      clientX: 144,
      clientY: 128,
    })
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

    expect(screen.getByRole('dialog')).toHaveTextContent('Edit corner angle')
    expect(screen.getByRole('spinbutton', { name: 'Angle (deg)' })).toHaveValue(180)
    expect(document.querySelectorAll('[data-testid^="wall-hit-"]').length).toBe(wallCount)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Edit wall')
    expect(document.querySelectorAll('[data-testid^="wall-hit-"]').length).toBe(wallCount)
    fireEvent.click(screen.getByRole('button', { name: 'Save wall' }))
    await waitFor(() =>
      expect(document.querySelectorAll('[data-testid^="wall-hit-"]').length).toBe(wallCount + 1),
    )
  })

  it('does not show angle targets for open wall ends', () => {
    const draft = createSeedState()
    const room = createRoom({
      id: 'open-room',
      name: 'Open room',
      anchor: { x: 0, y: 0 },
      startHeading: 0,
      segments: [
        createSegment({ id: 'seg-a', label: 'A', length: 10, turn: 90 }),
        createSegment({ id: 'seg-b', label: 'B', length: 8, turn: 90 }),
      ],
      furniture: [],
    })

    draft.structures[0].floors[0].rooms = [room]
    draft.selectedRoomId = room.id
    draft.selectedFurnitureId = null

    renderEditor({ draft })

    expect(screen.getByTestId('corner-hit-seg-a')).toBeInTheDocument()
    expect(screen.queryByTestId('corner-hit-seg-b')).not.toBeInTheDocument()
    expect(screen.getByTestId('corner-hover-overlay-seg-a')).toBeInTheDocument()
    expect(screen.queryByTestId('corner-hover-overlay-seg-b')).not.toBeInTheDocument()
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

  it('renders room-closing suggestions on inferred walls and applies them from the canvas', async () => {
    const draft = createSeedState()

    renderEditor({ draft })
    const svg = screen.getByLabelText('Interactive floorplan canvas')
    mockCanvasRect(svg)
    fireEvent(window, new Event('resize'))

    const suggestionActions = screen.getAllByTestId(/canvas-suggestion-actions-/)
    const suggestedPaths = screen.getAllByTestId(/suggested-path-/)

    expect(suggestionActions.length).toBeGreaterThan(0)
    expect(suggestedPaths.length).toBeGreaterThan(0)
    expect(suggestedPaths[0]).toHaveAttribute('style', expect.stringContaining('stroke-dasharray: 10 7'))
    expect(suggestedPaths[0]).toHaveAttribute('style', expect.stringContaining('stroke-linecap: butt'))

    expect(within(suggestionActions[0]).getByRole('button', { name: 'Accept inferred wall' })).toBeInTheDocument()
    expect(within(suggestionActions[0]).getByRole('button', { name: 'Dismiss inferred wall' })).toBeInTheDocument()

    const actionPosition = readSuggestionActionPosition(suggestionActions[0], 440, 360)
    const pathPoints = readSuggestedPathPoints(suggestedPaths[0], svg, 440, 360)

    expect(getMinimumSegmentDistance(actionPosition, pathPoints)).toBeLessThanOrEqual(4)

    const wallCount = document.querySelectorAll('[data-testid^="wall-label-"]').length
    fireEvent.click(screen.getAllByTestId(/canvas-suggestion-accept-/)[0])

    await waitFor(() =>
      expect(document.querySelectorAll('[data-testid^="wall-label-"]').length).toBeGreaterThan(wallCount),
    )

    const wallHits = screen.getAllByTestId(/wall-hit-/)
    fireEvent.click(wallHits[wallHits.length - 1])
    expect(screen.getByRole('dialog')).toHaveTextContent('Edit wall')
    expect(screen.queryByRole('combobox', { name: 'Measurement source' })).not.toBeInTheDocument()
  })

  it('keeps clustered inferred wall action boxes from collapsing onto the same point', () => {
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
        expect(Math.hypot(position.x - other.x, position.y - other.y)).toBeGreaterThanOrEqual(29)
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

  it('shrinks corner hover hitboxes as the canvas zooms in', async () => {
    const draft = createSeedState()
    const tinyWallLength = 5 / 12
    const tinyRoom = createRoom({
      id: 'tiny-room',
      name: 'Tiny room',
      anchor: { x: 0, y: 0 },
      startHeading: 0,
      segments: [
        createSegment({ id: 'tiny-a', label: 'A', length: tinyWallLength, turn: 90 }),
        createSegment({ id: 'tiny-b', label: 'B', length: tinyWallLength, turn: 90 }),
        createSegment({ id: 'tiny-c', label: 'C', length: tinyWallLength, turn: 90 }),
        createSegment({ id: 'tiny-d', label: 'D', length: tinyWallLength, turn: 90 }),
      ],
      furniture: [],
    })

    draft.structures[0].floors[0].rooms = [tinyRoom]
    draft.selectedRoomId = tinyRoom.id
    draft.selectedFurnitureId = null

    renderEditor({ draft })

    const svg = screen.getByLabelText('Interactive floorplan canvas')
    mockCanvasRect(svg)

    const firstCornerHit = screen.getByTestId('corner-hit-tiny-a')
    const initialRadius = getCircleScreenRadius(firstCornerHit, svg)

    zoomCanvasToMax(svg)

    await waitFor(() => expect(screen.getByText(formatZoomPercent(MAX_CAMERA_ZOOM))).toBeInTheDocument())

    const zoomedFirstCornerHit = screen.getByTestId('corner-hit-tiny-a')
    const zoomedSecondCornerHit = screen.getByTestId('corner-hit-tiny-b')
    const firstCornerCenter = getCircleScreenCenter(zoomedFirstCornerHit, svg)
    const secondCornerCenter = getCircleScreenCenter(zoomedSecondCornerHit, svg)
    const zoomedRadius = getCircleScreenRadius(zoomedFirstCornerHit, svg)

    expect(zoomedRadius).toBeLessThan(initialRadius)
    expect(Math.hypot(firstCornerCenter.x - secondCornerCenter.x, firstCornerCenter.y - secondCornerCenter.y)).toBeGreaterThan(
      zoomedRadius * 2,
    )
  })

  it('toggles canvas wall length labels and shows a hovered wall length when hidden', async () => {
    const user = userEvent.setup()
    const draft = createSeedState()
    const firstWall = draft.structures[0].floors[0].rooms[0].segments[0]

    renderEditor({ draft })

    expect(screen.getByTestId(`wall-label-${firstWall.id}`)).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Wall Lengths' }))

    expect(screen.queryByTestId(`wall-label-${firstWall.id}`)).not.toBeInTheDocument()

    fireEvent.mouseEnter(screen.getByTestId(`wall-hit-${firstWall.id}`))
    await waitFor(() => expect(screen.getByTestId(`wall-label-${firstWall.id}`)).toBeInTheDocument())

    fireEvent.mouseLeave(screen.getByTestId(`wall-hit-${firstWall.id}`))
    await waitFor(() => expect(screen.queryByTestId(`wall-label-${firstWall.id}`)).not.toBeInTheDocument())

    await user.click(screen.getByRole('checkbox', { name: 'Wall Lengths' }))

    expect(screen.getByTestId(`wall-label-${firstWall.id}`)).toBeInTheDocument()
  })

  it('keeps each wall length label closer to its own wall than a nearby parallel wall', () => {
    const draft = createSeedState()
    const room = createRoom({
      id: 'shallow-room',
      name: 'Shallow room',
      anchor: { x: 18, y: 0 },
      startHeading: 180,
      segments: [
        createSegment({ id: 'shallow-bottom', label: 'Bottom', length: 18, turn: -90 }),
        createSegment({ id: 'shallow-left', label: 'Left', length: 1, turn: -90 }),
        createSegment({ id: 'shallow-top', label: 'Top', length: 18, turn: -90 }),
        createSegment({ id: 'shallow-right', label: 'Right', length: 1, turn: -90 }),
      ],
      furniture: [],
    })

    draft.structures[0].floors[0].rooms = [room]
    draft.selectedRoomId = room.id
    draft.selectedFurnitureId = null

    renderEditor({ draft })

    const svg = screen.getByLabelText('Interactive floorplan canvas')
    const topLabel = getWallLabelScreenCenter('shallow-top')
    const bottomLabel = getWallLabelScreenCenter('shallow-bottom')
    const topWall = getWallLineScreenPosition('shallow-top', svg)
    const bottomWall = getWallLineScreenPosition('shallow-bottom', svg)

    expect(
      getPointToSegmentDistance(topLabel, { x: topWall.x1, y: topWall.y1 }, { x: topWall.x2, y: topWall.y2 }),
    ).toBeLessThan(
      getPointToSegmentDistance(topLabel, { x: bottomWall.x1, y: bottomWall.y1 }, { x: bottomWall.x2, y: bottomWall.y2 }),
    )
    expect(
      getPointToSegmentDistance(bottomLabel, { x: bottomWall.x1, y: bottomWall.y1 }, { x: bottomWall.x2, y: bottomWall.y2 }),
    ).toBeLessThan(
      getPointToSegmentDistance(bottomLabel, { x: topWall.x1, y: topWall.y1 }, { x: topWall.x2, y: topWall.y2 }),
    )
  })

  it('shrinks wall hover hit widths as the canvas zooms in', async () => {
    const draft = createSeedState()
    const firstWall = draft.structures[0].floors[0].rooms[0].segments[0]

    renderEditor({ draft })

    const svg = screen.getByLabelText('Interactive floorplan canvas')
    mockCanvasRect(svg)

    const initialStrokeWidth = Number(screen.getByTestId(`wall-hit-${firstWall.id}`).getAttribute('stroke-width'))

    zoomCanvasToMax(svg)

    await waitFor(() => expect(screen.getByText(formatZoomPercent(MAX_CAMERA_ZOOM))).toBeInTheDocument())

    expect(Number(screen.getByTestId(`wall-hit-${firstWall.id}`).getAttribute('stroke-width'))).toBeLessThan(initialStrokeWidth)
  })

  it('toggles canvas room and floor labels', async () => {
    const user = userEvent.setup()
    const draft = createSeedState()
    const floor = draft.structures[0].floors[0]
    const room = floor.rooms[0]

    renderEditor({ draft })

    expect(screen.getByTestId(`floor-label-${floor.id}`)).toBeInTheDocument()
    expect(screen.getByTestId(`room-label-${room.id}`)).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Labels' }))

    expect(screen.queryByTestId(`floor-label-${floor.id}`)).not.toBeInTheDocument()
    expect(screen.queryByTestId(`room-label-${room.id}`)).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Labels' }))

    expect(screen.getByTestId(`floor-label-${floor.id}`)).toBeInTheDocument()
    expect(screen.getByTestId(`room-label-${room.id}`)).toBeInTheDocument()
  })

  it('supports keyboard undo and redo for drawing changes', async () => {
    const user = userEvent.setup()
    const draft = createSeedState()
    const floor = draft.structures[0].floors[0]
    const nextRoomName = `Room ${floor.rooms.length + 1}`

    renderEditor({ draft })

    fireEvent.contextMenu(screen.getByTestId(`floor-label-${floor.id}`))
    await user.click(screen.getByRole('menuitem', { name: 'Add room' }))
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

    fireEvent.contextMenu(screen.getByTestId(`floor-label-${floor.id}`))
    await user.click(screen.getByRole('menuitem', { name: 'Add room' }))
    await waitFor(() => expect(screen.getByRole('button', { name: expandedFloorLabel })).toBeInTheDocument())

    fireEvent.click(screen.getByTestId(`room-label-${room.id}`))
    const input = screen.getByRole('textbox', { name: 'Room name' })
    input.focus()

    fireEvent.keyDown(input, { key: 'z', ctrlKey: true })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: expandedFloorLabel })).toBeInTheDocument()
  })

  it('removes the last wall without deleting the room', async () => {
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

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Closet' })).toBeInTheDocument())
    expect(screen.queryByText('Closet wall')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /First floor4 rooms/i })).toBeInTheDocument()
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

  it('keeps an open wall chain connected when deleting the first wall', async () => {
    const user = userEvent.setup()
    const draft = createSeedState()
    const room = createRoom({
      name: 'Open chain',
      anchor: { x: 0, y: 0 },
      startHeading: 0,
      segments: [
        createSegment({ id: 'wall-a', label: 'Wall A', length: 10, turn: 90 }),
        createSegment({ id: 'wall-b', label: 'Wall B', length: 8, turn: -90 }),
        createSegment({ id: 'wall-c', label: 'Wall C', length: 6, turn: 90 }),
        createSegment({ id: 'wall-d', label: 'Wall D', length: 4, turn: 0 }),
      ],
      furniture: [],
    })

    draft.structures[0].floors[0].rooms = [room]
    draft.selectedRoomId = room.id

    renderEditor({ draft })

    fireEvent.contextMenu(screen.getByTestId('wall-hit-wall-a'), {
      clientX: 120,
      clientY: 120,
    })

    await user.click(screen.getByRole('menuitem', { name: 'Delete wall' }))

    await waitFor(() => expect(screen.queryByTestId('wall-hit-wall-a')).not.toBeInTheDocument())

    const wallB = getWallLinePosition('wall-b')
    const wallC = getWallLinePosition('wall-c')
    const wallD = getWallLinePosition('wall-d')

    expect({ x: wallB.x2, y: wallB.y2 }).toEqual({ x: wallC.x1, y: wallC.y1 })
    expect({ x: wallC.x2, y: wallC.y2 }).toEqual({ x: wallD.x1, y: wallD.y1 })
  })

  it('moves detached wall runs by the same amount as the main room anchor', async () => {
    const draft = createSeedState()
    const room = createRoom({
      name: 'Detached runs',
      anchor: { x: 0, y: 0 },
      startHeading: 0,
      segments: [
        createSegment({ id: 'wall-a', label: 'Wall A', length: 8, turn: 0 }),
        createSegment({
          id: 'wall-b',
          label: 'Wall B',
          length: 5,
          turn: 0,
          startPoint: { x: 14, y: 6 },
          startHeading: 90,
        }),
      ],
      furniture: [],
    })

    draft.structures[0].floors[0].rooms = [room]
    draft.selectedRoomId = room.id

    renderEditor({ draft })

    const svg = screen.getByLabelText('Interactive floorplan canvas')
    mockCanvasRect(svg)

    const beforeA = getWallLinePosition('wall-a')
    const beforeB = getWallLinePosition('wall-b')

    fireEvent.pointerDown(screen.getByTestId(`room-label-${room.id}`), {
      button: 0,
      pointerId: 52,
      clientX: 160,
      clientY: 140,
    })
    fireEvent.pointerMove(window, {
      pointerId: 52,
      clientX: 220,
      clientY: 176,
    })
    fireEvent.pointerUp(window, {
      pointerId: 52,
      clientX: 220,
      clientY: 176,
    })

    await waitFor(() => {
      const afterA = getWallLinePosition('wall-a')
      expect(afterA.x1).not.toBe(beforeA.x1)
    })

    const afterA = getWallLinePosition('wall-a')
    const afterB = getWallLinePosition('wall-b')
    const deltaA = {
      x: afterA.x1 - beforeA.x1,
      y: afterA.y1 - beforeA.y1,
    }
    const deltaB = {
      x: afterB.x1 - beforeB.x1,
      y: afterB.y1 - beforeB.y1,
    }

    expect(deltaB.x).toBeCloseTo(deltaA.x, 6)
    expect(deltaB.y).toBeCloseTo(deltaA.y, 6)
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
    expect(screen.getByTestId('box-selection-summary')).toHaveTextContent('10 walls')
  })

  it('supports Cmd/Ctrl+A to select all visible walls', async () => {
    const draft = createSeedState()
    const activeFloor = draft.structures[0].floors[0]
    const kitchen = activeFloor.rooms[2]
    const totalWalls = activeFloor.rooms.reduce((sum, room) => sum + room.segments.length, 0)

    draft.selectedRoomId = kitchen.id
    draft.selectedFurnitureId = null

    renderEditor({ draft })

    fireEvent.keyDown(window, { key: 'a', metaKey: true })

    await waitFor(() => expect(screen.getByTestId('box-selection-summary')).toHaveTextContent(`${totalWalls} walls`))
    expect(screen.getByRole('heading', { name: kitchen.name })).toBeInTheDocument()

    activeFloor.rooms.flatMap((room) => room.segments).forEach((segment) => {
      expect(screen.getByTestId(`wall-hit-${segment.id}`)).toHaveClass('selected')
      expect(screen.getByTestId(`room-segment-${segment.id}`)).toHaveClass('selected')
    })

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('box-selection-summary')).not.toBeInTheDocument())

    fireEvent.keyDown(window, { key: 'a', ctrlKey: true })
    await waitFor(() => expect(screen.getByTestId('box-selection-summary')).toHaveTextContent(`${totalWalls} walls`))
  })

  it('keeps wall multi-select active when right-clicking the canvas and shows wall group actions', async () => {
    const draft = createSeedState()
    const activeFloor = draft.structures[0].floors[0]
    const totalWalls = activeFloor.rooms.reduce((sum, room) => sum + room.segments.length, 0)

    renderEditor({ draft })

    const svg = screen.getByLabelText('Interactive floorplan canvas')
    mockCanvasRect(svg)

    fireEvent.keyDown(window, { key: 'a', metaKey: true })
    await waitFor(() => expect(screen.getByTestId('box-selection-summary')).toHaveTextContent(`${totalWalls} walls`))

    fireEvent.contextMenu(screen.getByTestId('canvas-empty'), {
      clientX: 320,
      clientY: 84,
    })

    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Delete All' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Rotate All' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Assign All to Room' })).toBeInTheDocument()
    expect(screen.getByTestId('box-selection-summary')).toHaveTextContent(`${totalWalls} walls`)

    activeFloor.rooms.flatMap((room) => room.segments).forEach((segment) => {
      expect(screen.getByTestId(`wall-hit-${segment.id}`)).toHaveClass('selected')
    })
  })

  it('deletes the room when Delete All removes every wall in that room', async () => {
    const user = userEvent.setup()
    const draft = createSeedState()
    const sourceRoom = createRoom({
      id: 'source-room',
      name: 'Source room',
      anchor: { x: 0, y: 0 },
      startHeading: 0,
      segments: [
        createSegment({ id: 'source-wall-a', label: 'Source wall A', length: 8, turn: 90 }),
        createSegment({ id: 'source-wall-b', label: 'Source wall B', length: 6, turn: 90 }),
      ],
      furniture: [],
    })
    const receiverRoom = createRoom({
      id: 'receiver-room',
      name: 'Receiver room',
      anchor: { x: 20, y: 0 },
      startHeading: 0,
      segments: [
        createSegment({ id: 'receiver-wall-a', label: 'Receiver wall A', length: 7, turn: 90 }),
        createSegment({ id: 'receiver-wall-b', label: 'Receiver wall B', length: 5, turn: 90 }),
      ],
      furniture: [],
    })

    const secondFloor = createFloor({
      id: 'second-floor',
      name: 'Second floor',
      elevation: 10,
      rooms: [receiverRoom],
    })

    draft.structures[0].floors[0].rooms = [sourceRoom]
    draft.structures[0].floors = [draft.structures[0].floors[0], secondFloor]
    draft.activeFloorId = draft.structures[0].floors[0].id
    draft.selectedRoomId = sourceRoom.id
    draft.selectedFurnitureId = null

    renderEditor({ draft })

    const svg = screen.getByLabelText('Interactive floorplan canvas')
    mockCanvasRect(svg)

    fireEvent.keyDown(window, { key: 'a', metaKey: true })
    await waitFor(() => expect(screen.getByTestId('box-selection-summary')).toHaveTextContent('2 walls'))

    fireEvent.contextMenu(screen.getByTestId('canvas-empty'), {
      clientX: 320,
      clientY: 84,
    })
    await user.click(screen.getByRole('menuitem', { name: 'Delete All' }))

    await waitFor(() => expect(document.querySelectorAll('[data-testid^="wall-hit-"]').length).toBe(0))
    expect(screen.queryByTestId('box-selection-summary')).not.toBeInTheDocument()

    const savedStructure = readSavedDraft().structures[0]
    expect(savedStructure.floors[0].rooms.find((room: { id: string }) => room.id === sourceRoom.id)).toBeUndefined()
    expect(savedStructure.floors[1].rooms.find((room: { id: string }) => room.id === receiverRoom.id)?.segments).toHaveLength(2)
  })

  it('rotates all selected walls from the wall group context menu', async () => {
    const user = userEvent.setup()
    const draft = createSeedState()
    const room = createRoom({
      id: 'rotate-room',
      name: 'Rotate room',
      anchor: { x: 0, y: 0 },
      startHeading: 0,
      segments: [
        createSegment({ id: 'rotate-wall-a', label: 'Rotate wall A', length: 8, turn: 90 }),
        createSegment({ id: 'rotate-wall-b', label: 'Rotate wall B', length: 6, turn: 90 }),
      ],
      furniture: [],
    })

    draft.structures[0].floors[0].rooms = [room]
    draft.selectedRoomId = room.id
    draft.selectedFurnitureId = null

    renderEditor({ draft })

    const svg = screen.getByLabelText('Interactive floorplan canvas')
    mockCanvasRect(svg)

    const beforeWall = getWallLinePosition('rotate-wall-a')

    fireEvent.keyDown(window, { key: 'a', metaKey: true })
    fireEvent.contextMenu(screen.getByTestId('canvas-empty'), {
      clientX: 320,
      clientY: 84,
    })
    await user.click(screen.getByRole('menuitem', { name: 'Rotate All' }))
    await waitFor(() => expect(screen.getByRole('menuitem', { name: '90° ↻' })).toBeInTheDocument())
    await user.click(screen.getByRole('menuitem', { name: '90° ↻' }))

    await waitFor(() => {
      const savedRoom = readSavedDraft().structures[0].floors[0].rooms.find((item: { id: string }) => item.id === room.id)
      expect(savedRoom?.startHeading).toBe(270)
      expect(savedRoom?.anchor.x).not.toBe(room.anchor.x)
      expect(savedRoom?.anchor.y).not.toBe(room.anchor.y)
    })

    const afterWall = getWallLinePosition('rotate-wall-a')
    expect(afterWall.x1).not.toBe(beforeWall.x1)
    expect(afterWall.y1).not.toBe(beforeWall.y1)
  })

  it('assigns all selected walls to the chosen room from the wall group context menu', async () => {
    const user = userEvent.setup()
    const draft = createSeedState()
    const sourceRoom = createRoom({
      id: 'assign-source-room',
      name: 'Source room',
      anchor: { x: 0, y: 0 },
      startHeading: 0,
      segments: [
        createSegment({ id: 'assign-source-wall-a', label: 'Source wall A', length: 8, turn: 90 }),
        createSegment({ id: 'assign-source-wall-b', label: 'Source wall B', length: 6, turn: 90 }),
      ],
      furniture: [],
    })
    const receiverRoom = createRoom({
      id: 'assign-receiver-room',
      name: 'Receiver room',
      anchor: { x: 20, y: 0 },
      startHeading: 0,
      segments: [
        createSegment({ id: 'assign-receiver-wall-a', label: 'Receiver wall A', length: 7, turn: 90 }),
        createSegment({ id: 'assign-receiver-wall-b', label: 'Receiver wall B', length: 5, turn: 90 }),
      ],
      furniture: [],
    })

    draft.structures[0].floors[0].rooms = [sourceRoom, receiverRoom]
    draft.selectedRoomId = sourceRoom.id
    draft.selectedFurnitureId = null

    renderEditor({ draft })

    const svg = screen.getByLabelText('Interactive floorplan canvas')
    mockCanvasRect(svg)

    fireEvent.keyDown(window, { key: 'a', metaKey: true })
    fireEvent.contextMenu(screen.getByTestId('canvas-empty'), {
      clientX: 320,
      clientY: 84,
    })
    await user.click(screen.getByRole('menuitem', { name: 'Assign All to Room' }))
    await waitFor(() => expect(screen.getByRole('menuitem', { name: /Receiver room/ })).toBeInTheDocument())
    await user.click(screen.getByRole('menuitem', { name: /Receiver room/ }))

    await waitFor(() => {
      const savedFloor = readSavedDraft().structures[0].floors[0]
      const savedSourceRoom = savedFloor.rooms.find((room: { id: string }) => room.id === sourceRoom.id)
      const savedReceiverRoom = savedFloor.rooms.find((room: { id: string }) => room.id === receiverRoom.id)

      expect(savedSourceRoom?.segments).toHaveLength(0)
      expect(savedReceiverRoom?.segments).toHaveLength(4)
    })

    expect(screen.getByTestId('box-selection-summary')).toHaveTextContent('4 walls')
    expect(document.querySelectorAll('[data-testid^="wall-hit-"]').length).toBe(4)
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
    mockCanvasRect(screen.getByLabelText('Interactive floorplan canvas'))

    fireEvent.contextMenu(screen.getByTestId('structure-header'))
    expect(screen.getByRole('menu')).toHaveTextContent('Rename structure')
    fireEvent.pointerDown(document.body)

    fireEvent.contextMenu(screen.getByTestId(`floor-label-${floor.id}`))
    expect(screen.getByRole('menu')).toHaveTextContent('Rename floor')
    fireEvent.pointerDown(document.body)

    fireEvent.contextMenu(screen.getByTestId(`room-label-${room.id}`))
    expect(screen.getByRole('menu')).toHaveTextContent('Rename room')
    expect(screen.getByRole('menu')).toHaveTextContent('Rotate')
    expect(screen.getByRole('menu')).toHaveTextContent('Measure From Here')
    fireEvent.pointerDown(document.body)

    fireEvent.contextMenu(screen.getByTestId(`wall-label-${wall.id}`))
    const wallMenu = screen.getByRole('menu')
    expect(wallMenu).toHaveTextContent('Edit wall measurements')
    expect(wallMenu).not.toHaveTextContent('Insert wall after')
    expect(wallMenu).toHaveTextContent('Measure From Here')
    expect(wallMenu).toHaveTextContent('Assign to Room')
    expect(within(wallMenu).getByRole('separator')).toBeInTheDocument()
    const wallMenuLabels = within(wallMenu).getAllByRole('menuitem').map((item) => item.textContent?.trim() ?? '')
    expect(wallMenuLabels.indexOf('Edit wall measurements')).toBeLessThan(wallMenuLabels.indexOf('Measure From Here'))
    await user.click(within(wallMenu).getByRole('menuitem', { name: 'Assign to Room' }))
    const wallAssignSubmenu = screen.getByRole('menu', { name: 'Assign to Room submenu' })
    expect(within(wallAssignSubmenu).getByRole('menuitem', { name: room.name })).toHaveTextContent(new RegExp(`•\\s*${room.name}`))
    fireEvent.pointerDown(document.body)

    fireEvent.contextMenu(screen.getByTestId(`corner-hit-${wall.id}`))
    const cornerMenu = screen.getByRole('menu')
    expect(cornerMenu).toHaveTextContent('Edit corner angle')
    expect(cornerMenu).toHaveTextContent('Edit wall measurements')
    expect(cornerMenu).not.toHaveTextContent('Insert wall after')
    expect(within(cornerMenu).getAllByRole('menuitem', { name: 'Measure From Here' })).toHaveLength(1)
    expect(within(cornerMenu).getByRole('separator')).toBeInTheDocument()
    const cornerMenuLabels = within(cornerMenu).getAllByRole('menuitem').map((item) => item.textContent?.trim() ?? '')
    expect(cornerMenuLabels.indexOf('Edit corner angle')).toBeLessThan(cornerMenuLabels.indexOf('Measure From Here'))
    expect(cornerMenuLabels.indexOf('Edit wall measurements')).toBeLessThan(cornerMenuLabels.indexOf('Measure From Here'))
    await user.click(within(cornerMenu).getByRole('menuitem', { name: 'Edit wall measurements' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Edit wall')
    await user.click(screen.getByRole('button', { name: 'Close' }))

    fireEvent.contextMenu(screen.getByTestId('canvas-empty'))
    expect(screen.getByRole('menu')).toHaveTextContent('Fit view')
    expect(screen.getByRole('menu')).toHaveTextContent('Measure From Here')
    fireEvent.pointerDown(document.body)

    await user.click(screen.getByRole('button', { name: 'Furniture' }))
    fireEvent.contextMenu(screen.getByTestId(`furniture-${furniture.id}`))
    expect(screen.getByRole('menu')).toHaveTextContent('Edit furniture')
    expect(screen.getByRole('menu')).toHaveTextContent('Measure From Here')
    expect(screen.getByRole('menu')).toHaveTextContent('Assign to Room')
  })

  it('measures arbitrary distances on the canvas and clears them independently of selection', async () => {
    const user = userEvent.setup()
    const draft = createSeedState()
    const room = draft.structures[0].floors[0].rooms[0]

    renderEditor({ draft })

    const canvasStage = screen.getByTestId('canvas-stage')
    const svg = screen.getByLabelText('Interactive floorplan canvas')
    const canvasEmpty = screen.getByTestId('canvas-empty')
    const wallLabel = screen.getByTestId(`wall-label-${room.segments[0].id}`)
    mockCanvasRect(svg)

    const firstStart = { clientX: 72, clientY: 96 }
    const firstEnd = { clientX: 228, clientY: 150 }

    fireEvent.contextMenu(canvasEmpty, firstStart)
    await user.click(screen.getByRole('menuitem', { name: 'Measure From Here' }))
    expect(screen.getByTestId('canvas-measurement-pending')).toBeInTheDocument()

    fireEvent.pointerDown(canvasStage, {
      button: 0,
      pointerId: 41,
      ...firstEnd,
    })
    fireEvent.click(canvasStage, {
      button: 0,
      ...firstEnd,
    })

    await waitFor(() => expect(screen.getAllByTestId(/canvas-measurement-label-/)).toHaveLength(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByTestId('canvas-measurement-pending')).not.toBeInTheDocument()
    expect(screen.getAllByTestId(/canvas-measurement-line-/)).toHaveLength(1)
    expect(screen.getAllByTestId(/canvas-measurement-label-/)[0]).toHaveTextContent(
      formatFeet(getWorldDistanceBetweenScreenPoints(firstStart, firstEnd, svg)),
    )

    const secondStart = { clientX: 318, clientY: 224 }
    const secondEnd = { clientX: 164, clientY: 278 }

    fireEvent.contextMenu(wallLabel, secondStart)
    await user.click(screen.getByRole('menuitem', { name: 'Measure From Here' }))
    expect(screen.getByTestId('canvas-measurement-pending-label')).toHaveTextContent('Click endpoint')

    fireEvent.pointerDown(canvasStage, {
      button: 0,
      pointerId: 42,
      ...secondEnd,
    })
    fireEvent.click(canvasStage, {
      button: 0,
      ...secondEnd,
    })

    await waitFor(() => expect(screen.getAllByTestId(/canvas-measurement-label-/)).toHaveLength(2))
    const measurementLabels = screen.getAllByTestId(/canvas-measurement-label-/)
    expect(measurementLabels[0]).toHaveTextContent(formatFeet(getWorldDistanceBetweenScreenPoints(firstStart, firstEnd, svg)))
    expect(measurementLabels[1]).toHaveTextContent(formatFeet(getWorldDistanceBetweenScreenPoints(secondStart, secondEnd, svg)))
    expect(screen.getAllByTestId(/canvas-measurement-line-/)).toHaveLength(2)

    fireEvent.contextMenu(canvasEmpty, { clientX: 340, clientY: 64 })
    expect(screen.getByRole('menu')).toHaveTextContent('Clear All Measurements')
    await user.click(screen.getByRole('menuitem', { name: 'Clear All Measurements' }))

    await waitFor(() => expect(screen.queryAllByTestId(/canvas-measurement-label-/)).toHaveLength(0))
    expect(screen.queryAllByTestId(/canvas-measurement-line-/)).toHaveLength(0)
    expect(screen.queryByTestId('canvas-measurement-pending')).not.toBeInTheDocument()
  })

  it('reassigns walls and furniture to another room from the context menu', async () => {
    const user = userEvent.setup()
    const draft = createSeedState()
    const floor = draft.structures[0].floors[0]
    const livingRoom = floor.rooms[0]
    const hall = floor.rooms[1]
    const wall = livingRoom.segments[0]
    const furniture = livingRoom.furniture[0]

    renderEditor({ draft })
    const wallBefore = getWallLinePosition(wall.id)

    fireEvent.contextMenu(screen.getByTestId(`wall-label-${wall.id}`))
    await user.click(screen.getByRole('menuitem', { name: 'Assign to Room' }))
    await user.click(screen.getByRole('menuitem', { name: hall.name }))

    await waitFor(() => {
      const saved = readSavedDraft()
      const savedFloor = saved.structures[0].floors[0]
      expect(savedFloor.rooms[0].segments.some((segment: { id: string }) => segment.id === wall.id)).toBe(false)
      expect(savedFloor.rooms[1].segments.some((segment: { id: string }) => segment.id === wall.id)).toBe(true)
    })
    expect(getWallLinePosition(wall.id)).toEqual(wallBefore)

    await user.click(screen.getByRole('button', { name: 'Furniture' }))
    fireEvent.contextMenu(screen.getByTestId(`furniture-${furniture.id}`))
    await user.click(screen.getByRole('menuitem', { name: 'Assign to Room' }))
    await user.click(screen.getByRole('menuitem', { name: hall.name }))

    await waitFor(() => {
      const saved = readSavedDraft()
      const savedFloor = saved.structures[0].floors[0]
      expect(savedFloor.rooms[0].furniture.some((item: { id: string }) => item.id === furniture.id)).toBe(false)
      expect(savedFloor.rooms[1].furniture.some((item: { id: string }) => item.id === furniture.id)).toBe(true)
    })
  })

  it('assigns all selected walls and furniture to a room from the context menu', async () => {
    const user = userEvent.setup()
    const draft = createSeedState()
    const sourceRoom = createRoom({
      id: 'room-source',
      name: 'Source room',
      anchor: { x: 0, y: 0 },
      startHeading: 0,
      segments: [
        createSegment({ id: 'wall-a', label: 'Wall A', length: 8, turn: 0 }),
        createSegment({
          id: 'wall-b',
          label: 'Wall B',
          length: 5,
          turn: 0,
          startPoint: { x: 18, y: 0 },
          startHeading: 90,
        }),
      ],
      furniture: [createFurniture({ id: 'furn-a', name: 'Chair', x: 2, y: -1, width: 2, depth: 2 })],
    })
    const destinationRoom = createRoom({
      id: 'room-destination',
      name: 'Destination room',
      anchor: { x: 52, y: 0 },
      startHeading: 0,
      segments: [],
      furniture: [],
    })

    draft.structures[0].floors[0].rooms = [sourceRoom, destinationRoom]
    draft.selectedRoomId = sourceRoom.id
    draft.selectedFurnitureId = null
    draft.editorMode = 'furniture'

    renderEditor({
      draft,
      selectionTargets: [
        {
          kind: 'room',
          structureId: draft.activeStructureId,
          floorId: draft.activeFloorId,
          roomId: sourceRoom.id,
        },
        {
          kind: 'wall',
          structureId: draft.activeStructureId,
          floorId: draft.activeFloorId,
          roomId: sourceRoom.id,
          segmentId: 'wall-a',
        },
        {
          kind: 'wall',
          structureId: draft.activeStructureId,
          floorId: draft.activeFloorId,
          roomId: sourceRoom.id,
          segmentId: 'wall-b',
        },
        {
          kind: 'furniture',
          structureId: draft.activeStructureId,
          floorId: draft.activeFloorId,
          roomId: sourceRoom.id,
          furnitureId: 'furn-a',
        },
      ],
      focusedTarget: {
        kind: 'wall',
        structureId: draft.activeStructureId,
        floorId: draft.activeFloorId,
        roomId: sourceRoom.id,
        segmentId: 'wall-a',
      },
    })

    await waitFor(() => expect(screen.getByTestId('box-selection-summary')).toHaveTextContent('1 room'))
    expect(screen.getByTestId('box-selection-summary')).toHaveTextContent('1 furniture item')
    expect(screen.getByTestId('box-selection-summary')).toHaveTextContent('2 walls')

    fireEvent.contextMenu(screen.getByTestId('wall-hit-wall-a'))
    await user.click(screen.getByRole('menuitem', { name: 'Assign to Room' }))
    await user.click(screen.getByRole('menuitem', { name: destinationRoom.name }))

    await waitFor(() => {
      const saved = readSavedDraft()
      const savedFloor = saved.structures[0].floors[0]
      expect(savedFloor.rooms.map((room: { id: string }) => room.id)).toEqual(['room-destination'])
      expect(savedFloor.rooms[0].segments.map((segment: { id: string }) => segment.id)).toEqual(['wall-a', 'wall-b'])
      expect(savedFloor.rooms[0].furniture.map((item: { id: string }) => item.id)).toEqual(['furn-a'])
    })
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

function zoomCanvasToMax(element: HTMLElement) {
  for (let step = 0; step < 100; step += 1) {
    fireEvent.wheel(element, {
      bubbles: true,
      cancelable: true,
      clientX: 220,
      clientY: 180,
      deltaY: -120,
    })
  }
}

function formatZoomPercent(zoom: number) {
  return `${Math.round(zoom * 100)}%`
}

function getViewBoxCenter(element: HTMLElement) {
  const { x, y, width, height } = getViewBoxRect(element)
  return {
    x: x + width / 2,
    y: y + height / 2,
  }
}

function getViewBoxRect(element: HTMLElement) {
  const viewBox = element.getAttribute('viewBox')

  if (!viewBox) {
    throw new Error('Expected viewBox attribute')
  }

  const [x, y, width, height] = viewBox.split(' ').map((value) => Number.parseFloat(value))
  return { x, y, width, height }
}

function getWorldPointFromScreenPoint(
  point: { clientX: number; clientY: number },
  svg: HTMLElement,
) {
  const rect = svg.getBoundingClientRect()
  const viewBox = getViewBoxRect(svg)

  return {
    x: viewBox.x + ((point.clientX - rect.left) / rect.width) * viewBox.width,
    y: -(viewBox.y + ((point.clientY - rect.top) / rect.height) * viewBox.height),
  }
}

function getWorldDistanceBetweenScreenPoints(
  start: { clientX: number; clientY: number },
  end: { clientX: number; clientY: number },
  svg: HTMLElement,
) {
  const worldStart = getWorldPointFromScreenPoint(start, svg)
  const worldEnd = getWorldPointFromScreenPoint(end, svg)

  return Math.hypot(worldEnd.x - worldStart.x, worldEnd.y - worldStart.y)
}

function getAnnotationLeft(testId: string) {
  return Number.parseFloat(screen.getByTestId(testId).getAttribute('style')?.match(/left:\s*([\d.]+)px/)?.[1] ?? '0')
}

function getCircleScreenCenter(element: HTMLElement, svg: HTMLElement) {
  const { x, y, width, height } = getViewBoxRect(svg)

  return {
    x: ((Number(element.getAttribute('cx')) - x) / width) * 440,
    y: ((Number(element.getAttribute('cy')) - y) / height) * 360,
  }
}

function getCircleScreenRadius(element: HTMLElement, svg: HTMLElement) {
  const { width } = getViewBoxRect(svg)

  return (Number(element.getAttribute('r')) / width) * 440
}

function getGroupTranslate(testId: string) {
  const transform = screen.getByTestId(testId).getAttribute('transform') ?? ''
  const match = transform.match(/translate\(([-\d.]+)\s+([-\d.]+)\)/)

  if (!match) {
    return { x: 0, y: 0 }
  }

  return {
    x: Number.parseFloat(match[1]),
    y: Number.parseFloat(match[2]),
  }
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

function getWallLabelScreenCenter(segmentId: string) {
  const label = screen.getByTestId(`wall-label-${segmentId}`)
  const chip = label.closest('.canvas-wall-chip')

  if (!(chip instanceof HTMLElement)) {
    throw new Error('Expected wall label chip')
  }

  const position = readAbsolutePosition(chip)

  return {
    x: position.left,
    y: position.top,
  }
}

function getWallLineScreenPosition(segmentId: string, svg: HTMLElement) {
  const line = screen.getByTestId(`wall-hit-${segmentId}`)
  const { x, y, width, height } = getViewBoxRect(svg)
  const widthPx = 960
  const heightPx = 720

  return {
    x1: ((Number(line.getAttribute('x1')) - x) / width) * widthPx,
    x2: ((Number(line.getAttribute('x2')) - x) / width) * widthPx,
    y1: ((Number(line.getAttribute('y1')) - y) / height) * heightPx,
    y2: ((Number(line.getAttribute('y2')) - y) / height) * heightPx,
  }
}

function readAbsolutePosition(element: HTMLElement) {
  const style = element.getAttribute('style') ?? ''
  return {
    left: Number.parseFloat(style.match(/left:\s*([\d.]+)px/)?.[1] ?? '0'),
    top: Number.parseFloat(style.match(/top:\s*([\d.]+)px/)?.[1] ?? '0'),
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

function readSuggestedPathPoints(path: Element, svg: HTMLElement, width: number, height: number) {
  const d = path.getAttribute('d') ?? ''
  const viewBox = getViewBoxRect(svg)

  return Array.from(d.matchAll(/[ML]\s+([-\d.]+)\s+([-\d.]+)/g), (match) => ({
    x: ((Number.parseFloat(match[1]) - viewBox.x) / viewBox.width) * width,
    y: ((Number.parseFloat(match[2]) - viewBox.y) / viewBox.height) * height,
  }))
}

function getMinimumSegmentDistance(point: { x: number; y: number }, points: Array<{ x: number; y: number }>) {
  let minimum = Number.POSITIVE_INFINITY

  points.slice(0, -1).forEach((start, index) => {
    minimum = Math.min(minimum, getPointToSegmentDistance(point, start, points[index + 1]))
  })

  return minimum
}

function getPointToSegmentDistance(point: { x: number; y: number }, start: { x: number; y: number }, end: { x: number; y: number }) {
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const lengthSquared = deltaX ** 2 + deltaY ** 2

  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y)
  }

  const projection = ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared
  const t = Math.min(1, Math.max(0, projection))
  const closest = {
    x: start.x + deltaX * t,
    y: start.y + deltaY * t,
  }

  return Math.hypot(point.x - closest.x, point.y - closest.y)
}

function readSavedDraft() {
  const raw = window.localStorage.getItem('incremental-blueprint/v1')

  if (!raw) {
    throw new Error('Expected saved draft in localStorage')
  }

  return JSON.parse(raw)
}
