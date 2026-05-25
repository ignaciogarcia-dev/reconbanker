import { describe, it, expect } from 'vitest'
import { isValidElement } from 'react'
import { userPublicRoutes } from './routes'

describe('user/routes', () => {
  it('exports a non-empty React element fragment of public routes', () => {
    expect(isValidElement(userPublicRoutes)).toBe(true)
  })
})
