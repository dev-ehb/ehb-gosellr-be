import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  PssSubmitResponse,
  PssSqStatusResponse,
  PssBulkStatusResponse,
} from '../../../../../libs/gosellr-types/src';

@Injectable()
export class PssClientService {
  private readonly logger = new Logger(PssClientService.name);
  private readonly pssUrl: string;
  private readonly platformKey: string;
  private readonly platformId: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    this.pssUrl = this.config.getOrThrow<string>('PSS_API_URL');
    this.platformKey = this.config.getOrThrow<string>('PSS_PLATFORM_KEY');
    this.platformId = this.config.getOrThrow<string>('PLATFORM_ID');
  }

  private get headers() {
    return {
      'x-platform-key': this.platformKey,
      'x-platform-id': this.platformId,
    };
  }

  async submitForSQ(
    entityId: string,
    userId: string,
    entityType: string,
    entityData: Record<string, unknown>,
  ): Promise<PssSubmitResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<PssSubmitResponse>(
          `${this.pssUrl}/sq/submit`,
          {
            entity_id: entityId,
            entity_type: entityType,
            user_id: userId,
            platform_id: this.platformId,
            entity_data: entityData,
          },
          { headers: this.headers },
        ),
      );
      return response.data;
    } catch (err: unknown) {
      this.logger.error(`PSS submitForSQ failed: ${String(err)}`);
      // If PSS returned a structured error, return it; otherwise signal unavailable
      const axiosErr = err as { response?: { data?: PssSubmitResponse } };
      if (axiosErr.response?.data) return axiosErr.response.data;
      return { success: false, error: 'PSS unavailable' };
    }
  }

  async getSQStatus(entityId: string): Promise<PssSqStatusResponse | { error: string }> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<PssSqStatusResponse>(
          `${this.pssUrl}/sq/status/${entityId}?platform_id=${this.platformId}`,
          { headers: this.headers },
        ),
      );
      return response.data;
    } catch (err: unknown) {
      this.logger.error(`PSS getSQStatus failed: ${String(err)}`);
      return { error: 'PSS unavailable' };
    }
  }

  async getBulkSQStatus(
    entityIds: string[],
  ): Promise<PssBulkStatusResponse | { error: string }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<PssBulkStatusResponse>(
          `${this.pssUrl}/sq/status/bulk`,
          { platform_id: this.platformId, entity_ids: entityIds },
          { headers: this.headers },
        ),
      );
      return response.data;
    } catch (err: unknown) {
      this.logger.error(`PSS getBulkSQStatus failed: ${String(err)}`);
      return { error: 'PSS unavailable' };
    }
  }

  async verifyUser(
    userId: string,
    requiredFields: string[] = [],
  ): Promise<Record<string, unknown> | { error: string }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<Record<string, unknown>>(
          `${this.pssUrl}/users/verify`,
          {
            user_id: userId,
            requesting_platform: this.platformId,
            required_fields: requiredFields,
          },
          { headers: this.headers },
        ),
      );
      return response.data;
    } catch (err: unknown) {
      this.logger.error(`PSS verifyUser failed: ${String(err)}`);
      return { error: 'PSS unavailable' };
    }
  }
}
