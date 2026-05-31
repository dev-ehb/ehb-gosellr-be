import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RiderDocument = Rider & Document;

export type SqStatus =
  | 'not_submitted'
  | 'pending'
  | 'pending_franchise'
  | 'pending_edr'
  | 'approved'
  | 'rejected';

export type VehicleType = 'bike' | 'motorcycle' | 'car' | 'van' | 'truck';
export type RiderAvailability = 'online' | 'offline' | 'on_delivery';

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'riders' })
export class Rider {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
  user_id: Types.ObjectId;

  // ── Identity docs ────────────────────────────────────────────────────────
  @Prop({ type: String, required: true, trim: true })
  cnic: string;

  @Prop({ type: String, default: null, trim: true })
  cnic_front_url: string | null;

  @Prop({ type: String, default: null, trim: true })
  cnic_back_url: string | null;

  // ── Vehicle ───────────────────────────────────────────────────────────────
  @Prop({ type: String, enum: ['bike', 'motorcycle', 'car', 'van', 'truck'], required: true })
  vehicle_type: VehicleType;

  @Prop({ type: String, required: true, trim: true })
  license_plate: string;

  @Prop({ type: String, default: null, trim: true })
  vehicle_photo_url: string | null;

  @Prop({ type: String, default: null, trim: true })
  driving_license_url: string | null;

  // ── Service area ─────────────────────────────────────────────────────────
  @Prop({ type: String, required: true, trim: true })
  availability_zone: string;

  // ── Additional documents ─────────────────────────────────────────────────
  @Prop({ type: [String], default: [] })
  document_urls: string[];

  // ── Availability ─────────────────────────────────────────────────────────
  @Prop({
    type: String,
    enum: ['online', 'offline', 'on_delivery'],
    default: 'offline',
  })
  availability: RiderAvailability;

  // ── PSS / SQ fields ──────────────────────────────────────────────────────
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

  // ── Status ────────────────────────────────────────────────────────────────
  @Prop({ type: Boolean, default: true })
  is_active: boolean;

  // ── JPS profile linkage ────────────────────────────────────────────────────
  // Mirrors the seller link. Required before a seller can send this rider a
  // delivery request (the Assign Rider modal filters to riders who have a
  // JPS profile linked AND status=approved on JPS).
  //
  // Stores ONLY the JPS profile id — display_name / bio / sq_level are
  // fetched from JPS on demand. Partial unique index below prevents two
  // gosellr Rider rows from claiming the same JPS profile.

  @Prop({ type: String, default: null })
  jps_profile_id: string | null;

  @Prop({ type: Date, default: null })
  jps_profile_linked_at: Date | null;
}

export const RiderSchema = SchemaFactory.createForClass(Rider);

// Prevent two GoSellr riders from claiming the same JPS profile.
// Partial filter so multiple riders without a linked profile remain valid.
RiderSchema.index(
  { jps_profile_id: 1 },
  { unique: true, partialFilterExpression: { jps_profile_id: { $type: 'string' } } },
);
