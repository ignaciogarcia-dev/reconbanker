import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'

const LANGUAGES = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
] as const

export function LanguageSelector() {
  const { i18n } = useTranslation('common')

  function handleChange(code: string | null) {
    /* v8 ignore next 1 -- base-ui Select always emits a string from LANGUAGES; null guard is defensive. */
    if (!code) return
    i18n.changeLanguage(code)
    localStorage.setItem('lang', code)
  }

  const current = LANGUAGES.find(l => l.code === i18n.language) ?? LANGUAGES[0]

  return (
    <div className="px-3 py-1.5">
      <Select value={i18n.language} onValueChange={handleChange}>
        <SelectTrigger
          size="sm"
          className="w-full h-7 border-0 bg-transparent focus:ring-0 gap-1.5 px-2 py-0"
          style={{ color: 'oklch(0.5 0 0)', boxShadow: 'none' }}
        >
          <Globe className="size-3 shrink-0" />
          <SelectValue className="flex items-center">
            <span className="font-mono tracking-wide uppercase text-[10px] leading-none">{current.code}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="py-1">
          {LANGUAGES.map(({ code, label }) => (
            <SelectItem key={code} value={code} className="text-xs py-2.5 px-2">
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
