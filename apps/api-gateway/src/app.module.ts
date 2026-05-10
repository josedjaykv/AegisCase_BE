import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AuthLibModule, JwtAuthGuard, RolesGuard } from '@aegiscase/auth';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';
import { ProxyModule } from './proxy/proxy.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TerminusModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    AuthLibModule,
    ProxyModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    // Rate limiting guard applied globally
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // JWT authentication guard applied globally
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Role-based authorization guard applied globally
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
