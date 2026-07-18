import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { TransactionView } from '../transactions/transactions.service';
import { CacheService } from '../redis/cache.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  clamp,
  coefficientOfVariation,
  mean,
  round2,
  sampleStdDev,
} from './stats.util';

const ANOMALY_Z_THRESHOLD = 2.5; // std-devs above category mean to flag
const MIN_SAMPLES_FOR_ANOMALY = 4; // need enough history to trust the mean/std
const CACHE_TTL_SECONDS = 300; // analytics is invalidated on write anyway

export interface Anomaly {
  transactionId: string;
  category: string;
  amount: number;
  categoryMean: number;
  categoryStdDev: number;
  zScore: number;
  occurredAt: string;
  note: string;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly repo: Repository<Transaction>,
    private readonly cache: CacheService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Public endpoint payload. Read-through cached; invalidated on any write. */
  async overview() {
    const { value, hit } = await this.cache.wrap('analytics:overview', CACHE_TTL_SECONDS, () =>
      this.compute(),
    );
    return { ...value, cached: hit };
  }

  private async compute() {
    const rows = await this.repo.find({ order: { occurredAt: 'ASC' } });
    const txns = rows.map((r) => ({
      id: r.id,
      type: r.type,
      amount: Number(r.amount),
      category: r.category,
      note: r.note,
      occurredAt: r.occurredAt,
    }));

    const income = txns.filter((t) => t.type === 'income');
    const expense = txns.filter((t) => t.type === 'expense');
    const totalIncome = round2(income.reduce((a, t) => a + t.amount, 0));
    const totalExpense = round2(expense.reduce((a, t) => a + t.amount, 0));
    const balance = round2(totalIncome - totalExpense);
    const savingsRate = totalIncome > 0 ? clamp((totalIncome - totalExpense) / totalIncome, -1, 1) : 0;

    const anomalies = this.detectAnomalies(txns);

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalIncome,
        totalExpense,
        balance,
        transactionCount: txns.length,
        savingsRate: round2(savingsRate),
      },
      byCategory: this.byCategory(txns),
      monthly: this.monthlySeries(txns),
      forecast: this.forecast(txns, balance),
      anomalies,
      healthScore: this.healthScore(txns, savingsRate, anomalies.length, totalIncome, totalExpense),
    };
  }

  // ---- Category breakdown ------------------------------------------------
  private byCategory(txns: { type: string; category: string; amount: number }[]) {
    const map = new Map<string, { category: string; type: string; total: number; count: number }>();
    for (const t of txns) {
      const key = `${t.type}:${t.category}`;
      const cur = map.get(key) ?? { category: t.category, type: t.type, total: 0, count: 0 };
      cur.total += t.amount;
      cur.count += 1;
      map.set(key, cur);
    }
    return [...map.values()]
      .map((c) => ({ ...c, total: round2(c.total) }))
      .sort((a, b) => b.total - a.total);
  }

  // ---- Monthly series (last 6 months, for the chart) --------------------
  private monthlySeries(txns: { type: string; amount: number; occurredAt: Date }[]) {
    const buckets = new Map<string, { month: string; income: number; expense: number }>();
    for (const t of txns) {
      const d = t.occurredAt;
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const cur = buckets.get(key) ?? { month: key, income: 0, expense: 0 };
      if (t.type === 'income') cur.income += t.amount;
      else cur.expense += t.amount;
      buckets.set(key, cur);
    }
    return [...buckets.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6)
      .map((m) => ({
        month: m.month,
        income: round2(m.income),
        expense: round2(m.expense),
        net: round2(m.income - m.expense),
      }));
  }

  // ---- Burn-rate forecast for the current month -------------------------
  private forecast(
    txns: { type: string; amount: number; occurredAt: Date }[],
    currentBalance: number,
  ) {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const dayOfMonth = now.getUTCDate();

    const inMonth = txns.filter(
      (t) => t.occurredAt.getUTCFullYear() === year && t.occurredAt.getUTCMonth() === month,
    );
    const mtdExpense = round2(
      inMonth.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0),
    );
    const mtdIncome = round2(
      inMonth.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0),
    );

    const dailyBurnRate = dayOfMonth > 0 ? mtdExpense / dayOfMonth : 0;
    const remainingDays = Math.max(0, daysInMonth - dayOfMonth);
    const projectedRemainingExpense = round2(dailyBurnRate * remainingDays);
    const projectedMonthEndExpense = round2(mtdExpense + projectedRemainingExpense);
    // Assume income for the rest of the month tracks its own to-date run rate.
    const dailyIncomeRate = dayOfMonth > 0 ? mtdIncome / dayOfMonth : 0;
    const projectedRemainingIncome = round2(dailyIncomeRate * remainingDays);
    const projectedMonthEndBalance = round2(
      currentBalance + projectedRemainingIncome - projectedRemainingExpense,
    );

    return {
      daysInMonth,
      dayOfMonth,
      remainingDays,
      monthToDateExpense: mtdExpense,
      monthToDateIncome: mtdIncome,
      dailyBurnRate: round2(dailyBurnRate),
      projectedMonthEndExpense,
      projectedMonthEndBalance,
      // Human-readable verdict the UI can show without extra logic.
      willEndInDeficit: projectedMonthEndBalance < 0,
    };
  }

  // ---- Anomaly detection (per-category z-score on expenses) -------------
  private detectAnomalies(
    txns: { id: string; type: string; category: string; amount: number; note: string; occurredAt: Date }[],
  ): Anomaly[] {
    const expensesByCat = new Map<string, typeof txns>();
    for (const t of txns) {
      if (t.type !== 'expense') continue;
      const arr = expensesByCat.get(t.category) ?? [];
      arr.push(t);
      expensesByCat.set(t.category, arr);
    }

    const anomalies: Anomaly[] = [];
    for (const [category, items] of expensesByCat) {
      if (items.length < MIN_SAMPLES_FOR_ANOMALY) continue;
      const amounts = items.map((i) => i.amount);
      const m = mean(amounts);
      const sd = sampleStdDev(amounts);
      if (sd === 0) continue; // identical amounts -> nothing is anomalous
      for (const it of items) {
        const z = (it.amount - m) / sd;
        if (z >= ANOMALY_Z_THRESHOLD) {
          anomalies.push({
            transactionId: it.id,
            category,
            amount: round2(it.amount),
            categoryMean: round2(m),
            categoryStdDev: round2(sd),
            zScore: round2(z),
            occurredAt: it.occurredAt.toISOString(),
            note: it.note,
          });
        }
      }
    }
    return anomalies.sort((a, b) => b.zScore - a.zScore);
  }

  // ---- Composite Financial Health Score (0-100) -------------------------
  private healthScore(
    txns: { type: string; amount: number; occurredAt: Date }[],
    savingsRate: number,
    anomalyCount: number,
    totalIncome: number,
    totalExpense: number,
  ) {
    // Factor 1 — Savings rate (40 pts). 25%+ saved = full marks.
    const savingsPts = round2(clamp(savingsRate / 0.25, 0, 1) * 40);

    // Factor 2 — Spending consistency (20 pts). Lower month-to-month expense
    // volatility (coefficient of variation) is healthier.
    const monthly = this.monthlySeries(txns);
    const cv = coefficientOfVariation(monthly.map((m) => m.expense));
    const consistencyPts = round2(clamp(1 - cv, 0, 1) * 20);

    // Factor 3 — Anomaly cleanliness (20 pts). Each anomaly chips away at it.
    const anomalyPts = round2((20 * 1) / (1 + anomalyCount));

    // Factor 4 — Solvency (20 pts). Positive net balance = full; deeper deficits
    // relative to spend score lower.
    const solvencyPts =
      totalIncome - totalExpense >= 0
        ? 20
        : round2(clamp((totalIncome - totalExpense) / -totalExpense + 1, 0, 1) * 20);

    const score = Math.round(savingsPts + consistencyPts + anomalyPts + solvencyPts);
    const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';

    return {
      score,
      grade,
      factors: [
        { name: 'Savings rate', points: savingsPts, max: 40 },
        { name: 'Spending consistency', points: consistencyPts, max: 20 },
        { name: 'Anomaly-free', points: anomalyPts, max: 20 },
        { name: 'Solvency', points: solvencyPts, max: 20 },
      ],
    };
  }

  /**
   * Called on every transaction write. Fires notifications for genuinely notable
   * events only, so the medium isn't spammed on every save or on reads:
   *   - a new expense that is a statistical anomaly for its category
   *   - a write that flips the running balance from non-negative to negative
   */
  async evaluateNewTransaction(view: TransactionView): Promise<void> {
    // 1) Anomaly check against the category's *prior* history.
    if (view.type === 'expense') {
      const priors = await this.repo.find({
        where: { type: 'expense', category: view.category },
        order: { occurredAt: 'ASC' },
      });
      const priorAmounts = priors
        .filter((p) => p.id !== view.id)
        .map((p) => Number(p.amount));
      if (priorAmounts.length >= MIN_SAMPLES_FOR_ANOMALY) {
        const m = mean(priorAmounts);
        const sd = sampleStdDev(priorAmounts);
        if (sd > 0) {
          const z = (view.amount - m) / sd;
          if (z >= ANOMALY_Z_THRESHOLD) {
            await this.notifications.dispatch({
              level: 'warning',
              title: 'Unusual expense detected',
              message: `${view.category}: $${view.amount.toFixed(2)} is ${z.toFixed(
                1,
              )}σ above your usual ~$${m.toFixed(2)}.`,
            });
          }
        }
      }
    }

    // 2) Balance-flip-to-negative check (deterministic, self-deduplicating).
    const totals = await this.repo
      .createQueryBuilder('t')
      .select("SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END)", 'balance')
      .getRawOne<{ balance: string | null }>();
    const balance = Number(totals?.balance ?? 0);
    const signed = view.type === 'income' ? view.amount : -view.amount;
    const prevBalance = balance - signed;
    if (prevBalance >= 0 && balance < 0) {
      await this.notifications.dispatch({
        level: 'critical',
        title: 'Balance went negative',
        message: `This ${view.type} pushed your balance to $${balance.toFixed(2)}.`,
      });
    }
  }
}
