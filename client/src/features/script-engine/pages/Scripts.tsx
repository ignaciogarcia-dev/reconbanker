import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { CheckCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useScripts, usePromoteScript } from '../hooks/useScripts'
import { useBanks } from '@/features/account/hooks/useBanks'
import type { ScriptStatus } from '../types'

const statusVariant: Record<ScriptStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active:     'default',
  review:     'secondary',
  testing:    'outline',
  draft:      'outline',
  deprecated: 'secondary',
  failed:     'destructive',
}

type ScriptTab = 'active' | 'all'

export function Scripts() {
  const { t } = useTranslation(['script-engine', 'common'])
  const { data: scripts = [], isLoading } = useScripts()
  const { data: banks = [] } = useBanks()
  const promote = usePromoteScript()
  const [tab, setTab] = useState<ScriptTab>('active')

  const bankNameByCode = useMemo(
    () => Object.fromEntries(banks.map(b => [b.code, b.name])),
    [banks],
  )

  const filteredScripts = useMemo(
    () => (tab === 'active' ? scripts.filter((s) => s.status === 'active') : scripts),
    [scripts, tab],
  )

  const emptyMessage = tab === 'active' ? t('scripts.emptyActive') : t('scripts.empty')

  return (
    <div className="p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">{t('scripts.title')}</h2>
        <p className="text-muted-foreground">{t('scripts.subtitle')}</p>
      </div>
      <Tabs value={tab} onValueChange={(value) => setTab(value as ScriptTab)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">{t('scripts.tabAll')}</TabsTrigger>
          <TabsTrigger value="active">{t('scripts.tabActive')}</TabsTrigger>
        </TabsList>
        <Card>
          <CardHeader>
            <CardTitle>{t('scripts.registered')}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground text-sm">{t('scripts.loading')}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('scripts.colBank')}</TableHead>
                    <TableHead>{t('scripts.colFlow')}</TableHead>
                    <TableHead>{t('scripts.colVersion')}</TableHead>
                    <TableHead>{t('scripts.colOrigin')}</TableHead>
                    <TableHead>{t('scripts.colStatus')}</TableHead>
                    <TableHead>{t('scripts.colActions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredScripts.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{bankNameByCode[s.bank] ?? s.bank}</TableCell>
                      <TableCell className="font-mono text-xs">{t(`common:enums.flowType.${s.flowType}`)}</TableCell>
                      <TableCell className="font-mono text-xs">{s.version}</TableCell>
                      <TableCell>{t(`common:enums.scriptOrigin.${s.origin}`)}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[s.status] ?? 'outline'}>{t(`common:enums.scriptStatus.${s.status}`)}</Badge>
                      </TableCell>
                      <TableCell>
                        {s.status === 'review' && (
                          <Button size="sm" variant="outline" onClick={() => promote.mutate(s.id)}>
                            <CheckCircle className="size-3 mr-1" />
                            {t('scripts.promote')}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredScripts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        {emptyMessage}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </Tabs>
    </div>
  )
}
