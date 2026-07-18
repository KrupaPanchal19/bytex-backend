import { Controller, Get } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  // Single call powers the whole dashboard: summary, category split, monthly
  // series, burn-rate forecast, anomalies, and the health score.
  @Get()
  overview() {
    return this.service.overview();
  }
}
