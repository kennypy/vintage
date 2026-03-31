import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AudienceModule } from '../audience/audience.module';
import {
  AdPartnersAdminController,
  AdPartnersController,
} from './ad-partners.controller';
import { AdPartnersService } from './ad-partners.service';
import { AdPartnerAuthGuard } from './ad-partner-auth.guard';

@Module({
  imports: [PrismaModule, AudienceModule],
  controllers: [AdPartnersAdminController, AdPartnersController],
  providers: [AdPartnersService, AdPartnerAuthGuard],
  exports: [AdPartnersService],
})
export class AdPartnersModule {}
