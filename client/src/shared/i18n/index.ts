import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { commonEs, commonEn } from './common'
import { userEs, userEn } from '@/features/user/i18n'
import { accountEs, accountEn } from '@/features/account/i18n'
import { bankingEs, bankingEn } from '@/features/banking/i18n'
import { conciliationEs, conciliationEn } from '@/features/conciliation/i18n'
import { scriptEngineEs, scriptEngineEn } from '@/features/script-engine/i18n'
import { dashboardEs, dashboardEn } from '@/features/dashboard/i18n'

const stored =
  typeof window !== 'undefined' ? window.localStorage.getItem('lang') : null

i18n.use(initReactI18next).init({
  resources: {
    es: {
      common: commonEs,
      user: userEs,
      account: accountEs,
      banking: bankingEs,
      conciliation: conciliationEs,
      'script-engine': scriptEngineEs,
      dashboard: dashboardEs,
    },
    en: {
      common: commonEn,
      user: userEn,
      account: accountEn,
      banking: bankingEn,
      conciliation: conciliationEn,
      'script-engine': scriptEngineEn,
      dashboard: dashboardEn,
    },
  },
  lng: stored ?? 'es',
  fallbackLng: 'es',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
})

export default i18n
