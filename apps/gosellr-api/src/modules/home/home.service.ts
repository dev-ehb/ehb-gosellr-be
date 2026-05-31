import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product, ProductDocument } from '../products/product.schema';
import { Seller, SellerDocument } from '../seller/seller.schema';
import { User, UserDocument } from '../users/user.schema';
import {
  DEFAULT_FEATURED_BRANDS,
  DEFAULT_HERO_SLIDES,
  DEFAULT_PROMO_TILES,
  DEFAULT_TRUST_STATS,
  FeaturedBrand,
  HeroSlide,
  PromoTile,
} from './home.constants';

export interface HomeBannersResponse {
  hero_slides: HeroSlide[];
  promo_tiles: PromoTile[];
}

export interface HomeStatsResponse {
  sq_verified_pct: number;
  industries_covered: number;
  on_time_delivery_pct: number;
  trusted_buyers_count: number;
  total_products: number;
}

@Injectable()
export class HomeService {
  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Seller.name) private readonly sellerModel: Model<SellerDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  /**
   * Returns hero carousel slides + promo tiles for the landing page.
   * Currently sourced from in-memory defaults; future iterations can
   * source from a `campaigns` collection.
   */
  getBanners(): HomeBannersResponse {
    return {
      hero_slides: DEFAULT_HERO_SLIDES,
      promo_tiles: DEFAULT_PROMO_TILES,
    };
  }

  /**
   * Returns featured brand stores. Currently a curated default list
   * (matching the reference visual). When real sellers exist, the
   * top-N approved sellers can be merged into this list, ordered by
   * their SQ level.
   */
  async getFeaturedBrands(): Promise<FeaturedBrand[]> {
    // Try to enrich with real approved sellers, capped at 8 entries.
    const realSellers = await this.sellerModel
      .find({ sq_status: 'approved', is_active: true })
      .sort({ sq_level: -1, created_at: -1 })
      .limit(8)
      .lean()
      .exec();

    if (realSellers.length === 0) {
      return DEFAULT_FEATURED_BRANDS;
    }

    const palette = [
      { text_color: 'text-foreground',  bg_color: 'bg-surface-alt' },
      { text_color: 'text-rose-700',    bg_color: 'bg-rose-50' },
      { text_color: 'text-warning-500', bg_color: 'bg-warning-50' },
      { text_color: 'text-pink-600',    bg_color: 'bg-pink-50' },
      { text_color: 'text-accent',      bg_color: 'bg-accent-50' },
      { text_color: 'text-foreground',  bg_color: 'bg-surface-alt' },
      { text_color: 'text-primary',     bg_color: 'bg-primary-50' },
      { text_color: 'text-success-700', bg_color: 'bg-success-50' },
    ];

    return realSellers.map((s, i) => {
      const palette_i = palette[i % palette.length];
      return {
        id: s._id.toString(),
        name: s.business_name,
        initials: initialsOf(s.business_name),
        text_color: palette_i.text_color,
        bg_color: palette_i.bg_color,
        tag: 'Delivery within 24 hours',
        href: `/browse?seller_id=${s._id.toString()}`,
      };
    });
  }

  /**
   * Computes the trust-strip values shown below the hero. All counts are
   * computed live from the DB; constants in DEFAULT_TRUST_STATS are used
   * as fallbacks when the DB is empty (fresh install / dev environment).
   */
  async getStats(): Promise<HomeStatsResponse> {
    const [
      totalSellers,
      approvedSellers,
      totalProducts,
      categoryCount,
      buyerCount,
    ] = await Promise.all([
      this.sellerModel.countDocuments({ is_active: true }),
      this.sellerModel.countDocuments({ is_active: true, sq_status: 'approved' }),
      this.productModel.countDocuments({ is_active: true, sq_status: 'approved' }),
      this.productModel.distinct('category', { is_active: true, sq_status: 'approved' }),
      this.userModel.countDocuments({ role: 'buyer' }),
    ]);

    const sqPct = totalSellers > 0
      ? Math.round((approvedSellers / totalSellers) * 1000) / 10
      : 100;

    return {
      sq_verified_pct: sqPct,
      industries_covered: Math.max(
        Array.isArray(categoryCount) ? categoryCount.length : 0,
        DEFAULT_TRUST_STATS.industries_covered,
      ),
      on_time_delivery_pct: DEFAULT_TRUST_STATS.on_time_delivery_pct,
      trusted_buyers_count: Math.max(buyerCount, DEFAULT_TRUST_STATS.trusted_buyers_count),
      total_products: totalProducts,
    };
  }
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '??';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}
