// Common i18n resources shared across features (nav, enums, mascot, language).
export const commonEs = {
  nav: {
    dashboard: 'Dashboard',
    banks: 'Bancos',
    accounts: 'Cuentas',
    conciliations: 'Conciliaciones',
    movements: 'Movimientos',
    scripts: 'Scripts',
    settings: 'Configuración',
    logout: 'Cerrar sesión',
  },
  enums: {
    bankStatus: {
      pending: 'Pendiente',
      ready: 'Listo',
      failed: 'Fallido',
      onboarding: 'En configuración',
    },
    accountStatus: {
      active: 'Activo',
      inactive: 'Inactivo',
    },
    conciliationStatus: {
      matched: 'Conciliado',
      pending: 'Pendiente',
      processing: 'Procesando',
      not_found: 'No encontrado',
      ambiguous: 'Ambiguo',
      failed: 'Fallido',
      expired: 'Expirado',
      cancelled: 'Cancelado',
    },
    scriptStatus: {
      draft: 'Borrador',
      testing: 'En prueba',
      review: 'En revisión',
      active: 'Activo',
      deprecated: 'Obsoleto',
      failed: 'Fallido',
    },
    scriptOrigin: {
      system: 'Sistema',
      ai: 'IA',
      user: 'Usuario',
    },
    flowType: {
      login: 'Login',
      extract_transactions: 'Extracción de movimientos',
      verify_payment: 'Verificación de pago',
    },
  },
  mascot: {
    phrases: [
      '¡No soy Claude!',
      '¡Soy ReconBanker!',
      '¿Algún movimiento?',
      '¡Acá para ayudarte!',
      'Revisando tu banco...',
      'Conciliando datos...',
      '¡Todo cuadra!',
      '¡Encontré una diferencia!',
      'Ejecutando scripts...',
    ],
  },
  language: {
    label: 'Idioma',
    es: 'Español',
    en: 'English',
  },
  validation: {
    required: 'Completá este campo',
  },
}

export const commonEn = {
  nav: {
    dashboard: 'Dashboard',
    banks: 'Banks',
    accounts: 'Accounts',
    conciliations: 'Conciliations',
    movements: 'Movements',
    scripts: 'Scripts',
    settings: 'Settings',
    logout: 'Log out',
  },
  enums: {
    bankStatus: {
      pending: 'Pending',
      ready: 'Ready',
      failed: 'Failed',
      onboarding: 'Onboarding',
    },
    accountStatus: {
      active: 'Active',
      inactive: 'Inactive',
    },
    conciliationStatus: {
      matched: 'Matched',
      pending: 'Pending',
      processing: 'Processing',
      not_found: 'Not found',
      ambiguous: 'Ambiguous',
      failed: 'Failed',
      expired: 'Expired',
      cancelled: 'Cancelled',
    },
    scriptStatus: {
      draft: 'Draft',
      testing: 'Testing',
      review: 'In review',
      active: 'Active',
      deprecated: 'Deprecated',
      failed: 'Failed',
    },
    scriptOrigin: {
      system: 'System',
      ai: 'AI',
      user: 'User',
    },
    flowType: {
      login: 'Login',
      extract_transactions: 'Transaction extraction',
      verify_payment: 'Payment verification',
    },
  },
  mascot: {
    phrases: [
      "I'm not Claude!",
      "I'm ReconBanker!",
      'Any new movement?',
      "I'm here to help!",
      "I'm checking your bank...",
      'Reconciling data...',
      'All numbers match!',
      'Found a discrepancy!',
      'Running scripts...',
    ],
  },
  language: {
    label: 'Language',
    es: 'Español',
    en: 'English',
  },
  validation: {
    required: 'Please fill out this field',
  },
}
