import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FormField } from './FormField'
import { Input } from './input'

describe('FormField', () => {
  it('renders the label linked to the input', () => {
    render(
      <FormField label="Email" htmlFor="email">
        <Input id="email" />
      </FormField>
    )
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('shows the hint when there is no error', () => {
    render(
      <FormField label="Email" hint="We never share it">
        <Input />
      </FormField>
    )
    expect(screen.getByText('We never share it')).toBeInTheDocument()
  })

  it('replaces the hint with the error message', () => {
    render(
      <FormField label="Email" hint="We never share it" error="Required">
        <Input />
      </FormField>
    )
    expect(screen.getByText('Required')).toBeInTheDocument()
    expect(screen.queryByText('We never share it')).not.toBeInTheDocument()
  })

  it('renders a required asterisk', () => {
    render(
      <FormField label="Email" required>
        <Input />
      </FormField>
    )
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('exposes the help paragraph under the given helpId for aria-describedby', () => {
    render(
      <FormField label="Email" helpId="email-help" error="Required">
        <Input aria-describedby="email-help" />
      </FormField>
    )
    expect(document.getElementById('email-help')).toHaveTextContent('Required')
  })
})
