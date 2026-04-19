import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisService } from './services/redis.service';
import { RedisThrottlerStorage } from './throttler/redis-throttler.storage';
import { RetentionCronService } from './crons/retention-cron.service';

@Global()
@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [RedisService, RedisThrottlerStorage, RetentionCronService],
  exports: [RedisService, RedisThrottlerStorage],
})
export class CommonModule {}
