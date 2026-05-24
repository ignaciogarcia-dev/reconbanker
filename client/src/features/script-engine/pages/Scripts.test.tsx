import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { server } from '../../../../tests/msw/server'
import { scriptEngineHandlers } from '../../../../tests/msw/handlers/scriptEngine'
import { renderWithProviders } from '../../../../tests/utils/render'
import { Scripts } from './Scripts'

describe('Scripts page', () => {
  beforeEach(() => {
    server.use(...scriptEngineHandlers)
  })

  it('renders active scripts by default', async () => {
    renderWithProviders(<Scripts />)
    await waitFor(() => {
      expect(screen.getByText('2.0.1')).toBeInTheDocument()
      expect(screen.getByText('Activo')).toBeInTheDocument()
    })
    expect(screen.queryByText('Obsoleto')).not.toBeInTheDocument()
  })

  it('shows all scripts when the all tab is selected', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Scripts />)

    await waitFor(() => {
      expect(screen.getByText('2.0.1')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('tab', { name: 'Todos' }))

    await waitFor(() => {
      expect(screen.getByText('2.0.0')).toBeInTheDocument()
      expect(screen.getByText('Obsoleto')).toBeInTheDocument()
    })
  })
})
