import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../App'

describe('cockpit shell', () => {
  it('renders the unified top bar and inspector shell', () => {
    render(<App />)

    expect(screen.getByRole('button', { name: /room view/i })).toBeVisible()
    expect(screen.getByRole('tab', { name: /properties/i })).toBeVisible()
  })

  it('switches the inspector into preview and export tools', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.click(screen.getByRole('tab', { name: /preview \/ export/i }))

    expect(screen.getByRole('button', { name: /preview isometric/i })).toBeVisible()
    expect(screen.getByRole('button', { name: /export workspace json/i })).toBeVisible()
  })

  it('switches the active scope from room to floor', async () => {
    const user = userEvent.setup()

    render(<App />)

    await user.click(screen.getByRole('button', { name: /floor view/i }))

    expect(screen.getByText(/3 rooms in view/i)).toBeVisible()
  })
})
