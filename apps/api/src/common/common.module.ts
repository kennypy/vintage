import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisService } from './services/redis.service';
import { CpfVaultService } from './services/cpf-vault.service';
import { RedisThrottlerStorage } from './throttler/redis-throttler.storage';
import { RetentionCronService } from './crons/retention-cron.service';
import { CspReportController } from './controllers/csp-report.controller';

@Global()
@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [CspReportController],
  providers: [
    RedisService,
    CpfVaultService,
    RedisThrottlerStorage,
    RetentionCronService,
  ],
  exports: [RedisService, CpfVaultService, RedisThrottlerStorage],
})
export class CommonModule {}
