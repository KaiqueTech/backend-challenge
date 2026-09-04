import { WagerTransaction } from '../../../domain/entities/wagering/wager-transaction.js';
import { CommandHandler } from '@nestjs/cqrs';
import type { WageringOperations } from '../../ports/wagering-operations.port.js';

export class ProcessWagerTransactionCommand {
  constructor(public readonly transaction: WagerTransaction) {}
}

@CommandHandler(ProcessWagerTransactionCommand)
export class ProcessWagerTransactionHandler {
  constructor(private readonly operations: WageringOperations) {}

  execute(command: ProcessWagerTransactionCommand): Promise<WagerTransaction> {
    return this.operations.process(command.transaction);
  }
}