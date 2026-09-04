import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class MoneyDto {
  @ApiProperty({ example: '100.00' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(?:\.\d{1,2})?$/)
  amount!: string;

  @ApiProperty({ example: 'BRL' })
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
}
