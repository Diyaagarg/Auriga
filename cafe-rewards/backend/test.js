'use strict';

const path = require('node:path');
const fs = require('node:fs');

// Point at a dedicated test database before requiring anything that opens
// one, so this script never touches the real dev/prod data file.
const TEST_DB_PATH = path.join(__dirname, 'data', 'test.db');
process.env.DB_PATH = TEST_DB_PATH;

// Start from a clean slate every run.
for (const suffix of ['', '-wal', '-shm']) {
  const file = TEST_DB_PATH + suffix;
  if (fs.existsSync(file)) fs.rmSync(file);
}

const db = require('./src/db');
const {
  createMember,
  recordPurchase,
  redeemPoints,
  getMemberByPhone,
} = require('./src/services/loyaltyService');
const { listNotifications } = require('./src/services/notificationService');
const { getCurrentTime, advanceClock } = require('./src/services/clockService');
const { expireStalePoints } = require('./src/services/expiryService');

function section(title) {
  console.log('\n' + '='.repeat(65));
  console.log(title);
  console.log('='.repeat(65));
}

function printMember(label, member) {
  console.log(
    `${label}: lifetime=${member.lifetime_points} pts | balance=${member.points_balance} pts | tier=${member.tier}`
  );
}

// Verifies the outbox grew by exactly `expectedNewEntries` since `countBefore`,
// and — when a notification was expected — that the newest entry names the
// tier the member just moved into.
function checkOutboxDelta(countBefore, tierName, expectedNewEntries) {
  const notifications = listNotifications();
  const delta = notifications.length - countBefore;
  console.log(
    `  Outbox check: ${delta} new entr${delta === 1 ? 'y' : 'ies'} (expected ${expectedNewEntries})` +
      (delta === expectedNewEntries ? ' — OK' : ' — MISMATCH')
  );
  if (expectedNewEntries === 1) {
    const newest = notifications[0]; // ORDER BY timestamp DESC -> newest first
    const messageOk = Boolean(newest && newest.message.includes(tierName));
    console.log(
      messageOk
        ? `  OK — newest notification mentions "${tierName}": "${newest.message}"`
        : `  MISMATCH — expected newest notification to mention "${tierName}", got: ${newest && newest.message}`
    );
  }
}

section('1. Fresh test database');
console.log(`Using test DB at: ${TEST_DB_PATH}`);

section('2. Create test member');
const PHONE = '9000000001';
const created = createMember(PHONE, 'Test User');
console.log(`Created member: phone=${created.phone}, name=${created.name}, id=${created.id}`);

section('3. Purchase Rs 500 (Base tier: 1 pt / Rs 10 -> expect 50 pts)');
let outboxCountBefore = listNotifications().length;
let result = recordPurchase(PHONE, 500);
console.log(`Purchase amount: Rs ${result.transaction.amount}`);
console.log(`Tier applied:    ${result.transaction.tierApplied}`);
console.log(`Points earned:   ${result.transaction.pointsEarned}`);
printMember('Resulting state', result.member);
checkOutboxDelta(outboxCountBefore, 'Base', 0); // still Base -> no notification expected
let previousTier = result.member.tier;

section('4. More purchases: progress Base -> Silver -> Gold -> Platinum');
console.log('Tier used for each purchase is the tier held BEFORE that purchase.');
console.log('Platinum rate is 0.3 pts per Re 1 (= 3 pts per Rs 10 = 3x the Base rate).');
console.log('Each purchase also checks the /outbox: exactly one new entry on a tier crossing, none otherwise.');
const purchases = [4000, 1000, 1000, 5000, 1000, 3000, 1000, 5000, 5000, 4000, 1000];
let seenPlatinum = false;
for (const amount of purchases) {
  outboxCountBefore = listNotifications().length;
  result = recordPurchase(PHONE, amount);
  console.log(`\nPurchase: Rs ${amount}`);
  console.log(`  Tier applied for this purchase: ${result.transaction.tierApplied}`);
  console.log(`  Points earned:                  ${result.transaction.pointsEarned}`);
  printMember('  Resulting state', result.member);

  const crossed = result.member.tier !== previousTier;
  checkOutboxDelta(outboxCountBefore, result.member.tier, crossed ? 1 : 0);
  previousTier = result.member.tier;

  if (result.transaction.tierApplied === 'Platinum' && !seenPlatinum) {
    seenPlatinum = true;
    const rate = result.transaction.pointsEarned / amount;
    console.log(
      `  Rate check: ${result.transaction.pointsEarned} pts / Rs ${amount} = ${rate} pts per Re 1 (expected 0.3)`
    );
    console.log(rate === 0.3 ? '  OK — Platinum earn rate confirmed.' : '  MISMATCH — Platinum rate is wrong!');
  }
}
if (!seenPlatinum) {
  console.log('\nWARNING: purchase sequence never triggered a Platinum-rate purchase — test is incomplete.');
}

