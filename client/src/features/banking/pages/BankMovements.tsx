import { QueryError } from '@/shared/ui/QueryError'
import { useQueryClient } from '@tanstack/react-query'
import { useAccounts } from '@/features/account/hooks/useAccounts'
import { useBankMovements, useReNotifyMovement, bankMovementsQueryKey } from '../hooks/useBankMovements'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/shared/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { localizedApiError } from '@/shared/http/client'
import { Bell, CheckCircle2, Clock, Inbox } from 'lucide-react'

function MovementsTable({ accountId }: { accountId: string }) {
  const { t } = useTranslation(['banking', 'common'])
  const qc = useQueryClient()

  const { data: movements = [], isLoading, isError, refetch } = useBankMovements(accountId)

  const renotify = useReNotifyMovement(accountId)

  const handleRenotify = (movementId: string) => {
    renotify.mutate(movementId, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: bankMovementsQueryKey(accountId) })
      },
      onError: err => toast.error(localizedApiError(err) ?? t('common:errors.generic')),
    })
  }

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">{t('movements.loading')}</p>
  }

  if (isError) {
    return <QueryError onRetry={() => refetch()} />
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('movements.colExternalId')}</TableHead>
          <TableHead>{t('movements.colAmount')}</TableHead>
          <TableHead>{t('movements.colCurrency')}</TableHead>
          <TableHead>{t('movements.colSender')}</TableHead>
          <TableHead>{t('movements.colReceivedAt')}</TableHead>
          <TableHead>{t('movements.colNotified')}</TableHead>
          <TableHead>{t('movements.colActions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {movements.map(m => (
          <TableRow key={m.id}>
            <TableCell className="font-mono text-xs">{m.externalId}</TableCell>
            <TableCell>{m.amount}</TableCell>
            <TableCell>{m.currency}</TableCell>
            <TableCell>{m.senderName ?? '—'}</TableCell>
            <TableCell className="text-muted-foreground text-xs">
              {new Date(m.receivedAt).toLocaleString()}
            </TableCell>
            <TableCell>
              {m.notifiedAt ? (
                <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 border-transparent">
                  <CheckCircle2 />
                  {t('movements.notified')}
                </Badge>
              ) : (
                <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-transparent">
                  <Clock />
                  {t('movements.pending')}
                </Badge>
              )}
            </TableCell>
            <TableCell>
              <Dialog>
                <DialogTrigger render={
                  <Button variant="outline" size="icon-sm">
                    <Bell className="h-4 w-4" />
                  </Button>
                } />
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('movements.renotifyTitle')}</DialogTitle>
                    <DialogDescription>{t('movements.renotifyDesc')}</DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose render={
                      <Button variant="outline">
                        {t('movements.renotifyCancel')}
                      </Button>
                    } />
                    <DialogClose render={
                      <Button onClick={() => handleRenotify(m.id)}>
                        {t('movements.renotifyConfirm')}
                      </Button>
                    } />
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </TableCell>
          </TableRow>
        ))}
        {movements.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="py-12">
              <div className="flex flex-col items-center justify-center gap-1.5 text-center">
                <Inbox className="size-6 text-muted-foreground/40" aria-hidden />
                <p className="text-sm font-medium">{t('movements.emptyTable')}</p>
                <p className="text-xs text-muted-foreground max-w-md text-balance px-4">{t('movements.emptyTableDesc')}</p>
              </div>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}

export function BankMovements() {
  const { t } = useTranslation('banking')
  const { data: accounts = [], isLoading, isError, refetch } = useAccounts()

  return (
    <div className="p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">{t('movements.title')}</h2>
        <p className="text-muted-foreground">{t('movements.subtitle')}</p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">{t('movements.loading')}</p>
      ) : isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t('movements.emptyNoAccounts')}
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue={accounts[0].id}>
          <TabsList>
            {accounts.map(account => (
              <TabsTrigger key={account.id} value={account.id}>
                {account.name || account.bank}
              </TabsTrigger>
            ))}
          </TabsList>

          {accounts.map(account => (
            <TabsContent key={account.id} value={account.id}>
              <Card>
                <CardHeader>
                  <CardTitle>{account.name || account.bank}</CardTitle>
                </CardHeader>
                <CardContent>
                  <MovementsTable accountId={account.id} />
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  )
}
