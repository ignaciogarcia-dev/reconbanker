import { localizedApiError } from '@/shared/http/client'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Copy, KeyRound, Trash2, Check } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import { Checkbox } from '@/shared/ui/checkbox'
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '../hooks/useApiKeys'
import type { ApiScope } from '../api/apiKeys'

// Each scope maps to exactly one /v1 endpoint; the method+path are language-neutral so they live here, not in i18n
const SCOPES: { scope: ApiScope; key: string; method: string; path: string }[] = [
  { scope: 'otp:write', key: 'otpWrite', method: 'POST', path: '/v1/accounts/{accountId}/otp' },
  { scope: 'status:read', key: 'statusRead', method: 'GET', path: '/v1/accounts/{accountId}/status' },
]

// Conventional API-doc method colors: GET reads (blue), POST writes (green)
const METHOD_STYLES: Record<string, string> = {
  GET: 'border-sky-500/25 bg-sky-500/10 text-sky-400',
  POST: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400',
}

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

  const setScope = (scope: ApiScope, checked: boolean) =>
    setScopes(prev =>
      checked ? [...new Set([...prev, scope])] : prev.filter(x => x !== scope),
    )

  const handleCreate = () => {
    /* v8 ignore next 1 -- the create button is disabled while name/scopes are invalid; guard is defensive. */
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
    /* v8 ignore next 1 -- the copy button only renders when a secret exists; guard is defensive. */
    if (!createdSecret) return
    await navigator.clipboard.writeText(createdSecret).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const keys = data?.keys.filter(k => !k.revoked_at) ?? []

  return (
    <div className="mt-6 space-y-5">
      {/* One-time secret reveal */}
      {createdSecret && (
        <div className="space-y-3 rounded-2xl border border-amber-300/25 bg-amber-300/[0.08] p-4 shadow-[inset_0_1px_0_oklch(1_0_0_/_0.08)]">
          <div className="space-y-0.5">
            <p className="text-[13px] font-semibold text-amber-50">{t('settings.apiKeys.secretTitle')}</p>
            <p className="text-xs leading-relaxed text-amber-50/65">{t('settings.apiKeys.secretHelp')}</p>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs font-mono text-amber-50">{createdSecret}</code>
            <Button size="icon-sm" variant="outline" onClick={copySecret} className="border-amber-50/15 bg-amber-50/10 text-amber-50 hover:bg-amber-50/15">
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setCreatedSecret(null)} className="text-amber-50/80 hover:bg-amber-50/10 hover:text-amber-50">
            {t('settings.apiKeys.dismiss')}
          </Button>
        </div>
      )}

      {/* Create */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.035] p-4 shadow-[inset_0_1px_0_oklch(1_0_0_/_0.07)]">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-28 size-56 rounded-full opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(circle, oklch(0.72 0 0 / 0.22), transparent 68%)' }}
        />
        <div className="relative grid gap-5">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.22em]" style={{ color: 'oklch(0.55 0 0)' }}>
              {t('settings.apiKeys.scopes')}
            </p>
            <h3 className="text-[18px] font-semibold leading-tight tracking-[-0.03em]" style={{ color: 'oklch(0.96 0 0)' }}>
              {t('settings.apiKeys.subtitle')}
            </h3>
          </div>

          <div className="grid gap-1.5">
            <Label
              htmlFor="apikey-name"
              className="text-[12px] font-medium"
              style={{ color: 'oklch(0.76 0 0)' }}
            >
              {t('settings.apiKeys.name')}
            </Label>
            <Input
              id="apikey-name"
              placeholder={t('settings.apiKeys.namePlaceholder')}
              value={name}
              onChange={e => setName(e.target.value)}
              className="settings-input border-white/10 bg-black/20 text-[13px] text-white placeholder:text-white/35 focus-visible:border-white/25 focus-visible:ring-white/10"
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-end justify-between gap-4">
              <p className="max-w-md text-xs leading-relaxed" style={{ color: 'oklch(0.68 0 0)' }}>
                {t('settings.apiKeys.scopesHint')}
              </p>
              <span className="hidden shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/55 sm:inline-flex">
                v1 API
              </span>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {SCOPES.map(({ scope, key, method, path }) => {
                const selected = scopes.includes(scope)
                return (
                  <label
                    key={scope}
                    className={cn(
                      'group flex min-h-[154px] cursor-pointer flex-col justify-between gap-4 rounded-2xl border p-3 transition-all',
                      selected
                        ? 'border-white/20 bg-white/[0.07] shadow-[inset_0_1px_0_oklch(1_0_0_/_0.08),0_18px_45px_oklch(0_0_0_/_0.18)]'
                        : 'border-white/[0.08] bg-black/10 hover:border-white/15 hover:bg-white/[0.045]',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        className="mt-0.5 border-white/20 bg-black/30 data-checked:border-white data-checked:bg-white data-checked:[&_svg]:stroke-black"
                        checked={selected}
                        onCheckedChange={checked => setScope(scope, checked)}
                      />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <span className="block text-sm font-semibold leading-snug text-white">{t(`settings.apiKeys.scopeInfo.${key}.title`)}</span>
                        <p className="text-xs leading-relaxed" style={{ color: 'oklch(0.68 0 0)' }}>{t(`settings.apiKeys.scopeInfo.${key}.desc`)}</p>
                      </div>
                    </div>
                    <div className="space-y-2 rounded-xl border border-white/[0.08] bg-black/20 p-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[9px] uppercase tracking-[0.22em] text-white/35">Endpoint</span>
                        <code className="font-mono text-[10px] text-white/40">{scope}</code>
                      </div>
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={cn('shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-mono font-semibold', METHOD_STYLES[method])}>
                          {method}
                        </span>
                        <code className="min-w-0 break-words font-mono text-[11px] leading-relaxed text-white/78">{path}</code>
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-white/[0.08] pt-4">
            <p className="text-[11px] leading-relaxed text-white/40">
              {scopes.length} / {SCOPES.length} scopes
            </p>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={create.isPending || !name.trim() || scopes.length === 0}
              className="border-0 bg-white px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-black hover:bg-white/90"
            >
              <KeyRound className="mr-1 size-3.5" />
              {create.isPending ? t('settings.apiKeys.creating') : t('settings.apiKeys.create')}
            </Button>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {keys.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/[0.10] bg-white/[0.02] px-4 py-5 text-sm text-white/45">
            {t('settings.apiKeys.empty')}
          </div>
        )}
        {keys.map(k => (
          <div key={k.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.09] bg-white/[0.035] p-3 shadow-[inset_0_1px_0_oklch(1_0_0_/_0.05)]">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{k.name}</p>
              <p className="font-mono text-xs text-white/45">rbk_{k.prefix}_…</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {k.scopes.map(s => <Badge key={s} variant="secondary" className="border border-white/10 bg-white/[0.06] text-[10px] text-white/70">{s}</Badge>)}
              </div>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-white/45 hover:bg-white/10 hover:text-white"
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
