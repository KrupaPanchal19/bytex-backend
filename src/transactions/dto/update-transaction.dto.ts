import { PartialType } from '@nestjs/mapped-types';
import { CreateTransactionDto } from './create-transaction.dto';

// All fields optional; same validation rules apply when present.
export class UpdateTransactionDto extends PartialType(CreateTransactionDto) {}
