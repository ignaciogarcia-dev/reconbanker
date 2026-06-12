// Mirrors the backend password policy in src/api/routes/auth.routes.ts.
// Ordered so the user is shown one failing rule at a time.
export type PasswordRule = 'minLength' | 'maxLength' | 'lowercase' | 'uppercase' | 'number'

const rules: Array<{ key: PasswordRule; test: (pw: string) => boolean }> = [
  { key: 'minLength', test: pw => pw.length >= 12 },
  { key: 'maxLength', test: pw => pw.length <= 32 },
  { key: 'lowercase', test: pw => /[a-z]/.test(pw) },
  { key: 'uppercase', test: pw => /[A-Z]/.test(pw) },
  { key: 'number', test: pw => /[0-9]/.test(pw) },
]

export function firstFailingPasswordRule(pw: string): PasswordRule | null {
  return rules.find(r => !r.test(pw))?.key ?? null
}
