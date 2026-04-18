import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisService } from './services/redis.service';
import { RedisThrottlerStorage } from './throttler/redis-throttler.storage';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [RedisService, RedisThrottlerStorage],
  exports: [RedisService, RedisThrottlerStorage],
})
export class CommonModule {}
