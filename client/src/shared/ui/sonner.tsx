import { Toaster as SonnerToaster, type ToasterProps } from 'sonner'

const glassToast =
  'group border-0 p-3.5 text-[13px] text-foreground [backdrop-filter:blur(20px)_saturate(160%)] shadow-[inset_0_0_0_1px_oklch(1_0_0_/_0.08),0_16px_48px_oklch(0_0_0_/_0.5)]'

const glassSurface = '!bg-[oklch(0.10_0_0_/_0.92)] !text-[oklch(0.92_0_0)]'

export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      theme="dark"
      position="bottom-right"
      richColors={false}
      closeButton={false}
      style={
        {
          '--border-radius': 'var(--radius-lg)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: `${glassToast} ${glassSurface}`,
          title: 'font-medium tracking-[0.01em]',
          description: 'text-xs text-muted-foreground',
          success: `[&_[data-icon]]:!text-[oklch(0.78_0.14_150)]`,
          error: `[&_[data-icon]]:!text-[oklch(0.7_0.18_28)]`,
          info: `[&_[data-icon]]:!text-[oklch(0.75_0.12_250)]`,
          warning: `[&_[data-icon]]:!text-[oklch(0.82_0.14_85)]`,
          loading: `[&_[data-icon]]:!text-[oklch(0.75_0_0)]`,
          default: '',
          actionButton:
            '!h-7 !rounded-lg !border-0 !px-2.5 !bg-primary !text-primary-foreground !text-[11px] !font-medium !uppercase !tracking-[0.12em] hover:!bg-primary/80',
          cancelButton:
            '!h-7 !rounded-lg !border !border-border !px-2.5 !bg-transparent !text-foreground !text-[11px] !font-medium hover:!bg-muted/50',
        },
      }}
      {...props}
    />
  )
}
