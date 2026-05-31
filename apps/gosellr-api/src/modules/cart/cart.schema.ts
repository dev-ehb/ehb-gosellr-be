import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CartDocument = Cart & Document;

export interface CartItem {
  product_id: Types.ObjectId;
  seller_id: Types.ObjectId;
  product_name: string;
  product_image_url: string | null;
  unit_price: number;
  quantity: number;
  subtotal: number;
}

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'carts' })
export class Cart {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
  user_id: Types.ObjectId;

  @Prop({
    type: [
      {
        product_id: { type: Types.ObjectId, ref: 'Product', required: true },
        seller_id: { type: Types.ObjectId, ref: 'User', required: true },
        product_name: { type: String, required: true },
        product_image_url: { type: String, default: null },
        unit_price: { type: Number, required: true },
        quantity: { type: Number, required: true, min: 1 },
        subtotal: { type: Number, required: true },
      },
    ],
    default: [],
  })
  items: CartItem[];

  @Prop({ type: Number, default: 0 })
  total: number;
}

export const CartSchema = SchemaFactory.createForClass(Cart);
