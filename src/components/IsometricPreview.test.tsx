import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../App'

describe('isometric preview', () => {
  it('swaps the center stage into isometric preview and returns to plan view', async () => {
    const user = userEvent.setup()

    render(<App />)

    expect(screen.getByLabelText(/interactive floorplan canvas/i)).toBeVisible()

    await user.click(screen.getByRole('tab', { name: /preview \/ export/i }))
    await user.click(screen.getByRole('button', { name: /preview isometric/i }))

    expect(screen.getByLabelText(/isometric preview/i)).toBeVisible()
    expect(screen.queryByLabelText(/interactive floorplan canvas/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /return to plan/i }))

    expect(screen.getByLabelText(/interactive floorplan canvas/i)).toBeVisible()
    expect(screen.queryByLabelText(/isometric preview/i)).not.toBeInTheDocument()
  })

  it('shows the active scope summary in preview mode', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.click(screen.getByRole('button', { name: /house view/i }))
    await user.click(screen.getByRole('tab', { name: /preview \/ export/i }))
    await user.click(screen.getByRole('button', { name: /preview isometric/i }))

    expect(screen.getByText(/5 rooms across 2 floors/i)).toBeVisible()
  })
})
