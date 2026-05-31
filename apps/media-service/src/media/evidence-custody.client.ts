import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface CustodianResponse {
  evidenceId: string;
  currentCustodianId: string | null;
}

/**
 * Reads the current custodian of a piece of evidence from evidence-service (it owns
 * `evidence_db`). Used to gate downloads of EVIDENCE media to the custodian only.
 *
 * It hits the side-effect-free `GET /evidence/:id/custodian` — NEVER `GET /evidence/:id`,
 * which would itself transfer custody. The caller's bearer token is forwarded (the
 * route is role-guarded for the three roles).
 */
@Injectable()
export class EvidenceCustodyClient {
  private readonly logger = new Logger(EvidenceCustodyClient.name);
  private readonly baseUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {
    this.baseUrl = this.config.get('EVIDENCE_SERVICE_URL', 'http://localhost:3005');
  }

  async getCurrentCustodianId(evidenceId: string, authHeader?: string): Promise<string | null> {
    try {
      const { data } = await firstValueFrom(
        this.http.get<CustodianResponse>(`${this.baseUrl}/evidence/${evidenceId}/custodian`, {
          headers: authHeader ? { Authorization: authHeader } : {},
        }),
      );
      return data?.currentCustodianId ?? null;
    } catch (error: any) {
      // Fail closed: if we cannot verify custody, do not hand out a download URL.
      this.logger.error(
        `Custody lookup failed for evidence ${evidenceId}: ${error?.message}`,
      );
      throw new ServiceUnavailableException('Could not verify evidence custody');
    }
  }
}
