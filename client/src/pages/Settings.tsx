import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { GitMerge, ArrowDownUp, AlertTriangle, UserRound, Settings2 } from 'lucide-react'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/shared/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/ui/tabs'
import { useUser, useSetOperationMode, type OperationMode } from '@/shared/_legacy/useUser'
import { cn } from '@/shared/lib/utils'

const MODE_OPTIONS = [
  { mode: 'reconcile' as const, icon: GitMerge, recommended: true },
  { mode: 'passthrough' as const, icon: ArrowDownUp, recommended: false },
]

const SECTIONS = [
  { key: 'general', icon: UserRound },
  { key: 'operation', icon: Settings2 },
] as const

export function Settings({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation()
  const { data: me } = useUser()
  const setMode = useSetOperationMode()

  const [expanded, setExpanded] = useState(false)
  const [selected, setSelected] = useState<OperationMode | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  function handleOpenChange(o: boolean) {
    if (!o) {
      setExpanded(false)
      setSelected(null)
      setConfirmOpen(false)
    }
    onOpenChange(o)
  }

  const currentMode = me?.operation_mode ?? null
  const initial = me?.name?.[0]?.toUpperCase() ?? me?.email?.[0]?.toUpperCase() ?? '?'

  function startEditing() {
    setSelected(currentMode)
    setExpanded(true)
  }

  function cancelEditing() {
    setExpanded(false)
    setSelected(null)
  }

  function confirmChange() {
    if (!selected) return
    setMode.mutate(selected, {
      onSuccess: () => {
        setConfirmOpen(false)
        setExpanded(false)
        setSelected(null)
        toast.success(t('settings.mode.saved'))
      },
      onError: () => {
        toast.error(t('settings.mode.saveError'))
      },
    })
  }

  const canSave = selected != null && selected !== currentMode

  const [cardHeight, setCardHeight] = useState(0)
  const roRef = useRef<ResizeObserver | null>(null)
  const activeCardRef = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect()
    roRef.current = null
    if (!el) return
    setCardHeight(el.offsetHeight)
    const ro = new ResizeObserver(() => setCardHeight(el.offsetHeight))
    ro.observe(el)
    roRef.current = ro
  }, [])
  useEffect(() => () => roRef.current?.disconnect(), [])

  const activeOption =
    MODE_OPTIONS.find(o => o.mode === currentMode) ?? MODE_OPTIONS[0]
  const backOption = MODE_OPTIONS.find(o => o.mode !== activeOption.mode)!

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="overflow-hidden border-0 p-0 ring-0 sm:!max-w-[860px]"
          style={{
            background: 'oklch(0.10 0 0 / 0.94)',
            backdropFilter: 'blur(28px) saturate(160%)',
            WebkitBackdropFilter: 'blur(28px) saturate(160%)',
            boxShadow:
              'inset 0 0 0 1px oklch(1 0 0 / 0.08), 0 24px 80px oklch(0 0 0 / 0.6)',
            color: 'oklch(0.92 0 0)',
            height: 'min(640px, 88vh)',
            width: 'calc(100% - 2rem)',
          }}
        >
          <DialogTitle className="sr-only">{t('settings.title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('settings.subtitle')}</DialogDescription>

          {/* Decorative top hairline */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{
              background:
                'linear-gradient(90deg, transparent, oklch(1 0 0 / 0.22), transparent)',
            }}
          />
          {/* Decorative orb */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-32 -right-24 size-64 rounded-full opacity-40 blur-3xl"
            style={{ background: 'radial-gradient(circle, oklch(0.5 0 0), transparent 70%)' }}
          />

          <Tabs
            defaultValue="general"
            orientation="vertical"
            className="relative grid h-full grid-cols-[220px_1fr] gap-0"
          >
            {/* Mini sidebar */}
            <aside
              className="flex h-full flex-col px-5 py-7"
              style={{
                background: 'oklch(1 0 0 / 0.025)',
                borderRight: '1px solid oklch(1 0 0 / 0.07)',
              }}
            >
              <div className="mb-7">
                <p
                  className="text-[10px] uppercase tracking-[0.28em]"
                  style={{ color: 'oklch(0.5 0 0)' }}
                >
                  {t('settings.title')}
                </p>
                <h2
                  className="mt-1 text-[20px] font-semibold leading-[1.1]"
                  style={{ color: 'oklch(0.98 0 0)', letterSpacing: '-0.01em' }}
                >
                  {me?.name?.split(' ')[0] ?? t('settings.profile.name')}
                </h2>
              </div>

              <TabsList
                variant="line"
                className="h-auto w-full flex-col items-stretch gap-1 border-0 bg-transparent p-0 shadow-none"
              >
                {SECTIONS.map(({ key, icon: Icon }) => (
                  <TabsTrigger
                    key={key}
                    value={key}
                    className={cn(
                      'group relative h-9 w-full flex-none justify-start rounded-md border-0 bg-transparent px-3 text-[12px] tracking-[0.04em] transition-all',
                      'hover:!bg-white/[0.05]',
                      'data-[active]:!bg-white/15 data-[active]:!shadow-[inset_0_0_0_1px_oklch(1_0_0_/_0.2)]',
                      'dark:data-[active]:!bg-white/15',
                    )}
                    style={{ color: 'oklch(0.6 0 0)' }}
                  >
                    <Icon
                      className="size-3.5 shrink-0 transition-colors group-data-[active]:text-[oklch(0.95_0_0)]"
                    />
                    <span className="ml-2 group-data-[active]:text-[oklch(0.95_0_0)]">
                      {t(`settings.tabs.${key}`)}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>

              {me && (
                <div
                  className="mt-auto flex items-center gap-3 rounded-lg p-2"
                  style={{
                    background: 'oklch(1 0 0 / 0.04)',
                    boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.07)',
                  }}
                >
                  <div
                    className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                    style={{
                      color: 'oklch(0.96 0 0)',
                      background: 'oklch(1 0 0 / 0.07)',
                      boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.1)',
                    }}
                  >
                    {initial}
                  </div>
                  <p className="min-w-0 truncate text-[11px]" style={{ color: 'oklch(0.6 0 0)' }}>
                    {me.email}
                  </p>
                </div>
              )}
            </aside>

            {/* Content */}
            <div className="relative h-full overflow-hidden">
              {!me ? (
                <div className="p-8 text-sm" style={{ color: 'oklch(0.6 0 0)' }}>
                  {t('settings.loading')}
                </div>
              ) : (
                <div className="flex h-full flex-col">
                  <TabsContent
                    value="general"
                    className="flex-1 overflow-y-auto px-8 py-7 outline-none data-[active]:flex data-[active]:flex-col"
                  >
                    <PaneHeader title={t('settings.tabs.general')} subtitle={t('settings.subtitle')} />

                    <div className="mt-6 grid gap-5 sm:grid-cols-2">
                      <Field label={t('settings.profile.name')}>
                        <Input value={me.name ?? ''} disabled className="settings-input" />
                      </Field>
                      <Field label={t('settings.profile.email')}>
                        <Input value={me.email} disabled className="settings-input" />
                      </Field>
                    </div>
                  </TabsContent>

                  <TabsContent
                    value="operation"
                    className="flex-1 overflow-y-auto px-8 py-7 outline-none data-[active]:flex data-[active]:flex-col"
                  >
                    <PaneHeader
                      title={t('settings.tabs.operation')}
                      subtitle={t('settings.mode.title')}
                    />

                    <div className="mt-6 space-y-4">
                      {/* Header row */}
                      <div className="flex items-start justify-between gap-4">
                        <p
                          className="text-[10px] uppercase tracking-[0.22em]"
                          style={{ color: 'oklch(0.5 0 0)' }}
                        >
                          {t('settings.mode.title')}
                        </p>
                        <Button
                          size="sm"
                          onClick={expanded ? cancelEditing : startEditing}
                          disabled={setMode.isPending}
                          className="shrink-0 border-0 text-[11px] uppercase tracking-[0.18em]"
                          style={{
                            background: 'oklch(1 0 0 / 0.06)',
                            color: 'oklch(0.92 0 0)',
                            boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.12)',
                          }}
                        >
                          {expanded ? t('settings.mode.cancel') : t('settings.mode.change')}
                        </Button>
                      </div>

                      {/* Stacked cards: SWAP — active (front) slides DOWN while back rises to take its exact spot */}
                      <div
                        className="relative transition-[height] duration-[500ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                        style={{
                          height: expanded
                            ? `${cardHeight * 2 + 18}px`
                            : `${cardHeight + 8}px`,
                        }}
                      >
                        {/* Back card: peek (top:0, scaled) → slides DOWN to active's old slot (top:8) */}
                        <div
                          className="absolute inset-x-0 z-10 origin-top transition-[top,transform,opacity] duration-[500ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                          style={{
                            top: expanded ? '8px' : '0px',
                            transform: expanded ? 'scale(1)' : 'scale(0.94)',
                            opacity: expanded ? 1 : 0.6,
                          }}
                        >
                          <ModeCard
                            mode={backOption.mode}
                            icon={backOption.icon}
                            recommended={backOption.recommended}
                            isCurrent={false}
                            isSelected={expanded && selected === backOption.mode}
                            interactive={expanded}
                            disabled={setMode.isPending}
                            onClick={() => setSelected(backOption.mode)}
                            t={t}
                          />
                        </div>

                        {/* Active card: visible slot (top:8) → slides DOWN below the back */}
                        <div
                          ref={activeCardRef}
                          className="absolute inset-x-0 z-20 transition-[top] duration-[500ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                          style={{
                            top: expanded ? `${cardHeight + 18}px` : '8px',
                          }}
                        >
                          <ModeCard
                            mode={activeOption.mode}
                            icon={activeOption.icon}
                            recommended={activeOption.recommended}
                            isCurrent
                            isSelected={expanded && selected === activeOption.mode}
                            interactive={expanded}
                            disabled={setMode.isPending}
                            onClick={() => setSelected(activeOption.mode)}
                            t={t}
                          />
                        </div>
                      </div>

                      {/* Save action — fade in/out */}
                      <div
                        className={cn(
                          'flex justify-end pt-1 transition-opacity duration-300 ease-out',
                          canSave ? 'opacity-100' : 'pointer-events-none opacity-0',
                        )}
                      >
                        <Button
                          onClick={() => setConfirmOpen(true)}
                          disabled={!canSave || setMode.isPending}
                          className="text-[11px] uppercase tracking-[0.18em]"
                          style={{
                            background: 'oklch(0.95 0 0)',
                            color: 'oklch(0.12 0 0)',
                          }}
                        >
                          {t('settings.mode.save')}
                        </Button>
                      </div>

                    </div>
                  </TabsContent>
                </div>
              )}
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={o => { if (!setMode.isPending) setConfirmOpen(o) }}>
        <DialogContent
          className="border-0"
          style={{
            background: 'oklch(0.11 0 0 / 0.95)',
            backdropFilter: 'blur(24px) saturate(160%)',
            WebkitBackdropFilter: 'blur(24px) saturate(160%)',
            boxShadow:
              'inset 0 0 0 1px oklch(0.55 0.18 28 / 0.35), 0 24px 80px oklch(0 0 0 / 0.6)',
            color: 'oklch(0.92 0 0)',
          }}
        >
          <DialogTitle className="flex items-center gap-2" style={{ color: 'oklch(0.78 0.16 28)' }}>
            <AlertTriangle className="size-4" />
            <span className="text-[16px] font-semibold" style={{ color: 'oklch(0.96 0 0)' }}>
              {t('settings.mode.confirmTitle')}
            </span>
          </DialogTitle>
          <div
            className="rounded-lg p-3 text-sm leading-relaxed"
            style={{
              background: 'oklch(0.55 0.18 28 / 0.08)',
              boxShadow: 'inset 0 0 0 1px oklch(0.55 0.18 28 / 0.25)',
              color: 'oklch(0.85 0.05 28)',
            }}
          >
            {t('settings.mode.confirmBody')}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={setMode.isPending}
              className="text-[11px] uppercase tracking-[0.18em]"
              style={{ color: 'oklch(0.65 0 0)' }}
            >
              {t('settings.mode.confirmCancel')}
            </Button>
            <Button
              onClick={confirmChange}
              disabled={setMode.isPending}
              className="text-[11px] uppercase tracking-[0.18em]"
              style={{ background: 'oklch(0.58 0.2 28)', color: 'oklch(0.98 0 0)' }}
            >
              {setMode.isPending ? t('settings.mode.saving') : t('settings.mode.confirmConfirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function PaneHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="space-y-1">
      <p
        className="text-[10px] uppercase tracking-[0.28em]"
        style={{ color: 'oklch(0.5 0 0)' }}
      >
        {subtitle}
      </p>
      <h3
        className="text-[22px] font-semibold leading-[1.1]"
        style={{ color: 'oklch(0.98 0 0)', letterSpacing: '-0.01em' }}
      >
        {title}
      </h3>
    </div>
  )
}

