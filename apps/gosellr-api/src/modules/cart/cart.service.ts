import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cart, CartDocument } from './cart.schema';
import { Product, ProductDocument } from '../products/product.schema';

export interface AddToCartDto {
  product_id: string;
  product_name: string;
  product_image_url?: string;
  unit_price: number;
  quantity: number;
}

@Injectable()
export class CartService {
  constructor(
    @InjectModel(Cart.name) private readonly cartModel: Model<CartDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
  ) {}

  private recalcTotal(cart: CartDocument): void {
    cart.total = cart.items.reduce((sum, item) => sum + item.subtotal, 0);
  }

  async getOrCreate(userId: string): Promise<CartDocument> {
    let cart = await this.cartModel.findOne({ user_id: new Types.ObjectId(userId) }).exec();
    if (!cart) {
      cart = new this.cartModel({ user_id: new Types.ObjectId(userId), items: [], total: 0 });
      await cart.save();
    }
    return cart;
  }

  async addItem(userId: string, dto: AddToCartDto): Promise<CartDocument> {
    const cart = await this.getOrCreate(userId);
    const productObjectId = new Types.ObjectId(dto.product_id);

    // Look up the product server-side so we record the authoritative seller_id
    // (and prevent clients from spoofing seller/price). Required for checkout
    // since an order can only target one seller — orders.createOrder reads
    // seller_id off the cart item.
    const product = await this.productModel
      .findById(productObjectId)
      .select('seller_id title price images')
      .lean()
      .exec();
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const existingIdx = cart.items.findIndex(
      (i) => i.product_id.toString() === dto.product_id,
    );

    if (existingIdx >= 0) {
      cart.items[existingIdx].quantity += dto.quantity;
      cart.items[existingIdx].subtotal =
        cart.items[existingIdx].unit_price * cart.items[existingIdx].quantity;
      // Backfill seller_id on legacy items missing it
      if (!cart.items[existingIdx].seller_id) {
        cart.items[existingIdx].seller_id = product.seller_id;
      }
    } else {
      cart.items.push({
        product_id: productObjectId,
        seller_id: product.seller_id,
        product_name: dto.product_name,
        product_image_url: dto.product_image_url ?? null,
        unit_price: dto.unit_price,
        quantity: dto.quantity,
        subtotal: dto.unit_price * dto.quantity,
      });
    }
    this.recalcTotal(cart);
    return cart.save();
  }

  async updateItemQuantity(
    userId: string,
    productId: string,
    quantity: number,
  ): Promise<CartDocument> {
    if (quantity < 1) throw new BadRequestException('Quantity must be at least 1');
    const cart = await this.getOrCreate(userId);
    const idx = cart.items.findIndex((i) => i.product_id.toString() === productId);
    if (idx < 0) throw new NotFoundException('Item not in cart');
    cart.items[idx].quantity = quantity;
    cart.items[idx].subtotal = cart.items[idx].unit_price * quantity;
    this.recalcTotal(cart);
    return cart.save();
  }

  async removeItem(userId: string, productId: string): Promise<CartDocument> {
    const cart = await this.getOrCreate(userId);
    cart.items = cart.items.filter((i) => i.product_id.toString() !== productId);
    this.recalcTotal(cart);
    return cart.save();
  }

  async clearCart(userId: string): Promise<void> {
    await this.cartModel.findOneAndUpdate(
      { user_id: new Types.ObjectId(userId) },
      { items: [], total: 0 },
    ).exec();
  }

  toPublic(cart: CartDocument) {
    return {
      id: cart._id.toString(),
      user_id: cart.user_id.toString(),
      items: cart.items.map((i) => ({
        product_id: i.product_id.toString(),
        seller_id: i.seller_id?.toString() ?? null,
        product_name: i.product_name,
        product_image_url: i.product_image_url,
        unit_price: i.unit_price,
        quantity: i.quantity,
        subtotal: i.subtotal,
      })),
      total: cart.total,
    };
  }
}
