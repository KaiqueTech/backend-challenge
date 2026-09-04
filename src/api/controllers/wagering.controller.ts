import { BadRequestException, Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WageringPersistenceService } from '../../infrastructure/persistence/mikro-orm/wagering-persistence.service.js';
import { toTransaction, toTransactionResponse } from '../../http/http-mappers.js';
import { CreateWagerTransactionDto } from '../../application/dto/wager.dto.js';

@ApiTags('wagering')
@Controller('wagering/transactions')
export class WageringController {
  constructor(private readonly operations: WageringPersistenceService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Process a wager transaction' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async process(@Headers('idempotency-key') idempotencyKey: string | undefined, @Body() body: CreateWagerTransactionDto) {
    if (!idempotencyKey?.trim()) throw new BadRequestException('Idempotency-Key is required');
    const transaction = toTransaction(body, idempotencyKey);
    const processed = await this.operations.process(transaction);
    const wallet = await this.operations.findWallet(processed.walletId);
    return toTransactionResponse(processed, wallet?.balance, processed.id !== transaction.id);
  }
}