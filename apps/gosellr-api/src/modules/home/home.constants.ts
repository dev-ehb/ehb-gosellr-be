/**
 * Default landing-page content. Used by HomeService until an admin CMS
 * (or DB-backed campaigns collection) is wired up. These shapes mirror
 * what the frontend's landing components consume.
 */

export type PromoVariant =
  | 'pink' | 'sky' | 'red' | 'green' | 'amber' | 'navy' | 'orange';

export interface HeroSlide {
  id: string;
  eyebrow?: string;
  title: string;
  priceLine?: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  bgGradient: string; // tailwind classes: "from-... via-... to-..."
  illustration: 'phone' | 'laptop' | 'fashion';
  /**
   * Optional public-asset image URL (relative to the frontend's /public folder).
   * When set, the hero renders this real product photo instead of the abstract SVG illustration.
   */
  image_url?: string;
}

export interface PromoTile {
  id: string;
  variant: PromoVariant;
  subtitle?: string;
  title: string;
  highlight?: string;
  ctaLabel?: string;
  href: string;
  /** Where the tile renders. Used by the landing page to route tiles to the right row. */
  slot: 'mid_row_1' | 'mid_row_2' | 'wide_banner';
  /** Display order within its slot. */
  order: number;
}

export interface FeaturedBrand {
  id: string;
  name: string;
  initials: string;
  /** Tailwind text color class for initials, e.g. "text-rose-700" or "text-foreground". */
  text_color: string;
  /** Tailwind bg color class, e.g. "bg-rose-50". */
  bg_color: string;
  tag: string;
  /** Optional href; defaults to /browse?brand=<name>. */
  href?: string;
}

export const DEFAULT_HERO_SLIDES: HeroSlide[] = [
  {
    id: 'iphone-launch',
    eyebrow: 'New arrival',
    title: 'iPhone 16 Pro Max',
    priceLine: 'From $1,199*',
    description:
      'A18 chip. Superfast. Supersmart. Largest display. Pro camera system. SQ-verified by GoSellr.',
    ctaLabel: 'Shop Now',
    ctaHref: '/browse?category=Electronics',
    bgGradient: 'from-primary-900 via-primary-800 to-primary-600',
    illustration: 'phone',
    image_url: '/assets/iphone-16-pro-max.png',
  },
  {
    id: 'smart-living',
    eyebrow: 'Trending',
    title: 'Smart Living, Smart Savings',
    priceLine: 'Up to 40% off',
    description:
      'Premium electronics from verified sellers — laptops, headphones, smart-home devices.',
    ctaLabel: 'Explore Deals',
    ctaHref: '/browse',
    bgGradient: 'from-primary-800 via-accent-700 to-accent-500',
    illustration: 'laptop',
    image_url: '/assets/premium-electronics.png',
  },
  {
    id: 'style-drop',
    eyebrow: 'New season',
    title: 'Style That Speaks',
    priceLine: 'Up to 60% off',
    description:
      'Discover the latest fashion drops — exclusively from SQ-verified brand stores.',
    ctaLabel: 'Shop Fashion',
    ctaHref: '/browse?category=Clothing',
    bgGradient: 'from-primary-900 via-accent-600 to-accent-400',
    illustration: 'fashion',
    image_url: '/assets/banner-shoe.png',
  },
];

export const DEFAULT_PROMO_TILES: PromoTile[] = [
  // Row 1
  { id: 'veg',     slot: 'mid_row_1', order: 1, variant: 'pink',   subtitle: 'Fresh and healthy', title: 'Vegetables',    highlight: '50% OFF',     ctaLabel: 'Shop now', href: '/browse?category=Groceries' },
  { id: 'phones',  slot: 'mid_row_1', order: 2, variant: 'sky',    subtitle: 'Galaxy AI is here', title: 'New Phone Drops',                          ctaLabel: 'Shop now', href: '/browse?category=Electronics' },
  { id: 'pantry',  slot: 'mid_row_1', order: 3, variant: 'red',    subtitle: 'Limited stock',     title: 'Pantry Staples', highlight: 'Up to 30% off', ctaLabel: 'Shop now', href: '/browse?category=Groceries' },

  // Row 2
  { id: 'home',    slot: 'mid_row_2', order: 1, variant: 'navy',   subtitle: 'Stay home, stay happy', title: 'Smart Home Deals', highlight: 'Up to 70% off', ctaLabel: 'Shop now', href: '/browse?category=Electronics' },
  { id: 'clean',   slot: 'mid_row_2', order: 2, variant: 'amber',  subtitle: 'Special offers',        title: 'Cleaning Essentials',                            ctaLabel: 'Shop now', href: '/browse?category=Home' },
  { id: 'bundle',  slot: 'mid_row_2', order: 3, variant: 'orange', subtitle: 'Save 20% + Free Shipping', title: 'Create Your Custom Bundle',                  ctaLabel: 'Shop now', href: '/browse' },

  // Wide festival banner
  { id: 'festival',slot: 'wide_banner', order: 1, variant: 'green', subtitle: 'Festival deals', title: 'Up to 50% off on grocery essentials', ctaLabel: 'Shop now', href: '/browse?deals=1' },
];

export const DEFAULT_FEATURED_BRANDS: FeaturedBrand[] = [
  { id: 'adidas', name: 'Adidas',         initials: 'AD', text_color: 'text-foreground',  bg_color: 'bg-surface-alt', tag: 'Delivery within 24 hours' },
  { id: 'nestle', name: 'Nestlé',         initials: 'NS', text_color: 'text-rose-700',    bg_color: 'bg-rose-50',     tag: 'Delivery within 24 hours' },
  { id: 'pepper', name: 'Pdrepper',       initials: 'PD', text_color: 'text-warning-500', bg_color: 'bg-warning-50',  tag: 'Delivery within 24 hours' },
  { id: 'lg',     name: 'LG Electronics', initials: 'LG', text_color: 'text-pink-600',    bg_color: 'bg-pink-50',     tag: 'Delivery within 24 hours' },
  { id: 'dell',   name: 'Dell',           initials: 'DL', text_color: 'text-accent',      bg_color: 'bg-accent-50',   tag: 'Delivery within 24 hours' },
  { id: 'apple',  name: 'Apple',          initials: 'AP', text_color: 'text-foreground',  bg_color: 'bg-surface-alt', tag: 'Delivery within 24 hours' },
  { id: 'chanel', name: 'Chanel',         initials: 'CH', text_color: 'text-foreground',  bg_color: 'bg-surface-alt', tag: 'Delivery within 24 hours' },
  { id: 'zara',   name: 'Zara Fashion',   initials: 'ZA', text_color: 'text-foreground',  bg_color: 'bg-surface-alt', tag: 'Delivery within 24 hours' },
];

/** Static fallback values for the trust strip when no live data is available. */
export const DEFAULT_TRUST_STATS = {
  industries_covered: 38,
  on_time_delivery_pct: 98.4,
  trusted_buyers_count: 50000,
};
