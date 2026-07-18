import {
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Max,
} from 'class-validator';
import { TransactionType } from '../transaction.entity';

export class CreateTransactionDto {
  @IsEnum(['income', 'expense'], { message: 'type must be "income" or "expense"' })
  type: TransactionType;

  // Reject NaN/Infinity, negatives, zero, and absurd values. Cap keeps a fat-finger
  // entry from poisoning the anomaly statistics.
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'amount must be a number with up to 2 decimals' })
  @IsPositive({ message: 'amount must be greater than 0' })
  @Max(1_000_000_000, { message: 'amount is unrealistically large' })
  amount: number;

  @IsString()
  @Length(1, 60, { message: 'category must be 1-60 characters' })
  category: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  note?: string;

  // Optional; defaults to "now" in the service. ISO-8601 keeps parsing unambiguous.
  @IsOptional()
  @IsISO8601({}, { message: 'occurredAt must be an ISO-8601 date string' })
  occurredAt?: string;
}
