import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getInfo() {
    return {
      name: 'AegisCase Backend',
      version: '1.0.0',
      description: 'Investigation Management System',
      environment: process.env.NODE_ENV || 'development',
    };
  }
}
