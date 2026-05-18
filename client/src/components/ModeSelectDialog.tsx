import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Button } from '@/shared/ui/button'
import { ModeOptionCards } from '@/components/ModeOptionCards'
import type { OperationMode } from '@/shared/_legacy/useUser'

/**
 * Shown when the logged-in user has no operation_mode set. Mandatory: it has
 * no close button and is not dismissable — the user must pick a mode to continue.
 */
export function ModeSelectDialog({
  open,
  onConfirm,
  isPending,
}: {
  open: boolean
  onConfirm: (mode: OperationMode) => void
  isPending?: boolean
}) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<OperationMode | null>(null)

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('modeSelect.title')}</DialogTitle>
          <DialogDescription>{t('modeSelect.subtitle')}</DialogDescription>
        </DialogHeader>
        <ModeOptionCards value={selected} onChange={setSelected} />
        <Button
          className="w-full"
          disabled={!selected || isPending}
          onClick={() => selected && onConfirm(selected)}
        >
          {t('modeSelect.confirm')}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