function ModeCard({
  mode,
  icon: Icon,
  recommended,
  isCurrent,
  isSelected,
  interactive,
  disabled,
  onClick,
  t,
}: {
  mode: OperationMode
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  recommended: boolean
  isCurrent: boolean
  isSelected: boolean
  interactive: boolean
  disabled: boolean
  onClick: () => void
  t: (k: string) => string
}) {
  return (
    <button
      type="button"
      disabled={!interactive || disabled}
      aria-pressed={isSelected}
      onClick={onClick}
      className={cn(
        'w-full rounded-xl p-4 text-left transition-all duration-200',
        interactive ? 'cursor-pointer' : 'cursor-default',
      )}
      style={{
        background: isSelected ? 'oklch(1 0 0 / 0.08)' : 'oklch(0.13 0 0 / 0.95)',
        boxShadow: isSelected
          ? 'inset 0 0 0 1px oklch(0.95 0 0 / 0.6), 0 8px 24px oklch(0 0 0 / 0.4)'
          : 'inset 0 0 0 1px oklch(1 0 0 / 0.09), 0 8px 24px oklch(0 0 0 / 0.4)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex size-9 items-center justify-center rounded-lg"
          style={{
            background: 'oklch(1 0 0 / 0.06)',
            boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.08)',
          }}
        >
          <Icon className="size-4" style={{ color: 'oklch(0.92 0 0)' }} />
        </span>
        <span className="text-[14px] font-semibold" style={{ color: 'oklch(0.96 0 0)' }}>
          {t(`modeSelect.${mode}.title`)}
        </span>
        {isCurrent && (
          <Badge
            variant="secondary"
            className="text-[9px] uppercase tracking-[0.18em]"
            style={{
              background: 'oklch(1 0 0 / 0.08)',
              color: 'oklch(0.85 0 0)',
              border: '1px solid oklch(1 0 0 / 0.1)',
            }}
          >
            {t('settings.mode.current')}
          </Badge>
        )}
        {recommended && !isCurrent && (
          <Badge variant="secondary" className="text-[9px] uppercase tracking-[0.18em]">
            {t('modeSelect.reconcile.recommended')}
          </Badge>
        )}
        {interactive && (
          <span
            className="ml-auto size-4 shrink-0 rounded-full border-[1.5px] transition-colors"
            style={{
              borderColor: isSelected ? 'oklch(0.95 0 0)' : 'oklch(0.5 0 0)',
              background: isSelected ? 'oklch(0.95 0 0)' : 'transparent',
            }}
          />
        )}
      </div>
      <p className="mt-2 text-xs leading-relaxed" style={{ color: 'oklch(0.65 0 0)' }}>
        {t(`modeSelect.${mode}.desc`)}
      </p>
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label
        className="text-[10px] uppercase tracking-[0.2em]"
        style={{ color: 'oklch(0.5 0 0)' }}
      >
        {label}
      </Label>
      {children}
    </div>
  )
}
