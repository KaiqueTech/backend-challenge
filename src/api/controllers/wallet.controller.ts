import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { Money } from '../../domain/entities/money/money.js';
import { WageringPersistenceService } from '../../infrastructure/persistence/mikro-orm/wagering-persistence.service.js';
import { toWalletResponse } from '../../http/http-mappers.js';
import { CreateWalletDto } from '../../application/dto/wallet.dto.js';

@ApiTags('wallets')
@Controller('wallets')
export class WalletController {
  constructor(private readonly operations: WageringPersistenceService) {}

  @Post()
  @ApiOperation({ summary: 'Create a wallet' })
  async create(@Body() body: CreateWalletDto) {
    const wallet = await this.operations.createWallet({ id: randomUUID(), playerId: body.playerId, initialBalance: Money.create(body.initialBalance.amount, body.initialBalance.currency) });
    return toWalletResponse(wallet);
  }

  @Get(':walletId')
  async find(@Param('walletId') walletId: string) {
    const wallet = await this.operations.findWallet(walletId);
    if (!wallet) throw new Error('Wallet not found');
    return toWalletResponse(wallet);
  }

  @Get(':walletId/ledger')
  async ledger(@Param('walletId') walletId: string, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    if (!(await this.operations.findWallet(walletId))) throw new Error('Wallet not found');
    const pageSize = limit === undefined ? 50 : Number(limit);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error('INVALID_LIMIT');
    return this.operations.listLedger(walletId, cursor, pageSize);
  }

  @Post(':walletId/reconciliation')
  async reconcile(@Param('walletId') walletId: string) {
    const result = await this.operations.reconcile(walletId);
    if (!result) throw new Error('Wallet not found');
    return { walletId: result.walletId, storedBalance: result.storedBalance.toString(), calculatedBalance: result.calculatedBalance.toString(), difference: result.difference.toString(), consistent: result.consistent, checkedEntries: result.checkedEntries };
  }
}