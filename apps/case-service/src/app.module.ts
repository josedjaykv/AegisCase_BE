import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthLibModule, JwtAuthGuard, RolesGuard } from '@aegiscase/auth';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthLibModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
