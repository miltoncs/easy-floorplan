import { expect, test } from '@playwright/test'

test('supports direct canvas editing and route-based navigation', async ({ page }) => {
  await page.goto('/workspace')
  await page.waitForLoadState('networkidle')

  const canvas = page.getByLabel('Interactive floorplan canvas')
  const canvasBox = await canvas.boundingBox()
  if (!canvasBox) {
    throw new Error('Expected canvas bounding box')
  }
  const canvasSurfaceBox = await page.getByTestId('canvas-empty').boundingBox()
  if (!canvasSurfaceBox) {
    throw new Error('Expected canvas surface bounding box')
  }
  expect(canvasSurfaceBox.x).toBeCloseTo(canvasBox.x, 1)
  expect(canvasSurfaceBox.width).toBeCloseTo(canvasBox.width, 1)

  await expect(page.locator('[data-testid^="canvas-suggestion-actions-"]').first()).toBeVisible()
  const roomLabel = page.locator('.canvas-annotation-layer [data-testid^="room-label-"]').filter({ hasText: 'Living room' })
  const roomLabelBeforeZoom = await roomLabel.boundingBox()
  if (!roomLabelBeforeZoom) {
    throw new Error('Expected room label bounding box before zoom')
  }

  await page.mouse.move(roomLabelBeforeZoom.x + roomLabelBeforeZoom.width / 2, roomLabelBeforeZoom.y + roomLabelBeforeZoom.height / 2)
  await page.mouse.wheel(0, -400)
  await expect(page.locator('.toolbar-pill').first()).toHaveText('102%')
  const roomLabelAfterZoom = await roomLabel.boundingBox()
  if (!roomLabelAfterZoom) {
    throw new Error('Expected room label bounding box after zoom')
  }
  expect(roomLabelAfterZoom.width).toBeCloseTo(roomLabelBeforeZoom.width, 1)
  expect(roomLabelAfterZoom.height).toBeCloseTo(roomLabelBeforeZoom.height, 1)

  await page.mouse.move(roomLabelAfterZoom.x + roomLabelAfterZoom.width / 2, roomLabelAfterZoom.y + roomLabelAfterZoom.height / 2)
  const initialScrollY = await page.evaluate(() => window.scrollY)
  await page.mouse.wheel(0, 400)
  expect(await page.evaluate(() => window.scrollY)).toBe(initialScrollY)
  await expect(page.locator('.toolbar-pill').first()).toHaveText('100%')

  const initialViewBox = parseViewBox(await canvas.getAttribute('viewBox'))
  await canvas.dispatchEvent('wheel', {
    bubbles: true,
    cancelable: true,
    clientX: canvasBox.x + 4,
    clientY: canvasBox.y + canvasBox.height / 2,
    deltaY: -400,
  })
  await expect(page.locator('.toolbar-pill').first()).toHaveText('102%')
  const edgeZoomViewBox = parseViewBox(await canvas.getAttribute('viewBox'))
  const initialCenterX = initialViewBox.x + initialViewBox.width / 2
  const edgeCenterX = edgeZoomViewBox.x + edgeZoomViewBox.width / 2
  expect(edgeCenterX).toBeLessThan(initialCenterX)
  expect(edgeCenterX).toBeGreaterThan(initialCenterX - 2)

  await page.mouse.move(canvasBox.x + 4, canvasBox.y + canvasBox.height / 2)
  await page.mouse.wheel(0, 400)
  await expect(page.locator('.toolbar-pill').first()).toHaveText('100%')

  const viewBoxBeforeOutOfBoundsWheel = parseViewBox(await canvas.getAttribute('viewBox'))
  await canvas.dispatchEvent('wheel', {
    bubbles: true,
    cancelable: true,
    clientX: canvasBox.x + canvasBox.width / 2,
    clientY: canvasBox.y + canvasBox.height + 4000,
    deltaY: -400,
  })
  await expect(page.locator('.toolbar-pill').first()).toHaveText('102%')
  const outOfBoundsZoomViewBox = parseViewBox(await canvas.getAttribute('viewBox'))
  const centerYBeforeOutOfBoundsWheel = viewBoxBeforeOutOfBoundsWheel.y + viewBoxBeforeOutOfBoundsWheel.height / 2
  const centerYAfterOutOfBoundsWheel = outOfBoundsZoomViewBox.y + outOfBoundsZoomViewBox.height / 2
  expect(Math.abs(centerYAfterOutOfBoundsWheel - centerYBeforeOutOfBoundsWheel)).toBeLessThan(2)

  await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height - 4)
  await page.mouse.wheel(0, 400)
  await expect(page.locator('.toolbar-pill').first()).toHaveText('100%')

  const draftBeforeDrag = await page.evaluate(() => JSON.parse(window.localStorage.getItem('incremental-blueprint/v1') || 'null'))
  const kitchen = draftBeforeDrag.structures[0].floors[0].rooms.find((room: { id: string; name: string; anchor: { y: number } }) => room.name === 'Kitchen')
  if (!kitchen) {
    throw new Error('Expected Kitchen room in saved draft')
  }

  const kitchenLabel = page.getByTestId(`room-label-${kitchen.id}`)
  const kitchenFill = page.getByTestId(`room-fill-${kitchen.id}`)
  const kitchenLabelBox = await kitchenLabel.boundingBox()
  const kitchenFillBox = await kitchenFill.boundingBox()
  if (!kitchenLabelBox || !kitchenFillBox) {
    throw new Error('Expected Kitchen label and room fill bounding boxes')
  }

  const viewBoxBeforeRoomDrag = await canvas.getAttribute('viewBox')
  await page.mouse.move(kitchenLabelBox.x + kitchenLabelBox.width / 2, kitchenLabelBox.y + kitchenLabelBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(kitchenLabelBox.x + kitchenLabelBox.width / 2, kitchenLabelBox.y + kitchenLabelBox.height / 2 - 120, {
    steps: 10,
  })
  expect(await canvas.getAttribute('viewBox')).toBe(viewBoxBeforeRoomDrag)
  await page.mouse.up()

  expect(await canvas.getAttribute('viewBox')).toBe(viewBoxBeforeRoomDrag)
  await expect
    .poll(async () => {
      const draftAfterDrag = await page.evaluate(() => JSON.parse(window.localStorage.getItem('incremental-blueprint/v1') || 'null'))
      return draftAfterDrag?.structures?.[0]?.floors?.[0]?.rooms?.find(
        (room: { id: string; anchor: { y: number } }) => room.id === kitchen.id,
      )?.anchor?.y ?? null
    })
    .toBeGreaterThan(kitchen.anchor.y + 5)
  await expect
    .poll(async () => (await kitchenFill.boundingBox())?.y ?? null)
    .toBeLessThan(kitchenFillBox.y - 80)
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const viewBoxBeforePostDragZoom = parseViewBox(await canvas.getAttribute('viewBox'))
  await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2)
  await page.mouse.wheel(0, -400)
  await expect(page.locator('.toolbar-pill').first()).toHaveText('102%')
  const viewBoxAfterPostDragZoom = parseViewBox(await canvas.getAttribute('viewBox'))
  expect(viewBoxAfterPostDragZoom.x + viewBoxAfterPostDragZoom.width / 2).toBeCloseTo(
    viewBoxBeforePostDragZoom.x + viewBoxBeforePostDragZoom.width / 2,
    1,
  )
  expect(viewBoxAfterPostDragZoom.y + viewBoxAfterPostDragZoom.height / 2).toBeCloseTo(
    viewBoxBeforePostDragZoom.y + viewBoxBeforePostDragZoom.height / 2,
    1,
  )

  await page.mouse.wheel(0, 400)
  await expect(page.locator('.toolbar-pill').first()).toHaveText('100%')

  await roomLabel.click({ force: true })
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const renameInput = page.getByRole('textbox', { name: 'Room name' })
  await renameInput.fill('Room 🧱 測試 خانه')
  await renameInput.press('Enter')
  await expect(page.getByRole('textbox', { name: 'Room name' })).toHaveCount(0)
  await expect(
    page.locator('.canvas-annotation-layer [data-testid^="room-label-"]').filter({ hasText: 'Room 🧱 測試 خانه' }),
  ).toBeVisible()

  const wallTarget = page.locator('[data-testid^="wall-hit-"]').first()
  const wallTargetTestId = await wallTarget.getAttribute('data-testid')
  if (!wallTargetTestId) {
    throw new Error('Expected wall hit test id')
  }

  await page.getByTestId(wallTargetTestId).dispatchEvent('click')
  await expect(page.getByRole('dialog')).toContainText('Edit wall')
  await page.getByRole('textbox', { name: 'Length (ft)' }).fill('19.5')
  await page.getByRole('button', { name: 'Save wall' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()

  const cornerLabel = page.locator('[data-testid^="corner-label-"]').first()
  await cornerLabel.dispatchEvent('click')
  await page.getByRole('textbox', { name: 'Corner angle' }).fill('120')
  await page.getByRole('textbox', { name: 'Corner angle' }).press('Enter')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('[data-testid^="corner-label-"]').first()).toHaveText('120°')

  await page.goto('/detail')
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('Selected room')).toBeVisible()
  expect(await page.evaluate(() => window.scrollY)).toBe(0)

  await page.goto('/data')
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('heading', { name: 'Import and export' })).toBeVisible()
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
})

