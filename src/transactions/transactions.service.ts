import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheService } from '../redis/cache.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { Transaction } from './transaction.entity';

export interface TransactionView {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  note: string;
  occurredAt: string;
  createdAt: string;
}

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly repo: Repository<Transaction>,
    private readonly cache: CacheService,
    private readonly analytics: AnalyticsService,
  ) {}

  /** DB row -> API shape. Numeric column comes back as a string; convert once here. */
  static toView(t: Transaction): TransactionView {
    return {
      id: t.id,
      type: t.type,
      amount: Number(t.amount),
      category: t.category,
      note: t.note,
      occurredAt: t.occurredAt.toISOString(),
      createdAt: t.createdAt.toISOString(),
    };
  }

  async create(dto: CreateTransactionDto): Promise<TransactionView> {
    const entity = this.repo.create({
      type: dto.type,
      amount: dto.amount.toFixed(2),
      category: dto.category.trim(),
      note: dto.note?.trim() ?? '',
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
    });
    const saved = await this.repo.save(entity);
    await this.cache.bumpGeneration(); // any write invalidates all cached analytics
    const view = TransactionsService.toView(saved);
    // Fire notable-event notifications (anomaly / balance flip) off the write path.
    await this.analytics.evaluateNewTransaction(view);
    return view;
  }

  async findAll(query: QueryTransactionsDto): Promise<TransactionView[]> {
    const qb = this.repo.createQueryBuilder('t').orderBy('t.occurredAt', 'DESC');
    if (query.type) qb.andWhere('t.type = :type', { type: query.type });
    if (query.category) qb.andWhere('t.category = :category', { category: query.category });
    qb.take(query.limit ?? 100).skip(query.offset ?? 0);
    const rows = await qb.getMany();
    return rows.map(TransactionsService.toView);
  }

  async findOne(id: string): Promise<TransactionView> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Transaction ${id} not found`);
    return TransactionsService.toView(row);
  }

  async update(id: string, dto: UpdateTransactionDto): Promise<TransactionView> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Transaction ${id} not found`);

    if (dto.type !== undefined) row.type = dto.type;
    if (dto.amount !== undefined) row.amount = dto.amount.toFixed(2);
    if (dto.category !== undefined) row.category = dto.category.trim();
    if (dto.note !== undefined) row.note = dto.note.trim();
    if (dto.occurredAt !== undefined) row.occurredAt = new Date(dto.occurredAt);

    const saved = await this.repo.save(row);
    await this.cache.bumpGeneration();
    return TransactionsService.toView(saved);
  }

  async remove(id: string): Promise<{ id: string; deleted: true }> {
    const result = await this.repo.delete({ id });
    if (!result.affected) throw new NotFoundException(`Transaction ${id} not found`);
    await this.cache.bumpGeneration();
    return { id, deleted: true };
  }

  /** Distinct categories seen so far — powers the frontend autocomplete. */
  async categories(): Promise<string[]> {
    const rows = await this.repo
      .createQueryBuilder('t')
      .select('DISTINCT t.category', 'category')
      .orderBy('t.category', 'ASC')
      .getRawMany<{ category: string }>();
    return rows.map((r) => r.category);
  }
}
