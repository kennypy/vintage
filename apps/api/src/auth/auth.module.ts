import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { GoogleStrategy } from './google.strategy';
import { AppleStrategy } from './apple.strategy';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CsrfMiddleware } from '../common/middleware/csrf.middleware';

@Module({
  imports: [
    UsersModule,
    NotificationsModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        // @nestjs/jwt v11 switched to the stricter `jsonwebtoken@9` types,
        // which require `secret` to be a string/Buffer (not `string |
        // undefined`) and `expiresIn` to match the `ms` StringValue
        // template literal (`"15m"`, `"1h"`, …) or a number of seconds.
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          // main.ts re-asserts this on production boot; tests run with
          // `JWT_SECRET=test-secret-do-not-use-in-production` via CI env.
          throw new Error('JWT_SECRET is required');
        }
        return {
          secret,
          signOptions: {
            expiresIn: config.get<string>('JWT_EXPIRY', '15m') as `${number}${'s' | 'm' | 'h' | 'd'}`,
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, JwtStrategy, GoogleStrategy, AppleStrategy, CsrfMiddleware],
  controllers: [AuthController],
  exports: [AuthService, CsrfMiddleware],
})
export class AuthModule {}
