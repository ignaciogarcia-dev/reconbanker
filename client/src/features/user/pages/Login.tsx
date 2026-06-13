import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { FormField } from '@/shared/ui/FormField'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { useTranslation } from 'react-i18next'
import { localizedApiError } from '@/shared/http/client'
import { fieldErrorsFromApiError } from '../utils/serverFieldErrors'

// 401 keeps the friendly translated copy while other failures such as 429 surface the server message
function isAuthRejection(err: unknown): boolean {
  return (err as { response?: { status?: number } })?.response?.status === 401
}

const emailPattern = /^\S+@\S+\.\S+$/

type LoginErrors = { email?: string; password?: string; form?: string }

export function Login() {
  const { login, completeTotpLogin } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation(['user', 'common'])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<LoginErrors>({})
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [stage, setStage] = useState<'credentials' | 'totp'>('credentials')
  const [challengeToken, setChallengeToken] = useState('')
  const [code, setCode] = useState('')

  function validate(values: { email: string; password: string }): LoginErrors {
    const next: LoginErrors = {}
    if (!values.email.trim()) next.email = t('common:validation.required')
    else if (!emailPattern.test(values.email)) next.email = t('errors.emailInvalid')
    if (!values.password) next.password = t('common:validation.required')
    return next
  }

  function updateField(field: 'email' | 'password', value: string) {
    const setter = field === 'email' ? setEmail : setPassword
    setter(value)
    if (submitted) {
      const next = validate({ email, password, [field]: value })
      setErrors(next)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    const next = validate({ email, password })
    setErrors(next)
    if (next.email || next.password) return
    setLoading(true)
    try {
      const outcome = await login(email, password)
      if (outcome.status === 'totp_required') {
        setChallengeToken(outcome.challengeToken)
        setStage('totp')
        return
      }
      navigate('/')
    } catch (err) {
      if (isAuthRejection(err)) {
        setErrors({ form: t('login.error') })
        return
      }
      const fieldErrors = fieldErrorsFromApiError(err)
      if (fieldErrors.email || fieldErrors.password) {
        setErrors({
          email: fieldErrors.email && t('errors.emailInvalid'),
          password: fieldErrors.password && t('common:validation.required'),
        })
        return
      }
      setErrors({ form: localizedApiError(err) ?? t('login.error') })
    } finally {
      setLoading(false)
    }
  }

  async function handleTotpSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})
    setLoading(true)
    try {
      await completeTotpLogin(challengeToken, code)
      navigate('/')
    } catch (err) {
      setErrors({ form: isAuthRejection(err) ? t('login.totp.error') : localizedApiError(err) ?? t('login.totp.error') })
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
            {/* key prevents React from reusing these DOM nodes for the credentials form where the browser would run the click default action on a node already turned into a submit button */}
            <form key="totp" onSubmit={handleTotpSubmit} className="space-y-4">
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
              {errors.form && <p className="text-sm text-destructive" role="alert">{errors.form}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t('login.loading') : t('login.totp.submit')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => { setStage('credentials'); setCode(''); setErrors({}) }}
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
          <form key="credentials" onSubmit={handleSubmit} noValidate className="space-y-4">
            <FormField label={t('login.email')} htmlFor="email" helpId="email-error" error={errors.email}>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => updateField('email', e.target.value)}
                aria-invalid={errors.email ? true : undefined}
                aria-describedby="email-error"
              />
            </FormField>
            <FormField label={t('login.password')} htmlFor="password" helpId="password-error" error={errors.password}>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => updateField('password', e.target.value)}
                aria-invalid={errors.password ? true : undefined}
                aria-describedby="password-error"
              />
            </FormField>
            {errors.form && <p className="text-sm text-destructive" role="alert">{errors.form}</p>}
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
