import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { useTranslation } from 'react-i18next'

export function Login() {
  const { login, completeTotpLogin } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation(['user', 'common'])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [stage, setStage] = useState<'credentials' | 'totp'>('credentials')
  const [challengeToken, setChallengeToken] = useState('')
  const [code, setCode] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const outcome = await login(email, password)
      if (outcome.status === 'totp_required') {
        setChallengeToken(outcome.challengeToken)
        setStage('totp')
        return
      }
      navigate('/')
    } catch {
      setError(t('login.error'))
    } finally {
      setLoading(false)
    }
  }

  async function handleTotpSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await completeTotpLogin(challengeToken, code)
      navigate('/')
    } catch {
      setError(t('login.totp.error'))
    } finally {
      setLoading(false)
    }
  }

  if (stage === 'totp') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>ReconBanker</CardTitle>
            <CardDescription>{t('login.totp.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleTotpSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="totp-code">{t('login.totp.code')}</Label>
                <Input
                  id="totp-code"
                  inputMode="text"
                  autoComplete="one-time-code"
                  autoFocus
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t('login.loading') : t('login.totp.submit')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => { setStage('credentials'); setCode(''); setError('') }}
              >
                {t('login.totp.back')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>ReconBanker</CardTitle>
          <CardDescription>{t('login.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('login.email')}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                onInvalid={e => {
                  if (e.currentTarget.validity.valueMissing) {
                    e.currentTarget.setCustomValidity(t('common:validation.required'))
                  }
                }}
                onInput={e => e.currentTarget.setCustomValidity('')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('login.password')}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                onInvalid={e => {
                  if (e.currentTarget.validity.valueMissing) {
                    e.currentTarget.setCustomValidity(t('common:validation.required'))
                  }
                }}
                onInput={e => e.currentTarget.setCustomValidity('')}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('login.loading') : t('login.submit')}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              {t('login.noAccount')}{' '}
              <Link to="/register" className="underline underline-offset-4 hover:text-primary">
                {t('login.register')}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
