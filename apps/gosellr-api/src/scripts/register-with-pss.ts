/**
 * Register GoSellr with PSS
 *
 * Run: npx ts-node -r tsconfig-paths/register src/scripts/register-with-pss.ts
 *
 * Prerequisites:
 *   1. PSS is running on PSS_API_URL
 *   2. EHB_ADMIN_KEY is set in .env
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import axios from 'axios';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const PSS_API_URL = process.env.PSS_API_URL ?? 'http://localhost:3001';
const EHB_ADMIN_KEY = process.env.EHB_ADMIN_KEY ?? '';

async function main() {
  console.log(`\n🚀 Registering GoSellr with PSS at ${PSS_API_URL}...\n`);

  if (!EHB_ADMIN_KEY) {
    console.error('❌ EHB_ADMIN_KEY is not set in .env');
    process.exit(1);
  }

  try {
    const response = await axios.post(
      `${PSS_API_URL}/platforms/register`,
      {
        platform_id: 'gosellr',
        platform_name: 'GoSellr',
        webhook_url: 'http://localhost:3002/webhooks/pss',
        entity_types: ['product'],
        contact_email: 'admin@gosellr.com',
      },
      {
        headers: {
          'x-ehb-admin-key': EHB_ADMIN_KEY,
          'Content-Type': 'application/json',
        },
      },
    );

    const data = response.data as {
      success: boolean;
      platform_api_key?: string;
      webhook_secret?: string;
      message?: string;
    };

    if (data.success) {
      console.log('✅ GoSellr registered successfully!\n');
      console.log('══════════════════════════════════════');
      console.log('Copy these values to your .env file:');
      console.log('══════════════════════════════════════');
      console.log(`PSS_PLATFORM_KEY=${data.platform_api_key ?? '(check PSS response)'}`);
      if (data.webhook_secret) {
        console.log(`PSS_WEBHOOK_SECRET=${data.webhook_secret}`);
      }
      console.log('══════════════════════════════════════\n');
    } else {
      console.error('❌ Registration failed:', data.message);
    }
  } catch (err: unknown) {
    const e = err as { response?: { data?: unknown }; message?: string };
    console.error('❌ Error registering with PSS:');
    console.error(e.response?.data ?? e.message);
    process.exit(1);
  }
}

main().catch(console.error);
