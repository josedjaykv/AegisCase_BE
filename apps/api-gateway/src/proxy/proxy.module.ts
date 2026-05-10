import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthProxyController } from './auth-proxy.controller';

@Module({
  imports: [HttpModule],
  controllers: [AuthProxyController],
})
export class ProxyModule {}
