import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTranslation } from 'react-i18next'
import { Bell, CheckCircle2, Clock } from 'lucide-react'

interface Account {
  id: string
  name: string
  bank: string
  mode: 'reconcile' | 'passthrough'
}

interface BankMovement {
  id: string
  external_id: string
  amount: number | string
  currency: string
  sender_name: string | null
  received_at: string
  notified_at: string | null
  excluded_at: string | null
}

function MovementsTable({ accountId }: { accountId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const { data: movements = [], isLoading } = useQuery<BankMovement[]>({
    queryKey: ['movements', accountId],
    queryFn: () => api.get(`/accounts/${accountId}/movements`).then(r => r.data),
  })

  const renotify = useMutation({
    mutationFn: (movementId: string) =>
      api.post(`/accounts/${accountId}/movements/${movementId}/notify`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['movements', accountId] })
    },
  })

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">{t('movements.loading')}</p>
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
            <TableCell className="font-mono text-xs">{m.external_id}</TableCell>
            <TableCell>{m.amount}</TableCell>
            <TableCell>{m.currency}</TableCell>
            <TableCell>{m.sender_name ?? '—'}</TableCell>
            <TableCell className="text-muted-foreground text-xs">
              {new Date(m.received_at).toLocaleString()}
            </TableCell>
            <TableCell>
              {m.notified_at ? (
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
                      <Button onClick={() => renotify.mutate(m.id)}>
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
            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
              {t('movements.emptyTable')}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}

export function BankMovements() {
  const { t } = useTranslation()

  const { data: allAccounts = [], isLoading } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounts').then(r => r.data),
  })

  const accounts = useMemo(
    () => allAccounts.filter(a => a.mode === 'passthrough'),
    [allAccounts]
  )

  return (
    <div className="p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">{t('movements.title')}</h2>
        <p className="text-muted-foreground">{t('movements.subtitle')}</p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">{t('movements.loading')}</p>
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
