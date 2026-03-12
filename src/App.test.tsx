import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './lib/blueprint'

describe('app settings', () => {
  it('updates persistent canvas and furniture snapping settings from the settings dialog', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.click(screen.getByRole('button', { name: 'App settings' }))
    await user.click(screen.getByRole('menuitem', { name: 'Open settings' }))

    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByRole('slider', { name: 'Wall line width' }), {
      target: { value: '3.2' },
    })
    fireEvent.change(within(dialog).getByRole('slider', { name: 'Label font size' }), {
      target: { value: '16' },
    })
    await user.click(within(dialog).getByRole('checkbox', { name: 'Show label shapes' }))
    fireEvent.change(within(dialog).getByRole('slider', { name: 'Furniture wall snap strength' }), {
      target: { value: '1.75' },
    })
    fireEvent.change(within(dialog).getByRole('slider', { name: 'Furniture corner snap strength' }), {
      target: { value: '0.5' },
    })

    const canvasStage = screen.getByTestId('canvas-stage')
    const firstRoomLabel = screen.getAllByTestId(/room-label-/)[0]
    const savedDraft = window.localStorage.getItem(STORAGE_KEY)

    expect(canvasStage.style.getPropertyValue('--canvas-wall-line-width')).toBe('3.2px')
    expect(canvasStage.style.getPropertyValue('--canvas-label-font-size')).toBe('16px')
    expect(canvasStage).toHaveClass('canvas-stage--plain-labels')
    expect(firstRoomLabel).toHaveClass('canvas-annotation--plain')
    expect(savedDraft).toContain('"wallStrokeWidthPx":3.2')
    expect(savedDraft).toContain('"labelFontSize":16')
    expect(savedDraft).toContain('"showLabelShapes":false')
    expect(savedDraft).toContain('"furnitureSnapStrength":1.75')
    expect(savedDraft).toContain('"furnitureCornerSnapStrength":0.5')
  })
})
