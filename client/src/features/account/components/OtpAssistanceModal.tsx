import { localizedApiError } from '@/shared/http/client'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { OtpInput } from '@/shared/ui/otp-input'
import { submitOtp } from '../api/assistance'
import type { PendingAssistance } from '@/shared/realtime/useRealtime'

export interface OtpAssistanceModalProps {
  accountId: string
  accountName: string
  assistance: PendingAssistance
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmitted: () => void
}

// POSTs the entered code to the internal OTP endpoint which routes it to the waiting scrape session
export function OtpAssistanceModal({
  accountId, accountName, assistance, open, onOpenChange, onSubmitted,
}: OtpAssistanceModalProps) {
  const { t } = useTranslation(['account'])
  const [code, setCode] = useState('')
  const { length, type } = assistance.descriptor

  const mutation = useMutation({
    mutationFn: () => submitOtp(accountId, code),
    onSuccess: () => {
      toast.success(t('accounts.otp.submitted'))
      setCode('')
      onSubmitted()
      onOpenChange(false)
    },
    onError: (err) => toast.error(localizedApiError(err) ?? t('accounts.otp.submitError')),
  })

  const canSubmit = code.length === length && !mutation.isPending && !mutation.isSuccess

  /* v8 ignore next -- the dialog only ever emits onOpenChange(false) here; the open branch is defensive */
  const handleOpenChange = (o: boolean) => { if (!o) setCode(''); onOpenChange(o) }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="gap-5 p-5 sm:max-w-[380px]">
        <DialogHeader className="gap-1">
          <DialogTitle className="text-[15px] tracking-tight">{t('accounts.otp.title')}</DialogTitle>
          <DialogDescription className="text-[13px] leading-snug">
            {t('accounts.otp.description', { account: accountName })}
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <OtpInput
            length={length}
            value={code}
            onChange={setCode}
            type={type}
            autoFocus
            onComplete={() => { if (!mutation.isPending && !mutation.isSuccess) mutation.mutate() }}
          />
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t('accounts.otp.cancel')}
          </Button>
          <Button size="sm" disabled={!canSubmit} onClick={() => mutation.mutate()}>
            {mutation.isPending ? t('accounts.otp.submitting') : t('accounts.otp.submit')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
