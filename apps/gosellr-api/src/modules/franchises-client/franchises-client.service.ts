import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

interface NotifyResponse {
  accepted: true;
  store_id: string;
  franchise_id: string;
  region: string;
  created_new_franchise: boolean;
  redistributed: boolean;
}

export interface FranchiseSummary {
  _id: string;
  level: 'sub' | 'corporate' | 'master';
  parent_id: string | null;
  name: string;
  region: string;
  center: { type: 'Point'; coordinates: [number, number] };
  radius_km: number;
  store_count: number;
  child_count: number;
  status: 'Auto-Created' | 'Available' | 'Assigned' | 'Active';
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoreLookupResponse {
  store: {
    _id: string;
    store_id: string;
    franchise_id: string;
    store_location: { type: 'Point'; coordinates: [number, number] };
    active: boolean;
    created_at: string;
    updated_at: string;
  };
  sub: FranchiseSummary;
  corporate: FranchiseSummary | null;
  master: FranchiseSummary | null;
}

/**
 * FranchisesClientService - direct service-to-service client for ehb-franchises.
 *
 * Mirrors the existing jps-client pattern (x-service-key + x-service-id) that
 * was approved in Phase 0 as the way to communicate with the new franchise
 * system. The only call today is the store-registration notification.
 *
 * IMPORTANT: this client must NEVER block seller registration on a franchises
 * outage. Callers should `void`-await it and let the caller log failures.
 */
@Injectable()
export class FranchisesClientService {
  private readonly logger = new Logger(FranchisesClientService.name);
  private readonly baseUrl: string;
  private readonly serviceKey: string;
  private readonly serviceId: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    this.baseUrl = this.config.get<string>('FRANCHISES_API_URL', 'http://localhost:3010');
    this.serviceKey = this.config.get<string>('FRANCHISES_SERVICE_KEY', '');
    this.serviceId = this.config.get<string>('FRANCHISES_SERVICE_ID', 'gosellr');
  }

  private get headers() {
    return { 'x-service-key': this.serviceKey, 'x-service-id': this.serviceId };
  }

  /**
   * Look up which Sub franchise a store is linked to, plus its parent
   * Corporate and Master (if any). Public endpoint on ehb-franchises so we
   * don't need the service key for this call.
   *
   * Returns null when the store is not yet linked to any franchise (typically
   * because the seller registered without lat/lng so the auto-creation
   * pipeline never ran for them).
   */
  async lookupByStore(storeId: string): Promise<StoreLookupResponse | null> {
    try {
      const res = await firstValueFrom(
        this.httpService.get<StoreLookupResponse>(
          `${this.baseUrl}/catalog/stores/${encodeURIComponent(storeId)}`,
        ),
      );
      return res.data;
    } catch (err: unknown) {
      // 404 simply means "not linked yet" - caller treats that as null.
      this.logger.warn(`franchises lookupByStore(${storeId}) failed: ${String(err)}`);
      return null;
    }
  }

  /**
   * Notify ehb-franchises that a new GoSellr store registered.
   * Triggers the auto-creation pipeline (geo / allocation / hierarchy /
   * compliance) on the franchises side and returns the resolved franchise id.
   *
   * Returns null on any failure - integration is best-effort and never blocks
   * the seller's own registration flow.
   */
  async notifyStoreRegistered(input: {
    store_id: string;
    lat: number;
    lng: number;
    store_name?: string;
  }): Promise<NotifyResponse | null> {
    if (!this.serviceKey) {
      this.logger.warn('FRANCHISES_SERVICE_KEY not set - skipping notify');
      return null;
    }
    try {
      const res = await firstValueFrom(
        this.httpService.post<NotifyResponse>(
          `${this.baseUrl}/intake/store-registered`,
          {
            store_id: input.store_id,
            source_platform: 'gosellr',
            location: { lat: input.lat, lng: input.lng },
            // Cached on the StoreLink so franchise dashboards can show
            // meaningful names without round-tripping back to GoSellr.
            ...(input.store_name?.trim() ? { store_name: input.store_name.trim() } : {}),
          },
          { headers: this.headers },
        ),
      );
      this.logger.log(
        `franchises notify ok: store ${input.store_id} -> franchise ${res.data.franchise_id} (${res.data.region}${res.data.created_new_franchise ? ', new' : ''}${res.data.redistributed ? ', redistributed' : ''})`,
      );
      return res.data;
    } catch (err: unknown) {
      this.logger.warn(`franchises notify failed (non-fatal): ${String(err)}`);
      return null;
    }
  }
}