test('supports right-click menus across the 2D view and JSON round-trips', async ({ page }) => {
  await page.goto('/workspace')
  await page.waitForLoadState('networkidle')

  await page.getByTestId('structure-header').click({ button: 'right' })
  await expect(page.getByRole('menu')).toContainText('Rename structure')
  await page.mouse.click(10, 10)

  await page.locator('[data-testid^="floor-label-"]').first().dispatchEvent('contextmenu')
  await expect(page.getByRole('menu')).toContainText('Rename floor')
  await page.mouse.click(10, 10)

  await page.locator('[data-testid^="room-label-"]').first().dispatchEvent('contextmenu')
  await expect(page.getByRole('menu')).toContainText('Rename room')
  await page.mouse.click(10, 10)

  await page.locator('[data-testid^="wall-label-"]').first().dispatchEvent('contextmenu')
  await expect(page.getByRole('menu')).toContainText('Edit wall measurements')
  await page.mouse.click(10, 10)

  await page.locator('[data-testid^="corner-hit-"]').first().dispatchEvent('contextmenu')
  await expect(page.getByRole('menu')).toContainText('Edit corner angle')
  await page.mouse.click(10, 10)

  await page.getByTestId('canvas-empty').click({ button: 'right', position: { x: 16, y: 16 } })
  const canvasMenu = page.getByRole('menu')
  const firstCanvasMenuItem = canvasMenu.getByRole('menuitem').first()
  await expect(canvasMenu).toContainText('Fit view')
  await expect(canvasMenu).toHaveCSS('border-radius', '0px')
  await expect(firstCanvasMenuItem).toHaveCSS('border-radius', '0px')
  await expect(firstCanvasMenuItem).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(firstCanvasMenuItem).toHaveCSS('border-top-width', '0px')
  await firstCanvasMenuItem.hover()
  await expect(firstCanvasMenuItem).toHaveCSS('background-color', 'rgb(23, 23, 23)')
  await expect(firstCanvasMenuItem).toHaveCSS('color', 'rgba(255, 255, 255, 0.96)')
  await page.mouse.click(10, 10)

  await page.goto('/data')
  await page.waitForLoadState('networkidle')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export workspace JSON' }).click({ force: true })
  const download = await downloadPromise
  const downloadPath = await download.path()
  if (!downloadPath) {
    throw new Error('Expected workspace download path')
  }

  await page.locator('input[type="file"]').setInputFiles(downloadPath)
  await expect(page).toHaveURL(/\/workspace$/)
  await expect(page.getByRole('heading', { name: 'Cedar House' })).toBeVisible()
})

