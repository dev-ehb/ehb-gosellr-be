import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type SellerDocument = Seller & Document;

/**
 * Mongoose 8 mishandles inline GeoJSON Point objects passed via @Prop({ type: { ... } }).
 * Defining a proper sub-schema with `_id: false` avoids the path-parser bug and works
 * identically at storage. Same pattern as ehb-franchises franchise/store-link schemas.
 */
const GeoPointSchema = new MongooseSchema(
  {
    type: { type: String, enum: ['Point'], default: 'Point', required: true },
    coordinates: { type: [Number], required: true },
  },
  { _id: false },
);

export type SqStatus =
  | 'not_submitted'
  | 'pending'
  | 'pending_franchise'
  | 'pending_edr'
  | 'approved'
  | 'rejected';

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'sellers' })
export class Seller {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
  user_id: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  business_name: string;

  @Prop({ type: String, required: true, trim: true })
  business_type: string;

  @Prop({ type: String, required: true, trim: true })
  business_category: string;

  @Prop({ type: String, default: '', trim: true })
  store_description: string;

  // ── Geolocation (added in Phase 2 of the franchise-system work) ──────────
  // GeoJSON Point of the physical store. Powers the auto-creation pipeline in
  // ehb-franchises (Sub/Corporate/Master). Optional for backward compatibility
  // with existing seed data; new seller registrations should always provide it.
  // coordinates = [lng, lat] - 2dsphere indexed below.
  @Prop({ type: GeoPointSchema })
  store_location?: { type: 'Point'; coordinates: [number, number] };

  @Prop({ type: String, default: null, trim: true })
  store_logo_url: string | null;

  @Prop({
    type: {
      bank_name: String,
      account_title: String,
      account_number: String,
      iban: String,
    },
    default: null,
  })
  bank_info: {
    bank_name: string;
    account_title: string;
    account_number: string;
    iban: string;
  } | null;

  @Prop({ type: [String], default: [] })
  document_urls: string[];

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

  @Prop({ type: Boolean, default: true })
  is_active: boolean;

  // ── JPS profile linkage ────────────────────────────────────────────────────
  // Required before this seller can upload products.
  // Stores ONLY the JPS profile id — the source of truth for display_name,
  // bio, and sq_level lives in JPS. GoSellr fetches it through jps-client
  // every time it renders a product (with a 5-minute in-memory cache).
  //
  // Linked profile must satisfy (platform=gosellr, role=seller).
  // Any JPS status (draft / submitted / approved) is accepted.

  @Prop({ type: String, default: null })
  jps_profile_id: string | null;

  @Prop({ type: Date, default: null })
  jps_profile_linked_at: Date | null;
}

export const SellerSchema = SchemaFactory.createForClass(Seller);

// Prevent two GoSellr sellers from claiming the same JPS profile.
// Partial filter so multiple sellers without a linked profile remain valid.
SellerSchema.index(
  { jps_profile_id: 1 },
  { unique: true, partialFilterExpression: { jps_profile_id: { $type: 'string' } } },
);

// 2dsphere index on store_location - lets ehb-franchises run nearest-Sub
// geospatial queries efficiently. Partial filter so sellers without a location
// (older records) remain valid.
SellerSchema.index(
  { store_location: '2dsphere' },
  { partialFilterExpression: { store_location: { $type: 'object' } } },
);