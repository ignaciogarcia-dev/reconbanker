import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, render, renderHook, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from '@/shared/ui/sidebar'
import { TooltipProvider } from '@/shared/ui/tooltip'

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  })
}

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

describe('Sidebar primitives', () => {
  beforeEach(() => {
    setViewport(1280)
    mockMatchMedia(false)
    document.cookie = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('useSidebar throws when used outside a SidebarProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useSidebar())).toThrow(
      /useSidebar must be used within a SidebarProvider/
    )
    spy.mockRestore()
  })

  it('SidebarProvider provides context and exposes state to consumers', () => {
    const Probe = () => {
      const ctx = useSidebar()
      return (
        <div>
          <span data-testid="state">{ctx.state}</span>
          <span data-testid="open">{String(ctx.open)}</span>
          <span data-testid="mobile">{String(ctx.isMobile)}</span>
        </div>
      )
    }
    render(
      <SidebarProvider>
        <Probe />
      </SidebarProvider>
    )
    expect(screen.getByTestId('state')).toHaveTextContent('expanded')
    expect(screen.getByTestId('open')).toHaveTextContent('true')
  })

  it('SidebarProvider supports controlled open/onOpenChange', async () => {
    const onOpenChange = vi.fn()
    const Probe = () => {
      const ctx = useSidebar()
      return (
        <button data-testid="t" onClick={() => ctx.setOpen(!ctx.open)}>
          {ctx.state}
        </button>
      )
    }
    render(
      <SidebarProvider open={true} onOpenChange={onOpenChange}>
        <Probe />
      </SidebarProvider>
    )
    expect(screen.getByTestId('t')).toHaveTextContent('expanded')
    await userEvent.setup().click(screen.getByTestId('t'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('SidebarProvider ignores keydown events that are not the shortcut', async () => {
    const Probe = () => {
      const ctx = useSidebar()
      return <span data-testid="open">{String(ctx.open)}</span>
    }
    render(
      <SidebarProvider>
        <Probe />
      </SidebarProvider>
    )
    expect(screen.getByTestId('open')).toHaveTextContent('true')
    await act(async () => {
      // Not the shortcut key
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }))
      // The shortcut key without any modifier
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }))
    })
    expect(screen.getByTestId('open')).toHaveTextContent('true')
  })

  it('SidebarProvider toggles via the Ctrl+B keyboard shortcut', async () => {
    const Probe = () => {
      const ctx = useSidebar()
      return <span data-testid="open">{String(ctx.open)}</span>
    }
    render(
      <SidebarProvider>
        <Probe />
      </SidebarProvider>
    )
    expect(screen.getByTestId('open')).toHaveTextContent('true')
    await act(async () => {
      const e = new KeyboardEvent('keydown', { key: 'b', ctrlKey: true })
      window.dispatchEvent(e)
    })
    expect(screen.getByTestId('open')).toHaveTextContent('false')
    await act(async () => {
      const e = new KeyboardEvent('keydown', { key: 'b', metaKey: true })
      window.dispatchEvent(e)
    })
    expect(screen.getByTestId('open')).toHaveTextContent('true')
  })

  it('SidebarTrigger toggles open state and forwards onClick', async () => {
    const onClick = vi.fn()
    const Probe = () => {
      const ctx = useSidebar()
      return <span data-testid="open">{String(ctx.open)}</span>
    }
    render(
      <SidebarProvider>
        <SidebarTrigger onClick={onClick} />
        <Probe />
      </SidebarProvider>
    )
    expect(screen.getByTestId('open')).toHaveTextContent('true')
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /toggle sidebar/i }))
    expect(onClick).toHaveBeenCalled()
    expect(screen.getByTestId('open')).toHaveTextContent('false')
  })

  it('renders Sidebar with collapsible="none" on desktop', () => {
    render(
      <SidebarProvider>
        <Sidebar collapsible="none" className="c-side">
          <div>content-none</div>
        </Sidebar>
      </SidebarProvider>
    )
    expect(screen.getByText('content-none')).toBeInTheDocument()
    const root = screen.getByText('content-none').parentElement
    expect(root).toHaveAttribute('data-slot', 'sidebar')
    expect(root?.className).toContain('c-side')
  })

  it('renders default desktop Sidebar with side/variant attributes', () => {
    render(
      <SidebarProvider>
        <Sidebar side="right" variant="floating" className="c-side">
          <div>desktop</div>
        </Sidebar>
      </SidebarProvider>
    )
    expect(screen.getByText('desktop')).toBeInTheDocument()
    const root = document.querySelector('[data-slot="sidebar"]')
    expect(root).toHaveAttribute('data-side', 'right')
    expect(root).toHaveAttribute('data-variant', 'floating')
  })

  it('renders inset variant sidebar', () => {
    render(
      <SidebarProvider>
        <Sidebar variant="inset">
          <div>inset</div>
        </Sidebar>
      </SidebarProvider>
    )
    const root = document.querySelector('[data-slot="sidebar"]')
    expect(root).toHaveAttribute('data-variant', 'inset')
  })

  it('renders desktop Sidebar with data-collapsible when collapsed', () => {
    render(
      <SidebarProvider open={false}>
        <Sidebar collapsible="icon">
          <div>collapsed</div>
        </Sidebar>
      </SidebarProvider>
    )
    const root = document.querySelector('[data-slot="sidebar"]')
    expect(root).toHaveAttribute('data-state', 'collapsed')
    expect(root).toHaveAttribute('data-collapsible', 'icon')
  })

  it('SidebarMenuButton tooltip stays hidden when sidebar is expanded', () => {
    // state !== "collapsed" -> hidden = true (covers the false branch of the OR)
    render(
      <TooltipProvider>
        <SidebarProvider open={true}>
          <SidebarMenuButton tooltip="visible-tip">btnX</SidebarMenuButton>
        </SidebarProvider>
      </TooltipProvider>
    )
    expect(screen.getByText('btnX')).toBeInTheDocument()
  })

  it('SidebarMenuButton tooltip becomes visible when collapsed on desktop', () => {
    // state === "collapsed" AND !isMobile -> hidden = false (covers both sides of the OR being false)
    render(
      <TooltipProvider>
        <SidebarProvider open={false}>
          <SidebarMenuButton tooltip="collapsed-tip">btnCol</SidebarMenuButton>
        </SidebarProvider>
      </TooltipProvider>
    )
    expect(screen.getByText('btnCol')).toBeInTheDocument()
  })

  it('renders mobile Sidebar with a Sheet when isMobile is true', async () => {
    setViewport(500)
    mockMatchMedia(true)
    const OpenMobile = () => {
      const ctx = useSidebar()
      return (
        <button data-testid="om" onClick={() => ctx.setOpenMobile(true)}>
          open-mobile
        </button>
      )
    }
    render(
      <SidebarProvider>
        <OpenMobile />
        <Sidebar>
          <div>mobile-child</div>
        </Sidebar>
      </SidebarProvider>
    )
    await userEvent.setup().click(screen.getByTestId('om'))
    // The Sheet popup mounts on open and renders the sidebar children.
    expect(await screen.findByText('mobile-child')).toBeInTheDocument()
  })

  it('toggleSidebar uses mobile open/close when in mobile mode', async () => {
    setViewport(500)
    mockMatchMedia(true)
    const Probe = () => {
      const ctx = useSidebar()
      return (
        <>
          <span data-testid="om">{String(ctx.openMobile)}</span>
          <button data-testid="t" onClick={ctx.toggleSidebar}>
            toggle
          </button>
        </>
      )
    }
    render(
      <SidebarProvider>
        <Probe />
      </SidebarProvider>
    )
    expect(screen.getByTestId('om')).toHaveTextContent('false')
    await userEvent.setup().click(screen.getByTestId('t'))
    expect(screen.getByTestId('om')).toHaveTextContent('true')
  })

  it('SidebarRail toggles the sidebar', async () => {
    const Probe = () => {
      const ctx = useSidebar()
      return <span data-testid="open">{String(ctx.open)}</span>
    }
    render(
      <SidebarProvider>
        <SidebarRail data-testid="rail" />
        <Probe />
      </SidebarProvider>
    )
    expect(screen.getByTestId('open')).toHaveTextContent('true')
    await userEvent.setup().click(screen.getByTestId('rail'))
    expect(screen.getByTestId('open')).toHaveTextContent('false')
  })

  it('renders SidebarInset, SidebarInput, SidebarHeader, SidebarFooter, SidebarSeparator', () => {
    render(
      <SidebarProvider>
        <SidebarInset data-testid="inset" className="c-i">
          <SidebarInput data-testid="input" className="c-in" />
          <SidebarHeader data-testid="hdr" className="c-h" />
          <SidebarFooter data-testid="ftr" className="c-f" />
          <SidebarSeparator data-testid="sep" className="c-sep" />
        </SidebarInset>
      </SidebarProvider>
    )
    expect(screen.getByTestId('inset')).toHaveAttribute(
      'data-slot',
      'sidebar-inset'
    )
    expect(screen.getByTestId('input')).toHaveAttribute(
      'data-sidebar',
      'input'
    )
    expect(screen.getByTestId('hdr')).toHaveAttribute(
      'data-slot',
      'sidebar-header'
    )
    expect(screen.getByTestId('ftr')).toHaveAttribute(
      'data-slot',
      'sidebar-footer'
    )
    expect(screen.getByTestId('sep')).toHaveAttribute(
      'data-slot',
      'sidebar-separator'
    )
  })

  it('renders SidebarContent, Group/GroupLabel/GroupAction/GroupContent', () => {
    render(
      <SidebarProvider>
        <SidebarContent data-testid="content" className="c-cnt">
          <SidebarGroup data-testid="grp" className="c-g">
            <SidebarGroupLabel className="c-gl">Label</SidebarGroupLabel>
            <SidebarGroupAction className="c-ga">A</SidebarGroupAction>
            <SidebarGroupContent
              data-testid="gc"
              className="c-gc"
            ></SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </SidebarProvider>
    )
    expect(screen.getByTestId('content')).toHaveAttribute(
      'data-slot',
      'sidebar-content'
    )
    expect(screen.getByTestId('grp')).toHaveAttribute(
      'data-slot',
      'sidebar-group'
    )
    expect(screen.getByText('Label')).toBeInTheDocument()
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByTestId('gc')).toHaveAttribute(
      'data-slot',
      'sidebar-group-content'
    )
  })

  it('renders SidebarMenu, MenuItem, MenuButton (default), MenuAction, MenuBadge', () => {
    render(
      <SidebarProvider>
        <SidebarMenu data-testid="menu">
          <SidebarMenuItem data-testid="item">
            <SidebarMenuButton className="c-mb">Item</SidebarMenuButton>
            <SidebarMenuAction className="c-ma" showOnHover>
              A
            </SidebarMenuAction>
            <SidebarMenuBadge data-testid="badge" className="c-bd">
              5
            </SidebarMenuBadge>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarProvider>
    )
    expect(screen.getByTestId('menu')).toHaveAttribute(
      'data-slot',
      'sidebar-menu'
    )
    expect(screen.getByTestId('item')).toHaveAttribute(
      'data-slot',
      'sidebar-menu-item'
    )
    expect(screen.getByText('Item')).toBeInTheDocument()
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByTestId('badge')).toHaveAttribute(
      'data-slot',
      'sidebar-menu-badge'
    )
  })

  it('SidebarMenuButton supports variants and sizes', () => {
    render(
      <SidebarProvider>
        <SidebarMenuButton
          variant="outline"
          size="lg"
          isActive
          className="c-btn"
        >
          Outline LG
        </SidebarMenuButton>
        <SidebarMenuButton size="sm">SM</SidebarMenuButton>
      </SidebarProvider>
    )
    expect(screen.getByText('Outline LG')).toBeInTheDocument()
    expect(screen.getByText('SM')).toBeInTheDocument()
  })

  it('SidebarMenuButton wraps in a Tooltip when tooltip prop is a string', () => {
    render(
      <TooltipProvider>
        <SidebarProvider>
          <SidebarMenuButton tooltip="Help">btn</SidebarMenuButton>
        </SidebarProvider>
      </TooltipProvider>
    )
    expect(screen.getByText('btn')).toBeInTheDocument()
  })

  it('SidebarMenuButton wraps in a Tooltip when tooltip prop is an object', () => {
    render(
      <TooltipProvider>
        <SidebarProvider>
          <SidebarMenuButton tooltip={{ children: 'tip' }}>
            btn2
          </SidebarMenuButton>
        </SidebarProvider>
      </TooltipProvider>
    )
    expect(screen.getByText('btn2')).toBeInTheDocument()
  })

  it('SidebarMenuSkeleton renders with and without icon', () => {
    render(
      <SidebarProvider>
        <SidebarMenuSkeleton data-testid="sk1" />
        <SidebarMenuSkeleton data-testid="sk2" showIcon />
      </SidebarProvider>
    )
    expect(screen.getByTestId('sk1')).toHaveAttribute(
      'data-slot',
      'sidebar-menu-skeleton'
    )
    expect(screen.getByTestId('sk2')).toHaveAttribute(
      'data-slot',
      'sidebar-menu-skeleton'
    )
    // sk2 has an icon skeleton inside
    expect(
      screen.getByTestId('sk2').querySelector('[data-sidebar="menu-skeleton-icon"]')
    ).not.toBeNull()
  })

  it('renders SidebarMenuSub, SubItem, SubButton (with sizes)', () => {
    render(
      <SidebarProvider>
        <SidebarMenuSub data-testid="sub" className="c-sub">
          <SidebarMenuSubItem data-testid="subi" className="c-subi">
            <SidebarMenuSubButton size="sm" className="c-sb1">
              Sub SM
            </SidebarMenuSubButton>
            <SidebarMenuSubButton size="md" isActive className="c-sb2">
              Sub MD
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        </SidebarMenuSub>
      </SidebarProvider>
    )
    expect(screen.getByTestId('sub')).toHaveAttribute(
      'data-slot',
      'sidebar-menu-sub'
    )
    expect(screen.getByTestId('subi')).toHaveAttribute(
      'data-slot',
      'sidebar-menu-sub-item'
    )
    expect(screen.getByText('Sub SM')).toBeInTheDocument()
    expect(screen.getByText('Sub MD')).toBeInTheDocument()
  })
})
