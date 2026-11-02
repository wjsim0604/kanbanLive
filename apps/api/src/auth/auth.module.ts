import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_CONFIG, type AppConfig } from '../config';
import { ACCOUNT_THROTTLER, AuthThrottlerGuard, IP_THROTTLER } from './auth-throttler.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  imports: [
    JwtModule.register({}),
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        throttlers: [
          { name: ACCOUNT_THROTTLER, ttl: 60_000, limit: config.authRateLimit.perAccount },
          { name: IP_THROTTLER, ttl: 60_000, limit: config.authRateLimit.perIp },
        ],
        errorMessage: 'Too many requests, please try again later',
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthThrottlerGuard, { provide: APP_GUARD, useClass: JwtAuthGuard }],
  exports: [AuthService],
})
export class AuthModule {}
