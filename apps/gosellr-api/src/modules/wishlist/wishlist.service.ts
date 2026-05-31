import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WishlistItem, WishlistItemDocument } from './wishlist.schema';
import { Product, ProductDocument } from '../products/product.schema';

@Injectable()
export class WishlistService {
  constructor(
    @InjectModel(WishlistItem.name) private readonly wishlistModel: Model<WishlistItemDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
  ) {}

  /** All saved products for the current user, with full product details. */
  async list(userId: string) {
    const rows = await this.wishlistModel
      .find({ user_id: new Types.ObjectId(userId) })
      .sort({ created_at: -1 })
      .lean()
      .exec();

    if (rows.length === 0) return { data: [], total: 0 };

    const productIds = rows.map((r) => r.product_id);
    const products = await this.productModel
      .find({ _id: { $in: productIds }, is_active: true })
      .lean()
      .exec();

    return { data: products, total: products.length };
  }

  /** Returns just the product_ids the user has saved (cheap lookup). */
  async listIds(userId: string): Promise<string[]> {
    const rows = await this.wishlistModel
      .find({ user_id: new Types.ObjectId(userId) }, { product_id: 1 })
      .lean()
      .exec();
    return rows.map((r) => r.product_id.toString());
  }

  async add(userId: string, productId: string) {
    if (!Types.ObjectId.isValid(productId)) {
      throw new NotFoundException('Product not found');
    }
    const product = await this.productModel.findById(productId).lean().exec();
    if (!product) throw new NotFoundException('Product not found');

    await this.wishlistModel.updateOne(
      { user_id: new Types.ObjectId(userId), product_id: new Types.ObjectId(productId) },
      { $setOnInsert: { user_id: new Types.ObjectId(userId), product_id: new Types.ObjectId(productId) } },
      { upsert: true },
    ).exec();

    return { ok: true, product_id: productId };
  }

  async remove(userId: string, productId: string) {
    if (!Types.ObjectId.isValid(productId)) {
      throw new NotFoundException('Product not found');
    }
    await this.wishlistModel.deleteOne({
      user_id: new Types.ObjectId(userId),
      product_id: new Types.ObjectId(productId),
    }).exec();
    return { ok: true, product_id: productId };
  }
}
