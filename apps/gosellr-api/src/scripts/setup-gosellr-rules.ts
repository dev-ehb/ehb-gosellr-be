/**
 * Setup Default Routing Rules for GoSellr in PSS
 *
 * Run: npx ts-node -r tsconfig-paths/register src/scripts/setup-gosellr-rules.ts
 *
 * Run AFTER register-with-pss.ts and setup-gosellr-criteria.ts
 *
 * Rules:
 *  1. auto_low:      criteria ≤ 2 → auto-reject
 *  2. auto_basic:    criteria = 3 → auto-approve SQ2
 *  3. auto_standard: criteria = 4 → auto-approve SQ5
 *  4. franchise_full: criteria = 5 → forward to franchise
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import axios from 'axios';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const PSS_API_URL = process.env.PSS_API_URL ?? 'http://localhost:3001';
const EHB_ADMIN_KEY = process.env.EHB_ADMIN_KEY ?? '';

const RULES = [
  {
    platform_id: 'gosellr',
    rule_name: 'auto_low',
    criteria_threshold: 2,
    operator: 'lte',
    action: 'reject',
    rejection_reason: 'Too few criteria met — minimum 3 required for SQ approval',
    priority: 1,
    active: true,
  },
  {
    platform_id: 'gosellr',
    rule_name: 'auto_basic',
    criteria_threshold: 3,
    operator: 'eq',
    action: 'auto_approve',
    sq_level_assigned: 2,
    priority: 2,
    active: true,
  },
  {
    platform_id: 'gosellr',
    rule_name: 'auto_standard',
    criteria_threshold: 4,
    operator: 'eq',
    action: 'auto_approve',
    sq_level_assigned: 5,
    priority: 3,
    active: true,
  },
  {
    platform_id: 'gosellr',
    rule_name: 'franchise_full',
    criteria_threshold: 5,
    operator: 'eq',
    action: 'franchise',
    priority: 4,
    active: true,
  },
];

async function main() {
  console.log('\n📋 Setting up GoSellr routing rules in PSS...\n');

  if (!EHB_ADMIN_KEY) {
    console.error('❌ EHB_ADMIN_KEY is not set in .env');
    process.exit(1);
  }

  for (const rule of RULES) {
    try {
      const response = await axios.post(
        `${PSS_API_URL}/rules`,
        rule,
        {
          headers: {
            'x-ehb-admin-key': EHB_ADMIN_KEY,
            'Content-Type': 'application/json',
          },
        },
      );
      const data = response.data as { rule_name?: string };
      console.log(`✅ Rule created: ${rule.rule_name} (priority ${rule.priority})`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: unknown }; message?: string };
      console.error(`❌ Failed to create rule "${rule.rule_name}":`);
      console.error(e.response?.data ?? e.message);
    }
  }

  console.log('\n🎉 Rules setup complete!\n');
  console.log('Rule summary:');
  console.log('  ≤ 2 criteria → AUTO REJECT');
  console.log('  = 3 criteria → AUTO APPROVE (SQ2)');
  console.log('  = 4 criteria → AUTO APPROVE (SQ5)');
  console.log('  = 5 criteria → FRANCHISE REVIEW');
}

main().catch(console.error);
