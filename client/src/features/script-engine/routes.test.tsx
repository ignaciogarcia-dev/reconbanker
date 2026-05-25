import { describe, it, expect, beforeEach } from 'vitest'
import { Routes } from 'react-router-dom'
import { screen, waitFor } from '@testing-library/react'
import { server } from '../../../tests/msw/server'
import { scriptEngineHandlers } from '../../../tests/msw/handlers/scriptEngine'
import { accountHandlers } from '../../../tests/msw/handlers/account'
import { renderWithProviders } from '../../../tests/utils/render'
import { scriptEngineRoutes } from './routes'

describe('scriptEngineRoutes', () => {
  beforeEach(() => {
    server.use(...scriptEngineHandlers, ...accountHandlers)
  })

  it('renders the Scripts page at /scripts', async () => {
    renderWithProviders(<Routes>{scriptEngineRoutes}</Routes>, {
      initialEntries: ['/scripts'],
    })
    await waitFor(() => {
      expect(screen.getByText('Scripts registrados')).toBeInTheDocument()
    })
  })
})
