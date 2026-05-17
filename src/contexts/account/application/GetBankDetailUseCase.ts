import { IBankRepository } from '../domain/IBankRepository.js'
import { IBankScriptListReader } from '../domain/ports/IBankScriptListReader.js'
import { NotFoundError } from '../../../shared/errors/index.js'
import { BankDetailDto } from './dto/BankDto.js'

export class GetBankDetailUseCase {
  constructor(
    private readonly bankRepo: IBankRepository,
    private readonly scriptReader: IBankScriptListReader,
  ) {}

  async execute(bankId: string): Promise<BankDetailDto> {
    const bank = await this.bankRepo.findById(bankId)
    if (!bank) throw new NotFoundError('Bank not found')
    const scripts = await this.scriptReader.listForBank(bankId)
    return {
      id: bank.id,
      code: bank.code,
      name: bank.name,
      loginUrl: bank.loginUrl ?? null,
      status: bank.status,
      scripts,
    }
  }
}
