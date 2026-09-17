-- Members: current state per customer. phone is the natural business key;
-- id is a surrogate key so transactions FK on a cheap integer, not text.
CREATE TABLE IF NOT EXISTS members (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  phone           TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  lifetime_points INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_points >= 0),
  points_balance  INTEGER NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Transactions: append-only ledger. Never UPDATE or DELETE a row here —
-- corrections are made by inserting a new offsetting row.
CREATE TABLE IF NOT EXISTS transactions (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id             INTEGER NOT NULL REFERENCES members(id),
  type                  TEXT NOT NULL CHECK (type IN ('PURCHASE', 'REDEMPTION', 'EXPIRY')),
  amount                REAL,                  -- rupees spent; NULL for redemptions/expiry
  points_delta          INTEGER NOT NULL,      -- positive for earn, negative for redeem/expiry
  balance_after         INTEGER NOT NULL CHECK (balance_after >= 0),
  -- Set only on EXPIRY rows: the PURCHASE transaction whose points expired.
  -- Lets expireStalePoints() tell "already expired" from "still eligible"
  -- without any other bookkeeping.
  source_transaction_id INTEGER REFERENCES transactions(id),
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_transactions_member_id ON transactions(member_id);

-- Staff users for authenticating write actions. Never store plaintext
-- passwords — password_hash is a bcrypt hash. name/phone are nullable at
-- the schema level (existing pre-signup-feature accounts have neither) but
-- required by authService.registerUser for any newly created account.
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT,
  phone         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The unique index on users.phone is created in db.js, not here — on an
-- existing pre-signup-feature database the phone column doesn't exist yet
-- at the point this file runs, so the index has to wait until after that
-- migration adds it.

-- Notification outbox: written inside the same DB transaction as the
-- purchase that triggers it (see loyaltyService.recordPurchase), so a
-- tier-upgrade notification and the purchase that earned it always commit
-- together.
CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  phone      TEXT NOT NULL,
  message    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Single-row simulated clock (see clockService.js). The CHECK enforces a
-- singleton: there is only ever one "current simulated time".
-- Column is NOT named current_time: that collides with SQLite's built-in
-- CURRENT_TIME keyword/pseudo-column, which silently shadows it in SELECTs.
CREATE TABLE IF NOT EXISTS clock (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  simulated_time TEXT NOT NULL
);
