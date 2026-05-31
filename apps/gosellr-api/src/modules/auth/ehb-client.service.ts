import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface EhbVerifyResponse {
  valid: true;
  user: {
    ehb_user_id: string;
    email: string;
    full_name: string;
  };
}

/**
 * Thin HTTP client for EHB Main identity API.
 *
 * GoSellr backend calls EHB to verify EHB tokens during the
 * OAuth-style callback flow. This is the only place GoSellr ever
 * calls EHB — it is not a general-purpose cross-platform call.
 */
@Injectable()
export class EhbClientService {
  private readonly logger = new Logger(EhbClientService.name);
  private readonly ehbApiUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    this.ehbApiUrl = this.config.getOrThrow<string>('EHB_API_URL');
  }

  /**
   * Verify an EHB JWT and return the user's EHB identity.
   * Throws UnauthorizedException if the token is invalid.
   */
  async verifyToken(ehbToken: string): Promise<EhbVerifyResponse['user']> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<EhbVerifyResponse>(
          `${this.ehbApiUrl}/auth/verify-token`,
          {
            headers: { Authorization: `Bearer ${ehbToken}` },
          },
        ),
      );
      return response.data.user;
    } catch (err: unknown) {
      this.logger.error(`EHB token verification failed: ${String(err)}`);
      throw new UnauthorizedException('Invalid or expired EHB token');
    }
  }

  /**
   * Notify EHB that the user has linked their GoSellr account.
   * Best-effort — logs on failure but does not throw.
   */
  async linkPlatform(ehbToken: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.ehbApiUrl}/auth/link-platform`,
          { platform_id: 'gosellr' },
          { headers: { Authorization: `Bearer ${ehbToken}` } },
        ),
      );
    } catch (err: unknown) {
      // Non-fatal — log and continue
      this.logger.warn(`EHB link-platform call failed: ${String(err)}`);
    }
  }
}
