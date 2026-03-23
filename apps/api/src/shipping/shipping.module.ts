import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';
import { CorreiosClient } from './correios.client';
import { JadlogClient } from './jadlog.client';

@Module({
  imports: [ConfigModule],
  controllers: [ShippingController],
  providers: [ShippingService, CorreiosClient, JadlogClient],
  exports: [ShippingService],
})
export class ShippingModule {}
