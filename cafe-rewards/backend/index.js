'use strict';

const express = require('express');
const cors = require('cors');

require('./src/db'); // opens the DB and applies schema.sql before the app starts serving

const {
  createMember,
  recordPurchase,
  redeemPoints,
  getMemberByPhone,
  listMembers,
  toApiMember,
} = require('./src/services/loyaltyService');
const { registerUser, loginUser, resetPassword, requireAuth } = require('./src/services/authService');
const { listNotifications } = require('./src/services/notificationService');
const { getCurrentTime, advanceClock } = require('./src/services/clockService');
const { expireStalePoints } = require('./src/services/expiryService');

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  })
);
app.use(express.json());

// POST /api/auth/register — sign up a new staff user (username, password, name, phone)
app.post('/api/auth/register', (req, res, next) => {
  try {
    const { username, password, name, phone } = req.body;
    const user = registerUser(username, password, name, phone);
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login — returns a JWT to use as "Authorization: Bearer <token>"
app.post('/api/auth/login', (req, res, next) => {
  try {
    const { username, password } = req.body;
    const result = loginUser(username, password);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/reset-password — direct reset by phone, no verification step
app.post('/api/auth/reset-password', (req, res, next) => {
  try {
    const { phone, newPassword } = req.body;
    const result = resetPassword(phone, newPassword);
    res.status(200).json({ message: 'Password updated successfully', username: result.username });
  } catch (err) {
    next(err);
  }
});

// POST /api/members — register a new member (staff-authenticated)
app.post('/api/members', requireAuth, (req, res, next) => {
  try {
    const { name, phone } = req.body;
    const member = createMember(phone, name);
    res.status(201).json(toApiMember(member));
  } catch (err) {
    next(err);
  }
});

// GET /api/members — paginated, filterable, sortable member list.
// Filtering/sorting/pagination all happen in SQL (WHERE/ORDER BY/LIMIT/OFFSET)
// so this stays cheap regardless of how many members exist.
app.get('/api/members', (req, res, next) => {
  try {
    const { search, page, limit, sort, order } = req.query;
    const result = listMembers({ search, page, limit, sort, order });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/members/:phone — member details
app.get('/api/members/:phone', (req, res, next) => {
  try {
    const member = getMemberByPhone.get(req.params.phone);
    if (!member) {
      return res.status(404).json({ error: `No member with phone ${req.params.phone}` });
    }
    res.json(toApiMember(member));
  } catch (err) {
    next(err);
  }
});

// POST /api/purchase — record a purchase, returns updated balance/lifetime points/tier (staff-authenticated)
app.post('/api/purchase', requireAuth, (req, res, next) => {
  try {
    const { phone, amount } = req.body;
    const result = recordPurchase(phone, amount);
    res.status(201).json({
      phone,
      pointsEarned: result.transaction.pointsEarned,
      tierApplied: result.transaction.tierApplied,
      balance: result.member.points_balance,
      lifetimePoints: result.member.lifetime_points,
      tier: result.member.tier,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/redeem — redeem points, returns updated balance (staff-authenticated)
app.post('/api/redeem', requireAuth, (req, res, next) => {
  try {
    const { phone, points } = req.body;
    const result = redeemPoints(phone, points);
    res.status(200).json({
      phone,
      pointsRedeemed: result.transaction.pointsRedeemed,
      balance: result.member.points_balance,
      lifetimePoints: result.member.lifetime_points,
      tier: result.member.tier,
    });
  } catch (err) {
    next(err);
  }
});

// GET /outbox — notification outbox, newest first
app.get('/outbox', (req, res, next) => {
  try {
    res.json(listNotifications());
  } catch (err) {
    next(err);
  }
});

// POST /clock — advance the simulated clock, then run expireStalePoints()
// against the new simulated time (this is the only trigger for expiry).
app.post('/clock', (req, res, next) => {
  try {
    const { advanceDays } = req.body;
    const currentTime = advanceClock(advanceDays);
    const expiry = expireStalePoints();
    res.status(200).json({
      currentTime,
      expired: {
        count: expiry.expiredCount,
        totalPointsExpired: expiry.totalPointsExpired,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /clock — current simulated time, for convenience when debugging
app.get('/clock', (req, res, next) => {
  try {
    res.json({ currentTime: getCurrentTime() });
  } catch (err) {
    next(err);
  }
});

// Unmatched routes
app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
});

// Central error handler — maps custom error classes (see src/errors.js) to
// HTTP status codes: ValidationError -> 400, UnauthorizedError -> 401,
// NotFoundError -> 404, ConflictError/InsufficientBalanceError -> 409,
// anything unknown -> 500.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  if (statusCode === 500) console.error(err);
  res.status(statusCode).json({ error: err.message });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Café rewards API listening on port ${PORT}`);
});

module.exports = app;
