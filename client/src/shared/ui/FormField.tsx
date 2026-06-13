import { type ReactNode } from 'react'
import { Label } from '@/shared/ui/label'
import { cn } from '@/shared/lib/utils'
import { AlertCircle, Info } from 'lucide-react'

interface FormFieldProps {
  label: ReactNode
  htmlFor?: string
  helpId?: string
  required?: boolean
  hint?: string
  error?: string
  children: ReactNode
}

// Field wrapper where the input carries the error ring via aria-invalid and the label tints destructive on error
export function FormField({ label, htmlFor, helpId, required, hint, error, children }: FormFieldProps) {
  const hasError = Boolean(error)
  return (
    <div className="grid gap-1.5">
      <Label
        htmlFor={htmlFor}
        className={cn('text-[13px] transition-colors flex items-center gap-1', hasError && 'text-destructive')}
      >
        <span>{label}</span>
        {required && (
          <span className="text-destructive" aria-hidden>*</span>
        )}
      </Label>
      {children}
      {(hasError || hint || helpId) && (
        <p
          id={helpId}
          aria-live="polite"
          className={cn(
            'flex items-center gap-1 text-[11px] leading-4 min-h-4 transition-colors',
            hasError ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {hasError ? (
            <AlertCircle className="size-3 shrink-0" aria-hidden />
          ) : hint ? (
            <Info className="size-3 shrink-0 opacity-60" aria-hidden />
          ) : null}
          <span>{hasError ? error : hint}</span>
        </p>
      )}
    </div>
  )
}
