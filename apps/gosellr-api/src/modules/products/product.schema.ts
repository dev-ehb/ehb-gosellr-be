import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SqStatus =
  | 'not_submitted'
  | 'pending'
  | 'pending_franchise'
  | 'pending_edr'
  | 'approved'
  | 'rejected';

export type ProductDocument = Product & Document;

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'products',
})
export class Product {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  seller_id: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  title: string;

  @Prop({ type: String, required: true })
  description: string;

  @Prop({ type: Number, required: true, min: 0 })
  price: number;

  @Prop({ type: String, required: true })
  category: string;

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ type: Number, default: 0, min: 0 })
  stock: number;

  @Prop({ type: Boolean, default: true })
  is_active: boolean;

  // ── SQ Fields ─────────────────────────────────────────────────────────────
  // Updated by:
  //   1. Webhook handler (push) when PSS sends sq.decision
  //   2. ProductsService.getSQStatus() (pull) on "Refresh Status" click
  //      — fallback path when the webhook never arrived (e.g. Redis down)

  @Prop({ type: Number, default: null })
  sq_level: number | null;

  @Prop({
    type: String,
    enum: ['not_submitted', 'pending', 'pending_franchise', 'pending_edr', 'approved', 'rejected'],
    default: 'not_submitted',
  })
  sq_status: SqStatus;

  @Prop({ type: String, default: null })
  sq_request_id: string | null;

  @Prop({ type: Date, default: null })
  sq_decided_at: Date | null;

  @Prop({ type: String, default: null })
  sq_rejection_reason: string | null;

  @Prop({ type: String, default: null })
  sq_badge_label: string | null;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

// Compound index for buyer listing: approved + active products
ProductSchema.index({ sq_status: 1, is_active: 1 });
// Seller's own products
ProductSchema.index({ seller_id: 1, created_at: -1 });
