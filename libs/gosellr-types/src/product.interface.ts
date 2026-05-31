export type SqStatus =
  | 'not_submitted'
  | 'pending'
  | 'pending_franchise'
  | 'pending_edr'
  | 'approved'
  | 'rejected';

export interface IProduct {
  _id: string;
  seller_id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  images: string[];
  stock: number;
  is_active: boolean;
  sq_level: number | null;
  sq_status: SqStatus;
  sq_request_id?: string;
  sq_decided_at?: Date;
  sq_rejection_reason?: string;
  sq_badge_label?: string;
  created_at: Date;
  updated_at: Date;
}
