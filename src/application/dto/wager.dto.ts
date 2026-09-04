import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { MoneyDto } from './money.dto.js';
import { WagerTransactionKind } from '../../domain/entities/wagering/wager-transaction.js';

export class CreateWagerTransactionDto {
  @ApiProperty() @IsString() @IsNotEmpty() providerId!: string;
  @ApiProperty() @IsString() @IsNotEmpty() externalTransactionId!: string;
  @ApiProperty() @IsString() @IsNotEmpty() playerId!: string;
  @ApiProperty() @IsString() @IsNotEmpty() walletId!: string;
  @ApiProperty() @IsString() @IsNotEmpty() roundId!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() gameId?: string;
  @ApiProperty({ enum: WagerTransactionKind }) @IsEnum(WagerTransactionKind) kind!: WagerTransactionKind;
  @ApiProperty({ type: MoneyDto }) @ValidateNested() @Type(() => MoneyDto) money!: MoneyDto;
  @ApiProperty({ required: false }) @IsOptional() @IsString() referenceExternalTransactionId?: string;
}