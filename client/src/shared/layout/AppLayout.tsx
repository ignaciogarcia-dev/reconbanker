import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/features/user/hooks/useAuth'
import { Avatar, AvatarFallback } from '@/shared/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { LayoutDashboard, Building2, Building, GitMerge, ArrowDownUp, Code2, LogOut, Settings } from 'lucide-react'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { LanguageSelector } from '@/shared/layout/LanguageSelector'
import { ModeSelectDialog } from '@/features/user/components/ModeSelectDialog'
import { SettingsDialog } from '@/features/user/components/SettingsDialog'
import { useUser } from '@/features/user/hooks/useUser'
import { useSetOperationMode } from '@/features/user/hooks/useSetOperationMode'
import type { OperationMode } from '@/features/user/types'

export function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation(['common', 'user'])
  const { data: me } = useUser()
  const setMode = useSetOperationMode()
  const modalOpen = !!me && me.operationMode == null
  const [settingsOpen, setSettingsOpen] = useState(false)

  function handleModeConfirm(mode: OperationMode) {
    setMode.mutate(mode, {
      onSuccess: () => {
        navigate('/')
        toast.success(t('user:modeSelect.welcome'), {
          action: {
            label: t('user:modeSelect.welcomeAction'),
            onClick: () => navigate('/accounts'),
          },
        })
      },
    })
  }
  const containerRef = useRef<HTMLDivElement>(null)
  const [displayedText, setDisplayedText] = useState('')
  const [bubbleWidth, setBubbleWidth] = useState('1.5rem')
  const [isWiggling, setIsWiggling] = useState(false)
  const phraseIndexRef = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textMeasureRef = useRef<HTMLSpanElement>(null)

  const navItems = [
    { to: '/', label: t('nav.dashboard'), icon: LayoutDashboard },
    { to: '/banks', label: t('nav.banks'), icon: Building },
    { to: '/accounts', label: t('nav.accounts'), icon: Building2 },
    me?.operationMode !== 'passthrough' && {
      to: '/conciliations', label: t('nav.conciliations'), icon: GitMerge,
    },
    { to: '/movements', label: t('nav.movements'), icon: ArrowDownUp },
    { to: '/scripts', label: t('nav.scripts'), icon: Code2 },
  ].filter(Boolean) as { to: string; label: string; icon: typeof LayoutDashboard }[]

  const typePhrase = useCallback(() => {
    const phrases = t('mascot.phrases', { returnObjects: true }) as string[]
    const phrase = phrases[phraseIndexRef.current]
    let charIndex = 0

    setIsWiggling(true)
    setTimeout(() => setIsWiggling(false), 500)

    const typeNext = () => {
      if (charIndex <= phrase.length) {
        setDisplayedText(phrase.slice(0, charIndex))
        charIndex++
        timeoutRef.current = setTimeout(typeNext, 45)
      } else {
        // Pause, then erase
        timeoutRef.current = setTimeout(erasePhrase, 1800)
      }
    }

    const erasePhrase = () => {
      let len = phrase.length
      const eraseNext = () => {
        if (len >= 0) {
          setDisplayedText(phrase.slice(0, len))
          len--
          timeoutRef.current = setTimeout(eraseNext, 25)
        } else {
          phraseIndexRef.current = (phraseIndexRef.current + 1) % phrases.length
          timeoutRef.current = setTimeout(typePhrase, 400)
        }
      }
      eraseNext()
    }

    typeNext()
  }, [t])

  useEffect(() => {
    timeoutRef.current = setTimeout(typePhrase, 800)
    /* v8 ignore next 1 -- timeout is set synchronously above; the else branch is defensive. */
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [typePhrase])

  useEffect(() => {
    const el = textMeasureRef.current
    /* v8 ignore next 1 -- ref is attached on render; null guard is defensive. */
    if (!el) return
    const w = Math.min(el.scrollWidth + 24, 164)
    setBubbleWidth(displayedText.length === 0 ? '1.5rem' : `${w}px`)
  }, [displayedText])

  useEffect(() => {
    const el = containerRef.current
    /* v8 ignore next 1 -- ref is attached on render; null guard is defensive. */
    if (!el) return

    function handleMouseMove(e: MouseEvent) {
      el!.style.setProperty('--mouse-x', `${e.clientX}px`)
      el!.style.setProperty('--mouse-y', `${e.clientY}px`)
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div
      ref={containerRef}
      className="flex h-screen overflow-hidden relative"
      style={{
        background: 'oklch(0.08 0 0)',
        '--mouse-x': '50%',
        '--mouse-y': '50%',
      } as React.CSSProperties}
    >
      {/* Static ambient orbs */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden
      >
        <div
          className="absolute rounded-full opacity-30 blur-3xl"
          style={{
            width: 600,
            height: 600,
            top: '-15%',
            left: '-10%',
            background: 'radial-gradient(circle, oklch(0.25 0 0), transparent 70%)',
          }}
        />
        <div
          className="absolute rounded-full opacity-20 blur-3xl"
          style={{
            width: 500,
            height: 500,
            bottom: '-10%',
            right: '10%',
            background: 'radial-gradient(circle, oklch(0.2 0 0), transparent 70%)',
          }}
        />
      </div>

      {/* Mouse spotlight */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            'radial-gradient(600px circle at var(--mouse-x) var(--mouse-y), oklch(0.4 0 0 / 0.12), transparent 70%)',
        }}
      />

      {/* Sidebar */}
      <aside
        className="relative z-10 w-64 flex flex-col"
        style={{
          background: 'oklch(1 0 0 / 0.04)',
          backdropFilter: 'blur(20px) saturate(160%)',
          WebkitBackdropFilter: 'blur(20px) saturate(160%)',
          borderRight: '1px solid oklch(1 0 0 / 0.08)',
          boxShadow: 'inset -1px 0 0 oklch(1 0 0 / 0.04), 4px 0 24px oklch(0 0 0 / 0.3)',
        }}
      >
        {/* Logo */}
        <div
          className="p-6 flex items-center gap-3"
          style={{ borderBottom: '1px solid oklch(1 0 0 / 0.07)' }}
        >
          <img
            src="/logo.png"
            alt="ReconBanker"
            className={`w-9 h-9 ${isWiggling ? 'mascot-wiggle' : ''}`}
          />

          {/* Speech bubble */}
          <div
            className="relative h-7 border rounded-md flex items-center px-2 overflow-hidden transition-[width] duration-5"
            style={{
              borderColor: 'oklch(1 0 0 / 0.15)',
              background: 'oklch(1 0 0 / 0.04)',
              width: bubbleWidth,
            }}
          >
            {/* Hidden span to measure real text width */}
            <span
              ref={textMeasureRef}
              className="text-xs absolute invisible whitespace-nowrap pointer-events-none"
              aria-hidden
            >
              {displayedText}
            </span>
            {/* Tail */}
            <div
              className="absolute -left-[7px] top-1/2 -translate-y-1/2 w-0 h-0"
              style={{
                borderTop: '5px solid transparent',
                borderBottom: '5px solid transparent',
                borderRight: '7px solid oklch(1 0 0 / 0.15)',
              }}
            />
            <p className="text-xs whitespace-nowrap typing-cursor" style={{ color: 'oklch(0.75 0 0)' }}>
              {displayedText}
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${isActive ? 'active-nav-item' : 'inactive-nav-item'
                }`
              }
              style={({ isActive }) =>
                isActive
                  ? {
                    background: 'oklch(1 0 0 / 0.1)',
                    color: 'oklch(0.95 0 0)',
                    boxShadow:
                      'inset 0 0 0 1px oklch(1 0 0 / 0.15), 0 2px 12px oklch(0 0 0 / 0.3)',
                  }
                  : {
                    color: 'oklch(0.65 0 0)',
                  }
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className="size-4 shrink-0 transition-colors duration-200"
                    style={{ color: isActive ? 'oklch(0.9 0 0)' : undefined }}
                  />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Language selector */}
        <div style={{ borderTop: '1px solid oklch(1 0 0 / 0.07)' }}>
          <LanguageSelector />
        </div>

        {/* User */}
        <div
          className="p-3"
          style={{ borderTop: '1px solid oklch(1 0 0 / 0.07)' }}
        >
          <DropdownMenu>
            <DropdownMenuTrigger
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 outline-none"
              style={{ color: 'oklch(0.65 0 0)' }}
              onMouseEnter={(e) => {
                ; (e.currentTarget as HTMLElement).style.background = 'oklch(1 0 0 / 0.06)'
                  ; (e.currentTarget as HTMLElement).style.color = 'oklch(0.9 0 0)'
              }}
              onMouseLeave={(e) => {
                ; (e.currentTarget as HTMLElement).style.background = ''
                  ; (e.currentTarget as HTMLElement).style.color = 'oklch(0.65 0 0)'
              }}
            >
              <Avatar className="size-7 shrink-0">
                <AvatarFallback
                  className="text-xs font-semibold"
                  style={{
                    background: 'oklch(0.25 0 0)',
                    color: 'oklch(0.75 0 0)',
                    border: '1px solid oklch(1 0 0 / 0.15)',
                  }}
                >
                  {user?.name?.[0] ?? user?.email?.[0] ?? '?'}
                </AvatarFallback>
              </Avatar>
              <div className="text-left min-w-0">
                <p
                  className="text-sm font-medium leading-none truncate"
                  style={{ color: 'oklch(0.85 0 0)' }}
                >
                  {user?.name ?? 'Usuario'}
                </p>
                <p className="text-xs mt-0.5 truncate" style={{ color: 'oklch(0.5 0 0)' }}>
                  {user?.email}
                </p>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                <Settings className="size-4 mr-2" />
                {t('nav.settings')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="size-4 mr-2" />
                {t('nav.logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main content */}
      <main className="relative z-10 flex flex-1 flex-col overflow-auto" style={{ color: 'oklch(0.9 0 0)' }}>
        <Outlet />
      </main>

      <ModeSelectDialog
        open={modalOpen}
        onConfirm={handleModeConfirm}
        isPending={setMode.isPending}
      />

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}
