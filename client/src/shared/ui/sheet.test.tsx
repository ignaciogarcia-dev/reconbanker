import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/shared/ui/sheet'

describe('Sheet', () => {
  it('opens by default and renders header/title/description/footer', async () => {
    render(
      <Sheet defaultOpen>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent className="c-c">
          <SheetHeader className="c-h" data-testid="header">
            <SheetTitle className="c-t">Title</SheetTitle>
            <SheetDescription className="c-d">Desc</SheetDescription>
          </SheetHeader>
          <SheetFooter className="c-f" data-testid="footer">
            <SheetClose>Close me</SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    )
    expect(await screen.findByText('Title')).toBeInTheDocument()
    expect(screen.getByText('Desc')).toBeInTheDocument()
    expect(screen.getByText('Close me')).toBeInTheDocument()
    expect(screen.getByTestId('header')).toHaveAttribute(
      'data-slot',
      'sheet-header'
    )
    expect(screen.getByTestId('footer')).toHaveAttribute(
      'data-slot',
      'sheet-footer'
    )
  })

  it('renders the X close button by default and omits it when showCloseButton=false', async () => {
    const { rerender } = render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetTitle>Title</SheetTitle>
          <SheetDescription>Desc</SheetDescription>
        </SheetContent>
      </Sheet>
    )
    expect(await screen.findByText('Close')).toBeInTheDocument()

    rerender(
      <Sheet defaultOpen>
        <SheetContent showCloseButton={false}>
          <SheetTitle>Title2</SheetTitle>
          <SheetDescription>Desc2</SheetDescription>
        </SheetContent>
      </Sheet>
    )
    expect(await screen.findByText('Title2')).toBeInTheDocument()
    expect(screen.queryByText('Close')).not.toBeInTheDocument()
  })

  it('opens via SheetTrigger click and applies side="left"', async () => {
    const user = userEvent.setup()
    render(
      <Sheet>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent side="left" data-testid="content">
          <SheetTitle>Title</SheetTitle>
          <SheetDescription>Desc</SheetDescription>
        </SheetContent>
      </Sheet>
    )
    expect(screen.queryByText('Title')).not.toBeInTheDocument()
    await user.click(screen.getByText('Open'))
    expect(await screen.findByText('Title')).toBeInTheDocument()
    expect(screen.getByTestId('content')).toHaveAttribute('data-side', 'left')
  })
})
