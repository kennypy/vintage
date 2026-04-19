import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogService } from './audit-log.service';

/**
 * Global so every service can inject AuditLogService without us
 * wiring imports everywhere. The service writes to the shared
 * PrismaService; no other dependencies.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
