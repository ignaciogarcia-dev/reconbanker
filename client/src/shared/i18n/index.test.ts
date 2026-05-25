import { describe, it, expect } from 'vitest'
import i18n from './index'

describe('i18n initialization', () => {
  it('sets <html lang> to the active language on load', () => {
    expect(document.documentElement.lang).toBe(i18n.language)
  })

  it('updates <html lang> when the language changes', async () => {
    const start = i18n.language
    const next = start === 'es' ? 'en' : 'es'
    await i18n.changeLanguage(next)
    expect(document.documentElement.lang).toBe(next)
    await i18n.changeLanguage(start)
    expect(document.documentElement.lang).toBe(start)
  })

  it('loads common namespace resources for both locales', () => {
    expect(i18n.getResource('es', 'common', 'nav.dashboard')).toBe('Dashboard')
    expect(i18n.getResource('en', 'common', 'nav.dashboard')).toBe('Dashboard')
  })
})
