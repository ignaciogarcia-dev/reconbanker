import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { toast } from 'sonner'
import { register } from '../api/auth'
import { localizedApiError } from '@/shared/http/client'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { FormField } from '@/shared/ui/FormField'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { useTranslation } from 'react-i18next'
import { firstFailingPasswordRule } from '../utils/passwordRules'
import { fieldErrorsFromApiError } from '../utils/serverFieldErrors'

const emailPattern = /^\S+@\S+\.\S+$/

type RegisterErrors = { email?: string; password?: string; form?: string }

export function Register() {
  const navigate = useNavigate()
  const { t } = useTranslation(['user', 'common'])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<RegisterErrors>({})
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  function validate(values: { email: string; password: string }): RegisterErrors {
    const next: RegisterErrors = {}
    if (!values.email.trim()) next.email = t('common:validation.emailRequired')
    else if (!emailPattern.test(values.email)) next.email = t('errors.emailInvalid')
    if (!values.password) {
      next.password = t('common:validation.passwordRequired')
    } else {
      // One rule at a time: only the first failing rule is shown; fixing it reveals the next
      const rule = firstFailingPasswordRule(values.password)
      if (rule) next.password = t(`passwordRules.${rule}`)
    }
    return next
  }

  function updateField(field: 'email' | 'password', value: string) {
    const setter = field === 'email' ? setEmail : setPassword
    setter(value)
    if (submitted) setErrors(validate({ email, password, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    const next = validate({ email, password })
    setErrors(next)
    if (next.email || next.password) return
    setLoading(true)
    try {
      await register({ email, password, name: name || undefined })
      toast.success(t('register.success'))
      navigate('/login')
    } catch (err: unknown) {
      const fieldErrors = fieldErrorsFromApiError(err)
      if (fieldErrors.email || fieldErrors.password) {
        const passwordRule = fieldErrors.password ? firstFailingPasswordRule(password) : null
        setErrors({
          email: fieldErrors.email && t('errors.emailInvalid'),
          password: passwordRule ? t(`passwordRules.${passwordRule}`) : fieldErrors.password,
        })
        return
      }
      setErrors({ form: localizedApiError(err) ?? t('register.defaultError') })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t('register.title')}</CardTitle>
          <CardDescription>{t('register.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <FormField label={t('register.name')} htmlFor="name">
              <Input
                id="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </FormField>
            <FormField label={t('register.email')} htmlFor="email" helpId="email-error" error={errors.email}>
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
            <FormField label={t('register.password')} htmlFor="password" helpId="password-error" error={errors.password}>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={e => updateField('password', e.target.value)}
                aria-invalid={errors.password ? true : undefined}
                aria-describedby="password-error"
              />
            </FormField>
            {errors.form && <p className="text-sm text-destructive" role="alert">{errors.form}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('register.loading') : t('register.submit')}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              {t('register.hasAccount')}{' '}
              <Link to="/login" className="underline underline-offset-4 hover:text-primary">
                {t('register.login')}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
