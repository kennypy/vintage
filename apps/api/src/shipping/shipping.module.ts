import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';
import { CorreiosClient } from './correios.client';
import { JadlogClient } from './jadlog.client';
import { KanguClient } from './kangu.client';
import { PegakiClient } from './pegaki.client';

@Module({
  imports: [ConfigModule],
  controllers: [ShippingController],
  providers: [ShippingService, CorreiosClient, JadlogClient, KanguClient, PegakiClient],
  exports: [ShippingService],
})
export class ShippingModule {}
