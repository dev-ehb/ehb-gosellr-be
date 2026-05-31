/**
 * GoSellr Database Seed Script
 * ─────────────────────────────────────────────────────────────────
 * Creates test accounts and sample products for local development.
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/seed.ts
 *
 * Or with env override:
 *   MONGODB_URI=mongodb://localhost:27017/gosellr_test npx ts-node scripts/seed.ts
 *
 * What it creates:
 *   • 1 Buyer  — buyer@gosellr.test / Test1234
 *   • 1 Seller — seller@gosellr.test / Test1234
 *   • 1 Rider  — rider@gosellr.test  / Test1234
 *   • 1 SellerProfile (linked to seller user)
 *   • 12 Products (linked to seller, sq_status=approved)
 * ─────────────────────────────────────────────────────────────────
 */

import mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';

// ── Connection ────────────────────────────────────────────────────
const MONGODB_URI =
  process.env.MONGODB_URI ?? 'mongodb://localhost:27017/gosellr_db';

// ── Inline schemas (lightweight — avoids NestJS DI overhead) ─────

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, default: '' },
    full_name: { type: String, required: true },
    role: { type: String, enum: ['seller', 'buyer', 'rider'], required: true },
    is_active: { type: Boolean, default: true },
    phone: { type: String, default: null },
    otp_code: { type: String, default: null },
    otp_expires_at: { type: Date, default: null },
    is_email_verified: { type: Boolean, default: false },
    pss_user_id: { type: String, default: null },
    ehb_user_id: { type: String, default: null },
    token_version: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'users' },
);

const sellerSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, required: true },
    business_name: String,
    business_type: String,
    business_category: String,
    store_description: String,
    store_logo_url: { type: String, default: null },
    bank_info: {
      bank_name: String,
      account_title: String,
      account_number: String,
      iban: String,
    },
    document_urls: [String],
    sq_level: { type: Number, default: null },
    sq_status: { type: String, default: 'approved' },
    sq_request_id: { type: String, default: null },
    sq_decided_at: { type: Date, default: null },
    sq_rejection_reason: { type: String, default: null },
    sq_badge_label: { type: String, default: 'SQ Verified' },
    is_active: { type: Boolean, default: true },
    // JPS profile linkage — populated by the seed below so the demo
    // seller can upload products without needing a live JPS instance.
    jps_profile_id: { type: String, default: null },
    jps_profile_linked_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'sellers' },
);

const productSchema = new mongoose.Schema(
  {
    seller_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: String,
    description: String,
    price: Number,
    category: String,
    images: [String],
    stock: { type: Number, default: 50 },
    is_active: { type: Boolean, default: true },
    sq_level: { type: Number, default: 4 },
    sq_status: { type: String, default: 'approved' },
    sq_request_id: { type: String, default: null },
    sq_decided_at: { type: Date, default: null },
    sq_rejection_reason: { type: String, default: null },
    sq_badge_label: { type: String, default: 'SQ L4 Verified' },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, collection: 'products' },
);

// ── Seed data ─────────────────────────────────────────────────────
const SAMPLE_PRODUCTS = [
  // Electronics
  { title: 'Samsung Galaxy A54 5G', category: 'Electronics', price: 89999, description: 'Mid-range flagship with 50MP camera, 5000mAh battery. SQ L4 verified seller.', images: [] },
  { title: 'JBL Charge 5 Speaker', category: 'Electronics', price: 24500, description: 'Waterproof Bluetooth speaker with 20hr playtime. Deep bass, loud sound.', images: [] },
  { title: 'HP Laptop 15-inch Core i5', category: 'Electronics', price: 125000, description: '8GB RAM, 512GB SSD, Windows 11. Perfect for work and study.', images: [] },
  // Fashion
  { title: 'Men\'s Cotton Polo Shirt', category: 'Fashion', price: 1299, description: 'Premium pique cotton, available in 8 colors. Machine washable.', images: [] },
  { title: 'Women\'s Embroidered Kurta', category: 'Fashion', price: 2499, description: 'Hand-embroidered lawn fabric kurta. Festive and casual wear.', images: [] },
  // Health
  { title: 'Multivitamin Daily Pack (90 Caps)', category: 'Health', price: 1899, description: 'Complete daily multivitamin with Vitamin D3, C, Zinc & B-complex.', images: [] },
  { title: 'Digital Blood Pressure Monitor', category: 'Health', price: 3500, description: 'Upper arm BP monitor with memory for 2 users. WHO indicator.', images: [] },
  // Food
  { title: 'Organic Honey 1KG', category: 'Food', price: 2200, description: 'Pure Sidr honey from Balochistan. Lab tested, no additives.', images: [] },
  { title: 'Desi Ghee 500ml', category: 'Food', price: 1650, description: 'Traditional buffalo milk ghee. Made in Lahore, cold-process.', images: [] },
  // Home
  { title: 'Memory Foam Pillow Set (2pcs)', category: 'Home', price: 3200, description: 'Cervical support memory foam pillows with bamboo covers.', images: [] },
  { title: 'LED Desk Lamp with USB Port', category: 'Home', price: 1100, description: '3 color modes, dimmable, USB-A charging port. Eye-care design.', images: [] },
  // Sports
  { title: 'Adidas Running Shoes Men', category: 'Sports', price: 8500, description: 'Cushioned sole, breathable mesh upper. Sizes 7–13 available.', images: [] },
];

