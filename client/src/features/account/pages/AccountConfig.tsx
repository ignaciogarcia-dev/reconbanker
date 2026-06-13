import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
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
import { ArrowLeft, Save, Info, Trash2, AlertTriangle, ShieldAlert, Check, Bell, BellOff, TrendingDown, Lock, FileCheck, Settings as SettingsIcon, Terminal, KeyRound, Webhook, ListChecks, AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUser } from '@/features/user/hooks/useUser'
import { useAccount, useDeleteAccount } from '../hooks/useAccounts'
import { useAccountConfig, useUpsertAccountConfig } from '../hooks/useAccountConfig'
import type { AuthType, PollingMethod, SessionType, LoginMode } from '../types'
import {
  FIELD_ORDER,
  mapServerErrorToField,
  resolveTabForField,
  validateAccountConfigForm,
  type AccountConfigForm,
  type FormErrors,
} from './accountConfigForm'

type TranslateFn = ReturnType<typeof useTranslation>['t']

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
    notificationEndpointUrl: '',
    notificationAuthType: 'bearer',
    notificationAuthToken: '',
    notificationEventAssistance: false,
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>('credentials-session')

  const { data: account } = useAccount(accountId)
  const { data, isLoading } = useAccountConfig(accountId)

  const hasSavedCredential = !!(data?.bankUsername && data.bankUsername.trim() !== '')

  const liveErrors = useMemo(
    () => validateAccountConfigForm(form, { mode, hasSavedCredential, t }),
    [form, mode, hasSavedCredential, t],
  )

  function requiredFieldsFor(tab: string): (keyof AccountConfigForm)[] {
    switch (tab) {
      case 'credentials-session':
        return hasSavedCredential ? ['bankUsername'] : ['bankUsername', 'bankPassword']
      case 'orders':
        return ['pendingOrdersEndpoint', 'authToken']
      case 'webhook':
        return ['webhookUrl']
      /* v8 ignore start -- exhaustive switch over fixed tab IDs; default is unreachable. */
      default:
        return []
      /* v8 ignore stop */
    }
  }

  function tabProgress(tab: string): { done: number; total: number } {
    const required = requiredFieldsFor(tab)
    const done = required.filter(k => {
      const value = form[k]
      /* v8 ignore next -- all required fields are strings; the String(value) coercion is defensive. */
      const stringValue = typeof value === 'string' ? value : String(value)
      return stringValue.trim() !== '' && !liveErrors[k]
    }).length
    return { done, total: required.length }
  }

  const visibleTabs: string[] = mode === 'reconcile'
    ? ['credentials-session', 'orders', 'webhook', 'notifications']
    : ['credentials-session', 'webhook', 'notifications']

  const tabLabelKey: Record<string, string> = {
    'credentials-session': 'accountConfig.tabs.credentialsSession',
    'orders': 'accountConfig.tabs.orders',
    'webhook': 'accountConfig.tabs.webhook',
    'notifications': 'accountConfig.tabs.notifications',
  }

  function tabErrorCount(tab: string): number {
    return requiredFieldsFor(tab).filter(k => errors[k] !== undefined).length
  }

  function tabStatus(tab: string): 'neutral' | 'complete' | 'error' {
    if (tabErrorCount(tab) > 0) return 'error'
    const { done, total } = tabProgress(tab)
    if (total > 0 && done === total) return 'complete'
    return 'neutral'
  }

  const errorCount = Object.keys(errors).length

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
      notificationEndpointUrl: data.notificationEndpointUrl ?? '',
      notificationAuthType: data.notificationAuthType ?? 'bearer',
      notificationAuthToken: data.notificationAuthToken ?? '',
      notificationEventAssistance: (data.notificationEvents ?? []).includes('assistance_required'),
    }))
  }, [data])

  const save = useUpsertAccountConfig(accountId ?? '')

  const remove = useDeleteAccount()

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
      /* v8 ignore else -- validation rejects arrays for extra-fields and non-object pollingBody never round-trips through here in practice. */
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    /* v8 ignore start -- validation already gates malformed JSON and non-object payloads before reaching the catch + fallback return. */
    } catch {
      // Ignored — validation already gates this path.
    }
    return null
    /* v8 ignore stop */
  }

  function clearFieldError(key: keyof AccountConfigForm) {
    setErrors(prev => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function handleSave() {
    if (!accountId) return
    setServerError(null)
    const next = validateAccountConfigForm(form, { mode, hasSavedCredential, t })
    if (Object.keys(next).length > 0) {
      setErrors(next)
      const firstField = FIELD_ORDER.find(k => next[k] !== undefined)
      /* v8 ignore else -- validation always sets errors keyed by FIELD_ORDER, so `find` always matches. */
      if (firstField) {
        const targetTab = resolveTabForField(firstField, mode)
        if (targetTab && targetTab !== activeTab) setActiveTab(targetTab)
      }
      return
    }
    setErrors({})
    const trimmedEndpoint = form.pendingOrdersEndpoint.trim()
    const trimmedWebhook = form.webhookUrl.trim()
    const trimmedAuthToken = form.authToken.trim()
    const trimmedBankUsername = form.bankUsername.trim()
    save.mutate(
      {
        pendingOrdersEndpoint: trimmedEndpoint === '' ? null : trimmedEndpoint,
        webhookUrl: trimmedWebhook,
        retryLimit: data?.retryLimit ?? 3,
        pollingMethod: form.pollingMethod,
        pollingBody: parseJsonOrNull(form.pollingBody),
        authType: form.authType,
        authToken: trimmedAuthToken === '' ? null : trimmedAuthToken,
        webhookAuthType: data?.webhookAuthType ?? null,
        webhookAuthToken: data?.webhookAuthToken ?? null,
        notifyOnExpired: data?.notifyOnExpired ?? false,
        webhookExtraFields: parseJsonOrNull(form.webhookExtraFields),
        silentIngestion: form.silentIngestion,
        sessionType: form.sessionType,
        loginMode: form.loginMode,
        notificationEndpointUrl: form.notificationEndpointUrl.trim() === '' ? null : form.notificationEndpointUrl.trim(),
        notificationAuthType: form.notificationEndpointUrl.trim() === '' ? null : form.notificationAuthType,
        notificationAuthToken: form.notificationAuthToken.trim() === '' ? null : form.notificationAuthToken.trim(),
        notificationEvents: form.notificationEventAssistance ? ['assistance_required'] : [],
        /* v8 ignore start -- validation requires bankUsername so the empty branch is unreachable */
        bankUsername: trimmedBankUsername === '' ? null : trimmedBankUsername,
        /* v8 ignore stop */
        bankPassword: form.bankPassword === '' ? null : form.bankPassword,
      },
      {
        onSuccess: () => {
          toast.success(t('accountConfig.saved'))
          navigate('/accounts')
        },
        onError: (err: unknown) => {
          const message =
            (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
            (err as { message?: string })?.message ??
            /* v8 ignore start -- axios always populates err.message, so the generic fallback is unreachable. */
            t('accountConfig.errors.generic')
            /* v8 ignore stop */
          const field = mapServerErrorToField(message)
          if (field) {
            setErrors(prev => ({ ...prev, [field]: message }))
            const targetTab = resolveTabForField(field, mode)
            if (targetTab && targetTab !== activeTab) setActiveTab(targetTab)
          } else {
            setServerError(message)
          }
        },
      }
    )
  }

  function handleDelete() {
    /* v8 ignore next -- delete button is disabled when accountId is missing; guard is defensive. */
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
      'aria-invalid': (errors[key] ? true : undefined) as true | undefined,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setForm(f => ({ ...f, [key]: e.target.value }))
        clearFieldError(key)
      },
    }
  }

  if (isLoading) return <div className="p-8 text-muted-foreground text-sm">{t('accountConfig.loading')}</div>

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-1 flex-col gap-6 px-6 pt-8 pb-6 lg:px-8">
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
          onClick={() => openDeleteDialog(true)}
          disabled={!account}
          className="h-9 shrink-0 gap-2 px-4"
        >
          <Trash2 className="size-4" />
          {t('accountConfig.danger.deleteButton')}
        </Button>
      </div>

      {/* Hidden a11y descriptors referenced by each tab's aria-describedby */}
      <div className="sr-only">
        {visibleTabs.map(tab => {
          const status = tabStatus(tab)
          if (status === 'neutral') return null
          const label = t(tabLabelKey[tab])
          return (
            <span key={tab} id={`tab-status-${tab}`}>
              {status === 'complete'
                ? t('accountConfig.progress.tabStatusComplete', { label })
                : t('accountConfig.progress.tabStatusError', { label, count: tabErrorCount(tab) })}
            </span>
          )
        })}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-6">
        <TabsList className="h-10 w-fit gap-1 p-1">
          <StatusTab
            value="credentials-session"
            icon={KeyRound}
            labelKey="accountConfig.tabs.credentialsSession"
            status={tabStatus('credentials-session')}
            t={t}
          />
          {mode === 'reconcile' && (
            <StatusTab
              value="orders"
              icon={ListChecks}
              labelKey="accountConfig.tabs.orders"
              status={tabStatus('orders')}
              t={t}
            />
          )}
          <StatusTab
            value="webhook"
            icon={Webhook}
            labelKey="accountConfig.tabs.webhook"
            status={tabStatus('webhook')}
            t={t}
          />
          <StatusTab
            value="notifications"
            icon={Bell}
            labelKey="accountConfig.tabs.notifications"
            status={tabStatus('notifications')}
            t={t}
          />
        </TabsList>

        {/* Bank credentials + session behaviour */}
        <TabsContent value="credentials-session" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t('accountConfig.bankCredentials')}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <FormField
                label={t('accountConfig.username')}
                required
                hint={t('accountConfig.hints.bankUsername')}
                error={errors.bankUsername}
              >
                <Input placeholder={t('accountConfig.usernamePlaceholder')} {...field('bankUsername')} />
              </FormField>
              <FormField
                label={t('accountConfig.password')}
                required={!hasSavedCredential}
                hint={hasSavedCredential
                  ? t('accountConfig.hints.bankPasswordSaved')
                  : t('accountConfig.hints.bankPassword')}
                error={errors.bankPassword}
              >
                <Input type="password" placeholder={t('accountConfig.passwordPlaceholder')} {...field('bankPassword')} />
              </FormField>
            </CardContent>
          </Card>

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

        {/* Webhook */}
        <TabsContent value="webhook" className="space-y-6">
          {mode !== 'reconcile' && (
            <AuthCard
              form={form}
              errors={errors}
              t={t}
              field={field}
              setForm={setForm}
              hintKey="accountConfig.authHintWebhookOnly"
            />
          )}

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
              <FormField
                label={t('accountConfig.webhookUrl')}
                required
                hint={t('accountConfig.hints.webhookUrl')}
                error={errors.webhookUrl}
              >
                <Input placeholder="https://..." {...field('webhookUrl')} />
              </FormField>
              <FormField
                label={t('accountConfig.webhookExtraFields')}
                hint={t('accountConfig.webhookExtraFieldsDesc')}
                error={errors.webhookExtraFields}
              >
                <textarea
                  className={cn(
                    'w-full min-h-24 rounded-md border bg-transparent px-3 py-2 text-sm font-mono resize-y',
                    errors.webhookExtraFields && 'border-destructive ring-3 ring-destructive/20',
                  )}
                  placeholder='{"source": "reconbanker"}'
                  aria-invalid={errors.webhookExtraFields ? true : undefined}
                  value={form.webhookExtraFields}
                  onChange={e => {
                    setForm(f => ({ ...f, webhookExtraFields: e.target.value }))
                    clearFieldError('webhookExtraFields')
                  }}
                />
              </FormField>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Central notification endpoint (status/assistance events) */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('accountConfig.notifications.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border border-border bg-muted/40 p-3 flex gap-2 text-sm text-foreground">
                <Info className="size-4 mt-0.5 shrink-0" />
                <div>{t('accountConfig.notifications.desc')}</div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="notif-url">{t('accountConfig.notifications.endpoint')}</Label>
                <Input
                  id="notif-url"
                  placeholder="https://example.com/hooks/recon"
                  value={form.notificationEndpointUrl}
                  onChange={e => setForm(f => ({ ...f, notificationEndpointUrl: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="notif-auth-type">{t('accountConfig.notifications.authType')}</Label>
                <Select
                  value={form.notificationAuthType}
                  onValueChange={v => setForm(f => ({ ...f, notificationAuthType: v as AuthType }))}
                >
                  <SelectTrigger id="notif-auth-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bearer">Bearer</SelectItem>
                    <SelectItem value="api_key">Api-Key</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="notif-token">{t('accountConfig.notifications.authToken')}</Label>
                <Input
                  id="notif-token"
                  type="password"
                  placeholder="••••••••"
                  value={form.notificationAuthToken}
                  onChange={e => setForm(f => ({ ...f, notificationAuthToken: e.target.value }))}
                />
              </div>
              <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
                <span className="flex items-center gap-2">
                  <ShieldAlert className="size-4" />
                  {t('accountConfig.notifications.eventAssistance')}
                </span>
                <input
                  type="checkbox"
                  className="size-4"
                  checked={form.notificationEventAssistance}
                  onChange={e => setForm(f => ({ ...f, notificationEventAssistance: e.target.checked }))}
                />
              </label>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Orders (reconcile mode only) */}
        {mode === 'reconcile' && (
          <TabsContent value="orders" className="space-y-6">
            <AuthCard
              form={form}
              errors={errors}
              t={t}
              field={field}
              setForm={setForm}
              hintKey="accountConfig.authHintPollingAndWebhook"
            />

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
                <FormField
                  label={t('accountConfig.pendingEndpoint')}
                  required
                  hint={t('accountConfig.hints.pendingOrdersEndpoint')}
                  error={errors.pendingOrdersEndpoint}
                >
                  <Input placeholder="https://..." {...field('pendingOrdersEndpoint')} />
                </FormField>
                <FormField
                  label={
                    <span className="flex items-center gap-1.5">
                      {t('accountConfig.httpMethod')}
                      <Tooltip>
                        <TooltipTrigger render={
                          <button type="button" aria-label="info" className="text-muted-foreground/60 hover:text-foreground">
                            <Info className="size-3" />
                          </button>
                        } />
                        <TooltipContent className="max-w-xs text-left space-y-1">
                          <p>{t('accountConfig.tooltips.pollingMethodGet')}</p>
                          <p>{t('accountConfig.tooltips.pollingMethodPost')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </span>
                  }
                  hint={t('accountConfig.hints.pollingMethod')}
                >
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
                </FormField>
                {form.pollingMethod === 'POST' && (
                  <FormField
                    label={t('accountConfig.body')}
                    hint={t('accountConfig.hints.pollingBody')}
                    error={errors.pollingBody}
                  >
                    <textarea
                      className={cn(
                        'w-full min-h-24 rounded-md border bg-transparent px-3 py-2 text-sm font-mono resize-y',
                        errors.pollingBody && 'border-destructive ring-3 ring-destructive/20',
                      )}
                      placeholder='{"key": "value"}'
                      aria-invalid={errors.pollingBody ? true : undefined}
                      value={form.pollingBody}
                      onChange={e => {
                        setForm(f => ({ ...f, pollingBody: e.target.value }))
                        clearFieldError('pollingBody')
                      }}
                    />
                  </FormField>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
      </div>

      <div className="sticky bottom-0 z-10 shrink-0 border-t border-border/60 bg-background/95 px-6 py-4 lg:px-8 supports-backdrop-filter:backdrop-blur">
        {serverError && (
          <div className="mb-3 relative overflow-hidden rounded-md border border-destructive/30 bg-destructive/5">
            <div className="absolute inset-y-0 left-0 w-1 bg-destructive" />
            <div className="flex items-center gap-2.5 pl-4 pr-3 py-2">
              <ShieldAlert className="size-4 shrink-0 text-destructive" />
              <p className="text-xs text-destructive flex-1 min-w-0 break-words">{serverError}</p>
              <button
                type="button"
                onClick={() => setServerError(null)}
                className="text-xs text-destructive/70 hover:text-destructive shrink-0"
                aria-label={t('accountConfig.errors.dismiss')}
              >
                {t('accountConfig.errors.dismiss')}
              </button>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-4">
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            data-testid="save-failed-summary"
            className={cn(
              'text-xs text-muted-foreground transition-opacity',
              errorCount === 0 && 'opacity-0',
            )}
          >
            {errorCount > 0 && t('accountConfig.progress.saveFailedSummary', { count: errorCount })}
          </div>
          <Button
            onClick={handleSave}
            disabled={save.isPending}
            size="lg"
            className="h-10 min-w-44 shrink-0 gap-2 px-6 font-medium"
          >
            <Save className="size-4" />
            {save.isPending ? t('accountConfig.saving') : t('accountConfig.save')}
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

type TabStatus = 'neutral' | 'complete' | 'error'

function TabStatusIcon({ status }: { status: TabStatus }) {
  if (status === 'complete') {
    return (
      <Check
        className="size-3.5 text-emerald-600 dark:text-emerald-400 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
        strokeWidth={2.5}
        aria-hidden
      />
    )
  }
  if (status === 'error') {
    return <AlertCircle className="size-3.5 text-amber-600 dark:text-amber-400" aria-hidden />
  }
  return null
}

interface StatusTabProps {
  value: string
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  labelKey: string
  status: TabStatus
  t: TranslateFn
}

function StatusTab({ value, icon: Icon, labelKey, status, t }: StatusTabProps) {
  const label = t(labelKey)
  const descriptorId = `tab-status-${value}`
  return (
    <TabsTrigger
      value={value}
      data-status={status}
      aria-describedby={status !== 'neutral' ? descriptorId : undefined}
      className="flex-none gap-2 px-4"
    >
      <Icon className="size-4" aria-hidden />
      <span>{label}</span>
      <TabStatusIcon status={status} />
    </TabsTrigger>
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

interface AuthCardProps {
  form: AccountConfigForm
  errors: FormErrors
  t: TranslateFn
  field: <K extends keyof AccountConfigForm>(key: K) => {
    value: string
    'aria-invalid': true | undefined
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  }
  setForm: React.Dispatch<React.SetStateAction<AccountConfigForm>>
  hintKey: string
}

interface FormFieldProps {
  label: React.ReactNode
  required?: boolean
  hint?: string
  error?: string
  children: React.ReactNode
}

function FormField({ label, required, hint, error, children }: FormFieldProps) {
  const hasError = Boolean(error)
  return (
    <div className="grid gap-1.5">
      <Label className={cn('text-[13px] transition-colors flex items-center gap-1', hasError && 'text-destructive')}>
        <span>{label}</span>
        {required && (
          <span className="text-destructive" aria-hidden>*</span>
        )}
      </Label>
      {children}
      {(hasError || hint) && (
        <p
          aria-live="polite"
          className={cn(
            'flex items-center gap-1 text-[11px] leading-4 min-h-4 transition-colors',
            hasError ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {hasError ? (
            <AlertCircle className="size-3 shrink-0" aria-hidden />
          ) : (
            <Info className="size-3 shrink-0 opacity-60" aria-hidden />
          )}
          <span>{hasError ? error : hint}</span>
        </p>
      )}
    </div>
  )
}

function AuthCard({ form, errors, t, field, setForm, hintKey }: AuthCardProps) {
  return (
    <Card>
      <CardHeader><CardTitle>{t('accountConfig.auth')}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">{t(hintKey)}</p>
        <FormField
          label={
            <span className="flex items-center gap-1.5">
              {t('accountConfig.authType')}
              <Tooltip>
                <TooltipTrigger render={
                  <button type="button" aria-label="info" className="text-muted-foreground/60 hover:text-foreground">
                    <Info className="size-3" />
                  </button>
                } />
                <TooltipContent className="max-w-xs text-left space-y-1">
                  <p>{t('accountConfig.tooltips.authTypeBearer')}</p>
                  <p>{t('accountConfig.tooltips.authTypeApiKey')}</p>
                </TooltipContent>
              </Tooltip>
            </span>
          }
        >
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
        </FormField>
        <FormField
          label={t('accountConfig.tokenKey')}
          required
          hint={t('accountConfig.hints.authToken')}
          error={errors.authToken}
        >
          <Input type="password" {...field('authToken')} />
        </FormField>
      </CardContent>
    </Card>
  )
}
