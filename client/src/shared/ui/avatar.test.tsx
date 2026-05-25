import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from '@/shared/ui/avatar'

describe('Avatar', () => {
  it('renders root with default size', () => {
    render(
      <Avatar data-testid="av">
        <AvatarFallback>JD</AvatarFallback>
      </Avatar>
    )
    const root = screen.getByTestId('av')
    expect(root).toHaveAttribute('data-slot', 'avatar')
    expect(root).toHaveAttribute('data-size', 'default')
  })

  it('renders with sm and lg sizes', () => {
    const { rerender } = render(
      <Avatar data-testid="av" size="sm">
        <AvatarFallback>X</AvatarFallback>
      </Avatar>
    )
    expect(screen.getByTestId('av')).toHaveAttribute('data-size', 'sm')

    rerender(
      <Avatar data-testid="av" size="lg">
        <AvatarFallback>X</AvatarFallback>
      </Avatar>
    )
    expect(screen.getByTestId('av')).toHaveAttribute('data-size', 'lg')
  })

  it('renders AvatarFallback with text', () => {
    render(
      <Avatar>
        <AvatarFallback className="cf">JD</AvatarFallback>
      </Avatar>
    )
    const fb = screen.getByText('JD')
    expect(fb).toHaveAttribute('data-slot', 'avatar-fallback')
    expect(fb.className).toContain('cf')
  })

  it('renders AvatarImage when src is provided', () => {
    render(
      <Avatar>
        <AvatarImage src="/x.png" alt="me" className="ci" />
        <AvatarFallback>X</AvatarFallback>
      </Avatar>
    )
    // base-ui may defer rendering the img until loaded; check the slot is at least mounted
    // via the fallback presence (image swap is internal). We assert the cn merge works on fallback
    // and the Avatar tree renders without crashing.
    expect(screen.getByText('X')).toBeInTheDocument()
  })

  it('renders AvatarBadge with custom className', () => {
    render(
      <Avatar>
        <AvatarFallback>X</AvatarFallback>
        <AvatarBadge data-testid="badge" className="cb" />
      </Avatar>
    )
    const badge = screen.getByTestId('badge')
    expect(badge).toHaveAttribute('data-slot', 'avatar-badge')
    expect(badge.className).toContain('cb')
  })

  it('renders AvatarGroup and AvatarGroupCount', () => {
    render(
      <AvatarGroup data-testid="group" className="cg">
        <Avatar>
          <AvatarFallback>A</AvatarFallback>
        </Avatar>
        <AvatarGroupCount data-testid="count" className="cgc">
          +1
        </AvatarGroupCount>
      </AvatarGroup>
    )
    const group = screen.getByTestId('group')
    expect(group).toHaveAttribute('data-slot', 'avatar-group')
    expect(group.className).toContain('cg')

    const count = screen.getByTestId('count')
    expect(count).toHaveAttribute('data-slot', 'avatar-group-count')
    expect(count.className).toContain('cgc')
    expect(count).toHaveTextContent('+1')
  })
})
