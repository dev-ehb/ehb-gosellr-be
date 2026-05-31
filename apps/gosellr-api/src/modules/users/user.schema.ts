import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

export type UserRole = 'seller' | 'buyer' | 'rider';

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'users' })
export class User {
  @Prop({ type: String, required: true, unique: true, lowercase: true, trim: true, index: true })
  email: string;

  @Prop({ type: String, required: false, default: '' })
  password: string;

  @Prop({ type: String, required: true, trim: true })
  full_name: string;

  @Prop({ type: String, enum: ['seller', 'buyer', 'rider'], required: true })
  role: UserRole;

  @Prop({ type: Boolean, default: true })
  is_active: boolean;

  @Prop({ type: String, default: null, trim: true })
  phone: string | null;

  @Prop({ type: String, default: null })
  otp_code: string | null;

  @Prop({ type: Date, default: null })
  otp_expires_at: Date | null;

  @Prop({ type: Boolean, default: false })
  is_email_verified: boolean;

  @Prop({ type: String, default: null })
  pss_user_id: string | null;

  @Prop({ type: String, default: null, index: true })
  ehb_user_id: string | null;

  @Prop({ type: Number, default: 0 })
  token_version: number;
}

export const UserSchema = SchemaFactory.createForClass(User);
