import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, GitMerge, CheckCircle, AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface ConciliationRequest {
  id: string
  status: string
  created_at: string
}

function buildChartData(requests: ConciliationRequest[]) {
  const matched = requests.filter(r => r.status === 'matched')
  if (matched.length === 0) return { data: [], groupedByMonth: false }

  const dates = matched.map(r => new Date(r.created_at))
  const minDate = new Date(Math.min(...dates.map(d => d.getTime())))
  const maxDate = new Date(Math.max(...dates.map(d => d.getTime())))
  const diffDays = (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)

  const groupByMonth = diffDays > 90
  const counts: Record<string, number> = {}

  for (const r of matched) {
    const d = new Date(r.created_at)
    const key = groupByMonth
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      : d.toLocaleDateString('sv') // YYYY-MM-DD
    counts[key] = (counts[key] ?? 0) + 1
  }

  return {
    data: Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count })),
    groupedByMonth: groupByMonth,
  }
}

export function Dashboard() {
  const { t } = useTranslation()

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounts').then(r => r.data),
  })

  const { data: conciliations = [] } = useQuery<ConciliationRequest[]>({
    queryKey: ['conciliations'],
    queryFn: () => api.get('/conciliation').then(r => r.data),
  })

  const today = new Date().toLocaleDateString('sv')
  const reconciledToday = conciliations.filter(r => r.status === 'matched' && new Date(r.created_at).toLocaleDateString('sv') === today).length
  const unreconciled = conciliations.filter(r => r.status === 'pending' || r.status === 'processing').length
  const { data: chartData, groupedByMonth } = buildChartData(conciliations)

  const stats = [
    { label: t('dashboard.activeAccounts'),  value: accounts.length,    icon: Building2 },
    { label: t('dashboard.conciliations'),   value: conciliations.length, icon: GitMerge },
    { label: t('dashboard.reconciledToday'), value: reconciledToday,    icon: CheckCircle },
    { label: t('dashboard.unreconciled'),    value: unreconciled,        icon: AlertCircle },
  ]

  return (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">{t('dashboard.title')}</h2>
        <p className="text-muted-foreground">{t('dashboard.subtitle')}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{t('dashboard.reconciledByDay')}</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">—</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
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
                  formatter={(v: number) => [v, t('dashboard.conciliations')]}
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
          )}
        </CardContent>
      </Card>
    </div>
  )
}
