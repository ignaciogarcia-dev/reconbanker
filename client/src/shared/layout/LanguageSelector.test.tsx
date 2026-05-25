import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '@/shared/i18n'
import { renderWithProviders } from '../../../tests/utils/render'
import { LanguageSelector } from './LanguageSelector'

describe('LanguageSelector', () => {
  beforeEach(async () => {
    localStorage.removeItem('lang')
    await i18n.changeLanguage('es')
  })

  afterEach(async () => {
    await i18n.changeLanguage('es')
  })

  it('renders the language combobox with the current value', () => {
    renderWithProviders(<LanguageSelector />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('changes the language and persists it to localStorage when an option is picked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LanguageSelector />)

    await user.click(screen.getByRole('combobox'))
    const englishOption = await screen.findByRole('option', { name: 'English' })
    await user.click(englishOption)

    await waitFor(() => expect(i18n.language).toBe('en'))
    expect(localStorage.getItem('lang')).toBe('en')
  })

  it('falls back to the first language when the active language is not in the LANGUAGES list', async () => {
    await i18n.changeLanguage('fr')
    renderWithProviders(<LanguageSelector />)
    // Default first option in LANGUAGES is 'es' → label renders as 'es' (uppercase via CSS only).
    expect(screen.getByText('es')).toBeInTheDocument()
  })
})
