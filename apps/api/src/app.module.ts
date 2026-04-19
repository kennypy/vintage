import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { HashThrottlerGuard } from './common/guards/hash-throttler.guard';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';
import { CsrfMiddleware } from './common/middleware/csrf.middleware';
import { CommonModule } from './common/common.module';
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
import { SmsModule } from './sms/sms.module';
import { PushModule } from './push/push.module';
import { UploadsModule } from './uploads/uploads.module';
import { ConsentModule } from './consent/consent.module';
import { TrackingModule } from './tracking/tracking.module';
import { AudienceModule } from './audience/audience.module';
import { AdPartnersModule } from './ad-partners/ad-partners.module';
import { AdsModule } from './ads/ads.module';
import { ModerationModule } from './moderation/moderation.module';
import { AuthenticityModule } from './authenticity/authenticity.module';
import { SellerInsightsModule } from './seller-insights/seller-insights.module';
import { ImpactModule } from './impact/impact.module';
import { CouponsModule } from './coupons/coupons.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { AdminAnalyticsModule } from './admin-analytics/admin-analytics.module';
import { FraudModule } from './fraud/fraud.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { IdentityModule } from './identity/identity.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Redis-backed storage (see RedisThrottlerStorage). Required for
    // horizontal scale — the in-memory default would let an attacker
    // reset their rate-limit counter just by hitting a different API
    // instance.
    ThrottlerModule.forRootAsync({
      imports: [CommonModule],
      inject: [RedisThrottlerStorage],
      useFactory: (storage: RedisThrottlerStorage) => ({
        throttlers: [
          {
            ttl: 60000, // 1 minute
            limit: 60, // 60 requests per minute per tracker
          },
        ],
        storage,
      }),
    }),
    CommonModule,
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
    SmsModule,
    PushModule,
    UploadsModule,
    ConsentModule,
    TrackingModule,
    AudienceModule,
    AdPartnersModule,
    AdsModule,
    ModerationModule,
    AuthenticityModule,
    SellerInsightsModule,
    ImpactModule,
    CouponsModule,
    FeatureFlagsModule,
    AdminAnalyticsModule,
    FraudModule,
    AnalyticsModule,
    IdentityModule,
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
    // NestJS v11 middleware path-matching: paths in `exclude()` and
    // `forRoutes()` are interpreted RELATIVE to the global prefix set
    // by `app.setGlobalPrefix('api/v1')` in main.ts. A DAST probe
    // during pen-test track 2 found that the previous exclude list
    // carried the `api/v1/` prefix and therefore never matched — so
    // every CSRF-excluded endpoint (Mercado Pago webhooks, register,
    // login, 2FA confirm, partner API, tracking, ads) was being
    // rejected with 403 "Token CSRF ausente". That meant:
    //   * Mercado Pago could not deliver a single payment webhook
    //     (payments were stuck PENDING forever);
    //   * nobody could register or log in (we blocked them before
    //     they ever saw a CSRF token);
    //   * mobile SDKs hitting /tracking/event / /ads/serve all 403'd.
    // This was the DAST finding D-03 — pre-launch showstopper.
    consumer
      .apply(CsrfMiddleware)
      .exclude(
        { path: 'payments/webhook', method: RequestMethod.POST },
        { path: 'auth/register', method: RequestMethod.POST },
        { path: 'auth/login', method: RequestMethod.POST },
        { path: 'auth/2fa/confirm-login', method: RequestMethod.POST },
        // SMS-code resend is called with only a tempToken (same pre-auth
        // security model as /auth/2fa/confirm-login), so CSRF is not
        // applicable — the tempToken is the anti-forgery factor.
        { path: 'auth/2fa/sms/login-resend', method: RequestMethod.POST },
        { path: 'auth/apple/callback', method: RequestMethod.POST },
        // Partner API endpoints use X-Partner-Key (authenticated
        // separately by AdPartnerAuthGuard). CSRF makes no sense for
        // them — they're server-to-server.
        { path: 'partner/*path', method: RequestMethod.ALL },
        // Tracking + ad endpoints are called from mobile SDKs without
        // a browser cookie context, so CSRF is inapplicable.
        { path: 'tracking/event', method: RequestMethod.POST },
        { path: 'ads/serve', method: RequestMethod.POST },
        { path: 'ads/click', method: RequestMethod.POST },
      )
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
