import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ListingsModule } from './listings/listings.module';
import { OrdersModule } from './orders/orders.module';
import { OffersModule } from './offers/offers.module';
import { WalletModule } from './wallet/wallet.module';
import { MessagesModule } from './messages/messages.module';
import { ReviewsModule } from './reviews/reviews.module';
import { NotificationsModule } from './notifications/notifications.module';
import { HealthModule } from './health/health.module';
import { SearchModule } from './search/search.module';
import { PaymentsModule } from './payments/payments.module';
import { ShippingModule } from './shipping/shipping.module';
import { DisputesModule } from './disputes/disputes.module';
import { ReportsModule } from './reports/reports.module';
import { NotaFiscalModule } from './notafiscal/notafiscal.module';
import { BundlesModule } from './bundles/bundles.module';
import { PromotionsModule } from './promotions/promotions.module';
import { EmailModule } from './email/email.module';
import { PushModule } from './push/push.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 60, // 60 requests per minute
      },
    ]),
    PrismaModule,
    AuthModule,
    UsersModule,
    ListingsModule,
    OrdersModule,
    OffersModule,
    WalletModule,
    MessagesModule,
    ReviewsModule,
    NotificationsModule,
    HealthModule,
    SearchModule,
    PaymentsModule,
    ShippingModule,
    DisputesModule,
    ReportsModule,
    NotaFiscalModule,
    BundlesModule,
    PromotionsModule,
    EmailModule,
    PushModule,
    UploadsModule,
  ],
})
export class AppModule {}
