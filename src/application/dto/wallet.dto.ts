import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { MoneyDto } from './money.dto.js';

export class CreateWalletDto {
  @ApiProperty({ example: 'player-1' })
  @IsString()
  @IsNotEmpty()
  playerId!: string;

  @ApiProperty({ type: MoneyDto })
  @ValidateNested()
  @Type(() => MoneyDto)
  initialBalance!: MoneyDto;
}

export class LedgerQueryDto {
  @ApiProperty({ required: false })
  cursor?: string;

  @ApiProperty({ required: false, default: 50, minimum: 1, maximum: 100 })
  limit?: number;
}