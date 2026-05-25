import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card'

describe('Card', () => {
  it('renders all parts with default size', () => {
    render(
      <Card data-testid="card">
        <CardHeader data-testid="header">
          <CardTitle data-testid="title">Title</CardTitle>
          <CardDescription data-testid="desc">Desc</CardDescription>
          <CardAction data-testid="action">A</CardAction>
        </CardHeader>
        <CardContent data-testid="content">Content</CardContent>
        <CardFooter data-testid="footer">Footer</CardFooter>
      </Card>
    )
    expect(screen.getByTestId('card')).toHaveAttribute('data-slot', 'card')
    expect(screen.getByTestId('card')).toHaveAttribute('data-size', 'default')
    expect(screen.getByTestId('header')).toHaveAttribute(
      'data-slot',
      'card-header'
    )
    expect(screen.getByTestId('title')).toHaveAttribute(
      'data-slot',
      'card-title'
    )
    expect(screen.getByTestId('desc')).toHaveAttribute(
      'data-slot',
      'card-description'
    )
    expect(screen.getByTestId('action')).toHaveAttribute(
      'data-slot',
      'card-action'
    )
    expect(screen.getByTestId('content')).toHaveAttribute(
      'data-slot',
      'card-content'
    )
    expect(screen.getByTestId('footer')).toHaveAttribute(
      'data-slot',
      'card-footer'
    )
  })

  it('supports sm size on the Card root', () => {
    render(<Card data-testid="card" size="sm" />)
    expect(screen.getByTestId('card')).toHaveAttribute('data-size', 'sm')
  })

  it('merges custom className on each part', () => {
    render(
      <Card data-testid="card" className="c-card">
        <CardHeader data-testid="header" className="c-h" />
        <CardTitle data-testid="title" className="c-t" />
        <CardDescription data-testid="desc" className="c-d" />
        <CardAction data-testid="action" className="c-a" />
        <CardContent data-testid="content" className="c-c" />
        <CardFooter data-testid="footer" className="c-f" />
      </Card>
    )
    expect(screen.getByTestId('card').className).toContain('c-card')
    expect(screen.getByTestId('header').className).toContain('c-h')
    expect(screen.getByTestId('title').className).toContain('c-t')
    expect(screen.getByTestId('desc').className).toContain('c-d')
    expect(screen.getByTestId('action').className).toContain('c-a')
    expect(screen.getByTestId('content').className).toContain('c-c')
    expect(screen.getByTestId('footer').className).toContain('c-f')
  })
})
