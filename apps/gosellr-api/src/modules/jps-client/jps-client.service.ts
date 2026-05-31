import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  JpsProfilePublic,
} from '../../../../../libs/gosellr-types/src';

interface JpsProfileFull {
  _id: string;
  user_id?: string;
  platform: string;
  role: string;
  display_name: string;
  bio: string;
  description: string;
  status: string;
  sq_level: number | null;
  cnic_front?: string | null;
  cnic_back?: string | null;
  address?: string;
  address_proof?: string | null;
  rejection_reason?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface CacheEntry {
  data: JpsProfilePublic;
  expires_at: number;
}

/**
 * Client for service-to-service calls to JPS.
 *
 * GoSellr and JPS deliberately do NOT share a JWT secret — each service
 * issues its own bearer tokens. To bridge identities we use:
 *   - x-service-key header (shared secret in JPS_SERVICE_TOKEN env)
 *   - the user's email as the join key (both services agree on the same
 *     EHB SSO email per identity)
 *
 * Buyer-facing public profile reads are cached for PUBLIC_TTL_MS (5 min)
 * to avoid hammering JPS on every product render. Cache is in-process.
 */
@Injectable()
export class JpsClientService {
  private readonly logger = new Logger(JpsClientService.name);
  private readonly jpsUrl: string;
  private readonly serviceKey: string;
  private readonly serviceId = 'gosellr';
  private readonly publicCache = new Map<string, CacheEntry>();
  private static readonly PUBLIC_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    this.jpsUrl = this.config.getOrThrow<string>('JPS_BASE_URL');
    this.serviceKey = this.config.getOrThrow<string>('JPS_SERVICE_TOKEN');
  }

  private get serviceHeaders() {
    return {
      'x-service-key': this.serviceKey,
      'x-service-id': this.serviceId,
    };
  }

  /**
   * List the JPS profiles owned by the user with the given email,
   * filtered to (platform=gosellr, role=<role>). Service-key auth.
   *
   * The role defaults to "seller" so existing call-sites (the seller attach
   * flow) keep working unchanged. The rider attach flow passes role="rider".
   */
  async listEligibleByEmail(
    email: string,
    role: string = 'seller',
  ): Promise<JpsProfileFull[]> {
    if (!email) {
      this.logger.warn('[svc-lookup] called with empty email — returning []');
      return [];
    }
    this.logger.log(
      `[svc-lookup] GET ${this.jpsUrl}/profiles/by-email/lookup?email=${email}&platform=gosellr&role=${role}`,
    );
    try {
      const response = await firstValueFrom(
        this.httpService.get<JpsProfileFull[]>(
          `${this.jpsUrl}/profiles/by-email/lookup`,
          {
            headers: this.serviceHeaders,
            params: {
              email,
              platform: 'gosellr',
              role,
            },
          },
        ),
      );
      const profiles = response.data ?? [];
      this.logger.log(`[svc-lookup] JPS returned ${profiles.length} profile(s)`);
      return profiles;
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: unknown } };
      this.logger.error(
        `listEligibleByEmail(${email}, role=${role}) failed: status=${e.response?.status} ` +
        `data=${JSON.stringify(e.response?.data)} ${String(err)}`,
      );
      return [];
    }
  }

  /**
   * Roster lookup: list SQ-approved profiles for a given (platform, role)
   * on JPS. Each entry is enriched with `owner_email` + `owner_full_name`
   * so we can join against our local `users`/`riders` tables. Service-key auth.
   *
   * Used by the Assign Rider flow to enumerate gosellr riders verified by JPS.
   * Defaults to status=approved, limit=200. Not cached — the seller modal
   * is rare enough that staleness matters more than throughput.
   */
  async listRoster(opts: {
    platform: string;
    role: string;
    status?: string;
    limit?: number;
  }): Promise<Array<JpsProfileFull & { owner_email: string | null; owner_full_name: string | null }>> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<Array<JpsProfileFull & { owner_email: string | null; owner_full_name: string | null }>>(
          `${this.jpsUrl}/profiles/roster/lookup`,
          {
            headers: this.serviceHeaders,
            params: {
              platform: opts.platform,
              role: opts.role,
              status: opts.status ?? 'approved',
              limit: opts.limit ?? 200,
            },
          },
        ),
      );
      const profiles = response.data ?? [];
      this.logger.log(
        `[roster] JPS returned ${profiles.length} ${opts.role}(s) on ${opts.platform}`,
      );
      return profiles;
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: unknown } };
      this.logger.error(
        `listRoster(${opts.platform}/${opts.role}) failed: ` +
        `status=${e.response?.status} ${String(err)}`,
      );
      return [];
    }
  }

  /**
   * Fetch a SINGLE profile by id, but only when the supplied email is the
   * owner. Service-key auth. Used by the GoSellr attach flow to validate
   * ownership server-side before writing the link.
   */
  async getProfileForEmail(
    profileId: string,
    email: string,
  ): Promise<JpsProfileFull | null> {
    if (!email) return null;
    try {
      const response = await firstValueFrom(
        this.httpService.get<JpsProfileFull | null>(
          `${this.jpsUrl}/profiles/${profileId}/owned-by`,
          {
            headers: this.serviceHeaders,
            params: { email },
          },
        ),
      );
      return response.data ?? null;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number } };
      if (axiosErr.response?.status === 404) return null;
      this.logger.warn(
        `getProfileForEmail(${profileId}, ${email}) failed: ${String(err)}`,
      );
      return null;
    }
  }

  /**
   * Buyer-safe view of any profile (service-to-service auth).
   * Used to render the "Owner" sub-section on product cards. Cached
   * PUBLIC_TTL_MS — never cache durably in MongoDB. Stale verification
   * badges are a trust risk.
   */
  async getProfilePublic(profileId: string): Promise<JpsProfilePublic | null> {
    const cached = this.publicCache.get(profileId);
    if (cached && cached.expires_at > Date.now()) {
      return cached.data;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<JpsProfilePublic>(
          `${this.jpsUrl}/profiles/${profileId}/public`,
          { headers: this.serviceHeaders },
        ),
      );
      const data = response.data;
      this.publicCache.set(profileId, {
        data,
        expires_at: Date.now() + JpsClientService.PUBLIC_TTL_MS,
      });
      return data;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number } };
      if (axiosErr.response?.status === 404) return null;
      this.logger.error(`getProfilePublic(${profileId}) failed: ${String(err)}`);
      return null;
    }
  }

  /**
   * Bulk fetch — used by the buyer browse list. Calls getProfilePublic in
   * parallel; benefits from the per-id cache so warm IDs are free.
   */
  async getManyPublic(profileIds: string[]): Promise<Record<string, JpsProfilePublic>> {
    const unique = Array.from(new Set(profileIds.filter(Boolean)));
    const results = await Promise.all(unique.map((id) => this.getProfilePublic(id)));
    const out: Record<string, JpsProfilePublic> = {};
    unique.forEach((id, i) => {
      const r = results[i];
      if (r) out[id] = r;
    });
    return out;
  }

  /** Test-only / admin: clear the cache. */
  invalidateCache(profileId?: string): void {
    if (profileId) this.publicCache.delete(profileId);
    else this.publicCache.clear();
  }
}
