import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthLibModule } from '@aegiscase/auth';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    HttpModule,
    AuthLibModule,
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
