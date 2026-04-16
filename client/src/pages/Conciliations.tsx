import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  matched:    'default',
  pending:    'outline',
  processing: 'secondary',
  not_found:  'destructive',
  ambiguous:  'destructive',
  failed:     'destructive',
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

function OrdersTable({ requests, accounts, showAccount }: { requests: ConciliationRequest[]; accounts: Account[]; showAccount?: boolean }) {
  const { t } = useTranslation()
  const accountMap = Object.fromEntries(accounts.map(a => [a.id, a.name || a.bank]))

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
              <Badge variant={statusVariant[r.status] ?? 'outline'}>{t(`enums.conciliationStatus.${r.status}`)}</Badge>
            </TableCell>
            <TableCell className="text-muted-foreground text-xs">
              {new Date(r.created_at).toLocaleString()}
            </TableCell>
          </TableRow>
        ))}
        {requests.length === 0 && (
          <TableRow>
            <TableCell colSpan={showAccount ? 7 : 6} className="text-center text-muted-foreground py-8">
              {t('conciliations.empty')}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}

function filterRequests(requests: ConciliationRequest[], query: string, t: (key: string) => string): ConciliationRequest[] {
  if (!query) return requests
  const q = query.toLowerCase()
  return requests.filter(r =>
    r.external_id.toLowerCase().includes(q) ||
    (r.sender_name && r.sender_name.toLowerCase().includes(q)) ||
    String(r.expected_amount).includes(q) ||
    r.currency.toLowerCase().includes(q) ||
    t(`enums.conciliationStatus.${r.status}`).toLowerCase().includes(q)
  )
}

export function Conciliations() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')

  const { data: requests = [], isLoading: loadingReqs } = useQuery<ConciliationRequest[]>({
    queryKey: ['conciliations'],
    queryFn: () => api.get('/conciliation').then(r => r.data),
  })

  const { data: accounts = [], isLoading: loadingAccounts } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounts').then(r => r.data),
  })

  const isLoading = loadingReqs || loadingAccounts
  const filtered = filterRequests(requests, search, t)

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">{t('conciliations.title')}</h2>
          <p className="text-muted-foreground">{t('conciliations.subtitle')}</p>
        </div>
        <div className="relative max-w-xs w-full">
          <Input
            placeholder={t('conciliations.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={search ? 'pr-8' : ''}
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
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">{t('conciliations.loading')}</p>
      ) : (
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">{t('conciliations.tabAll')}</TabsTrigger>
            {accounts.map(account => (
              <TabsTrigger key={account.id} value={account.id}>
                {account.name || account.bank}
              </TabsTrigger>
            ))}
          </TabsList>

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
