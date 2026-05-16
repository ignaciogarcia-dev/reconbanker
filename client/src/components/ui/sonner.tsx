import { Toaster as SonnerToaster, type ToasterProps } from 'sonner'

export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      theme="dark"
      position="bottom-right"
      richColors={false}
      closeButton={false}
      toastOptions={{
        classNames: {
          toast:
            'group rounded-xl border-0 p-4 text-[13px] shadow-[inset_0_0_0_1px_oklch(1_0_0_/_0.1),0_24px_60px_oklch(0_0_0_/_0.5)] backdrop-blur-xl',
          title: 'font-medium tracking-[0.01em]',
          description: 'text-xs opacity-70',
          success:
            '!bg-[oklch(0.11_0_0_/_0.94)] !text-[oklch(0.95_0_0)] [&_[data-icon]]:!text-[oklch(0.78_0.14_150)]',
          error:
            '!bg-[oklch(0.11_0_0_/_0.94)] !text-[oklch(0.95_0_0)] [&_[data-icon]]:!text-[oklch(0.7_0.18_28)]',
          info: '!bg-[oklch(0.11_0_0_/_0.94)] !text-[oklch(0.95_0_0)]',
          actionButton:
            '!bg-[oklch(0.95_0_0)] !text-[oklch(0.12_0_0)] !rounded-md !text-[11px] !uppercase !tracking-[0.18em]',
        },
      }}
      {...props}
    />
  )
}
