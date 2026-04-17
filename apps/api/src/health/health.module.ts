import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { HealthController } from './health.controller';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [HealthController],
})
export class HealthModule {}
