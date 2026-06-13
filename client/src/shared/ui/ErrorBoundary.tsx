import { Component, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'

function ErrorFallback() {
  const { t } = useTranslation('common')
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <h1 className="text-xl font-semibold">{t('errorBoundary.title')}</h1>
      <p className="text-sm text-muted-foreground max-w-md">{t('errorBoundary.description')}</p>
      <Button onClick={() => { window.location.href = '/' }}>{t('errorBoundary.goHome')}</Button>
    </div>
  )
}

interface Props { children: ReactNode }
interface State { hasError: boolean }

// Last resort safety net so a render crash shows a recoverable screen instead of a blank page
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('Unhandled render error', error)
  }

  render() {
    if (this.state.hasError) return <ErrorFallback />
    return this.props.children
  }
}
