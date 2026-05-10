import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthProxyController } from './auth-proxy.controller';
import { ServiceProxyController } from './service-proxy.controller';

@Module({
  imports: [HttpModule],
  controllers: [AuthProxyController, ServiceProxyController],
})
export class ProxyModule {}
