import { useState, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTranslation } from 'react-i18next'
import { X, SlidersHorizontal, Bell, CheckCircle2, Clock, Loader2, SearchX, HelpCircle, XCircle, History, Ban, type LucideIcon } from 'lucide-react'

const STATUS_KEYS = ['matched', 'pending', 'processing', 'not_found', 'ambiguous', 'failed', 'expired', 'cancelled'] as const

const statusStyle: Record<string, { icon: LucideIcon; className: string }> = {
  matched:    { icon: CheckCircle2, className: 'bg-green-500/10 text-green-700 dark:text-green-400 border-transparent' },
  pending:    { icon: Clock,        className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-transparent' },
  processing: { icon: Loader2,      className: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-transparent [&>svg]:animate-spin' },
  not_found:  { icon: SearchX,      className: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-transparent' },
  ambiguous:  { icon: HelpCircle,   className: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-transparent' },
  failed:     { icon: XCircle,      className: 'bg-red-500/10 text-red-700 dark:text-red-400 border-transparent' },
  expired:    { icon: History,      className: 'bg-gray-500/10 text-gray-700 dark:text-gray-400 border-transparent' },
  cancelled:  { icon: Ban,          className: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-transparent' },
}

interface ConciliationRequest {
  id: string
  account_id: string
  external_id: string
  expected_amount: number
  currency: string
  sender_name: string | null
  status: string
  created_at: string
}

interface Account {
  id: string
  name: string
  bank: string
}

interface Filters {
  status: string
  dateFrom: string
  dateTo: string
}

const emptyFilters: Filters = { status: '', dateFrom: '', dateTo: '' }

function hasActiveFilters(f: Filters) {
  return f.status !== '' || f.dateFrom !== '' || f.dateTo !== ''
}

const NOTIFIABLE_STATUSES = ['matched', 'ambiguous', 'expired']

function OrdersTable({ requests, accounts, showAccount }: { requests: ConciliationRequest[]; accounts: Account[]; showAccount?: boolean }) {
  const { t } = useTranslation()
  const accountMap = Object.fromEntries(accounts.map(a => [a.id, a.name || a.bank]))

  const renotify = useMutation({
    mutationFn: (requestId: string) => api.post(`/conciliation/${requestId}/notify`),
  })

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {showAccount && <TableHead>{t('conciliations.colAccount')}</TableHead>}
          <TableHead>{t('conciliations.colExternalId')}</TableHead>
          <TableHead>{t('conciliations.colAmount')}</TableHead>
          <TableHead>{t('conciliations.colCurrency')}</TableHead>
          <TableHead>{t('conciliations.colSender')}</TableHead>
          <TableHead>{t('conciliations.colStatus')}</TableHead>
          <TableHead>{t('conciliations.colCreated')}</TableHead>
          <TableHead>{t('conciliations.colActions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.map(r => (
          <TableRow key={r.id}>
            {showAccount && <TableCell className="text-sm">{accountMap[r.account_id] ?? '—'}</TableCell>}
            <TableCell className="font-mono text-xs">{r.external_id}</TableCell>
            <TableCell>{r.expected_amount}</TableCell>
            <TableCell>{r.currency}</TableCell>
            <TableCell>{r.sender_name ?? '—'}</TableCell>
            <TableCell>
              {(() => {
                const style = statusStyle[r.status]
                const Icon = style?.icon
                return (
                  <Badge className={style?.className ?? ''}>
                    {Icon && <Icon />}
                    {t(`enums.conciliationStatus.${r.status}`)}
                  </Badge>
                )
              })()}
            </TableCell>
            <TableCell className="text-muted-foreground text-xs">
              {new Date(r.created_at).toLocaleString()}
            </TableCell>
            <TableCell>
              {NOTIFIABLE_STATUSES.includes(r.status) ? (
                <Dialog>
                  <DialogTrigger render={
                    <Button variant="outline" size="icon-sm">
                      <Bell className="h-4 w-4" />
                    </Button>
                  } />
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t('conciliations.renotifyTitle')}</DialogTitle>
                      <DialogDescription>{t('conciliations.renotifyDesc')}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose render={
                        <Button variant="outline">
                          {t('conciliations.renotifyCancel')}
                        </Button>
                      } />
                      <DialogClose render={
                        <Button onClick={() => renotify.mutate(r.id)}>
                          {t('conciliations.renotifyConfirm')}
                        </Button>
                      } />
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              ) : (
                <Button variant="outline" size="icon-sm" disabled>
                  <Bell className="h-4 w-4" />
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
        {requests.length === 0 && (
          <TableRow>
            <TableCell colSpan={showAccount ? 8 : 7} className="text-center text-muted-foreground py-8">
              {t('conciliations.empty')}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}

export function Conciliations() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [draft, setDraft] = useState<Filters>(emptyFilters)

  const { data: requests = [], isLoading: loadingReqs } = useQuery<ConciliationRequest[]>({
    queryKey: ['conciliations'],
    queryFn: () => api.get('/conciliation').then(r => r.data),
  })

  const { data: accounts = [], isLoading: loadingAccounts } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounts').then(r => r.data),
  })

  const isLoading = loadingReqs || loadingAccounts

  const filtered = useMemo(() => {
    let result = requests

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(r =>
        r.external_id.toLowerCase().includes(q) ||
        (r.sender_name && r.sender_name.toLowerCase().includes(q)) ||
        String(r.expected_amount).includes(q) ||
        r.currency.toLowerCase().includes(q) ||
        t(`enums.conciliationStatus.${r.status}`).toLowerCase().includes(q)
      )
    }

    if (filters.status) {
      result = result.filter(r => r.status === filters.status)
    }

    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom)
      result = result.filter(r => new Date(r.created_at) >= from)
    }

    if (filters.dateTo) {
      const to = new Date(filters.dateTo + 'T23:59:59')
      result = result.filter(r => new Date(r.created_at) <= to)
    }

    return result
  }, [requests, search, filters, t])

  return (
    <div className="p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">{t('conciliations.title')}</h2>
        <p className="text-muted-foreground">{t('conciliations.subtitle')}</p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">{t('conciliations.loading')}</p>
      ) : (
        <Tabs defaultValue="all">
          <div className="flex items-center justify-between gap-4">
            <TabsList>
              <TabsTrigger value="all">{t('conciliations.tabAll')}</TabsTrigger>
              {accounts.map(account => (
                <TabsTrigger key={account.id} value={account.id}>
                  {account.name || account.bank}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Input
                  placeholder={t('conciliations.searchPlaceholder')}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className={`w-64 ${search ? 'pr-8' : ''}`}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <Dialog onOpenChange={open => { if (open) setDraft(filters) }}>
                <DialogTrigger render={
                  <Button variant="outline" size="default" className="relative">
                    <SlidersHorizontal className="h-4 w-4 mr-1.5" />
                    {t('conciliations.filters')}
                    {hasActiveFilters(filters) && (
                      <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary" />
                    )}
                  </Button>
                } />
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('conciliations.filters')}</DialogTitle>
                  </DialogHeader>

                  <div className="space-y-4 mt-2">
                    <div className="space-y-1.5">
                      <Label>{t('conciliations.colStatus')}</Label>
                      <div className="relative">
                        <Select value={draft.status} onValueChange={v => setDraft(d => ({ ...d, status: v }))}>
                          <SelectTrigger className={draft.status ? 'w-full [&>svg:last-child]:hidden pr-8' : 'w-full'}>
                            <SelectValue placeholder={t('conciliations.allStatuses')}>
                              {draft.status ? t(`enums.conciliationStatus.${draft.status}`) : t('conciliations.allStatuses')}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">{t('conciliations.allStatuses')}</SelectItem>
                            {STATUS_KEYS.map(s => (
                              <SelectItem key={s} value={s}>{t(`enums.conciliationStatus.${s}`)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {draft.status && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); setDraft(d => ({ ...d, status: '' })) }} className="absolute right-2 top-1/2 -translate-y-1/2 z-10 text-muted-foreground hover:text-foreground">
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label>{t('conciliations.dateFrom')}</Label>
                      <div className="relative">
                        <Input
                          type="date"
                          value={draft.dateFrom}
                          max={draft.dateTo || undefined}
                          onChange={e => setDraft(d => ({ ...d, dateFrom: e.target.value }))}
                          className={draft.dateFrom ? '[&::-webkit-calendar-picker-indicator]:!hidden pr-8' : ''}
                        />
                        {draft.dateFrom && (
                          <button type="button" onClick={() => setDraft(d => ({ ...d, dateFrom: '' }))} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label>{t('conciliations.dateTo')}</Label>
                      <div className="relative">
                        <Input
                          type="date"
                          value={draft.dateTo}
                          min={draft.dateFrom || undefined}
                          onChange={e => setDraft(d => ({ ...d, dateTo: e.target.value }))}
                          className={draft.dateTo ? '[&::-webkit-calendar-picker-indicator]:!hidden pr-8' : ''}
                        />
                        {draft.dateTo && (
                          <button type="button" onClick={() => setDraft(d => ({ ...d, dateTo: '' }))} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <DialogFooter>
                    {hasActiveFilters(draft) && (
                      <Button variant="ghost" onClick={() => setDraft(emptyFilters)}>
                        {t('conciliations.clearFilters')}
                      </Button>
                    )}
                    <DialogClose render={
                      <Button onClick={() => setFilters(draft)}>
                        {t('conciliations.applyFilters')}
                      </Button>
                    } />
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <TabsContent value="all">
            <Card>
              <CardHeader><CardTitle>{t('conciliations.orders')}</CardTitle></CardHeader>
              <CardContent>
                <OrdersTable requests={filtered} accounts={accounts} showAccount />
              </CardContent>
            </Card>
          </TabsContent>

          {accounts.map(account => (
            <TabsContent key={account.id} value={account.id}>
              <Card>
                <CardHeader>
                  <CardTitle>{account.name || account.bank}</CardTitle>
                </CardHeader>
                <CardContent>
                  <OrdersTable requests={filtered.filter(r => r.account_id === account.id)} accounts={accounts} />
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  )
}
