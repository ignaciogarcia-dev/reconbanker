import { useQueries } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { Building2, GitMerge, CheckCircle, AlertCircle, Bell } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAccounts } from '@/features/account/hooks/useAccounts'
import { bankMovementsQueryKey } from '@/features/banking/hooks/useBankMovements'
import { listBankMovements } from '@/features/banking/api/movements'
import { useConciliations } from '@/features/conciliation/hooks/useConciliations'
import { useUser } from '@/features/user/hooks/useUser'
import type { Account } from '@/features/account/types'
import type { BankMovement } from '@/features/banking/types'
import type { ConciliationRequestListItem } from '@/features/conciliation/types'

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
          formatter={(v) => [v ?? 0, seriesLabel]}
          labelFormatter={(label) => {
            const str = String(label ?? '')
            if (groupedByMonth) {
              const [y, m] = str.split('-')
              return `${m}/${y}`
            }
            return str
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

  const { data: me } = useUser()
  const accountsQuery = useAccounts()
  const accounts: Account[] = accountsQuery.data ?? []

  const onlyPassthrough = me?.operationMode === 'passthrough'

  const conciliationsQuery = useConciliations()
  const conciliations: ConciliationRequestListItem[] = conciliationsQuery.data ?? []

  // Per-account movements query — kept as-is per spec ("do not rewrite the duplication logic").
  const movementResults = useQueries({
    queries: accounts.map(a => ({
      queryKey: [...bankMovementsQueryKey(a.id), 100, 0] as const,
      queryFn: (): Promise<BankMovement[]> => listBankMovements(a.id, 100, 0),
      enabled: onlyPassthrough,
    })),
  })

  const allMovements = movementResults.flatMap(r => r.data ?? [])

  // Reconcile stats
  const reconciledToday = conciliations.filter(
    r => r.status === 'matched' && new Date(r.createdAt).toLocaleDateString('sv') === today
  ).length
  const unreconciled = conciliations.filter(r => r.status === 'pending' || r.status === 'processing').length
  const { data: reconcileChart, groupedByMonth: reconcileGrouped } = buildTimeSeriesData(
    conciliations.filter(r => r.status === 'matched').map(r => r.createdAt)
  )

  // Passthrough stats
  const movementsNotified = allMovements.filter(m => m.notifiedAt !== null).length
  const movementsPending = allMovements.filter(m => m.notifiedAt === null && m.excludedAt === null).length
  const { data: movementChart, groupedByMonth: movementGrouped } = buildTimeSeriesData(
    allMovements.map(m => m.receivedAt)
  )

  return (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">{t('dashboard.title')}</h2>
        <p className="text-muted-foreground">{t('dashboard.subtitle')}</p>
      </div>

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
    </div>
  )
}
