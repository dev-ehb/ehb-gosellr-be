import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;

/**
 * Closed enum so the frontend can switch on it for icons/styling without
 * defensive defaults. Add new variants here when introducing new events.
 */
export type NotificationType =
  // Order lifecycle (buyer, seller, rider see different ones)
  | 'order:created'
  | 'order:confirmed'
  | 'order:ready_for_delivery'
  | 'order:rider_assigned'
  | 'order:picked'
  | 'order:out_for_delivery'
  | 'order:delivered'
  | 'order:cancelled'
  // Delivery request lifecycle
  | 'delivery_request:new'
  | 'delivery_request:accepted'
  | 'delivery_request:rejected'
  | 'delivery_request:expired'
  | 'delivery_request:cancelled'
  // Catch-all
  | 'system';

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'notifications',
})
export class Notification {
  /** Recipient — the only person who can see/read this notification. */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user_id: Types.ObjectId;

  @Prop({ type: String, required: true })
  type: NotificationType;

  @Prop({ type: String, required: true })
  title: string;

  @Prop({ type: String, default: '' })
  message: string;

  /** Optional deep-link inside the app (e.g. `/dashboard/orders`). */
  @Prop({ type: String, default: null })
  link: string | null;

  /** Free-form bag: order_id, request_id, rider_name, etc. Used by the
   *  frontend to navigate or render extra context. */
  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;

  @Prop({ type: Boolean, default: false, index: true })
  read: boolean;

  @Prop({ type: Date, default: null })
  read_at: Date | null;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

// Inbox-style sort: newest first per user. Add unread filter and you have
// the index used by `unreadCount`.
NotificationSchema.index({ user_id: 1, created_at: -1 });
NotificationSchema.index({ user_id: 1, read: 1 });
