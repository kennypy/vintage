import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisService } from './services/redis.service';
import { CpfVaultService } from './services/cpf-vault.service';
import { RedisThrottlerStorage } from './throttler/redis-throttler.storage';
import { RetentionCronService } from './crons/retention-cron.service';

@Global()
@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    RedisService,
    CpfVaultService,
    RedisThrottlerStorage,
    RetentionCronService,
  ],
  exports: [RedisService, CpfVaultService, RedisThrottlerStorage],
})
export class CommonModule {}
