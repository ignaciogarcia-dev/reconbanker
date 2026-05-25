import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import App from './App'

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState({}, '', '/login')
  })

  it('renders without crashing and shows the login page when unauthenticated', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
    })
  })
})
