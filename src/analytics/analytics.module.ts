import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  // Registers its own repo handle for Transaction (no dependency on
  // TransactionsModule) so TransactionsModule can depend on us without a cycle.
  imports: [TypeOrmModule.forFeature([Transaction]), NotificationsModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
