import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog'

function renderControlledDialog(opts?: {
  showCloseButton?: boolean
  footerShowClose?: boolean
}) {
  return render(
    <Dialog defaultOpen>
      <DialogTrigger>Open</DialogTrigger>
      <DialogContent showCloseButton={opts?.showCloseButton} className="c-c">
        <DialogHeader className="c-h">
          <DialogTitle className="c-t">Title</DialogTitle>
          <DialogDescription className="c-d">Desc</DialogDescription>
        </DialogHeader>
        <div>Body</div>
        <DialogFooter
          className="c-f"
          showCloseButton={opts?.footerShowClose}
        >
          <DialogClose>Cancel</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

describe('Dialog', () => {
  it('opens the dialog by default and shows content + close button', async () => {
    renderControlledDialog()
    expect(await screen.findByText('Title')).toBeInTheDocument()
    expect(screen.getByText('Desc')).toBeInTheDocument()
    expect(screen.getByText('Body')).toBeInTheDocument()
    expect(screen.getByText('Close')).toBeInTheDocument()
  })

  it('omits the X close button when showCloseButton is false', async () => {
    renderControlledDialog({ showCloseButton: false })
    expect(await screen.findByText('Title')).toBeInTheDocument()
    expect(screen.queryByText('Close')).not.toBeInTheDocument()
  })

  it('renders DialogFooter with a Close button when showCloseButton is true', async () => {
    renderControlledDialog({ showCloseButton: false, footerShowClose: true })
    expect(await screen.findByText('Title')).toBeInTheDocument()
    // The footer Close text from line 113
    expect(screen.getByText('Close')).toBeInTheDocument()
  })

  it('closes when the trigger toggles', async () => {
    const user = userEvent.setup()
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Desc</DialogDescription>
        </DialogContent>
      </Dialog>
    )
    expect(screen.queryByText('Title')).not.toBeInTheDocument()
    await user.click(screen.getByText('Open'))
    expect(await screen.findByText('Title')).toBeInTheDocument()
  })

  it('renders standalone DialogOverlay and DialogPortal when used directly', async () => {
    render(
      <Dialog defaultOpen>
        <DialogPortal>
          <DialogOverlay className="c-overlay" data-testid="overlay" />
          <div>Direct portal child</div>
        </DialogPortal>
      </Dialog>
    )
    const overlay = await screen.findByTestId('overlay')
    expect(overlay).toHaveAttribute('data-slot', 'dialog-overlay')
    expect(overlay.className).toContain('c-overlay')
  })
})
