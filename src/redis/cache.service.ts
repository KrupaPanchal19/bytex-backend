import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Thin Redis wrapper with a *generation-based* invalidation strategy.
 *
 * The naive approach — DEL every analytics key on each write — is O(n) in the
 * number of cached views and racy (a read can repopulate a key the writer is
 * mid-delete on). Instead we keep a single monotonically increasing integer,
 * `ledger:gen`. Every cache key is namespaced with the current generation:
 *
 *     analytics:summary            ->  g42:analytics:summary
 *
 * A write does ONE atomic `INCR ledger:gen`. That instantly orphans every key
 * from older generations — no scanning, no per-key deletes, no races. Orphaned
 * keys simply expire on their TTL. Reads and writes stay O(1).
 *
 * The service also fails *open*: if Redis is down, reads return null (compute
 * fresh) and writes are swallowed, so the API keeps serving instead of 500-ing.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger('Cache');
  private readonly client: Redis;
  private readonly GEN_KEY = 'ledger:gen';
  private cachedGen: string | null = null;

  constructor() {
    this.client = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      // Keep retrying the connection quietly instead of crashing the process.
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });
    this.client.on('error', (err) => this.logger.warn(`Redis error: ${err.message}`));
  }

  private async generation(): Promise<string> {
    if (this.cachedGen) return this.cachedGen;
    try {
      const gen = (await this.client.get(this.GEN_KEY)) ?? '0';
      this.cachedGen = gen;
      return gen;
    } catch {
      return '0';
    }
  }

  private async key(logical: string): Promise<string> {
    return `g${await this.generation()}:${logical}`;
  }

  /** Read-through helper: return cached value or compute, cache, and return it. */
  async wrap<T>(logical: string, ttlSeconds: number, compute: () => Promise<T>): Promise<{
    value: T;
    hit: boolean;
  }> {
    const k = await this.key(logical);
    try {
      const cached = await this.client.get(k);
      if (cached !== null) {
        return { value: JSON.parse(cached) as T, hit: true };
      }
    } catch {
      // fall through to compute
    }

    const value = await compute();
    try {
      await this.client.set(k, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // fail open — value is still returned
    }
    return { value, hit: false };
  }

  /**
   * Invalidate ALL cached views in one atomic op by bumping the generation.
   * Call this from any write path (create/update/delete transaction).
   */
  async bumpGeneration(): Promise<void> {
    try {
      const next = await this.client.incr(this.GEN_KEY);
      this.cachedGen = String(next);
    } catch {
      // If Redis is unreachable, drop our cached gen so the next read recomputes.
      this.cachedGen = null;
    }
  }

  async onModuleDestroy() {
    await this.client.quit().catch(() => undefined);
  }
}