test('measures multiple distances from the canvas context menu until cleared', async ({ page }) => {
  await page.goto('/workspace')
  await page.waitForLoadState('networkidle')

  const canvas = page.getByLabel('Interactive floorplan canvas')
  const measurementLabels = page.locator('[data-testid^="canvas-measurement-label-"]')
  const measurementLines = page.locator('[data-testid^="canvas-measurement-line-"]')
  const canvasBox = await canvas.boundingBox()
  if (!canvasBox) {
    throw new Error('Expected canvas bounding box')
  }

  await page.mouse.click(canvasBox.x + 260, canvasBox.y + 190, { button: 'right' })
  await page.getByRole('menuitem', { name: 'Measure From Here' }).click()
  await expect(page.getByTestId('canvas-measurement-pending-label')).toBeVisible()

  await page.mouse.click(canvasBox.x + 228, canvasBox.y + 150)
  await expect(measurementLabels).toHaveCount(1)
  await expect(measurementLines).toHaveCount(1)
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.locator('[data-testid^="wall-label-"]').first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Measure From Here' }).click()
  await expect(page.getByTestId('canvas-measurement-pending-label')).toBeVisible()

  await page.mouse.click(canvasBox.x + 164, canvasBox.y + 278)
  await expect(measurementLabels).toHaveCount(2)
  await expect(measurementLines).toHaveCount(2)

  await page.mouse.click(canvasBox.x + 274, canvasBox.y + 204, { button: 'right' })
  await page.getByRole('menuitem', { name: 'Clear All Measurements' }).click()
  await expect(measurementLabels).toHaveCount(0)
  await expect(measurementLines).toHaveCount(0)
})

