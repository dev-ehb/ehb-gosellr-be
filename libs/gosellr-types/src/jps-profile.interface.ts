/**
 * Buyer-safe view of a JPS Profile, fetched by GoSellr from JPS's
 * service-to-service endpoint:
 *   GET {JPS_BASE_URL}/profiles/:id/public
 *
 * Mirrors apps/jps-api/.../profile-public.dto.ts on the JPS side.
 *
 * NEVER cache the sq_level or is_verified durably in GoSellr — always
 * fetch through the cache-aware jps-client. Stale verification badges
 * are a trust risk.
 */
export interface JpsProfilePublic {
  id: string;
  platform: 'gosellr' | 'jps' | 'hps' | 'ols' | 'wms' | 'obs';
  role: string;
  display_name: string;
  bio: string;
  description: string;
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'resubmit_required';
  sq_level: number | null;
  sq_badge_label: string | null;
  is_verified: boolean;
}

/**
 * Compact summary used in product list responses.
 * Just enough to render a tiny "Verified by JPS · SQ5" pill on each card
 * without paying the cost of the full profile fetch.
 */
export interface JpsProfileSummary {
  id: string;
  display_name: string;
  sq_badge_label: string | null;
  is_verified: boolean;
}

/**
 * Server-side errors when GoSellr's seller endpoints reject a request
 * because the seller hasn't linked a JPS profile yet. Frontend uses
 * `next` to route the user to the linking page.
 */
export interface JpsProfileRequiredError {
  error: 'JPS_PROFILE_REQUIRED';
  message: string;
  next: string;
}
