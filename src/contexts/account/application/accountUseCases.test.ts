import { describe, expect, it, vi } from 'vitest'
import { CreateAccountUseCase } from './CreateAccountUseCase.js'
import { CreateBankUseCase } from './CreateBankUseCase.js'
import { DeleteAccountUseCase } from './DeleteAccountUseCase.js'
import { GetAccountConfigUseCase } from './GetAccountConfigUseCase.js'
import { GetAccountDetailUseCase } from './GetAccountDetailUseCase.js'
import { GetBankDetailUseCase } from './GetBankDetailUseCase.js'
import { ListAccountsForUserUseCase } from './ListAccountsForUserUseCase.js'
import { ListBanksUseCase } from './ListBanksUseCase.js'
import { NotFoundError, ValidationError } from '../../../shared/errors/index.js'

describe('CreateAccountUseCase', () => {
  const bank = { id: 'b-1', code: 'mi-dinero' } as any

  it('persists a new account and returns its id', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const accountRepo = { save } as any
    const bankRepo = { findById: vi.fn().mockResolvedValue(bank) } as any
    const uc = new CreateAccountUseCase(accountRepo, bankRepo)

    const out = await uc.execute({ userId: 'u-1', bankId: 'b-1', name: 'Acc' })

    expect(out.id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('throws NotFoundError when the bank does not exist', async () => {
    const accountRepo = { save: vi.fn() } as any
    const bankRepo = { findById: vi.fn().mockResolvedValue(null) } as any
    const uc = new CreateAccountUseCase(accountRepo, bankRepo)

    await expect(uc.execute({ userId: 'u-1', bankId: 'b-1', name: 'Acc' })).rejects.toBeInstanceOf(
      NotFoundError,
    )
    expect(accountRepo.save).not.toHaveBeenCalled()
  })
})

describe('CreateBankUseCase', () => {
  it('persists a new bank and returns its id', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const bankRepo = { save } as any
    const uc = new CreateBankUseCase(bankRepo)

    const out = await uc.execute({ code: 'mi-dinero', name: 'Mi Dinero', loginUrl: 'https://x' })

    expect(out.id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(save).toHaveBeenCalledTimes(1)
    const saved = save.mock.calls[0][0]
    expect(saved.code).toBe('mi-dinero')
    expect(saved.name).toBe('Mi Dinero')
    expect(saved.loginUrl).toBe('https://x')
  })

  it('persists without loginUrl when omitted', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const uc = new CreateBankUseCase({ save } as any)

    await uc.execute({ code: 'x', name: 'Y' })

    expect(save).toHaveBeenCalled()
  })
})

describe('DeleteAccountUseCase', () => {
  const account = (overrides: Partial<{ id: string; name: string }> = {}) =>
    ({ id: 'acc-1', name: 'My Account', ...overrides }) as any

  it('deletes when confirmation matches', async () => {
    const del = vi.fn().mockResolvedValue(undefined)
    const repo = { findByIdForUser: async () => account(), delete: del } as any
    const uc = new DeleteAccountUseCase(repo)

    await uc.execute({ id: 'acc-1', userId: 'u-1', confirmationName: 'My Account' })

    expect(del).toHaveBeenCalledWith('acc-1')
  })

  it('scopes the lookup to the requesting user', async () => {
    const findByIdForUser = vi.fn().mockResolvedValue(account())
    const repo = { findByIdForUser, delete: vi.fn().mockResolvedValue(undefined) } as any
    const uc = new DeleteAccountUseCase(repo)

    await uc.execute({ id: 'acc-1', userId: 'u-1', confirmationName: 'My Account' })

    expect(findByIdForUser).toHaveBeenCalledWith('acc-1', 'u-1')
  })

  it('trims whitespace from confirmation', async () => {
    const del = vi.fn().mockResolvedValue(undefined)
    const repo = { findByIdForUser: async () => account(), delete: del } as any
    const uc = new DeleteAccountUseCase(repo)

    await uc.execute({ id: 'acc-1', userId: 'u-1', confirmationName: '  My Account  ' })

    expect(del).toHaveBeenCalled()
  })

  it('throws NotFoundError when the account does not exist or is not owned by the user (IDOR guard)', async () => {
    const del = vi.fn()
    const repo = { findByIdForUser: async () => null, delete: del } as any
    const uc = new DeleteAccountUseCase(repo)

    await expect(
      uc.execute({ id: 'acc-1', userId: 'attacker', confirmationName: 'My Account' }),
    ).rejects.toBeInstanceOf(NotFoundError)
    expect(del).not.toHaveBeenCalled()
  })

  it('throws ValidationError when confirmation does not match', async () => {
    const del = vi.fn()
    const repo = { findByIdForUser: async () => account(), delete: del } as any
    const uc = new DeleteAccountUseCase(repo)

    await expect(
      uc.execute({ id: 'acc-1', userId: 'u-1', confirmationName: 'Wrong' }),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(del).not.toHaveBeenCalled()
  })
})

describe('GetAccountConfigUseCase', () => {
  const setup = (opts: {
    accountFound?: boolean
    config?: any
    bankUsername?: string | null
  }) => {
    const accountRepo = {
      findByIdForUser: async () =>
        opts.accountFound === false ? null : ({ id: 'acc-1' } as any),
    } as any
    const configRepo = { findByAccountId: async () => opts.config ?? null } as any
    const credentialsRepo = {
      findUsernameByAccount: async () => opts.bankUsername ?? null,
    } as any
    return new GetAccountConfigUseCase(accountRepo, configRepo, credentialsRepo)
  }

  it('returns the config with bank username when both exist', async () => {
    const uc = setup({
      config: { id: 'cfg-1', accountId: 'acc-1', webhookUrl: 'https://x' },
      bankUsername: 'me',
    })

    const out = await uc.execute('acc-1', 'u-1')

    expect(out).toMatchObject({ id: 'cfg-1', bankUsername: 'me' })
  })

  it('returns null when the account has no config', async () => {
    const uc = setup({ config: null })

    expect(await uc.execute('acc-1', 'u-1')).toBeNull()
  })

  it('throws NotFoundError when the user does not own the account', async () => {
    const uc = setup({ accountFound: false })

    await expect(uc.execute('acc-1', 'u-1')).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('GetAccountDetailUseCase', () => {
  const account = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'acc-1',
      bank: 'mi-dinero',
      name: 'My Account',
      status: 'ready',
      scrapeBlockedAt: undefined,
      scrapeBlockedReason: null,
      ...overrides,
    }) as any

  it('returns serialized detail with null name fallback', async () => {
    const repo = { findByIdForUser: async () => account({ name: null }) } as any
    const out = await new GetAccountDetailUseCase(repo).execute('acc-1', 'u-1')

    expect(out).toEqual({
      id: 'acc-1',
      bank: 'mi-dinero',
      name: null,
      status: 'ready',
      scrapeBlockedAt: null,
      scrapeBlockedReason: null,
    })
  })

  it('serializes scrapeBlockedAt to ISO string when present', async () => {
    const blockedAt = new Date('2024-01-15T10:00:00Z')
    const repo = {
      findByIdForUser: async () =>
        account({ scrapeBlockedAt: blockedAt, scrapeBlockedReason: 'bad creds' }),
    } as any
    const out = await new GetAccountDetailUseCase(repo).execute('acc-1', 'u-1')

    expect(out.scrapeBlockedAt).toBe(blockedAt.toISOString())
    expect(out.scrapeBlockedReason).toBe('bad creds')
  })

  it('throws NotFoundError when the account is missing', async () => {
    const repo = { findByIdForUser: async () => null } as any
    await expect(new GetAccountDetailUseCase(repo).execute('x', 'y')).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })
})

describe('GetBankDetailUseCase', () => {
  const bank = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'bank-1',
      code: 'mi-dinero',
      name: 'Mi Dinero',
      loginUrl: 'https://x',
      status: 'ready',
      ...overrides,
    }) as any

  it('returns the bank detail with its scripts', async () => {
    const bankRepo = { findById: async () => bank() } as any
    const scriptReader = {
      listForBank: async () => [{ id: 's-1', flowType: 'extract_transactions', version: '1.0' }],
    } as any
    const uc = new GetBankDetailUseCase(bankRepo, scriptReader)

    const out = await uc.execute('bank-1')

    expect(out).toMatchObject({ id: 'bank-1', code: 'mi-dinero' })
    expect(out.scripts).toHaveLength(1)
  })

  it('returns null loginUrl when bank has none', async () => {
    const bankRepo = { findById: async () => bank({ loginUrl: undefined }) } as any
    const scriptReader = { listForBank: async () => [] } as any
    const uc = new GetBankDetailUseCase(bankRepo, scriptReader)

    const out = await uc.execute('bank-1')

    expect(out.loginUrl).toBeNull()
  })

  it('throws NotFoundError when the bank is missing', async () => {
    const bankRepo = { findById: async () => null } as any
    const scriptReader = { listForBank: async () => [] } as any
    const uc = new GetBankDetailUseCase(bankRepo, scriptReader)

    await expect(uc.execute('missing')).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('ListAccountsForUserUseCase', () => {
  it('maps accounts to summary DTOs', async () => {
    const repo = {
      findAllByUser: async () => [
        {
          id: 'a-1',
          bank: 'mi-dinero',
          name: 'one',
          status: 'ready',
          scrapeBlockedAt: undefined,
          scrapeBlockedReason: null,
        },
        {
          id: 'a-2',
          bank: 'mi-dinero',
          name: null,
          status: 'blocked',
          scrapeBlockedAt: new Date('2024-01-15T00:00:00Z'),
          scrapeBlockedReason: 'creds',
        },
      ],
    } as any
    const out = await new ListAccountsForUserUseCase(repo).execute('u-1')

    expect(out).toHaveLength(2)
    expect(out[0].name).toBe('one')
    expect(out[1].name).toBeNull()
    expect(out[1].scrapeBlockedAt).toBe('2024-01-15T00:00:00.000Z')
  })

  it('returns empty array when user has no accounts', async () => {
    const repo = { findAllByUser: async () => [] } as any
    expect(await new ListAccountsForUserUseCase(repo).execute('u-1')).toEqual([])
  })
})

describe('ListBanksUseCase', () => {
  it('maps banks to summary DTOs', async () => {
    const repo = {
      findAll: async () => [
        { id: 'b-1', code: 'mi-dinero', name: 'Mi Dinero', loginUrl: 'https://x', status: 'ready' },
        { id: 'b-2', code: 'other', name: 'Other', loginUrl: undefined, status: 'beta' },
      ],
    } as any
    const out = await new ListBanksUseCase(repo).execute()

    expect(out).toHaveLength(2)
    expect(out[0].loginUrl).toBe('https://x')
    expect(out[1].loginUrl).toBeNull()
  })

  it('returns empty array when there are no banks', async () => {
    const repo = { findAll: async () => [] } as any
    expect(await new ListBanksUseCase(repo).execute()).toEqual([])
  })
})
