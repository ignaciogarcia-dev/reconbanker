import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../tests/msw/server'
import { userHandlers } from '../../../../tests/msw/handlers/user'
import { renderWithProviders } from '../../../../tests/utils/render'
import { ModeGuard } from './ModeGuard'

function setup(initialMode: 'reconcile' | 'passthrough' | null) {
  server.use(
    http.get('/api/me', () =>
      HttpResponse.json({
        id: 'u-1',
        email: 'a@x',
        name: 'A',
        operation_mode: initialMode,
      })
    )
  )
  return renderWithProviders(
    <Routes>
      <Route
        path="/protected"
        element={
          <ModeGuard requires="reconcile">
            <div>PROTECTED</div>
          </ModeGuard>
        }
      />
      <Route path="/" element={<div>HOME</div>} />
    </Routes>,
    { initialEntries: ['/protected'] }
  )
}

describe('ModeGuard', () => {
  beforeEach(() => {
    server.use(...userHandlers)
  })

  it('renders children when the user mode matches', async () => {
    setup('reconcile')
    await waitFor(() => {
      expect(screen.getByText('PROTECTED')).toBeInTheDocument()
    })
  })

  it('renders children when the user has no mode set yet', async () => {
    setup(null)
    await waitFor(() => {
      expect(screen.getByText('PROTECTED')).toBeInTheDocument()
    })
  })

  it('redirects to "/" when the user mode does not match', async () => {
    setup('passthrough')
    await waitFor(() => {
      expect(screen.getByText('HOME')).toBeInTheDocument()
    })
  })

  it('renders nothing while loading', () => {
    setup('reconcile')
    expect(screen.queryByText('PROTECTED')).not.toBeInTheDocument()
    expect(screen.queryByText('HOME')).not.toBeInTheDocument()
  })
})
