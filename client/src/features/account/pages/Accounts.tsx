import { QueryError } from '@/shared/ui/QueryError'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { localizedApiError } from '@/shared/http/client'
import { FormField } from '@/shared/ui/FormField'
import { Button, buttonVariants } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Badge } from '@/shared/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { Plus, Settings, ShieldAlert } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAccounts, useCreateAccount } from '../hooks/useAccounts'
import { useBanks } from '../hooks/useBanks'
import { useRealtime } from '@/shared/realtime/useRealtime'
import { OtpAssistanceModal } from '../components/OtpAssistanceModal'

type FormErrors = { bankId?: string; name?: string }

export function Accounts() {
  const navigate = useNavigate()
  const { t } = useTranslation(['account', 'common'])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ bankId: '', name: '' })
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitted, setSubmitted] = useState(false)

  const bankId = useId()
  const nameId = useId()
  const bankHelpId = useId()
  const nameHelpId = useId()

  const { data: accounts = [], isLoading, isError, refetch } = useAccounts()
  const { data: banks = [] } = useBanks()

  // Live OTP assistance state pushed over the realtime WebSocket, seeded for the listed accounts
  // so a request raised before the page opened still shows the assistance button.
  const { assistance, clearAccount } = useRealtime(accounts.map(a => a.id))
  const [otpAccountId, setOtpAccountId] = useState<string | null>(null)
  const otpAssistance = otpAccountId ? assistance.get(otpAccountId) : undefined

  /* v8 ignore next -- the modal only ever requests close here; the open branch is defensive */
  const closeOtpModal = (o: boolean) => { if (!o) setOtpAccountId(null) }

  /* v8 ignore next 2 -- the OTP button only renders for listed accounts, so find matches; the name/id fallbacks are defensive */
  const otpAccountName =
    accounts.find(a => a.id === otpAccountId)?.name ?? otpAccountId ?? ''

  const bankNameByCode = Object.fromEntries(banks.map(b => [b.code, b.name]))

  const create = useCreateAccount()

  function validate(values: typeof form): FormErrors {
    const next: FormErrors = {}
    if (!values.bankId) next.bankId = t('accounts.dialog.errors.bankRequired')
    if (!values.name.trim()) next.name = t('accounts.dialog.errors.nameRequired')
    return next
  }

  function handleCreate() {
    setSubmitted(true)
    const next = validate(form)
    setErrors(next)
    if (Object.keys(next).length > 0) return
    create.mutate(form, {
      onSuccess: () => {
        setOpen(false)
        setForm({ bankId: '', name: '' })
        setErrors({})
        setSubmitted(false)
      },
      onError: err => toast.error(localizedApiError(err) ?? t('common:errors.generic')),
    })
  }

  function updateForm<K extends keyof typeof form>(key: K, value: string) {
    setForm(f => {
      const updated = { ...f, [key]: value }
      if (submitted) setErrors(validate(updated))
      return updated
    })
  }

  /* v8 ignore next -- base-ui Select always passes a string so `?? ''` is defensive */
  const onBankChange = (v: string | null) => updateForm('bankId', v ?? '')

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setForm({ bankId: '', name: '' })
      setErrors({})
      setSubmitted(false)
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">{t('accounts.title')}</h2>
          <p className="text-muted-foreground">{t('accounts.subtitle')}</p>
        </div>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger className={buttonVariants()}>
            <Plus className="size-4 mr-2" />{t('accounts.newAccount')}
          </DialogTrigger>
          <DialogContent className="gap-5 p-5 sm:max-w-[400px]">
            <DialogHeader className="gap-1">
              <DialogTitle className="text-[15px] tracking-tight">{t('accounts.dialog.title')}</DialogTitle>
              <DialogDescription className="text-[13px] leading-snug">
                {t('accounts.dialog.description')}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3.5">
              <FormField
                label={t('accounts.dialog.name')}
                htmlFor={nameId}
                helpId={nameHelpId}
                hint={t('accounts.dialog.nameHint')}
                error={errors.name}
              >
                <Input
                  id={nameId}
                  placeholder={t('accounts.dialog.namePlaceholder')}
                  value={form.name}
                  onChange={e => updateForm('name', e.target.value)}
                  aria-invalid={errors.name ? true : undefined}
                  aria-describedby={nameHelpId}
                />
              </FormField>
              <FormField
                label={t('accounts.dialog.bank')}
                htmlFor={bankId}
                helpId={bankHelpId}
                hint={t('accounts.dialog.bankHint')}
                error={errors.bankId}
              >
                <Select value={form.bankId} onValueChange={onBankChange}>
                  <SelectTrigger
                    id={bankId}
                    aria-invalid={errors.bankId ? true : undefined}
                    aria-describedby={bankHelpId}
                    className="w-full"
                  >
                    <SelectValue placeholder={t('accounts.dialog.selectBank')}>
                      {banks.find(b => b.id === form.bankId)?.name ?? null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {banks.filter(b => b.status === 'ready').map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <DialogClose render={<Button variant="ghost" size="sm" />}>
                {t('accounts.dialog.cancel')}
              </DialogClose>
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={create.isPending}
              >
                {create.isPending ? t('accounts.dialog.creating') : t('accounts.dialog.create')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <Card>
        <CardHeader><CardTitle>{t('accounts.registered')}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm">{t('accounts.loading')}</p>
          ) : isError ? (
            <QueryError onRetry={() => refetch()} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('accounts.colName')}</TableHead>
                  <TableHead>{t('accounts.colBank')}</TableHead>
                  <TableHead>{t('accounts.colStatus')}</TableHead>
                  <TableHead>{t('accounts.colId')}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.name ?? '—'}</TableCell>
                    <TableCell>{bankNameByCode[a.bank] ?? a.bank}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={a.status === 'active' ? 'default' : 'secondary'}>
                          {t(`common:enums.accountStatus.${a.status}`)}
                        </Badge>
                        {assistance.has(a.id) && (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => setOtpAccountId(a.id)}
                          >
                            <ShieldAlert className="size-3 mr-1" />
                            {t('accounts.otp.assistanceNeeded')}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs font-mono">{a.id}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/accounts/${a.id}/config`)}>
                        <Settings className="size-3 mr-1" />
                        {t('accounts.configure')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {accounts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      {t('accounts.empty')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {otpAccountId && otpAssistance && (
        <OtpAssistanceModal
          accountId={otpAccountId}
          accountName={otpAccountName}
          assistance={otpAssistance}
          open={!!otpAccountId}
          onOpenChange={closeOtpModal}
          onSubmitted={() => clearAccount(otpAccountId)}
        />
      )}
    </div>
  )
}
