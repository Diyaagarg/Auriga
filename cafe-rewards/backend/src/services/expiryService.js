const db = require('../db');
const { getCurrentTime } = require('./clockService');

const EXPIRY_DAYS = 90;

// A PURCHASE is eligible when:
//   1. it is the member's most recent PURCHASE-or-REDEMPTION transaction
//      (i.e. nothing has happened on the account since) — the literal
//      "no purchase or redemption since that transaction" rule, and
//   2. more than EXPIRY_DAYS simulated days have passed since it posted, and
//   3. it hasn't already been expired (no EXPIRY row points back at it).
//
// SIMPLIFYING ASSUMPTION: because rule 1 requires the flagged purchase to be
// the *latest* activity on the account, at most one purchase per member can
// ever be eligible at a time. An older purchase that gets superseded by a
// later purchase or redemption is permanently protected from expiring, even
// if it individually sits unused for 90+ days — this mirrors the task's
// literal wording rather than a real-world FIFO "per-lot" expiry system
// (which would need to track how much of each purchase's points remain
// unredeemed/unexpired independently). Implementing true per-lot expiry
// was intentionally left out per "keep this simple."
const findEligiblePurchases = db.prepare(`
  SELECT t.id, t.member_id, t.points_delta
  FROM transactions t
  WHERE t.type = 'PURCHASE'
    AND t.id = (
      SELECT t2.id FROM transactions t2
      WHERE t2.member_id = t.member_id
        AND t2.type IN ('PURCHASE', 'REDEMPTION')
      ORDER BY t2.created_at DESC, t2.id DESC
      LIMIT 1
    )
    AND NOT EXISTS (
      SELECT 1 FROM transactions e
      WHERE e.type = 'EXPIRY' AND e.source_transaction_id = t.id
    )
    AND (julianday(?) - julianday(t.created_at)) > ?
`);

const getMemberById = db.prepare('SELECT * FROM members WHERE id = ?');
// Only points_balance is touched — lifetime_points (and therefore tier)
// stays exactly as it was, same principle as redemption: tier reflects
// lifetime earning history, not what's currently sitting in the balance.
const updateMemberBalance = db.prepare('UPDATE members SET points_balance = ? WHERE id = ?');
// created_at is stamped explicitly with the simulated "now" too (see
// loyaltyService's insertTransaction for why) rather than the real-time
// column default.
const insertExpiryTransaction = db.prepare(`
  INSERT INTO transactions (member_id, type, amount, points_delta, balance_after, source_transaction_id, created_at)
  VALUES (?, 'EXPIRY', NULL, ?, ?, ?, ?)
`);

// Single DB transaction: every expiry found in one run commits together, so
// a crash mid-run can't deduct a balance without leaving the matching
// ledger row (or vice versa).
const expireStalePoints = db.transaction(() => {
  const now = getCurrentTime();
  const eligible = findEligiblePurchases.all(now, EXPIRY_DAYS);

  const details = [];
  for (const row of eligible) {
    const member = getMemberById.get(row.member_id);
    // Defensive clamp against the balance-never-negative invariant; in
    // practice this transaction is the account's most recent activity (rule
    // 1 above), so its full points_delta is always still present in balance.
    const expireAmount = Math.min(row.points_delta, member.points_balance);
    if (expireAmount <= 0) continue;

    const newBalance = member.points_balance - expireAmount;
    updateMemberBalance.run(newBalance, member.id);
    insertExpiryTransaction.run(member.id, -expireAmount, newBalance, row.id, now);

    details.push({
      memberId: member.id,
      phone: member.phone,
      sourceTransactionId: row.id,
      pointsExpired: expireAmount,
      newBalance,
    });
  }

  return {
    currentTime: now,
    expiredCount: details.length,
    totalPointsExpired: details.reduce((sum, d) => sum + d.pointsExpired, 0),
    details,
  };
});

module.exports = { expireStalePoints, EXPIRY_DAYS };
