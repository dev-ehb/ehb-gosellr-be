/**
 * Diagnostic — runs side-by-side queries against jps_db and gosellr_db
 * to find why GoSellr's "by-email" lookup returns empty for a user who
 * clearly has profiles in JPS.
 *
 * Usage:  npx ts-node scripts/diagnose-jps-link.ts <gosellr-email>
 *   (default email: seller@gosellr.test — change to whatever you log in as)
 */

import mongoose from 'mongoose';

const GOSELLR_URI = process.env.GOSELLR_MONGODB_URI ?? 'mongodb://localhost:27017/gosellr_db';
const JPS_URI = process.env.JPS_MONGODB_URI ?? 'mongodb://localhost:27017/jps_db';
const TARGET_EMAIL = (process.argv[2] ?? 'seller@gosellr.test').toLowerCase();

async function main() {
  console.log(`\n🔍  Diagnosing JPS link for email: "${TARGET_EMAIL}"\n`);

  // ── GoSellr side ──────────────────────────────────────────────────────────
  const gs = await mongoose.createConnection(GOSELLR_URI).asPromise();
  const gsUser = await gs.collection('users').findOne({ email: TARGET_EMAIL });
  console.log('── GoSellr side ──────────────────────────────────────');
  if (!gsUser) {
    console.log(`❌ no GoSellr user with email "${TARGET_EMAIL}"`);
    console.log('   → log in to GoSellr with this email or pass the right email as arg');
  } else {
    console.log(`✅ GoSellr user._id = ${gsUser._id}`);
    console.log(`   email           = "${gsUser.email}"`);
    console.log(`   role            = "${gsUser.role}"`);
    const seller = await gs.collection('sellers').findOne({ user_id: gsUser._id });
    if (seller) {
      console.log(`   seller          = ${seller._id}, jps_profile_id = ${seller.jps_profile_id ?? 'null'}`);
    } else {
      console.log(`   seller          = (none)`);
    }
  }

  // ── JPS side ──────────────────────────────────────────────────────────────
  const jps = await mongoose.createConnection(JPS_URI).asPromise();

  console.log('\n── JPS side ──────────────────────────────────────────');

  const jpsUser = await jps.collection('users').findOne({ email: TARGET_EMAIL });
  if (!jpsUser) {
    console.log(`❌ no JPS user with email "${TARGET_EMAIL}"`);
    const allJpsUsers = await jps.collection('users').find({}, { projection: { email: 1, ehb_user_id: 1 } }).toArray();
    console.log(`   JPS has ${allJpsUsers.length} user(s) total:`);
    allJpsUsers.forEach((u) => console.log(`     • _id=${u._id} email="${u.email}" ehb_user_id="${u.ehb_user_id}"`));
    console.log('\n   → root cause: emails differ between GoSellr and JPS.');
    console.log('     Either log in to JPS first with the same email, or pass the JPS email');
    console.log('     to this script: npx ts-node scripts/diagnose-jps-link.ts <jps-email>');
  } else {
    console.log(`✅ JPS user._id = ${jpsUser._id}`);
    console.log(`   email        = "${jpsUser.email}"`);
    console.log(`   ehb_user_id  = "${jpsUser.ehb_user_id}"`);

    // What does Profile.user_id look like?
    const allProfiles = await jps.collection('profiles').find({}).toArray();
    console.log(`\n   All profiles in jps_db.profiles (${allProfiles.length}):`);
    allProfiles.forEach((p, i) => {
      const uid = p.user_id;
      const uidType = typeof uid === 'object' && uid?.constructor?.name === 'ObjectId' ? 'ObjectId' : typeof uid;
      console.log(
        `     ${i + 1}. _id=${p._id}` +
        `\n        platform="${p.platform}" role="${p.role}" status="${p.status}"` +
        `\n        display_name="${p.display_name}"` +
        `\n        user_id=${String(uid)} (type: ${uidType})` +
        `\n        deleted_at=${p.deleted_at ?? 'null'}`,
      );
    });

    // Now run THE EXACT QUERY my service runs
    console.log('\n   Running findEligibleByEmail filter (exactly what JPS service uses):');
    const userIdStr = String(jpsUser._id);
    const filter = {
      user_id: userIdStr,
      deleted_at: null,
      platform: 'gosellr',
      role: 'seller',
    };
    console.log(`     filter = ${JSON.stringify(filter)}`);
    const matched = await jps.collection('profiles').find(filter).toArray();
    console.log(`     → matched ${matched.length} profile(s)`);

    if (matched.length === 0) {
      // Try with ObjectId
      const filterObj = { ...filter, user_id: jpsUser._id };
      const matchedObj = await jps.collection('profiles').find(filterObj).toArray();
      console.log(`     → also tried user_id as ObjectId: matched ${matchedObj.length}`);
      if (matchedObj.length > 0) {
        console.log('\n   ⚠️  ROOT CAUSE: profiles store user_id as ObjectId, but the service queries with a string.');
        console.log('       Fix: in jps profiles.service.ts findEligibleByEmail, pass user._id directly (not stringified).');
      } else {
        // Drop platform/role to see what matches
        const noFilter = { user_id: { $in: [userIdStr, jpsUser._id] }, deleted_at: null };
        const allOwned = await jps.collection('profiles').find(noFilter).toArray();
        if (allOwned.length === 0) {
          console.log('\n   ⚠️  ROOT CAUSE: this JPS user owns no profiles at all.');
          console.log('       The 3 profiles in jps_db.profiles belong to OTHER users.');
        } else {
          console.log(`\n   This user owns ${allOwned.length} profile(s) but none match (platform=gosellr, role=seller):`);
          allOwned.forEach((p) => console.log(`     • platform="${p.platform}" role="${p.role}"`));
          console.log('\n   ⚠️  ROOT CAUSE: the user\'s profile has a different platform or role.');
          console.log('       Either fix the profile, or the GoSellr filter is too strict.');
        }
      }
    } else {
      console.log('\n   ✅ JPS itself returns the profile correctly.');
      console.log('      Bug must be in GoSellr request path or env vars.');
    }
  }

  await gs.close();
  await jps.close();
  console.log('\n──────────────────────────────────────────────────────\n');
}

main().catch((err) => {
  console.error('❌ Diagnostic failed:', err);
  process.exit(1);
});
