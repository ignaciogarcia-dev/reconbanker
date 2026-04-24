import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ArrowLeft, Save, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface AccountConfig {
  pending_orders_endpoint: string
  webhook_url: string
  polling_method: 'GET' | 'POST'
  polling_body: string
  auth_type: 'bearer' | 'api_key'
  auth_token: string
  bank_username: string
  bank_password: string
  webhook_extra_fields: string
  mode: 'reconcile' | 'passthrough'
}

const RESERVED_WEBHOOK_KEYS = ['external_id', 'status', 'amount', 'currency', 'sender_name', 'payment_method_id', 'id', 'received_at']

export function AccountConfig() {
  const { accountId } = useParams<{ accountId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [form, setForm] = useState<AccountConfig>({
    pending_orders_endpoint: '',
    webhook_url: '',
    polling_method: 'GET',
    polling_body: '',
    auth_type: 'bearer',
    auth_token: '',
    bank_username: '',
    bank_password: '',
    webhook_extra_fields: '',
    mode: 'reconcile',
  })
  const [saved, setSaved] = useState(false)
  const [extraFieldsError, setExtraFieldsError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['account-config', accountId],
    queryFn: () => api.get(`/accounts/${accountId}/config`).then(r => r.data),
    enabled: !!accountId,
  })

  useEffect(() => {
    if (data) setForm(f => ({
      ...f,
      ...data,
      bank_password: '',
      webhook_extra_fields: data.webhook_extra_fields
        ? JSON.stringify(data.webhook_extra_fields, null, 2)
        : '',
    }))
  }, [data])

  function validateExtraFields(): string | null {
    const raw = form.webhook_extra_fields.trim()
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

  const save = useMutation({
    mutationFn: () => api.put(`/accounts/${accountId}/config`, form),
    onSuccess: () => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  function handleSave() {
    const err = validateExtraFields()
    setExtraFieldsError(err)
    if (err) return
    save.mutate()
  }

  function field<K extends keyof AccountConfig>(key: K) {
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

      {/* Mode */}
      <Card>
        <CardHeader><CardTitle>{t('accountConfig.mode')}</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-start gap-4">
            <Switch
              checked={form.mode === 'reconcile'}
              onCheckedChange={(checked: boolean) =>
                setForm(f => ({ ...f, mode: checked ? 'reconcile' : 'passthrough' }))
              }
            />
            <div className="flex-1">
              <p className="font-medium text-sm">
                {form.mode === 'reconcile' ? t('accountConfig.modeReconcile') : t('accountConfig.modePassthrough')}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {form.mode === 'reconcile' ? t('accountConfig.modeReconcileDesc') : t('accountConfig.modePassthroughDesc')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bank credentials */}
      <Card>
        <CardHeader><CardTitle>{t('accountConfig.bankCredentials')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t('accountConfig.username')}</Label>
            <Input placeholder={t('accountConfig.usernamePlaceholder')} {...field('bank_username')} />
          </div>
          <div className="space-y-2">
            <Label>{t('accountConfig.password')}</Label>
            <Input type="password" placeholder={t('accountConfig.passwordPlaceholder')} {...field('bank_password')} />
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
              value={form.auth_type}
              onValueChange={v => setForm(f => ({ ...f, auth_type: v as 'bearer' | 'api_key' }))}
            >
              <SelectTrigger>
                <SelectValue>{form.auth_type === 'bearer' ? 'Bearer token' : 'API Key'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bearer">Bearer token</SelectItem>
                <SelectItem value="api_key">API Key</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('accountConfig.tokenKey')}</Label>
            <Input type="password" {...field('auth_token')} />
          </div>
        </CardContent>
      </Card>

      {/* Order ingestion (reconcile mode only) */}
      {form.mode === 'reconcile' && (
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
    "external_id": "order-123",   // string, requerido
    "amount": 1500.00,            // number, requerido
    "currency": "UYU",            // string, requerido
    "sender_name": "Juan Pérez"   // string, requerido
  }
]`}</pre>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('accountConfig.pendingEndpoint')}</Label>
            <Input placeholder="https://..." {...field('pending_orders_endpoint')} />
          </div>
          <div className="space-y-2">
            <Label>{t('accountConfig.httpMethod')}</Label>
            <Select
              value={form.polling_method}
              onValueChange={v => setForm(f => ({ ...f, polling_method: v as 'GET' | 'POST' }))}
            >
              <SelectTrigger>
                <SelectValue>{form.polling_method}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="POST">POST</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.polling_method === 'POST' && (
            <div className="space-y-2">
              <Label>{t('accountConfig.body')}</Label>
              <textarea
                className="w-full min-h-24 rounded-md border bg-transparent px-3 py-2 text-sm font-mono resize-y"
                placeholder='{"key": "value"}'
                {...field('polling_body')}
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
                {form.mode === 'reconcile'
                  ? t('accountConfig.webhookPayloadDesc')
                  : t('accountConfig.webhookPayloadPassthroughDesc')}
              </p>
              <pre className="text-xs bg-background rounded p-2 font-mono whitespace-pre-wrap">
                {form.mode === 'reconcile'
                  ? `{
  "external_id": "order-123",
  "amount": 1500.00,
  "currency": "UYU",
  "sender_name": "Juan Pérez",
  "payment_method_id": 33  // solo si está en el body de polling
}`
                  : `{
  "id": "uuid-del-movimiento",
  "amount": 1500.00,
  "currency": "UYU",
  "sender_name": "Juan Pérez",
  "received_at": "2026-04-24T12:00:00.000Z"
}`}
              </pre>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('accountConfig.webhookUrl')}</Label>
            <Input placeholder="https://..." {...field('webhook_url')} />
          </div>
          <div className="space-y-2">
            <Label>{t('accountConfig.webhookExtraFields')}</Label>
            <p className="text-xs text-muted-foreground">{t('accountConfig.webhookExtraFieldsDesc')}</p>
            <textarea
              className="w-full min-h-24 rounded-md border bg-transparent px-3 py-2 text-sm font-mono resize-y"
              placeholder='{"source": "reconbanker"}'
              value={form.webhook_extra_fields}
              onChange={e => {
                setForm(f => ({ ...f, webhook_extra_fields: e.target.value }))
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
    </div>
  )
}
