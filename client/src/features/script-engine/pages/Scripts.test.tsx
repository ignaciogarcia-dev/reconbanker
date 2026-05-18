import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { server } from '../../../../tests/msw/server'
import { scriptEngineHandlers } from '../../../../tests/msw/handlers/scriptEngine'
import { renderWithProviders } from '../../../../tests/utils/render'
import { Scripts } from './Scripts'

describe('Scripts page', () => {
  beforeEach(() => {
    server.use(...scriptEngineHandlers)
  })

  it('renders script rows from the API', async () => {
    renderWithProviders(<Scripts />)
    await waitFor(() => {
      expect(screen.getByText('extract_transactions')).toBeInTheDocument()
    })
  })
})
