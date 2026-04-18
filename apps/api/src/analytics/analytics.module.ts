import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AnalyticsService } from './analytics.service';

/**
 * Global because analytics is called from every feature module —
 * auth, listings, orders, disputes, payments — and making each one
 * import AnalyticsModule individually produced zero value beyond
 * boilerplate. Marking it @Global() keeps that explicit.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
