import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { ShieldCheck, ShieldOff } from 'lucide-react'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Button } from '@/shared/ui/button'
import { Badge } from '@/shared/ui/badge'
import { enroll2fa, confirm2fa, disable2fa } from '../api/me'
import { meQueryKey } from '../hooks/useUser'

type Stage = 'idle' | 'enrolling' | 'backup' | 'disabling'

export function TwoFactorSection({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation('user')
  const qc = useQueryClient()
  const [stage, setStage] = useState<Stage>('idle')
  const [otpauthUri, setOtpauthUri] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])

  function reset() {
    setStage('idle')
    setOtpauthUri('')
    setCode('')
    setPassword('')
    setBackupCodes([])
  }

  const enroll = useMutation({
    mutationFn: enroll2fa,
    onSuccess: ({ otpauthUri }) => {
      setOtpauthUri(otpauthUri)
      setStage('enrolling')
    },
    onError: () => toast.error(t('settings.security.enrollError')),
  })

  const confirm = useMutation({
    mutationFn: () => confirm2fa(code),
    onSuccess: ({ backupCodes }) => {
      setBackupCodes(backupCodes)
      setCode('')
      setStage('backup')
      qc.invalidateQueries({ queryKey: meQueryKey })
    },
    onError: () => toast.error(t('settings.security.codeError')),
  })

  const disable = useMutation({
    mutationFn: () => disable2fa(password, code),
    onSuccess: () => {
      toast.success(t('settings.security.disabled'))
      reset()
      qc.invalidateQueries({ queryKey: meQueryKey })
    },
    onError: () => toast.error(t('settings.security.codeError')),
  })

  // Already enabled: show status + disable flow.
  if (enabled) {
    return (
      <div className="mt-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4" style={{ color: 'oklch(0.8 0.16 150)' }} />
          <span className="text-[14px]" style={{ color: 'oklch(0.92 0 0)' }}>
            {t('settings.security.enabledLabel')}
          </span>
          <Badge variant="secondary" className="text-[9px] uppercase tracking-[0.18em]">
            {t('settings.security.on')}
          </Badge>
        </div>

        {stage !== 'disabling' ? (
          <Button
            variant="ghost"
            onClick={() => setStage('disabling')}
            className="text-[11px] uppercase tracking-[0.18em]"
            style={{ color: 'oklch(0.7 0.18 28)' }}
          >
            <ShieldOff className="size-3.5" />
            {t('settings.security.disable')}
          </Button>
        ) : (
          <div className="space-y-3 max-w-sm">
            <p className="text-xs leading-relaxed" style={{ color: 'oklch(0.65 0 0)' }}>
              {t('settings.security.disableHint')}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="totp-disable-password" className="text-[10px] uppercase tracking-[0.2em]" style={{ color: 'oklch(0.5 0 0)' }}>
                {t('login.password')}
              </Label>
              <Input id="totp-disable-password" type="password" value={password} onChange={e => setPassword(e.target.value)} className="settings-input" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="totp-disable-code" className="text-[10px] uppercase tracking-[0.2em]" style={{ color: 'oklch(0.5 0 0)' }}>
                {t('settings.security.code')}
              </Label>
              <Input id="totp-disable-code" value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" className="settings-input" />
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={reset} disabled={disable.isPending}>
                {t('settings.mode.cancel')}
              </Button>
              <Button
                onClick={() => disable.mutate()}
                disabled={disable.isPending || !password || !code}
                style={{ background: 'oklch(0.58 0.2 28)', color: 'oklch(0.98 0 0)' }}
              >
                {disable.isPending ? t('settings.mode.saving') : t('settings.security.disable')}
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Backup codes view (after confirming enrollment).
  if (stage === 'backup') {
    return (
      <div className="mt-6 space-y-4 max-w-sm">
        <p className="text-[14px] font-semibold" style={{ color: 'oklch(0.96 0 0)' }}>
          {t('settings.security.backupTitle')}
        </p>
        <p className="text-xs leading-relaxed" style={{ color: 'oklch(0.7 0.16 70)' }}>
          {t('settings.security.backupHint')}
        </p>
        <div
          className="grid grid-cols-2 gap-2 rounded-lg p-4 font-mono text-[13px]"
          style={{ background: 'oklch(1 0 0 / 0.04)', boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.08)', color: 'oklch(0.92 0 0)' }}
        >
          {backupCodes.map(c => <span key={c}>{c}</span>)}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => navigator.clipboard?.writeText(backupCodes.join('\n'))}>
            {t('settings.security.copy')}
          </Button>
          <Button onClick={reset} style={{ background: 'oklch(0.95 0 0)', color: 'oklch(0.12 0 0)' }}>
            {t('settings.security.done')}
          </Button>
        </div>
      </div>
    )
  }

  // Enrolling view: show QR + code confirmation.
  if (stage === 'enrolling') {
    return (
      <div className="mt-6 space-y-4 max-w-sm">
        <p className="text-xs leading-relaxed" style={{ color: 'oklch(0.65 0 0)' }}>
          {t('settings.security.scanHint')}
        </p>
        <div className="inline-block rounded-lg bg-white p-3">
          <QRCodeSVG value={otpauthUri} size={168} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="totp-enroll-code" className="text-[10px] uppercase tracking-[0.2em]" style={{ color: 'oklch(0.5 0 0)' }}>
            {t('settings.security.code')}
          </Label>
          <Input id="totp-enroll-code" value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" autoFocus className="settings-input" />
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={reset} disabled={confirm.isPending}>
            {t('settings.mode.cancel')}
          </Button>
          <Button
            onClick={() => confirm.mutate()}
            disabled={confirm.isPending || !code}
            style={{ background: 'oklch(0.95 0 0)', color: 'oklch(0.12 0 0)' }}
          >
            {confirm.isPending ? t('settings.mode.saving') : t('settings.security.verify')}
          </Button>
        </div>
      </div>
    )
  }

  // Idle (disabled): offer to enable.
  return (
    <div className="mt-6 space-y-4 max-w-sm">
      <div className="flex items-center gap-2">
        <ShieldOff className="size-4" style={{ color: 'oklch(0.6 0 0)' }} />
        <span className="text-[14px]" style={{ color: 'oklch(0.92 0 0)' }}>
          {t('settings.security.disabledLabel')}
        </span>
      </div>
      <p className="text-xs leading-relaxed" style={{ color: 'oklch(0.65 0 0)' }}>
        {t('settings.security.intro')}
      </p>
      <Button
        onClick={() => enroll.mutate()}
        disabled={enroll.isPending}
        className="text-[11px] uppercase tracking-[0.18em]"
        style={{ background: 'oklch(0.95 0 0)', color: 'oklch(0.12 0 0)' }}
      >
        <ShieldCheck className="size-3.5" />
        {enroll.isPending ? t('settings.mode.saving') : t('settings.security.enable')}
      </Button>
    </div>
  )
}
