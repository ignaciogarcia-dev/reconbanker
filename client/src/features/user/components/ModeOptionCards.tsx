import { GitMerge, ArrowDownUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/shared/ui/badge'
import { cn } from '@/shared/lib/utils'
import type { OperationMode } from '../types'

const OPTIONS = [
  { mode: 'reconcile' as const, icon: GitMerge, recommended: true },
  { mode: 'passthrough' as const, icon: ArrowDownUp, recommended: false },
]

export function ModeOptionCards({
  value,
  onChange,
}: {
  value: OperationMode | null
  onChange: (mode: OperationMode) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="space-y-2.5">
      {OPTIONS.map(({ mode, icon: Icon, recommended }) => {
        const selected = value === mode
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(mode)}
            className={cn(
              'w-full rounded-lg border p-3.5 text-left transition-all',
              selected
                ? 'border-foreground bg-foreground/[0.04]'
                : 'border-border hover:border-foreground/30'
            )}
          >
            <div className="flex items-center gap-2.5">
              <span className="flex size-7 items-center justify-center rounded-md bg-foreground/[0.06]">
                <Icon className="size-3.5" />
              </span>
              <span className="text-sm font-semibold">{t(`modeSelect.${mode}.title`)}</span>
              <div className="ml-auto flex items-center gap-2">
                {recommended && (
                  <Badge variant="secondary">{t('modeSelect.reconcile.recommended')}</Badge>
                )}
                <span
                  className={cn(
                    'size-4 shrink-0 rounded-full border-[1.5px]',
                    selected ? 'border-foreground bg-foreground' : 'border-muted-foreground'
                  )}
                />
              </div>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {t(`modeSelect.${mode}.desc`)}
            </p>
          </button>
        )
      })}
    </div>
  )
}
