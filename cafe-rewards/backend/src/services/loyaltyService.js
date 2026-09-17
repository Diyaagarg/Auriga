const db = require('../db');
const { NotFoundError, ValidationError, InsufficientBalanceError, ConflictError } = require('../errors');
const { TIERS, getTier, pointsForPurchase, tierRankSql } = require('./tiers');
const { notifyTierUpgrade } = require('./notificationService');
const { getCurrentTime } = require('./clockService');

// Whitelisted sort columns only — sort/order are validated against this map
// before being concatenated into SQL, so nothing user-supplied reaches the
// query string unparameterized.
const SORT_COLUMNS = {
  name: 'name COLLATE NOCASE',
  points_balance: 'points_balance',
  tier: tierRankSql('lifetime_points'),
};
const MAX_LIMIT = 100;

const getMemberByPhone = db.prepare('SELECT * FROM members WHERE phone = ?');
const getMemberById = db.prepare('SELECT * FROM members WHERE id = ?');
const insertMember = db.prepare('INSERT INTO members (phone, name) VALUES (?, ?)');
const updateMemberPoints = db.prepare(
  'UPDATE members SET lifetime_points = ?, points_balance = ? WHERE id = ?'
);
// created_at is stamped from the simulated clock, not SQLite's real-time
// default — expireStalePoints() measures "days since" against this column,
// so it must move with clockService.advanceClock(), not real wall-clock time.
const insertTransaction = db.prepare(`
  INSERT INTO transactions (member_id, type, amount, points_delta, balance_after, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

function createMember(phone, name) {
  if (!phone || typeof phone !== 'string') throw new ValidationError('phone is required');
  if (!name || typeof name !== 'string') throw new ValidationError('name is required');
  if (getMemberByPhone.get(phone)) throw new ConflictError(`Member with phone ${phone} already exists`);

  const info = insertMember.run(phone, name);
  return getMemberById.get(info.lastInsertRowid);
}

function toApiMember(member) {
  return { ...member, tier: getTier(member.lifetime_points).name };
}

function parsePositiveInt(value, fallback, { min, max, field }) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ValidationError(`${field} must be an integer between ${min} and ${max}`);
  }
  return n;
}

// LIKE wildcards (% and _) in user input must be escaped so a search like
// "98_1" matches the literal underscore, not "any single character".
function escapeLikePattern(value) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function listMembers({ search, page, limit, sort, order } = {}) {
  const pageNum = parsePositiveInt(page, 1, { min: 1, max: Number.MAX_SAFE_INTEGER, field: 'page' });
  const limitNum = parsePositiveInt(limit, 10, { min: 1, max: MAX_LIMIT, field: 'limit' });

  const sortKey = sort || 'name';
  if (!Object.prototype.hasOwnProperty.call(SORT_COLUMNS, sortKey)) {
    throw new ValidationError(`sort must be one of: ${Object.keys(SORT_COLUMNS).join(', ')}`);
  }

  const orderKey = (order || 'asc').toLowerCase();
  if (orderKey !== 'asc' && orderKey !== 'desc') {
    throw new ValidationError('order must be "asc" or "desc"');
  }

  const params = [];
  let whereClause = '';
  if (search) {
    whereClause = "WHERE phone LIKE ? ESCAPE '\\'";
    params.push(`%${escapeLikePattern(search)}%`);
  }

  const total = db.prepare(`SELECT COUNT(*) AS count FROM members ${whereClause}`).get(...params).count;

  // Secondary `id ASC` keeps pagination deterministic across pages when the
  // primary sort key has ties (e.g. two members on the same tier).
  const orderClause = `${SORT_COLUMNS[sortKey]} ${orderKey.toUpperCase()}, id ASC`;
  const offset = (pageNum - 1) * limitNum;
  const rows = db
    .prepare(`SELECT * FROM members ${whereClause} ORDER BY ${orderClause} LIMIT ? OFFSET ?`)
    .all(...params, limitNum, offset);

  return {
    members: rows.map(toApiMember),
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum),
  };
}

// Runs as a single DB transaction: the member row and the ledger row commit
// together or not at all, so a crash mid-write can never leave one without the other.
const recordPurchase = db.transaction((phone, amount) => {
  if (!phone || typeof phone !== 'string') throw new ValidationError('phone is required');
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new ValidationError('amount must be a positive number');
  }

  const member = getMemberByPhone.get(phone);
  if (!member) throw new NotFoundError(`No member with phone ${phone}`);

  // Rate is determined by the tier the member already held going into this
  // purchase — see loyaltyService module notes on why this ordering is chosen.
  const tierBefore = getTier(member.lifetime_points);
  const pointsEarned = pointsForPurchase(amount, tierBefore);

  const newLifetimePoints = member.lifetime_points + pointsEarned;
  const newBalance = member.points_balance + pointsEarned;
  const tierAfter = getTier(newLifetimePoints);

  updateMemberPoints.run(newLifetimePoints, newBalance, member.id);
  const info = insertTransaction.run(member.id, 'PURCHASE', amount, pointsEarned, newBalance, getCurrentTime());

  // Only fires on an actual upward crossing, never on a tier-neutral
  // purchase — compares rank (array position in TIERS), not just inequality,
  // since a purchase can only ever move a member up or leave them where they
  // are (lifetime_points never decreases), but comparing ranks explicitly
  // keeps this correct even if TIERS is ever reordered.
  if (TIERS.indexOf(tierAfter) > TIERS.indexOf(tierBefore)) {
    notifyTierUpgrade(phone, tierAfter.name);
  }

  return {
    member: toApiMember({ ...member, lifetime_points: newLifetimePoints, points_balance: newBalance }),
    transaction: {
      id: info.lastInsertRowid,
      type: 'PURCHASE',
      amount,
      tierApplied: tierBefore.name,
      pointsEarned,
      balanceAfter: newBalance,
    },
  };
});

// Also a single DB transaction: the balance check and the deduction happen
// atomically, so two concurrent redemptions can never both pass the check
// and together drive the balance negative.
const redeemPoints = db.transaction((phone, points) => {
  if (!phone || typeof phone !== 'string') throw new ValidationError('phone is required');
  if (!Number.isInteger(points) || points <= 0) {
    throw new ValidationError('points must be a positive integer');
  }

  const member = getMemberByPhone.get(phone);
  if (!member) throw new NotFoundError(`No member with phone ${phone}`);

  if (member.points_balance < points) {
    throw new InsufficientBalanceError(
      `Insufficient balance: have ${member.points_balance}, requested ${points}`
    );
  }

  // lifetime_points is untouched: tier reflects lifetime earning, not current
  // balance, so redeeming never demotes a member.
  const newBalance = member.points_balance - points;

  updateMemberPoints.run(member.lifetime_points, newBalance, member.id);
  const info = insertTransaction.run(member.id, 'REDEMPTION', null, -points, newBalance, getCurrentTime());

  return {
    member: toApiMember({ ...member, points_balance: newBalance }),
    transaction: {
      id: info.lastInsertRowid,
      type: 'REDEMPTION',
      pointsRedeemed: points,
      balanceAfter: newBalance,
    },
  };
});

module.exports = {
  createMember,
  recordPurchase,
  redeemPoints,
  getMemberByPhone,
  listMembers,
  toApiMember,
};
