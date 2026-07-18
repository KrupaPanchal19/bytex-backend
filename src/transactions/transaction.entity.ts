import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type TransactionType = 'income' | 'expense';

@Entity('transactions')
@Index(['type', 'occurredAt'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ['income', 'expense'] })
  type: TransactionType;

  // Money is stored as an exact numeric to avoid float drift; the API surface
  // uses plain numbers, so we (de)serialize at the service boundary.
  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: string;

  @Column({ type: 'varchar', length: 60 })
  @Index()
  category: string;

  @Column({ type: 'varchar', length: 200, default: '' })
  note: string;

  @Column({ type: 'timestamptz' })
  occurredAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
