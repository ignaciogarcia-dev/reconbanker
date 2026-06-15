import { localizedApiError } from '@/shared/http/client'
import { Fragment, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Copy, KeyRound, Trash2, Check, AlertTriangle } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import { Checkbox } from '@/shared/ui/checkbox'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/shared/ui/dialog'
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '../hooks/useApiKeys'
import { useUser } from '../hooks/useUser'
import type { ApiKey, ApiScope } from '../api/apiKeys'

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
  const { data: me } = useUser()
  const create = useCreateApiKey()
  const revoke = useRevokeApiKey()

  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<ApiScope[]>(['otp:write'])
  const [createdSecret, setCreatedSecret] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Key pending revocation; opening the dialog. 2FA users must enter a code.
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null)
  const [revokeCode, setRevokeCode] = useState('')
  const [revokeCodeError, setRevokeCodeError] = useState(false)

  const requires2fa = me?.totpEnabled ?? false

  const closeRevoke = () => {
    setRevokeTarget(null)
    setRevokeCode('')
    setRevokeCodeError(false)
  }

  const submitRevoke = () => {
    /* v8 ignore next 1 -- the submit button only renders while a target is set; guard is defensive. */
    if (!revokeTarget) return
    if (requires2fa && !revokeCode.trim()) return
    setRevokeCodeError(false)
    revoke.mutate(
      { id: revokeTarget.id, code: requires2fa ? revokeCode.trim() : undefined },
      {
        onSuccess: () => {
          toast.success(t('settings.apiKeys.revoked'))
          closeRevoke()
        },
        onError: (err) => {
          const status = (err as { response?: { status?: number } })?.response?.status
          // A 401 on the 2FA path means the code was wrong — keep the dialog open
          // and surface an inline error instead of a toast.
          if (requires2fa && status === 401) {
            setRevokeCodeError(true)
            return
          }
          toast.error(localizedApiError(err) ?? t('settings.apiKeys.revokeError'))
        },
      },
    )
  }

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
    await navigator.clipboard.writeText(createdSecret).catch(() => { })
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const keys = data?.keys.filter(k => !k.revoked_at) ?? []

  return (
    <>
      {/* One-time secret reveal — modal over the settings dialog */}
      <Dialog
        open={createdSecret !== null}
        onOpenChange={o => {
          /* v8 ignore next 4 -- dialog has no internal trigger so the truthy branch is defensive */
          if (!o) {
            setCreatedSecret(null)
            setCopied(false)
          }
        }}
      >
        <DialogContent
          forceOverlay
          overlayClassName="bg-black/75 supports-backdrop-filter:backdrop-blur-sm"
          className="overflow-hidden border-0 p-0 ring-0 sm:!max-w-[540px]"
          style={{
            background: 'oklch(0.12 0.008 85 / 0.97)',
            backdropFilter: 'blur(28px) saturate(160%)',
            WebkitBackdropFilter: 'blur(28px) saturate(160%)',
            boxShadow:
              'inset 0 0 0 1px oklch(0.83 0.13 85 / 0.26), 0 32px 90px oklch(0 0 0 / 0.7)',
            color: 'oklch(0.92 0 0)',
          }}
        >
          {/* amber accent hairline along the top edge */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, oklch(0.83 0.14 85 / 0.7), transparent)' }}
          />
          <div className="grid min-w-0 gap-5 p-6">
            <div className="flex items-start gap-3 pr-6">
              <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-amber-300/25 bg-amber-300/[0.12]">
                <KeyRound className="size-4 text-amber-300" />
              </div>
              <div className="min-w-0 space-y-1.5">
                <DialogTitle className="text-[15px] font-semibold leading-tight tracking-[-0.01em] text-amber-50">
                  {t('settings.apiKeys.secretTitle')}
                </DialogTitle>
                <DialogDescription className="text-xs leading-relaxed text-amber-50/60">
                  {t('settings.apiKeys.secretHelp')}
                </DialogDescription>
              </div>
            </div>

            <div className="min-w-0 space-y-2.5 rounded-xl border border-white/10 bg-black/35 p-3.5 shadow-[inset_0_1px_0_oklch(1_0_0_/_0.04)]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/35">API key</span>
                <Button
                  size="icon-sm"
                  variant="outline"
                  onClick={copySecret}
                  className="border-amber-50/15 bg-amber-50/10 text-amber-50 hover:bg-amber-50/15"
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                </Button>
              </div>
              <code className="block select-all truncate font-mono text-[12.5px] text-amber-50">{createdSecret}</code>
            </div>

            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => setCreatedSecret(null)}
                className="border-0 bg-white px-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-black hover:bg-white/90"
              >
                {t('settings.apiKeys.dismiss')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Revoke confirmation — requires a current TOTP code when 2FA is enabled */}
      <Dialog
        open={revokeTarget !== null}
        onOpenChange={o => {
          /* v8 ignore next -- dialog has no internal trigger so the truthy branch is defensive */
          if (!o) closeRevoke()
        }}
      >
        <DialogContent
          forceOverlay
          overlayClassName="bg-black/75 supports-backdrop-filter:backdrop-blur-sm"
          className="overflow-hidden border-0 p-0 ring-0 sm:!max-w-[460px]"
          style={{
            background: 'oklch(0.12 0.01 28 / 0.97)',
            backdropFilter: 'blur(28px) saturate(160%)',
            WebkitBackdropFilter: 'blur(28px) saturate(160%)',
            boxShadow: 'inset 0 0 0 1px oklch(0.55 0.18 28 / 0.30), 0 32px 90px oklch(0 0 0 / 0.7)',
            color: 'oklch(0.92 0 0)',
          }}
        >
          <div className="grid min-w-0 gap-5 p-6">
            <div className="flex items-start gap-3 pr-6">
              <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-rose-400/25 bg-rose-400/[0.12]">
                <AlertTriangle className="size-4 text-rose-300" />
              </div>
              <div className="min-w-0 space-y-1.5">
                <DialogTitle className="text-[15px] font-semibold leading-tight tracking-[-0.01em] text-rose-50">
                  {t('settings.apiKeys.revokeTitle')}
                </DialogTitle>
                <DialogDescription className="text-xs leading-relaxed text-rose-50/65">
                  {t('settings.apiKeys.revokeBody')}
                </DialogDescription>
                {revokeTarget && (
                  <p className="truncate text-xs">
                    <span className="font-semibold text-white/80">{revokeTarget.name}</span>
                    <span className="ml-1.5 font-mono text-white/40">rbk_{revokeTarget.prefix}_…</span>
                  </p>
                )}
              </div>
            </div>

            {requires2fa && (
              <div className="grid gap-1.5">
                <Label htmlFor="revoke-2fa-code" className="text-[10px] uppercase tracking-[0.2em]" style={{ color: 'oklch(0.5 0 0)' }}>
                  {t('settings.apiKeys.revoke2faHint')}
                </Label>
                <Input
                  id="revoke-2fa-code"
                  value={revokeCode}
                  onChange={e => { setRevokeCode(e.target.value); setRevokeCodeError(false) }}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  autoFocus
                  placeholder="123456"
                  onKeyDown={e => { if (e.key === 'Enter') submitRevoke() }}
                  className="settings-input border-white/10 bg-black/20 text-[13px] text-white placeholder:text-white/30 focus-visible:border-white/25 focus-visible:ring-white/10"
                />
                {revokeCodeError && (
                  <p className="text-xs text-rose-300">{t('settings.security.codeError')}</p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={closeRevoke}
                disabled={revoke.isPending}
                className="text-[11px] uppercase tracking-[0.16em] text-white/60 hover:bg-white/10 hover:text-white"
              >
                {t('settings.apiKeys.cancel')}
              </Button>
              <Button
                size="sm"
                onClick={submitRevoke}
                disabled={revoke.isPending || (requires2fa && !revokeCode.trim())}
                className="border-0 px-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-white"
                style={{ background: 'oklch(0.55 0.2 28)' }}
              >
                {t('settings.apiKeys.revokeConfirm')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="mt-6 space-y-5">
        {/* Create */}
        <div className="grid gap-5">
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
            <div>
              <hr className="border-white/[0.08]" />
              {SCOPES.map(({ scope, key, method, path }) => {
                const selected = scopes.includes(scope)
                return (
                  <Fragment key={scope}>
                    <label className="group flex cursor-pointer items-start gap-3 py-4">
                      <Checkbox
                        className="mt-0.5 border-white/20 bg-black/30 data-checked:border-white data-checked:bg-white data-checked:[&_svg]:stroke-black"
                        checked={selected}
                        onCheckedChange={checked => setScope(scope, checked)}
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="space-y-1">
                          <span className="block text-sm font-semibold leading-snug text-white">{t(`settings.apiKeys.scopeInfo.${key}.title`)}</span>
                          <p className="text-xs leading-relaxed" style={{ color: 'oklch(0.68 0 0)' }}>{t(`settings.apiKeys.scopeInfo.${key}.desc`)}</p>
                        </div>
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className={cn('shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-mono font-semibold', METHOD_STYLES[method])}>
                            {method}
                          </span>
                          <code className="min-w-0 break-all font-mono text-[11px] leading-relaxed text-white/75">{path}</code>
                          <code className="font-mono text-[10px] text-white/35">{scope}</code>
                        </div>
                      </div>
                    </label>
                    <hr className="border-white/[0.08]" />
                  </Fragment>
                )
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
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

        {/* List */}
        <div>
          {keys.length === 0 ? (
            <p className="text-sm text-white/45">{t('settings.apiKeys.empty')}</p>
          ) : (
            <>
              <hr className="border-white/[0.08]" />
              {keys.map(k => (
                <Fragment key={k.id}>
                  <div className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{k.name}</p>
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <p className="font-mono text-xs text-white/45">rbk_{k.prefix}_…</p>
                        {k.scopes.map(s => <Badge key={s} variant="secondary" className="border border-white/10 bg-white/[0.06] text-[10px] text-white/70">{s}</Badge>)}
                      </div>
                    </div>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-white/45 hover:bg-white/10 hover:text-white"
                      onClick={() => setRevokeTarget(k)}
                      aria-label={t('settings.apiKeys.revoke')}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  <hr className="border-white/[0.08]" />
                </Fragment>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  )
}
