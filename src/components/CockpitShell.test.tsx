import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from '../App'

describe('cockpit shell', () => {
  it('renders the unified top bar and inspector shell', () => {
    render(<App />)

    expect(screen.getByRole('button', { name: /room view/i })).toBeVisible()
    expect(screen.getByRole('tab', { name: /properties/i })).toBeVisible()
  })
})
