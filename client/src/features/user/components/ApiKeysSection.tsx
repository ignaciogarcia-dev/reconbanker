import { localizedApiError } from '@/shared/http/client'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Copy, KeyRound, Trash2, Check } from 'lucide-react'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '../hooks/useApiKeys'
import type { ApiScope } from '../api/apiKeys'

const ALL_SCOPES: ApiScope[] = ['otp:write', 'status:read']

// Manages API keys for the external /v1 surface and reveals each secret exactly once at creation
export function ApiKeysSection() {
  const { t } = useTranslation('user')
  const { data } = useApiKeys()
  const create = useCreateApiKey()
  const revoke = useRevokeApiKey()

  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<ApiScope[]>(['otp:write'])
  const [createdSecret, setCreatedSecret] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const toggleScope = (s: ApiScope) =>
    setScopes(prev => (prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]))

  const handleCreate = () => {
    if (!name.trim() || scopes.length === 0) return
    create.mutate(
      { name: name.trim(), scopes, account_ids: null },
      {
        onSuccess: (key) => {
          setCreatedSecret(key.key)
          setName('')
          setScopes(['otp:write'])
          toast.success(t('settings.apiKeys.created'))
        },
        onError: (err) => toast.error(localizedApiError(err) ?? t('settings.apiKeys.createError')),
      },
    )
  }

  const copySecret = async () => {
    if (!createdSecret) return
    await navigator.clipboard.writeText(createdSecret).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const keys = data?.keys.filter(k => !k.revoked_at) ?? []

  return (
    <div className="space-y-6">
      {/* One-time secret reveal */}
      {createdSecret && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
          <p className="text-[13px] font-medium">{t('settings.apiKeys.secretOnce')}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-background/60 px-2 py-1 text-xs font-mono">{createdSecret}</code>
            <Button size="icon-sm" variant="outline" onClick={copySecret}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setCreatedSecret(null)}>
            {t('settings.apiKeys.dismiss')}
          </Button>
        </div>
      )}

      {/* Create */}
      <div className="grid gap-3 rounded-lg border border-border p-4">
        <div className="grid gap-1.5">
          <Label htmlFor="apikey-name">{t('settings.apiKeys.name')}</Label>
          <Input
            id="apikey-name"
            placeholder={t('settings.apiKeys.namePlaceholder')}
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>{t('settings.apiKeys.scopes')}</Label>
          <div className="flex flex-wrap gap-3">
            {ALL_SCOPES.map(s => (
              <label key={s} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4" checked={scopes.includes(s)} onChange={() => toggleScope(s)} />
                <code className="text-xs">{s}</code>
              </label>
            ))}
          </div>
        </div>
        <div>
          <Button size="sm" onClick={handleCreate} disabled={create.isPending || !name.trim() || scopes.length === 0}>
            <KeyRound className="size-3.5 mr-1" />
            {create.isPending ? t('settings.apiKeys.creating') : t('settings.apiKeys.create')}
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {keys.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('settings.apiKeys.empty')}</p>
        )}
        {keys.map(k => (
          <div key={k.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{k.name}</p>
              <p className="text-xs text-muted-foreground font-mono">rbk_{k.prefix}_…</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {k.scopes.map(s => <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>)}
              </div>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => revoke.mutate(k.id, { onSuccess: () => toast.success(t('settings.apiKeys.revoked')) })}
              aria-label={t('settings.apiKeys.revoke')}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
