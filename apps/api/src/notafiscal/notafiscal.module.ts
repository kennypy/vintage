import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { NotaFiscalController } from './notafiscal.controller';
import { NotaFiscalService } from './notafiscal.service';
import { NFeClient } from './nfe.client';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [NotaFiscalController],
  providers: [NotaFiscalService, NFeClient],
  exports: [NotaFiscalService],
})
export class NotaFiscalModule {}
