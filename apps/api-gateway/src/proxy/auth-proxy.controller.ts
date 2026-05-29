import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { Public, Roles } from '@aegiscase/auth';
import { UserRole } from '@aegiscase/enums';

@ApiTags('auth')
@Controller('auth')
export class AuthProxyController {
  private readonly authServiceUrl: string;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.authServiceUrl = this.config.get('AUTH_SERVICE_URL', 'http://localhost:3001');
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login — proxied to auth-service' })
  async login(@Body() body: any, @Res() res: Response) {
    return this.proxy('POST', '/auth/login', body, res);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh token — proxied to auth-service' })
  async refresh(@Body() body: any, @Res() res: Response) {
    return this.proxy('POST', '/auth/refresh', body, res);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Logout — proxied to auth-service' })
  async logout(@Body() body: any, @Res() res: Response) {
    return this.proxy('POST', '/auth/logout', body, res);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Get current user — proxied to auth-service' })
  async me(@Req() req: Request, @Res() res: Response) {
    return this.proxy('GET', '/auth/me', null, res, req.headers['authorization']);
  }

  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @Get('keycloak-users')
  @ApiOperation({ summary: 'Search Keycloak users — proxied to auth-service (ADMIN)' })
  @ApiQuery({ name: 'search', required: true })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async keycloakUsers(@Req() req: Request, @Res() res: Response) {
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    return this.proxy(
      'GET',
      `/auth/keycloak-users${qs}`,
      null,
      res,
      req.headers['authorization'],
    );
  }

  @ApiBearerAuth()
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate token — proxied to auth-service' })
  async validate(@Req() req: Request, @Res() res: Response) {
    return this.proxy('POST', '/auth/validate', null, res, req.headers['authorization']);
  }

  private async proxy(
    method: 'GET' | 'POST',
    path: string,
    body: any,
    res: Response,
    authHeader?: string,
  ) {
    const url = `${this.authServiceUrl}${path}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authHeader) headers['Authorization'] = authHeader;

    try {
      const request =
        method === 'GET'
          ? this.http.get(url, { headers })
          : this.http.post(url, body, { headers });

      const { data, status } = await firstValueFrom(request);
      return res.status(status).json(data);
    } catch (error) {
      const status = error?.response?.status ?? 502;
      const data = error?.response?.data ?? { message: 'Auth service unavailable' };
      return res.status(status).json(data);
    }
  }
}