section('4b. Full outbox contents');
for (const note of listNotifications()) {
  console.log(`  [#${note.id}] ${note.timestamp} -> ${note.phone}: "${note.message}"`);
}
const expectedUpgrades = ['Silver', 'Gold', 'Platinum'];
const outboxTiers = listNotifications()
  .slice()
  .reverse() // outbox is newest-first; reverse to chronological order
  .map((n) => expectedUpgrades.find((t) => n.message.includes(t)));
console.log(`Expected upgrade sequence: ${expectedUpgrades.join(' -> ')}`);
console.log(`Actual outbox tier sequence:   ${outboxTiers.join(' -> ')}`);
console.log(
  JSON.stringify(outboxTiers) === JSON.stringify(expectedUpgrades)
    ? 'OK — outbox has exactly the three expected upgrade notifications, in order.'
    : 'MISMATCH — outbox contents do not match the expected upgrade sequence!'
);

section('5. Redeem 300 points');
const balanceBeforeRedeem = result.member.points_balance;
const redeemResult = redeemPoints(PHONE, 300);
console.log(`Balance before redemption: ${balanceBeforeRedeem}`);
console.log(`Points redeemed:           ${redeemResult.transaction.pointsRedeemed}`);
printMember('Resulting state', redeemResult.member);

section('6. Attempt to redeem more points than balance allows');
const currentBalance = redeemResult.member.points_balance;
const overRedeemAmount = currentBalance + 500;
console.log(`Current balance: ${currentBalance}`);
console.log(`Attempting to redeem: ${overRedeemAmount} (should be rejected)`);
try {
  redeemPoints(PHONE, overRedeemAmount);
  console.log('UNEXPECTED: redemption succeeded — this should not happen!');
} catch (err) {
  console.log(`Rejected as expected -> [${err.name}] ${err.message}`);
}

const memberAfterFailedRedeem = getMemberByPhone.get(PHONE);
console.log(`Balance after failed attempt (should be unchanged): ${memberAfterFailedRedeem.points_balance}`);
console.log(
  memberAfterFailedRedeem.points_balance === currentBalance
    ? 'OK — balance untouched by the rejected redemption.'
    : 'MISMATCH — balance changed despite rejection!'
);

section('7. Points expiry — stale purchase expires, active member is protected');
console.log(`Simulated clock starts at: ${getCurrentTime()}`);
console.log('Expiry rule: a PURCHASE expires once >90 simulated days old AND nothing');
console.log('(no purchase/redemption) has happened on the account since.');

const STALE_PHONE = '9000000002';
const ACTIVE_PHONE = '9000000003';
createMember(STALE_PHONE, 'Stale Member');
createMember(ACTIVE_PHONE, 'Active Member');

console.log('\n-- Both members purchase Rs 500 at T0 (50 pts each, Base tier) --');
const staleP1 = recordPurchase(STALE_PHONE, 500);
const activeP1 = recordPurchase(ACTIVE_PHONE, 500);
printMember('Stale member',  staleP1.member);
printMember('Active member', activeP1.member);

console.log('\n-- Advance clock +30 days (POST /clock equivalent: advance, then expire) --');
let clockNow = advanceClock(30);
let expiryRun = expireStalePoints();
console.log(`Clock is now: ${clockNow}`);
console.log(`Expiry run:   ${expiryRun.expiredCount} expired (expected 0 — nothing is 90 days old yet)`);

