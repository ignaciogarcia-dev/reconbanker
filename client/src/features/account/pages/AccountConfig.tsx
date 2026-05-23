import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { cn } from '@/shared/lib/utils'
import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { ArrowLeft, Save, Info, Trash2, AlertTriangle, RotateCcw, ShieldAlert, Check, Bell, BellOff, TrendingDown, Lock, FileCheck, Settings as SettingsIcon, Terminal, KeyRound, Activity, Webhook, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUser } from '@/features/user/hooks/useUser'
import { useAccount, useDeleteAccount, useRestartAccount } from '../hooks/useAccounts'
import { useAccountConfig, useUpsertAccountConfig } from '../hooks/useAccountConfig'
import type { AuthType, PollingMethod, SessionType, LoginMode } from '../types'

interface AccountConfigForm {
  pendingOrdersEndpoint: string
  webhookUrl: string
  pollingMethod: PollingMethod
  pollingBody: string
  authType: AuthType
  authToken: string
  bankUsername: string
  bankPassword: string
  webhookExtraFields: string
  silentIngestion: boolean
  sessionType: SessionType
  loginMode: LoginMode
}

const RESERVED_WEBHOOK_KEYS = ['external_id', 'status', 'amount', 'currency', 'name', 'id', 'received_at']

export function AccountConfig() {
  const { accountId } = useParams<{ accountId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation('account')
  const { data: me } = useUser()
  const mode = me?.operationMode
  const [form, setForm] = useState<AccountConfigForm>({
    pendingOrdersEndpoint: '',
    webhookUrl: '',
    pollingMethod: 'GET',
    pollingBody: '',
    authType: 'bearer',
    authToken: '',
    bankUsername: '',
    bankPassword: '',
    webhookExtraFields: '',
    silentIngestion: false,
    sessionType: 'one-shot',
    loginMode: 'simple',
  })
  const [saved, setSaved] = useState(false)
  const [extraFieldsError, setExtraFieldsError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>('credentials')

  const { data: account } = useAccount(accountId)
  const { data, isLoading } = useAccountConfig(accountId)

  useEffect(() => {
    if (!data) return
    // Hydrate the editable form from the loaded config snapshot.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(f => ({
      ...f,
      pendingOrdersEndpoint: data.pendingOrdersEndpoint ?? '',
      webhookUrl: data.webhookUrl ?? '',
      pollingMethod: data.pollingMethod,
      pollingBody: data.pollingBody ? JSON.stringify(data.pollingBody, null, 2) : '',
      authType: data.authType,
      authToken: data.authToken ?? '',
      bankUsername: data.bankUsername ?? '',
      bankPassword: '',
      webhookExtraFields: data.webhookExtraFields
        ? JSON.stringify(data.webhookExtraFields, null, 2)
        : '',
      silentIngestion: data.silentIngestion,
      sessionType: data.sessionType,
      loginMode: data.loginMode,
    }))
  }, [data])

  function validateExtraFields(): string | null {
    const raw = form.webhookExtraFields.trim()
    if (!raw) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return t('accountConfig.webhookExtraFieldsInvalidJson')
    }
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return t('accountConfig.webhookExtraFieldsMustBeObject')
    }
    const conflicts = Object.keys(parsed as object).filter(k => RESERVED_WEBHOOK_KEYS.includes(k))
    if (conflicts.length > 0) {
      return t('accountConfig.webhookExtraFieldsReserved', { keys: conflicts.join(', ') })
    }
    return null
  }

  const save = useUpsertAccountConfig(accountId ?? '')

  const remove = useDeleteAccount()

  const restart = useRestartAccount()

  function openDeleteDialog(open: boolean) {
    setDeleteOpen(open)
    if (!open) {
      setDeleteConfirmName('')
      setDeleteError(null)
    }
  }

  const confirmMatches = !!account && deleteConfirmName.trim() === account.name

  function parseJsonOrNull(raw: string): Record<string, unknown> | null {
    const trimmed = raw.trim()
    if (!trimmed) return null
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // Ignored — caller validates separately.
    }
    return null
  }

  function handleSave() {
    if (!accountId) return
    const err = validateExtraFields()
    setExtraFieldsError(err)
    if (err) return
    save.mutate(
      {
        pendingOrdersEndpoint: form.pendingOrdersEndpoint.trim() === '' ? null : form.pendingOrdersEndpoint,
        webhookUrl: form.webhookUrl,
        retryLimit: data?.retryLimit ?? 3,
        pollingMethod: form.pollingMethod,
        pollingBody: parseJsonOrNull(form.pollingBody),
        authType: form.authType,
        authToken: form.authToken === '' ? null : form.authToken,
        webhookAuthType: data?.webhookAuthType ?? null,
        webhookAuthToken: data?.webhookAuthToken ?? null,
        notifyOnExpired: data?.notifyOnExpired ?? false,
        webhookExtraFields: parseJsonOrNull(form.webhookExtraFields),
        silentIngestion: form.silentIngestion,
        sessionType: form.sessionType,
        loginMode: form.loginMode,
        bankUsername: form.bankUsername === '' ? null : form.bankUsername,
        bankPassword: form.bankPassword === '' ? null : form.bankPassword,
      },
      {
        onSuccess: () => {
          setSaved(true)
          setTimeout(() => setSaved(false), 2000)
        },
      }
    )
  }

  function handleDelete() {
    if (!accountId) return
    remove.mutate(
      { accountId, confirmationName: deleteConfirmName.trim() },
      {
        onSuccess: () => navigate('/accounts'),
        onError: (err: unknown) => {
          const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
          setDeleteError(message ?? t('accountConfig.danger.genericError'))
        },
      }
    )
  }

  function field<K extends keyof AccountConfigForm>(key: K) {
    return {
      value: String(form[key]),
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm(f => ({ ...f, [key]: e.target.value })),
    }
  }

  if (isLoading) return <div className="p-8 text-muted-foreground text-sm">{t('accountConfig.loading')}</div>

  return (
    <div className="px-6 lg:px-8 py-8 space-y-6 pb-28">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => navigate('/accounts')}>
            <ArrowLeft className="size-4 mr-1" />
            {t('accountConfig.back')}
          </Button>
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold">{t('accountConfig.title')}</h2>
            <p className="text-muted-foreground text-sm truncate">ID: {accountId}</p>
          </div>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => openDeleteDialog(true)}
          disabled={!account}
          className="gap-2 shrink-0"
        >
          <Trash2 className="size-4" />
          {t('accountConfig.danger.deleteButton')}
        </Button>
      </div>

      {/* Session blocked — fatal failure stopped automatic scraping/sessions */}
      {account?.scrapeBlockedReason && (
        <div className="relative overflow-hidden rounded-xl border border-destructive/30 bg-destructive/5">
          <div className="absolute inset-y-0 left-0 w-1 bg-destructive" />
          <div className="flex flex-col gap-4 p-5 pl-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <ShieldAlert className="size-5" />
              </div>
              <div className="space-y-1.5">
                <p className="font-semibold leading-none text-destructive">{t('accountConfig.blocked.title')}</p>
                <p className="text-sm text-muted-foreground">{t('accountConfig.blocked.description')}</p>
                <code className="mt-1 inline-block rounded bg-destructive/10 px-2 py-1 font-mono text-xs text-destructive">
                  {account.scrapeBlockedReason}
                </code>
                {account.scrapeBlockedAt && (
                  <p className="text-xs text-muted-foreground">
                    {t('accountConfig.blocked.since', { when: new Date(account.scrapeBlockedAt).toLocaleString() })}
                  </p>
                )}
              </div>
            </div>
            <Button
              variant="destructive"
              className="shrink-0 gap-2"
              disabled={restart.isPending}
              onClick={() => accountId && restart.mutate(accountId)}
            >
              <RotateCcw className={`size-4 ${restart.isPending ? 'animate-spin' : ''}`} />
              {restart.isPending ? t('accountConfig.blocked.restarting') : t('accountConfig.blocked.restart')}
            </Button>
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-6">
        <TabsList className="h-10 w-fit gap-1 p-1">
          <TabsTrigger value="credentials" className="flex-none gap-2 px-4">
            <KeyRound className="size-4" />
            {t('accountConfig.tabs.credentials')}
          </TabsTrigger>
          <TabsTrigger value="session" className="flex-none gap-2 px-4">
            <Activity className="size-4" />
            {t('accountConfig.tabs.session')}
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="flex-none gap-2 px-4">
            <Webhook className="size-4" />
            {t('accountConfig.tabs.webhooks')}
          </TabsTrigger>
          {mode === 'reconcile' && (
            <TabsTrigger value="auth-orders" className="flex-none gap-2 px-4">
              <ShieldCheck className="size-4" />
              {t('accountConfig.tabs.authOrders')}
            </TabsTrigger>
          )}
        </TabsList>

        {/* Bank credentials */}
        <TabsContent value="credentials" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t('accountConfig.bankCredentials')}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t('accountConfig.username')}</Label>
                <Input placeholder={t('accountConfig.usernamePlaceholder')} {...field('bankUsername')} />
              </div>
              <div className="space-y-2">
                <Label>{t('accountConfig.password')}</Label>
                <Input type="password" placeholder={t('accountConfig.passwordPlaceholder')} {...field('bankPassword')} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Session behaviour */}
        <TabsContent value="session" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t('accountConfig.session')}</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>{t('accountConfig.sessionType')}</Label>
                <RadioGroup
                  value={form.sessionType}
                  onValueChange={v => setForm(f => ({ ...f, sessionType: v as SessionType }))}
                  className="flex flex-col gap-3"
                >
                  <OptionCard
                    value="one-shot"
                    title={t('accountConfig.sessionTypeOneShot')}
                    description={t('accountConfig.sessionTypeOneShotDesc')}
                  />
                  <OptionCard
                    value="persistent"
                    title={t('accountConfig.sessionTypePersistent')}
                    description={t('accountConfig.sessionTypePersistentDesc')}
                  />
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label>{t('accountConfig.loginMode')}</Label>
                <RadioGroup
                  value={form.loginMode}
                  onValueChange={v => setForm(f => ({ ...f, loginMode: v as LoginMode }))}
                  className="flex flex-col gap-3"
                >
                  <OptionCard
                    value="simple"
                    title={t('accountConfig.loginModeSimple')}
                    description={t('accountConfig.loginModeSimpleDesc')}
                  />
                  <OptionCard
                    value="assisted"
                    title={t('accountConfig.loginModeAssisted')}
                    description={t('accountConfig.loginModeAssistedDesc')}
                  />
                </RadioGroup>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Webhooks */}
        <TabsContent value="webhooks" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('accountConfig.webhooks')}</CardTitle>
              <CardAction>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        type="button"
                        aria-pressed={form.silentIngestion}
                        aria-label={t(
                          form.silentIngestion
                            ? 'accountConfig.notificationsSilenced'
                            : 'accountConfig.notificationsActive',
                        )}
                        onClick={() => setForm(f => ({ ...f, silentIngestion: !f.silentIngestion }))}
                      >
                        {form.silentIngestion ? <BellOff className="size-4" /> : <Bell className="size-4" />}
                      </Button>
                    }
                  />
                  <TooltipContent className="max-w-xs text-left">
                    {t('accountConfig.silentIngestionDesc')}
                  </TooltipContent>
                </Tooltip>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border border-border bg-muted/40 p-3 flex gap-2 text-sm text-foreground">
                <Info className="size-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium mb-1">{t('accountConfig.webhookPayload')}</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    {mode === 'reconcile'
                      ? t('accountConfig.webhookPayloadDesc')
                      : t('accountConfig.webhookPayloadPassthroughDesc')}
                  </p>
                  <pre className="text-xs bg-background rounded p-2 font-mono whitespace-pre-wrap">
                    {mode === 'reconcile'
                      ? `{
  "external_id": "order-123",
  "amount": 1500.00,
  "currency": "UYU",
  "name": "Juan Pérez"
}`
                      : `{
  "id": "uuid-del-movimiento",
  "amount": 1500.00,
  "currency": "UYU",
  "name": "Juan Pérez",
  "received_at": "2026-04-24T12:00:00.000Z"
}`}
                  </pre>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t('accountConfig.webhookUrl')}</Label>
                <Input placeholder="https://..." {...field('webhookUrl')} />
              </div>
              <div className="space-y-2">
                <Label>{t('accountConfig.webhookExtraFields')}</Label>
                <p className="text-xs text-muted-foreground">{t('accountConfig.webhookExtraFieldsDesc')}</p>
                <textarea
                  className="w-full min-h-24 rounded-md border bg-transparent px-3 py-2 text-sm font-mono resize-y"
                  placeholder='{"source": "reconbanker"}'
                  value={form.webhookExtraFields}
                  onChange={e => {
                    setForm(f => ({ ...f, webhookExtraFields: e.target.value }))
                    if (extraFieldsError) setExtraFieldsError(null)
                  }}
                />
                {extraFieldsError && (
                  <p className="text-xs text-destructive">{extraFieldsError}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Auth & Orders (reconcile mode only) */}
        {mode === 'reconcile' && (
          <TabsContent value="auth-orders" className="space-y-6">
            <Card>
              <CardHeader><CardTitle>{t('accountConfig.auth')}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('accountConfig.authType')}</Label>
                  <Select
                    value={form.authType}
                    onValueChange={v => setForm(f => ({ ...f, authType: v as AuthType }))}
                  >
                    <SelectTrigger>
                      <SelectValue>{form.authType === 'bearer' ? 'Bearer token' : 'API Key'}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bearer">Bearer token</SelectItem>
                      <SelectItem value="api_key">API Key</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('accountConfig.tokenKey')}</Label>
                  <Input type="password" {...field('authToken')} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>{t('accountConfig.orderIngestion')}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-md border border-border bg-muted/40 p-3 flex gap-2 text-sm text-foreground">
                  <Info className="size-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium mb-1">{t('accountConfig.endpointFormat')}</p>
                    <p className="text-xs text-muted-foreground mb-2">{t('accountConfig.endpointFormatDesc')}</p>
                    <pre className="text-xs bg-background rounded p-2 font-mono whitespace-pre-wrap">{`[
  {
    "external_id": "order-123",
    "amount": 1500.00,
    "currency": "UYU",
    "name": "Juan Pérez"
  }
]`}</pre>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t('accountConfig.pendingEndpoint')}</Label>
                  <Input placeholder="https://..." {...field('pendingOrdersEndpoint')} />
                </div>
                <div className="space-y-2">
                  <Label>{t('accountConfig.httpMethod')}</Label>
                  <Select
                    value={form.pollingMethod}
                    onValueChange={v => setForm(f => ({ ...f, pollingMethod: v as PollingMethod }))}
                  >
                    <SelectTrigger>
                      <SelectValue>{form.pollingMethod}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GET">GET</SelectItem>
                      <SelectItem value="POST">POST</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.pollingMethod === 'POST' && (
                  <div className="space-y-2">
                    <Label>{t('accountConfig.body')}</Label>
                    <textarea
                      className="w-full min-h-24 rounded-md border bg-transparent px-3 py-2 text-sm font-mono resize-y"
                      placeholder='{"key": "value"}'
                      {...field('pollingBody')}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Sticky save bar — stays visible regardless of active tab */}
      <div className="sticky bottom-0 -mx-6 lg:-mx-8 mt-2 border-t border-border/60 bg-background/80 px-6 lg:px-8 py-3 supports-backdrop-filter:backdrop-blur">
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={save.isPending} className="gap-2">
            <Save className="size-4" />
            {save.isPending ? t('accountConfig.saving') : saved ? t('accountConfig.saved') : t('accountConfig.save')}
          </Button>
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={openDeleteDialog}>
        <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden">
          <DialogHeader className="gap-1.5 px-5 py-4">
            <DialogTitle className="text-destructive flex items-center gap-2.5 text-base font-semibold tracking-tight">
              <AlertTriangle className="size-5" strokeWidth={2.25} />
              {t('accountConfig.danger.dialogTitle')}
            </DialogTitle>
            <p className="text-xs text-destructive/80 pl-[1.875rem]">
              {t('accountConfig.danger.dialogSubtitle')}
            </p>
          </DialogHeader>

          <div className="px-5 py-5 space-y-5">
            <div className="space-y-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
                {t('accountConfig.danger.impactHeading')}
              </p>
              <ul className="space-y-2">
                {[
                  { Icon: TrendingDown, label: t('accountConfig.danger.itemMovements') },
                  { Icon: Lock, label: t('accountConfig.danger.itemCredentials') },
                  { Icon: FileCheck, label: t('accountConfig.danger.itemConciliations') },
                  { Icon: SettingsIcon, label: t('accountConfig.danger.itemConfig') },
                  { Icon: Terminal, label: t('accountConfig.danger.itemScrapeLogs') },
                ].map(({ Icon, label }) => (
                  <li key={label} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <Icon className="size-4 mt-0.5 shrink-0 text-muted-foreground/70" strokeWidth={1.75} />
                    <span className="leading-snug">{label}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">
                {t('accountConfig.danger.typeToConfirmShort')}
              </Label>
              <div className="relative">
                <Input
                  value={deleteConfirmName}
                  onChange={e => {
                    setDeleteConfirmName(e.target.value)
                    if (deleteError) setDeleteError(null)
                  }}
                  placeholder={account?.name ?? ''}
                  aria-invalid={!!deleteError || undefined}
                  aria-label={t('accountConfig.danger.nameLabel')}
                  autoFocus
                  className={cn(
                    'pr-8 font-mono',
                    confirmMatches && 'border-emerald-500 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20'
                  )}
                />
                {confirmMatches && (
                  <Check
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-emerald-500 animate-in fade-in zoom-in-75 duration-200"
                    strokeWidth={2.5}
                    aria-hidden
                  />
                )}
              </div>
              {deleteError && (
                <p className="text-xs text-destructive animate-in fade-in duration-150">
                  {deleteError}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                onClick={() => openDeleteDialog(false)}
                disabled={remove.isPending}
              >
                {t('accountConfig.danger.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={!confirmMatches || remove.isPending}
                className="gap-1.5"
              >
                {confirmMatches && (
                  <Trash2
                    className="size-4 animate-in fade-in slide-in-from-left-1 duration-200"
                    strokeWidth={2}
                  />
                )}
                {remove.isPending ? t('accountConfig.danger.deleting') : t('accountConfig.danger.confirmDelete')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function OptionCard({ value, title, description }: {
  value: string
  title: string
  description: string
}) {
  return (
    <Radio.Root
      value={value}
      className={cn(
        'group relative flex cursor-pointer flex-col gap-1 rounded-lg border border-input bg-transparent p-3 text-left',
        'transition-colors hover:bg-muted/50',
        'data-[checked]:border-ring data-[checked]:bg-muted/30',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <span
          className={cn(
            'flex size-4 items-center justify-center rounded-full border border-input transition-colors',
            'group-data-[checked]:border-foreground group-data-[checked]:bg-foreground group-data-[checked]:text-background',
          )}
        >
          <Radio.Indicator>
            <Check className="size-3" />
          </Radio.Indicator>
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </Radio.Root>
  )
}
