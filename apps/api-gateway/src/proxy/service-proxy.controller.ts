import {
  Controller,
  All,
  Req,
  Res,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { firstValueFrom, Observable } from 'rxjs';
import { AxiosResponse } from 'axios';

@Controller()
export class ServiceProxyController {
  private readonly serviceUrls: Record<string, string>;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.serviceUrls = {
      users: this.config.get('USER_SERVICE_URL', 'http://localhost:3002'),
      cases: this.config.get('CASE_SERVICE_URL', 'http://localhost:3003'),
      'involved-persons': this.config.get('INVOLVED_SERVICE_URL', 'http://localhost:3004'),
      evidence: this.config.get('EVIDENCE_SERVICE_URL', 'http://localhost:3005'),
      tasks: this.config.get('TASK_SERVICE_URL', 'http://localhost:3006'),
      media: this.config.get('MEDIA_SERVICE_URL', 'http://localhost:3007'),
      audit: this.config.get('AUDIT_SERVICE_URL', 'http://localhost:3008'),
    };
  }

  @All('users*')
  proxyUsers(@Req() req: Request, @Res() res: Response) {
    return this.proxyRequest(req, res, this.serviceUrls['users']);
  }

  @All('cases*')
  proxyCases(@Req() req: Request, @Res() res: Response) {
    return this.proxyRequest(req, res, this.serviceUrls['cases']);
  }

  @All('involved-persons*')
  proxyInvolved(@Req() req: Request, @Res() res: Response) {
    return this.proxyRequest(req, res, this.serviceUrls['involved-persons']);
  }

  @All('evidence*')
  proxyEvidence(@Req() req: Request, @Res() res: Response) {
    return this.proxyRequest(req, res, this.serviceUrls['evidence']);
  }

  @All('tasks*')
  proxyTasks(@Req() req: Request, @Res() res: Response) {
    return this.proxyRequest(req, res, this.serviceUrls['tasks']);
  }

  @All('media*')
  proxyMedia(@Req() req: Request, @Res() res: Response) {
    return this.proxyRequest(req, res, this.serviceUrls['media']);
  }

  @All('audit*')
  proxyAudit(@Req() req: Request, @Res() res: Response) {
    return this.proxyRequest(req, res, this.serviceUrls['audit']);
  }

  private async proxyRequest(req: Request, res: Response, baseUrl: string) {
    const url = `${baseUrl}${req.url}`;
    const method = req.method.toLowerCase() as any;
    const isMultipart = req.headers['content-type']?.startsWith('multipart/form-data');

    try {
      const hasBody = ['post', 'put', 'patch'].includes(method);
      let obs: Observable<AxiosResponse>;

      if (hasBody && isMultipart) {
        // Pipe the raw request stream so the multipart boundary is preserved
        obs = this.http.request({
          method,
          url,
          data: req,
          headers: {
            ...this.forwardHeaders(req),
            'content-type': req.headers['content-type'],
            ...(req.headers['content-length'] && { 'content-length': req.headers['content-length'] }),
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });
      } else if (hasBody) {
        obs = this.http.request({ method, url, data: req.body, headers: this.forwardHeaders(req) });
      } else {
        obs = this.http.request({ method, url, headers: this.forwardHeaders(req) });
      }

      const { data, status } = await firstValueFrom(obs);
      return res.status(status).json(data);
    } catch (error) {
      const status = error?.response?.status ?? 502;
      const data = error?.response?.data ?? { message: 'Service unavailable' };
      return res.status(status).json(data);
    }
  }

  private forwardHeaders(req: Request): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (req.headers['authorization']) {
      headers['Authorization'] = req.headers['authorization'] as string;
    }
    return headers;
  }
}
