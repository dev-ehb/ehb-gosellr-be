import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OrderDocument = Order & Document;

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'ready_for_delivery'
  | 'picked'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export interface OrderItem {
  product_id: Types.ObjectId;
  product_name: string;
  product_image_url: string | null;
  unit_price: number;
  quantity: number;
  subtotal: number;
}

export interface StatusHistoryEntry {
  status: OrderStatus;
  timestamp: Date;
  note: string | null;
}

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'orders' })
export class Order {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  buyer_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  seller_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null, index: true })
  rider_id: Types.ObjectId | null;

  @Prop({
    type: [
      {
        product_id: { type: Types.ObjectId, ref: 'Product', required: true },
        product_name: { type: String, required: true },
        product_image_url: { type: String, default: null },
        unit_price: { type: Number, required: true },
        quantity: { type: Number, required: true, min: 1 },
        subtotal: { type: Number, required: true },
      },
    ],
    required: true,
  })
  items: OrderItem[];

  @Prop({ type: Number, required: true })
  subtotal: number;

  @Prop({ type: Number, default: 0 })
  delivery_fee: number;

  @Prop({ type: Number, required: true })
  total: number;

  @Prop({
    type: String,
    enum: ['pending', 'confirmed', 'ready_for_delivery', 'picked', 'out_for_delivery', 'delivered', 'cancelled'],
    default: 'pending',
    index: true,
  })
  status: OrderStatus;

  @Prop({
    type: [
      {
        status: {
          type: String,
          enum: ['pending', 'confirmed', 'ready_for_delivery', 'picked', 'out_for_delivery', 'delivered', 'cancelled'],
        },
        timestamp: { type: Date, default: Date.now },
        note: { type: String, default: null },
      },
    ],
    default: [],
  })
  status_history: StatusHistoryEntry[];

  @Prop({
    type: {
      address_line: String,
      city: String,
      area: String,
      lat: Number,
      lng: Number,
    },
    required: true,
  })
  delivery_address: {
    address_line: string;
    city: string;
    area: string;
    lat: number | null;
    lng: number | null;
  };

  @Prop({ type: String, default: null })
  buyer_notes: string | null;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
