import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotaFiscalController } from './notafiscal.controller';
import { NotaFiscalService } from './notafiscal.service';

@Module({
  imports: [PrismaModule],
  controllers: [NotaFiscalController],
  providers: [NotaFiscalService],
  exports: [NotaFiscalService],
})
export class NotaFiscalModule {}
