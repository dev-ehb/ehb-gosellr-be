/**
 * Setup GoSellr Product Criteria in PSS
 *
 * Run: npx ts-node -r tsconfig-paths/register src/scripts/setup-gosellr-criteria.ts
 *
 * Run AFTER register-with-pss.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import axios from 'axios';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const PSS_API_URL = process.env.PSS_API_URL ?? 'http://localhost:3001';
const EHB_ADMIN_KEY = process.env.EHB_ADMIN_KEY ?? '';

const CRITERIA_PAYLOAD = {
  platform_id: 'gosellr',
  entity_type: 'product',
  criteria: [
    {
      id: 'c1',
      label: 'Product title',
      field_key: 'title',
      required: true,
      sq_min: 1,
      check_type: 'presence',
    },
    {
      id: 'c2',
      label: 'Product description (min 20 chars)',
      field_key: 'description',
      required: true,
      sq_min: 1,
      check_type: 'min_length',
      check_value: 20,
    },
    {
      id: 'c3',
      label: 'Product price set',
      field_key: 'price',
      required: true,
      sq_min: 1,
      check_type: 'min_value',
      check_value: 1,
    },
    {
      id: 'c4',
      label: 'At least 1 image',
      field_key: 'images',
      required: true,
      sq_min: 2,
      check_type: 'min_length',
      check_value: 1,
    },
    {
      id: 'c5',
      label: 'Category set',
      field_key: 'category',
      required: true,
      sq_min: 2,
      check_type: 'presence',
    },
  ],
};

async function main() {
  console.log('\n🔧 Setting up GoSellr product criteria in PSS...\n');

  if (!EHB_ADMIN_KEY) {
    console.error('❌ EHB_ADMIN_KEY is not set in .env');
    process.exit(1);
  }

  try {
    const response = await axios.post(
      `${PSS_API_URL}/criteria`,
      CRITERIA_PAYLOAD,
      {
        headers: {
          'x-ehb-admin-key': EHB_ADMIN_KEY,
          'Content-Type': 'application/json',
        },
      },
    );

    console.log('✅ Criteria created successfully!');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (err: unknown) {
    const e = err as { response?: { data?: unknown }; message?: string };
    console.error('❌ Error creating criteria:');
    console.error(e.response?.data ?? e.message);
    process.exit(1);
  }
}

main().catch(console.error);
