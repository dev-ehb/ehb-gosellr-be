export interface PssSubmitResponse {
  success: boolean;
  sq_request_id?: string;
  status?: string;
  message?: string;
  code?: string;
  current_sq_level?: number;
  error?: string;
}

export interface PssSqStatusResponse {
  entity_id: string;
  platform_id: string;
  sq_level: number | null;
  status: string;
  approved_at?: string;
  expires_at?: string | null;
  badge_label?: string;
  pending_at?: string;
  message?: string;
  rejection_reason?: string;
  rejected_at?: string;
  can_resubmit?: boolean;
}

export interface PssBulkStatusResult {
  entity_id: string;
  sq_level: number | null;
  status: string;
}

export interface PssBulkStatusResponse {
  results: PssBulkStatusResult[];
}

export interface PssWebhookPayload {
  event: string;
  sq_request_id: string;
  entity_id: string;
  user_id: string;
  platform_id: string;
  decision: string;
  sq_level: number | null;
  decided_by: string;
  decided_at: string;
  rejection_reason: string | null;
}
