import { Money } from '../../../domain/entities/money/money.js';
import { CommandHandler } from '@nestjs/cqrs';
import { Wallet } from '../../../domain/entities/wallet/wallet.js';
import type { WageringOperations } from '../../ports/wagering-operations.port.js';

export class CreateWalletCommand {
  constructor(
    public readonly props: { id: string; playerId: string; initialBalance: Money },
  ) {}
}

@CommandHandler(CreateWalletCommand)
export class CreateWalletHandler {
  constructor(private readonly operations: WageringOperations) {}

  execute(command: CreateWalletCommand): Promise<Wallet> {
    return this.operations.createWallet(command.props);
  }
}