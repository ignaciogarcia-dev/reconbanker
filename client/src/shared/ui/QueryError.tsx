import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'

// Shown in place of page content when a query fails so the user can retry
export function QueryError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation('common')
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <p className="text-sm text-muted-foreground">{t('errors.loadFailed')}</p>
      <Button variant="outline" onClick={onRetry}>
        {t('errors.retry')}
      </Button>
    </div>
  )
}
