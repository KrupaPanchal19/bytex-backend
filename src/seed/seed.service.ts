import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../transactions/transaction.entity';

interface SeedSpec {
  type: 'income' | 'expense';
  category: string;
  min: number;
  max: number;
  note: string;
}

const CATEGORIES: SeedSpec[] = [
  { type: 'income', category: 'Salary', min: 3800, max: 4200, note: 'Monthly salary' },
  { type: 'income', category: 'Freelance', min: 200, max: 900, note: 'Side project' },
  { type: 'expense', category: 'Rent', min: 1200, max: 1200, note: 'Apartment' },
  { type: 'expense', category: 'Groceries', min: 40, max: 120, note: 'Weekly shop' },
  { type: 'expense', category: 'Dining', min: 15, max: 60, note: 'Eating out' },
  { type: 'expense', category: 'Transport', min: 10, max: 45, note: 'Commute' },
  { type: 'expense', category: 'Utilities', min: 60, max: 140, note: 'Bills' },
];

@Injectable()
export class SeedService {
  private readonly logger = new Logger('Seed');

  constructor(
    @InjectRepository(Transaction)
    private readonly repo: Repository<Transaction>,
  ) {}

  /** Populate ~3 months of realistic data (plus one obvious anomaly) if empty. */
  async seedIfEmpty(): Promise<void> {
    const count = await this.repo.count();
    if (count > 0) {
      this.logger.log(`Skipping seed — ${count} transactions already present.`);
      return;
    }

    const rows: Partial<Transaction>[] = [];
    const now = new Date();

    for (let monthsAgo = 2; monthsAgo >= 0; monthsAgo--) {
      const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));

      for (const spec of CATEGORIES) {
        // Income + rent: once a month. Everyday categories: several times a month.
        const occurrences =
          spec.type === 'income' || spec.category === 'Rent' ? 1 : 6 + Math.floor(Math.random() * 4);
        for (let i = 0; i < occurrences; i++) {
          const day = 1 + Math.floor(Math.random() * 27);
          const amount = spec.min + Math.random() * (spec.max - spec.min);
          rows.push({
            type: spec.type,
            category: spec.category,
            amount: amount.toFixed(2),
            note: spec.note,
            occurredAt: new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), day)),
          });
        }
      }
    }

    // Deliberate anomaly: a single Groceries charge ~10x the norm, in the current
    // month, so the z-score detector visibly flags it out of the box.
    rows.push({
      type: 'expense',
      category: 'Groceries',
      amount: '890.00',
      note: 'Bulk party supplies (anomaly demo)',
      occurredAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Math.min(now.getUTCDate(), 20))),
    });

    await this.repo.save(this.repo.create(rows));
    this.logger.log(`Seeded ${rows.length} demo transactions.`);
  }
}