// ── Main ──────────────────────────────────────────────────────────
async function seed() {
  console.log('🌱 GoSellr Seed Script');
  console.log(`   URI: ${MONGODB_URI}`);
  console.log('');

  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const UserModel = mongoose.model('User', userSchema);
  const SellerModel = mongoose.model('Seller', sellerSchema);
  const ProductModel = mongoose.model('Product', productSchema);

  const password = await bcrypt.hash('Test1234', 10);

  // ── Users ─────────────────────────────────────────────────────
  const accounts = [
    { email: 'buyer@gosellr.test', full_name: 'Ali Khan (Buyer)', role: 'buyer' as const },
    { email: 'seller@gosellr.test', full_name: 'Sara Ahmed (Seller)', role: 'seller' as const },
    { email: 'rider@gosellr.test', full_name: 'Bilal Raza (Rider)', role: 'rider' as const },
  ];

  const userDocs: Record<string, mongoose.Document & { _id: mongoose.Types.ObjectId }> = {};

  for (const acc of accounts) {
    const existing = await UserModel.findOne({ email: acc.email });
    if (existing) {
      console.log(`⏭️  User already exists: ${acc.email}`);
      userDocs[acc.role] = existing as never;
      continue;
    }
    const doc = await UserModel.create({
      ...acc,
      password,
      is_email_verified: true,
      is_active: true,
    });
    userDocs[acc.role] = doc as never;
    console.log(`✅ Created user: ${acc.email} (${acc.role})`);
  }

  const sellerId = (userDocs['seller'] as { _id: mongoose.Types.ObjectId })._id;

  // ── Seller Profile ────────────────────────────────────────────
  const existingSeller = await SellerModel.findOne({ user_id: sellerId });
  if (existingSeller) {
    console.log('⏭️  Seller profile already exists');
  } else {
    await SellerModel.create({
      user_id: sellerId,
      business_name: 'Sara\'s Online Store',
      business_type: 'sole_proprietorship',
      business_category: 'General Merchandise',
      store_description: 'Quality products at best prices. Fast delivery across Pakistan.',
      bank_info: {
        bank_name: 'HBL',
        account_title: 'Sara Ahmed',
        account_number: '00427901298630',
        iban: 'PK36HABB0000427901298630',
      },
      sq_status: 'approved',
      sq_level: 4,
      sq_badge_label: 'SQ L4 Verified',
      // Link to a deterministic JPS profile ObjectId. The matching profile
      // should be seeded in JPS via ehb-jps's seed (or stubbed by jps-client
      // when JPS is unreachable — buyer page degrades gracefully).
      jps_profile_id: '672a5f8b1c1f4d2c3a8b9d01',
      jps_profile_linked_at: new Date(),
    });
    console.log('✅ Created seller profile');
  }

  // ── Products ──────────────────────────────────────────────────
  let created = 0;
  let skipped = 0;

  for (const product of SAMPLE_PRODUCTS) {
    const existing = await ProductModel.findOne({ title: product.title, seller_id: sellerId });
    if (existing) { skipped++; continue; }
    await ProductModel.create({ ...product, seller_id: sellerId });
    created++;
  }

  if (created > 0) console.log(`✅ Created ${created} products`);
  if (skipped > 0) console.log(`⏭️  Skipped ${skipped} existing products`);

  // ── Summary ───────────────────────────────────────────────────
  console.log('');
  console.log('─────────────────────────────────────────');
  console.log('🎉 Seed complete! Test accounts:');
  console.log('');
  console.log('  BUYER   buyer@gosellr.test   / Test1234');
  console.log('  SELLER  seller@gosellr.test  / Test1234');
  console.log('  RIDER   rider@gosellr.test   / Test1234');
  console.log('');
  console.log(`  ${SAMPLE_PRODUCTS.length} sample products (sq_status: approved)`);
  console.log('  Seller is linked to JPS profile id: 672a5f8b1c1f4d2c3a8b9d01');
  console.log('  → Make sure ehb-jps seed creates a Profile with this _id.');
  console.log('─────────────────────────────────────────');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
