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

  await canvas.dispatchEvent('wheel', {
    bubbles: true,
    cancelable: true,
    clientX: canvasBox.x + canvasBox.width / 2,
    clientY: canvasBox.y + canvasBox.height / 2,
    deltaY: -400,
  })
  await expect(page.locator('.toolbar-pill').first()).toHaveText('102%')
  const roomLabelAfterZoom = await roomLabel.boundingBox()
  if (!roomLabelAfterZoom) {
    throw new Error('Expected room label bounding box after zoom')
  }
  expect(roomLabelAfterZoom.width).toBeCloseTo(roomLabelBeforeZoom.width, 1)
  expect(roomLabelAfterZoom.height).toBeCloseTo(roomLabelBeforeZoom.height, 1)

  await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2)
  const initialScrollY = await page.evaluate(() => window.scrollY)
  await page.mouse.wheel(0, 400)
  expect(await page.evaluate(() => window.scrollY)).toBe(initialScrollY)

  const wallCount = await page.locator('[data-testid^="wall-hit-"]').count()
  await page.locator('[data-testid^="anchor-"]').last().dispatchEvent('click')
  await expect(page.getByRole('dialog')).toContainText('Edit wall')
  await expect(page.locator('[data-testid^="wall-hit-"]')).toHaveCount(wallCount + 1)
  await page.getByRole('button', { name: 'Save wall' }).click()

  await roomLabel.click({ force: true })
  await expect(page.getByRole('dialog')).toContainText('Rename room')

  const renameInput = page.getByRole('textbox', { name: 'Name' })
  await renameInput.fill('Room 🧱 測試 خانه')
  await page.getByRole('button', { name: 'Save name' }).click()
  await expect(page.getByRole('heading', { name: 'Room 🧱 測試 خانه' })).toBeVisible()

  const inlineWallLabel = page.locator('[data-testid^="wall-label-"]').first()
  const inlineWallLabelTestId = await inlineWallLabel.getAttribute('data-testid')
  if (!inlineWallLabelTestId) {
    throw new Error('Expected inline wall label test id')
  }
  await inlineWallLabel.click()
  const inlineWallInput = page.getByRole('textbox', { name: 'Wall length' })
  await inlineWallInput.fill(`10'6"`)
  await inlineWallInput.press('Enter')
  await expect(page.getByTestId(inlineWallLabelTestId)).toHaveText(`10' 6"`)

  await page.getByTestId(inlineWallLabelTestId.replace('wall-label-', 'wall-menu-')).click()
  await expect(page.getByRole('dialog')).toContainText('Edit wall')
  await page.getByRole('textbox', { name: 'Length (ft)' }).fill(`12'3"`)
  await page.getByRole('button', { name: 'Save wall' }).click()
  await expect(page.getByTestId(inlineWallLabelTestId)).toHaveText(`12' 3"`)

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

  await page.getByRole('button', { name: 'Furniture', exact: true }).click()
  const furniture = page.locator('[data-testid^="furniture-"]:not([data-testid^="furniture-label-"])').first()
  await furniture.dispatchEvent('click')
  await expect(page.getByRole('dialog')).toContainText('Edit furniture')
  await expect(page.getByRole('textbox', { name: 'Width (ft)' })).toHaveValue(`7'`)
  await expect(page.getByRole('textbox', { name: 'Depth (ft)' })).toHaveValue(`3'`)
  await page.getByRole('textbox', { name: 'Width (ft)' }).fill(`2'6"`)
  await page.getByRole('textbox', { name: 'Depth (ft)' }).fill(`1'6"`)
  await page.getByRole('button', { name: 'Save furniture' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()

  await page.getByRole('link', { name: 'Detail', exact: true }).click()
  await expect(page.getByText('Selected room')).toBeVisible()
  await expect(page.getByText(`2' 6" × 1' 6"`)).toBeVisible()
  expect(await page.evaluate(() => window.scrollY)).toBe(0)

  await page.getByRole('link', { name: 'Data', exact: true }).click()
  await expect(page.getByText('Import and export')).toBeVisible()
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
})

test('supports right-click menus across the 2D view and JSON round-trips', async ({ page }) => {
  await page.goto('/workspace')
  await page.waitForLoadState('networkidle')

  await page.getByTestId('structure-badge').click({ button: 'right' })
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

  await page.locator('[data-testid^="corner-label-"]').first().dispatchEvent('contextmenu')
  await expect(page.getByRole('menu')).toContainText('Edit corner angle')
  await page.mouse.click(10, 10)

  await page.getByTestId('canvas-empty').click({ button: 'right', position: { x: 16, y: 16 } })
  await expect(page.getByRole('menu')).toContainText('Fit view')
  await page.mouse.click(10, 10)

  await page.getByRole('link', { name: 'Data' }).click()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export workspace JSON' }).click()
  const download = await downloadPromise
  const downloadPath = await download.path()
  if (!downloadPath) {
    throw new Error('Expected workspace download path')
  }

  await page.locator('input[type="file"]').setInputFiles(downloadPath)
  await expect(page).toHaveURL(/\/workspace$/)
  await expect(page.getByRole('heading', { name: 'Cedar House' })).toBeVisible()
})
