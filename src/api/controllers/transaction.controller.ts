import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WageringPersistenceService } from '../../infrastructure/persistence/mikro-orm/wagering-persistence.service.js';
import { toTransactionResponse } from '../../http/http-mappers.js';

@ApiTags('transactions')
@Controller()
export class TransactionController {
  constructor(private readonly operations: WageringPersistenceService) {}

  @Get('transactions/:transactionId')
  async find(@Param('transactionId') transactionId: string) {
    const transaction = await this.operations.findTransaction(transactionId);
    if (!transaction) throw new Error('Transaction not found');
    const wallet = await this.operations.findWallet(transaction.walletId);
    return toTransactionResponse(transaction, wallet?.balance);
  }

  @Get('providers/:providerId/transactions/:externalTransactionId')
  async findByExternal(@Param('providerId') providerId: string, @Param('externalTransactionId') externalTransactionId: string) {
    const transaction = await this.operations.findTransactionByExternal(providerId, externalTransactionId);
    if (!transaction) throw new Error('Transaction not found');
    const wallet = await this.operations.findWallet(transaction.walletId);
    return toTransactionResponse(transaction, wallet?.balance);
  }
}