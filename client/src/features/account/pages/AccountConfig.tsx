import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Switch } from '@/shared/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { ArrowLeft, Save, Info, Trash2, AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUser } from '@/features/user/hooks/useUser'
import { useAccount, useDeleteAccount } from '../hooks/useAccounts'
import { useAccountConfig, useUpsertAccountConfig } from '../hooks/useAccountConfig'
import type { AuthType, PollingMethod } from '../types'

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
  })
  const [saved, setSaved] = useState(false)
  const [extraFieldsError, setExtraFieldsError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)

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
    <div className="p-8 space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/accounts')}>
          <ArrowLeft className="size-4 mr-1" />
          {t('accountConfig.back')}
        </Button>
        <div>
          <h2 className="text-2xl font-semibold">{t('accountConfig.title')}</h2>
          <p className="text-muted-foreground text-sm">ID: {accountId}</p>
        </div>
      </div>

      {/* Bank credentials */}
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

      {/* Auth */}
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

      {/* Order ingestion (reconcile mode only) */}
      {mode === 'reconcile' && (
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
      )}

      {/* Webhooks */}
      <Card>
        <CardHeader><CardTitle>{t('accountConfig.webhooks')}</CardTitle></CardHeader>
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
          <div className="rounded-md border border-border bg-muted/30 p-3 flex items-start gap-4">
            <Switch
              checked={form.silentIngestion}
              onCheckedChange={(checked: boolean) =>
                setForm(f => ({ ...f, silentIngestion: checked }))
              }
            />
            <div className="flex-1">
              <p className="font-medium text-sm">{t('accountConfig.silentIngestion')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('accountConfig.silentIngestionDesc')}</p>
            </div>
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

      <Button onClick={handleSave} disabled={save.isPending} className="gap-2">
        <Save className="size-4" />
        {save.isPending ? t('accountConfig.saving') : saved ? t('accountConfig.saved') : t('accountConfig.save')}
      </Button>

      {/* Danger zone */}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <AlertTriangle className="size-4" />
            {t('accountConfig.danger.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t('accountConfig.danger.description')}</p>
          <Button
            variant="destructive"
            onClick={() => openDeleteDialog(true)}
            disabled={!account}
            className="gap-2"
          >
            <Trash2 className="size-4" />
            {t('accountConfig.danger.deleteButton')}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={deleteOpen} onOpenChange={openDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="size-4" />
              {t('accountConfig.danger.dialogTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              {t('accountConfig.danger.dialogIntro')}
            </p>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
              <li>{t('accountConfig.danger.itemMovements')}</li>
              <li>{t('accountConfig.danger.itemCredentials')}</li>
              <li>{t('accountConfig.danger.itemConciliations')}</li>
              <li>{t('accountConfig.danger.itemConfig')}</li>
              <li>{t('accountConfig.danger.itemScrapeLogs')}</li>
            </ul>
            <p className="text-sm">
              {t('accountConfig.danger.typeToConfirm')}{' '}
              <span className="font-mono font-medium text-foreground">{account?.name}</span>
            </p>
            <div className="space-y-2">
              <Label>{t('accountConfig.danger.nameLabel')}</Label>
              <Input
                value={deleteConfirmName}
                onChange={e => {
                  setDeleteConfirmName(e.target.value)
                  if (deleteError) setDeleteError(null)
                }}
                placeholder={account?.name ?? ''}
                autoFocus
              />
            </div>
            {deleteError && <p className="text-xs text-destructive">{deleteError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => openDeleteDialog(false)} disabled={remove.isPending}>
                {t('accountConfig.danger.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={!confirmMatches || remove.isPending}
                className="gap-2"
              >
                <Trash2 className="size-4" />
                {remove.isPending ? t('accountConfig.danger.deleting') : t('accountConfig.danger.confirmDelete')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
