import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { CheckCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useScripts, usePromoteScript } from '../hooks/useScripts'
import type { ScriptStatus } from '../types'

const statusVariant: Record<ScriptStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active:     'default',
  review:     'secondary',
  testing:    'outline',
  draft:      'outline',
  deprecated: 'secondary',
  failed:     'destructive',
}

export function Scripts() {
  const { t } = useTranslation(['script-engine', 'common'])
  const { data: scripts = [], isLoading } = useScripts()
  const promote = usePromoteScript()

  return (
    <div className="p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">{t('scripts.title')}</h2>
        <p className="text-muted-foreground">{t('scripts.subtitle')}</p>
      </div>
      <Card>
        <CardHeader><CardTitle>{t('scripts.registered')}</CardTitle></CardHeader>
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
                {scripts.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.bank}</TableCell>
                    <TableCell className="font-mono text-xs">{s.flowType}</TableCell>
                    <TableCell className="font-mono text-xs">{s.version}</TableCell>
                    <TableCell>{s.origin}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[s.status] ?? 'outline'}>{t(`enums.scriptStatus.${s.status}`)}</Badge>
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
                {scripts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      {t('scripts.empty')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
