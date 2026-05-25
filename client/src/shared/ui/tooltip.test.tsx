import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/shared/ui/tooltip'

describe('Tooltip', () => {
  it('renders TooltipProvider with default delay=0 and passes children through', () => {
    render(
      <TooltipProvider>
        <span data-testid="ch">child</span>
      </TooltipProvider>
    )
    expect(screen.getByTestId('ch')).toBeInTheDocument()
  })

  it('allows custom delay on TooltipProvider', () => {
    render(
      <TooltipProvider delay={500}>
        <span data-testid="ch">child</span>
      </TooltipProvider>
    )
    expect(screen.getByTestId('ch')).toBeInTheDocument()
  })

  it('renders tooltip content when opened by default', async () => {
    render(
      <TooltipProvider>
        <Tooltip defaultOpen>
          <TooltipTrigger>hover me</TooltipTrigger>
          <TooltipContent className="c-tc">Hello</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
    expect(await screen.findByText('Hello')).toBeInTheDocument()
  })

  it('does not show content when not open', () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>hover me</TooltipTrigger>
          <TooltipContent>Hidden</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument()
  })
})
