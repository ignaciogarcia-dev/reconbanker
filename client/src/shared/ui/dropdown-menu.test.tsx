import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'

function openMenu(ui: React.ReactElement) {
  return render(ui)
}

describe('DropdownMenu', () => {
  it('opens content when trigger is clicked and renders item with default variant', async () => {
    const user = userEvent.setup()
    openMenu(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent className="c-cnt">
          <DropdownMenuItem className="c-it">Item 1</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
    await user.click(screen.getByText('Open'))
    const item = await screen.findByText('Item 1')
    expect(item).toBeInTheDocument()
    expect(item).toHaveAttribute('data-slot', 'dropdown-menu-item')
    expect(item).toHaveAttribute('data-variant', 'default')
  })

  it('renders an item with destructive variant and inset', async () => {
    const user = userEvent.setup()
    openMenu(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem variant="destructive" inset>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
    await user.click(screen.getByText('Open'))
    const item = await screen.findByText('Delete')
    expect(item).toHaveAttribute('data-variant', 'destructive')
    expect(item).toHaveAttribute('data-inset', 'true')
  })

  it('renders group, label (with inset), separator, and shortcut', async () => {
    const user = userEvent.setup()
    openMenu(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuLabel className="c-l" inset>
              Group
            </DropdownMenuLabel>
            <DropdownMenuItem>
              Save
              <DropdownMenuShortcut className="c-s">⌘S</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator data-testid="sep" className="c-sp" />
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    )
    await user.click(screen.getByText('Open'))
    const label = await screen.findByText('Group')
    expect(label).toHaveAttribute('data-slot', 'dropdown-menu-label')
    expect(label).toHaveAttribute('data-inset', 'true')
    expect(screen.getByText('⌘S')).toHaveAttribute(
      'data-slot',
      'dropdown-menu-shortcut'
    )
    expect(screen.getByTestId('sep')).toHaveAttribute(
      'data-slot',
      'dropdown-menu-separator'
    )
  })

  it('renders checkbox items (checked and unchecked)', async () => {
    const user = userEvent.setup()
    openMenu(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem checked inset>
            Checked
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={false}>
            Unchecked
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
    await user.click(screen.getByText('Open'))
    expect(await screen.findByText('Checked')).toBeInTheDocument()
    expect(screen.getByText('Unchecked')).toBeInTheDocument()
  })

  it('renders radio group with radio items', async () => {
    const user = userEvent.setup()
    openMenu(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup value="a">
            <DropdownMenuRadioItem value="a" inset>
              A
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="b">B</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    )
    await user.click(screen.getByText('Open'))
    expect(await screen.findByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('renders a submenu via sub trigger / sub content', async () => {
    const user = userEvent.setup()
    openMenu(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger inset className="c-st">
              More
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="c-sc">
              <DropdownMenuItem>Nested</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    )
    await user.click(screen.getByText('Open'))
    const subTrigger = await screen.findByText('More')
    expect(subTrigger).toHaveAttribute(
      'data-slot',
      'dropdown-menu-sub-trigger'
    )
    expect(subTrigger).toHaveAttribute('data-inset', 'true')
    await user.hover(subTrigger)
    expect(await screen.findByText('Nested')).toBeInTheDocument()
  })

  it('uses DropdownMenuPortal export to wrap content', async () => {
    const user = userEvent.setup()
    openMenu(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuPortal>
          <div role="menu" aria-label="custom-portal">
            <DropdownMenu>
              <DropdownMenuTrigger>Inner</DropdownMenuTrigger>
            </DropdownMenu>
          </div>
        </DropdownMenuPortal>
      </DropdownMenu>
    )
    await user.click(screen.getByText('Open'))
    // Just confirms the portal wrapper renders without crashing.
    expect(screen.getByText('Open')).toBeInTheDocument()
  })
})
