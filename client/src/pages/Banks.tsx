import { useQuery } from '@tanstack/react-query'
import { httpClient } from '@/shared/http/client'
import { Badge } from '@/shared/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { useTranslation } from 'react-i18next'

type BankStatus = 'pending' | 'ready' | 'failed' | 'onboarding'

interface Bank {
  id: string
  name: string
  code: string
  loginUrl: string
  status: BankStatus
}

const statusVariant: Record<BankStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  ready:       'default',
  onboarding:  'secondary',
  pending:     'outline',
  failed:      'destructive',
}

export function Banks() {
  const { t } = useTranslation()

  const { data: banks = [], isLoading } = useQuery<Bank[]>({
    queryKey: ['banks'],
    queryFn: () => httpClient.get('/banks').then(r => r.data),
  })

  return (
    <div className="p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">{t('banks.title')}</h2>
        <p className="text-muted-foreground">{t('banks.subtitle')}</p>
      </div>

      <Card>
        <CardHeader><CardTitle>{t('banks.registered')}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm">{t('banks.loading')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('banks.colName')}</TableHead>
                  <TableHead>{t('banks.colCode')}</TableHead>
                  <TableHead>{t('banks.colLoginUrl')}</TableHead>
                  <TableHead>{t('banks.colStatus')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {banks.map(bank => (
                  <TableRow key={bank.id}>
                    <TableCell className="font-medium">{bank.name}</TableCell>
                    <TableCell className="font-mono text-xs">{bank.code}</TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-48">{bank.loginUrl}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[bank.status] ?? 'outline'}>{t(`enums.bankStatus.${bank.status}`)}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {banks.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      {t('banks.empty')}
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
