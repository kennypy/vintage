import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { HashThrottlerGuard } from './common/guards/hash-throttler.guard';
import { CsrfMiddleware } from './common/middleware/csrf.middleware';
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
import { ConsentModule } from './consent/consent.module';
import { TrackingModule } from './tracking/tracking.module';
import { AudienceModule } from './audience/audience.module';
import { AdPartnersModule } from './ad-partners/ad-partners.module';
import { AdsModule } from './ads/ads.module';
import { ModerationModule } from './moderation/moderation.module';

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
    ConsentModule,
    TrackingModule,
    AudienceModule,
    AdPartnersModule,
    AdsModule,
    ModerationModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: HashThrottlerGuard,
    },
    CsrfMiddleware,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CsrfMiddleware)
      .exclude(
        { path: 'api/v1/payments/webhook', method: RequestMethod.POST },
        { path: 'api/v1/auth/register', method: RequestMethod.POST },
        { path: 'api/v1/auth/login', method: RequestMethod.POST },
        { path: 'api/v1/auth/apple/callback', method: RequestMethod.POST },
        // Partner API endpoints use X-Partner-Key; CSRF middleware already
        // skips routes where X-API-Key is present. Explicit exclusion for clarity.
        { path: 'api/v1/partner/*path', method: RequestMethod.ALL },
        // Tracking events may originate from SDKs without CSRF tokens
        { path: 'api/v1/tracking/event', method: RequestMethod.POST },
        // Ad serving / click endpoints are called from mobile SDKs
        { path: 'api/v1/ads/serve', method: RequestMethod.POST },
        { path: 'api/v1/ads/click', method: RequestMethod.POST },
      )
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
