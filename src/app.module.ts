import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './transactions/transaction.entity';
import { Notification } from './notifications/notification.entity';
import { TransactionsModule } from './transactions/transactions.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RedisModule } from './redis/redis.module';
import { SeedModule } from './seed/seed.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USER ?? 'ledger',
      password: process.env.DB_PASSWORD ?? 'ledger',
      database: process.env.DB_NAME ?? 'ledger',
      entities: [Transaction, Notification],
      // Fine for a challenge app; a production service would use migrations instead.
      synchronize: true,
      retryAttempts: 15,
      retryDelay: 3000,
    }),
    RedisModule,
    TransactionsModule,
    AnalyticsModule,
    NotificationsModule,
    SeedModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
