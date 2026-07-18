import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { TransactionType } from '../transaction.entity';

export class QueryTransactionsDto {
  @IsOptional()
  @IsEnum(['income', 'expense'])
  type?: TransactionType;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 100;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