test('keeps wall strokes a constant screen width while zooming', async ({ page }) => {
  await page.goto('/workspace')
  await page.waitForLoadState('networkidle')

  const wall = page.locator('[data-testid^="room-segment-"]').first()
  const beforeZoom = await wall.boundingBox()
  if (!beforeZoom) {
    throw new Error('Expected wall bounding box before zoom')
  }

  const zoomInButton = page.getByRole('button', { name: '+' })
  for (let index = 0; index < 20; index += 1) {
    await zoomInButton.click()
  }
  await expect(page.locator('.toolbar-pill').first()).toHaveText('181%')

  const afterZoom = await wall.boundingBox()
  if (!afterZoom) {
    throw new Error('Expected wall bounding box after zoom')
  }

  expect(afterZoom.width).toBeGreaterThan(beforeZoom.width * 1.5)
  expect(Math.abs(afterZoom.height - beforeZoom.height)).toBeLessThan(0.35)
})

test('keeps anchor action icons a constant screen size while zooming', async ({ page }) => {
  await page.goto('/workspace')
  await page.waitForLoadState('networkidle')

  const anchorAction = page.locator('[data-testid^="anchor-"]').first()
  await expect(anchorAction).toBeVisible()

  const beforeZoom = await anchorAction.boundingBox()
  if (!beforeZoom) {
    throw new Error('Expected anchor action bounding box before zoom')
  }

  const zoomInButton = page.getByRole('button', { name: '+' })
  for (let index = 0; index < 20; index += 1) {
    await zoomInButton.click()
  }
  await expect(page.locator('.toolbar-pill').first()).toHaveText('181%')

  const afterZoom = await anchorAction.boundingBox()
  if (!afterZoom) {
    throw new Error('Expected anchor action bounding box after zoom')
  }

  expect(Math.abs(afterZoom.width - beforeZoom.width)).toBeLessThan(0.75)
  expect(Math.abs(afterZoom.height - beforeZoom.height)).toBeLessThan(0.75)
})

function parseViewBox(value: string | null) {
  if (!value) {
    throw new Error('Expected viewBox attribute')
  }

  const [x, y, width, height] = value.split(' ').map(Number)
  return { x, y, width, height }
}
