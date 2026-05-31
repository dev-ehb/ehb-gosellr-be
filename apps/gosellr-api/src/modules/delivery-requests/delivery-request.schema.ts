import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DeliveryRequestDocument = DeliveryRequest & Document;

/**
 * Lifecycle:
 *   pending  ─► accepted   (rider hits Accept; order.rider_id is set)
 *            ─► rejected   (rider hits Reject)
 *            ─► expired    (auto, 60s after requested_at)
 *            ─► cancelled  (seller hits Cancel before any of the above)
 *
 * Only ONE pending request may exist per order at a time — enforced by a
 * partial-unique index below. Once a request reaches `accepted`, the order's
 * rider_id is locked. To switch riders before pickup, that accepted request
 * must be cancelled first (future enhancement — out of scope for v1).
 */
export type DeliveryRequestStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'cancelled';

export const DELIVERY_REQUEST_TTL_MS = 60_000;

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'delivery_requests',
})
export class DeliveryRequest {
  @Prop({ type: Types.ObjectId, ref: 'Order', required: true, index: true })
  order_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  seller_id: Types.ObjectId;

  /** Local gosellr User _id of the rider being asked. */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  rider_user_id: Types.ObjectId;

  /** JPS profile id (string) — for traceability of the verified identity. */
  @Prop({ type: String, required: true })
  rider_jps_profile_id: string;

  /** Snapshot of the rider's display name at request time. */
  @Prop({ type: String, default: '' })
  rider_display_name: string;

  @Prop({
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'expired', 'cancelled'],
    default: 'pending',
    index: true,
  })
  status: DeliveryRequestStatus;

  @Prop({ type: Date, required: true, default: () => new Date() })
  requested_at: Date;

  @Prop({ type: Date, required: true })
  expires_at: Date;

  @Prop({ type: Date, default: null })
  responded_at: Date | null;

  @Prop({ type: String, default: null })
  reject_reason: string | null;

  /** Snapshot of the order's delivery fee so the rider sees what they'll earn. */
  @Prop({ type: Number, default: 0 })
  delivery_fee: number;
}

export const DeliveryRequestSchema = SchemaFactory.createForClass(DeliveryRequest);

// At most ONE pending request per order — prevents accidental double-send.
DeliveryRequestSchema.index(
  { order_id: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } },
);

// Fast lookup of "what's open for this rider".
DeliveryRequestSchema.index({ rider_user_id: 1, status: 1, requested_at: -1 });
