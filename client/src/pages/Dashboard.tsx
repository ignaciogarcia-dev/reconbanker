import { useQuery, useQueries } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Building2, GitMerge, CheckCircle, AlertCircle, Bell, Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface Account {
  id: string
  name: string
  bank: string
  status: string
  mode: 'reconcile' | 'passthrough'
}

interface BankMovement {
  id: string
  received_at: string
  notified_at: string | null
  excluded_at: string | null
}

interface ConciliationRequest {
  id: string
  status: string
  created_at: string
}

function buildTimeSeriesData(dates: string[]) {
  if (dates.length === 0) return { data: [], groupedByMonth: false }
  const parsed = dates.map(d => new Date(d))
  const minDate = new Date(Math.min(...parsed.map(d => d.getTime())))
  const maxDate = new Date(Math.max(...parsed.map(d => d.getTime())))
  const diffDays = (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)
  const groupByMonth = diffDays > 90
  const counts: Record<string, number> = {}
  for (const d of parsed) {
    const key = groupByMonth
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      : d.toLocaleDateString('sv')
    counts[key] = (counts[key] ?? 0) + 1
  }
  return {
    data: Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count })),
    groupedByMonth: groupByMonth,
  }
}

function TimeSeriesChart({
  data,
  groupedByMonth,
  seriesLabel,
}: {
  data: { date: string; count: number }[]
  groupedByMonth: boolean
  seriesLabel: string
}) {
  if (data.length === 0) {
    return <p className="text-muted-foreground text-sm py-8 text-center">—</p>
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
          tickFormatter={(value: string) => {
            if (groupedByMonth) {
              const [y, m] = value.split('-')
              return `${m}/${y.slice(2)}`
            }
            const [, m, d] = value.split('-')
            return `${d}/${m}`
          }}
          interval="preserveStartEnd"
        />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} className="text-muted-foreground" />
        <Tooltip
          contentStyle={{ fontSize: 12 }}
          formatter={(v: number) => [v, seriesLabel]}
          labelFormatter={(label: string) => {
            if (groupedByMonth) {
              const [y, m] = label.split('-')
              return `${m}/${y}`
            }
            return label
          }}
        />
        <Line type="monotone" dataKey="count" strokeWidth={2} dot={false} className="stroke-primary" />
      </LineChart>
    </ResponsiveContainer>
  )
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  )
}

export function Dashboard() {
  const { t } = useTranslation()
  const today = new Date().toLocaleDateString('sv')

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounts').then(r => r.data),
  })

  const reconcileAccounts = accounts.filter(a => a.mode === 'reconcile')
  const passthroughAccounts = accounts.filter(a => a.mode === 'passthrough')
  const isMixed = reconcileAccounts.length > 0 && passthroughAccounts.length > 0
  const onlyPassthrough = passthroughAccounts.length > 0 && reconcileAccounts.length === 0

  const { data: conciliations = [] } = useQuery<ConciliationRequest[]>({
    queryKey: ['conciliations'],
    queryFn: () => api.get('/conciliation').then(r => r.data),
    enabled: reconcileAccounts.length > 0,
  })

  const movementResults = useQueries({
    queries: passthroughAccounts.map(a => ({
      queryKey: ['movements', a.id],
      queryFn: (): Promise<BankMovement[]> => api.get(`/accounts/${a.id}/movements`).then(r => r.data),
    })),
  })

  const allMovements = movementResults.flatMap(r => r.data ?? [])

  // Reconcile stats
  const reconciledToday = conciliations.filter(
    r => r.status === 'matched' && new Date(r.created_at).toLocaleDateString('sv') === today
  ).length
  const unreconciled = conciliations.filter(r => r.status === 'pending' || r.status === 'processing').length
  const { data: reconcileChart, groupedByMonth: reconcileGrouped } = buildTimeSeriesData(
    conciliations.filter(r => r.status === 'matched').map(r => r.created_at)
  )

  // Passthrough stats
  const movementsToday = allMovements.filter(
    m => new Date(m.received_at).toLocaleDateString('sv') === today
  ).length
  const movementsNotified = allMovements.filter(m => m.notified_at !== null).length
  const movementsPending = allMovements.filter(m => m.notified_at === null && m.excluded_at === null).length
  const { data: movementChart, groupedByMonth: movementGrouped } = buildTimeSeriesData(
    allMovements.map(m => m.received_at)
  )

  return (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">{t('dashboard.title')}</h2>
        <p className="text-muted-foreground">{t('dashboard.subtitle')}</p>
      </div>

      {!isMixed ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label={t('dashboard.activeAccounts')} value={accounts.length} icon={Building2} />
            {onlyPassthrough ? (
              <>
                <StatCard label={t('dashboard.movementsTotal')} value={allMovements.length} icon={GitMerge} />
                <StatCard label={t('dashboard.movementsNotified')} value={movementsNotified} icon={Bell} />
                <StatCard label={t('dashboard.movementsPending')} value={movementsPending} icon={AlertCircle} />
              </>
            ) : (
              <>
                <StatCard label={t('dashboard.conciliations')} value={conciliations.length} icon={GitMerge} />
                <StatCard label={t('dashboard.reconciledToday')} value={reconciledToday} icon={CheckCircle} />
                <StatCard label={t('dashboard.unreconciled')} value={unreconciled} icon={AlertCircle} />
              </>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                {t(onlyPassthrough ? 'dashboard.movementsByDay' : 'dashboard.reconciledByDay')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {onlyPassthrough ? (
                <TimeSeriesChart
                  data={movementChart}
                  groupedByMonth={movementGrouped}
                  seriesLabel={t('dashboard.movementsTotal')}
                />
              ) : (
                <TimeSeriesChart
                  data={reconcileChart}
                  groupedByMonth={reconcileGrouped}
                  seriesLabel={t('dashboard.conciliations')}
                />
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <Tabs defaultValue="reconcile">
            <TabsList>
              <TabsTrigger value="reconcile">{t('dashboard.reconciledSection')}</TabsTrigger>
              <TabsTrigger value="passthrough">{t('dashboard.passthroughSection')}</TabsTrigger>
            </TabsList>

            <TabsContent value="reconcile" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard label={t('dashboard.conciliations')} value={conciliations.length} icon={GitMerge} />
                <StatCard label={t('dashboard.reconciledToday')} value={reconciledToday} icon={CheckCircle} />
                <StatCard label={t('dashboard.unreconciled')} value={unreconciled} icon={AlertCircle} />
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">{t('dashboard.reconciledByDay')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <TimeSeriesChart
                    data={reconcileChart}
                    groupedByMonth={reconcileGrouped}
                    seriesLabel={t('dashboard.conciliations')}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="passthrough" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label={t('dashboard.movementsTotal')} value={allMovements.length} icon={GitMerge} />
                <StatCard label={t('dashboard.movementsToday')} value={movementsToday} icon={Clock} />
                <StatCard label={t('dashboard.movementsNotified')} value={movementsNotified} icon={Bell} />
                <StatCard label={t('dashboard.movementsPending')} value={movementsPending} icon={AlertCircle} />
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">{t('dashboard.movementsByDay')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <TimeSeriesChart
                    data={movementChart}
                    groupedByMonth={movementGrouped}
                    seriesLabel={t('dashboard.movementsTotal')}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}
