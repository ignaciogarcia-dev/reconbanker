import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

interface Bank { id: string; code: string; name: string; status: string }

export function Accounts() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ bankId: '', name: '' })

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounts').then(r => r.data),
  })

  const { data: banks = [] } = useQuery<Bank[]>({
    queryKey: ['banks'],
    queryFn: () => api.get('/banks').then(r => r.data),
  })

  const create = useMutation({
    mutationFn: (data: typeof form) => api.post('/accounts', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      setOpen(false)
      setForm({ bankId: '', name: '' })
    },
  })

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">{t('accounts.title')}</h2>
          <p className="text-muted-foreground">{t('accounts.subtitle')}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger className={buttonVariants()}>
            <Plus className="size-4 mr-2" />{t('accounts.newAccount')}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('accounts.dialog.title')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>{t('accounts.dialog.bank')}</Label>
                <Select value={form.bankId} onValueChange={v => setForm(f => ({ ...f, bankId: v ?? '' }))}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('accounts.dialog.selectBank')}>
                      {banks.find(b => b.id === form.bankId)?.name ?? null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {banks.filter(b => b.status === 'ready').map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('accounts.dialog.name')}</Label>
                <Input
                  placeholder={t('accounts.dialog.namePlaceholder')}
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <Button
                className="w-full"
                onClick={() => create.mutate(form)}
                disabled={!form.bankId || create.isPending}
              >
                {create.isPending ? t('accounts.dialog.creating') : t('accounts.dialog.create')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <Card>
        <CardHeader><CardTitle>{t('accounts.registered')}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm">{t('accounts.loading')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('accounts.colName')}</TableHead>
                  <TableHead>{t('accounts.colBank')}</TableHead>
                  <TableHead>{t('accounts.colStatus')}</TableHead>
                  <TableHead>{t('accounts.colId')}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.name ?? '—'}</TableCell>
                    <TableCell>{a.bank}</TableCell>
                    <TableCell>
                      <Badge variant={a.status === 'active' ? 'default' : 'secondary'}>
                        {t(`enums.accountStatus.${a.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs font-mono">{a.id}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/accounts/${a.id}/config`)}>
                        <Settings className="size-3 mr-1" />
                        {t('accounts.configure')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {accounts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      {t('accounts.empty')}
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