console.log('\n-- Active member makes a second purchase at T0+30 (resets their "last activity") --');
const activeP2 = recordPurchase(ACTIVE_PHONE, 300);
printMember('Active member', activeP2.member);

console.log('\n-- Advance clock +65 more days (T0+95 total) --');
clockNow = advanceClock(65);
expiryRun = expireStalePoints();
console.log(`Clock is now: ${clockNow}`);
console.log(`Expiry run: expiredCount=${expiryRun.expiredCount}, totalPointsExpired=${expiryRun.totalPointsExpired}`);
console.log(JSON.stringify(expiryRun.details, null, 2));

const staleAfter = getMemberByPhone.get(STALE_PHONE);
const activeAfter = getMemberByPhone.get(ACTIVE_PHONE);

console.log('\n-- Stale member: purchase from T0 is now 95 days old with no activity since -> should expire --');
console.log(`  Balance: ${staleAfter.points_balance} (expected 0 — the only 50 pts they had just expired)`);
console.log(`  Lifetime points: ${staleAfter.lifetime_points} (expected 50 — expiry must NOT touch lifetime_points)`);
console.log(
  staleAfter.points_balance === 0 && staleAfter.lifetime_points === 50
    ? '  OK — balance expired, lifetime points and tier untouched.'
    : '  MISMATCH — expiry affected the wrong field(s)!'
);

const staleExpiryRow = db
  .prepare("SELECT * FROM transactions WHERE member_id = ? AND type = 'EXPIRY'")
  .get(staleAfter.id);
console.log(`  Expiry ledger entry: ${staleExpiryRow ? JSON.stringify(staleExpiryRow) : 'NONE FOUND'}`);
console.log(
  staleExpiryRow && staleExpiryRow.points_delta === -50
    ? '  OK — expiry ledger entry exists with points_delta = -50.'
    : '  MISMATCH — expected exactly one EXPIRY row with points_delta -50.'
);

console.log('\n-- Active member: has a purchase within the last 90 days -> nothing should expire --');
console.log(`  Balance: ${activeAfter.points_balance} (expected 80 — both purchases' points intact)`);
console.log(
  activeAfter.points_balance === 80
    ? '  OK — active member kept all their points.'
    : '  MISMATCH — active member lost points they should have kept!'
);
const activeExpiryRow = db
  .prepare("SELECT * FROM transactions WHERE member_id = ? AND type = 'EXPIRY'")
  .get(activeAfter.id);
console.log(
  !activeExpiryRow
    ? '  OK — no EXPIRY row for the active member.'
    : `  MISMATCH — unexpected EXPIRY row for active member: ${JSON.stringify(activeExpiryRow)}`
);

console.log('\n-- Re-running expiry again should be a no-op (already-expired purchase must not double-expire) --');
const rerun = expireStalePoints();
console.log(`Second run: expiredCount=${rerun.expiredCount} (expected 0)`);
const staleAfterRerun = getMemberByPhone.get(STALE_PHONE);
console.log(
  rerun.expiredCount === 0 && staleAfterRerun.points_balance === 0
    ? '  OK — no double-expiry.'
    : '  MISMATCH — stale member was expired more than once!'
);

section('Bonus: ledger consistency check (all members)');
for (const [label, phone] of [
  ['Tier-progression member', PHONE],
  ['Stale member', STALE_PHONE],
  ['Active member', ACTIVE_PHONE],
]) {
  const member = getMemberByPhone.get(phone);
  const ledgerSum = db
    .prepare('SELECT SUM(points_delta) AS total FROM transactions WHERE member_id = ?')
    .get(member.id).total;
  console.log(`${label}: ledger sum=${ledgerSum}, cached balance=${member.points_balance}`);
  console.log(
    ledgerSum === member.points_balance
      ? '  MATCH — balance has no drift from the ledger.'
      : '  MISMATCH — drift detected between ledger and cached balance!'
  );
}

db.close();
console.log('\nDone.\n');
