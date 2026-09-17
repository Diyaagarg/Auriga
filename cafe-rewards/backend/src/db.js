const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'cafe-rewards.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// WAL lets reads proceed while a write transaction is in flight; foreign_keys
// must be turned on per-connection, better-sqlite3 does not enable it by default.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// Migrate any database created before the EXPIRY type/source_transaction_id
// column existed. CREATE TABLE IF NOT EXISTS above is a no-op on a table
// that already exists, so an old `transactions` table needs an explicit
// rebuild — SQLite can't ALTER a CHECK constraint in place. No-op on a
// fresh database, since schema.sql already created the final shape above.
const transactionColumns = db.prepare('PRAGMA table_info(transactions)').all();
const hasSourceTransactionId = transactionColumns.some((col) => col.name === 'source_transaction_id');
if (!hasSourceTransactionId) {
  db.exec(`
    BEGIN;

    ALTER TABLE transactions RENAME TO transactions_old;

    CREATE TABLE transactions (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id             INTEGER NOT NULL REFERENCES members(id),
      type                  TEXT NOT NULL CHECK (type IN ('PURCHASE', 'REDEMPTION', 'EXPIRY')),
      amount                REAL,
      points_delta          INTEGER NOT NULL,
      balance_after         INTEGER NOT NULL CHECK (balance_after >= 0),
      source_transaction_id INTEGER REFERENCES transactions(id),
      created_at            TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO transactions (id, member_id, type, amount, points_delta, balance_after, created_at)
      SELECT id, member_id, type, amount, points_delta, balance_after, created_at FROM transactions_old;

    DROP TABLE transactions_old;

    CREATE INDEX IF NOT EXISTS idx_transactions_member_id ON transactions(member_id);

    COMMIT;
  `);
}

// Migrate any database created before users had name/phone. Unlike the
// transactions migration above, this only ever adds nullable columns — no
// CHECK constraint is involved — so a plain ALTER TABLE ADD COLUMN is safe
// and doesn't need a full table rebuild. No-op on a fresh database.
const userColumns = db.prepare('PRAGMA table_info(users)').all();
if (!userColumns.some((col) => col.name === 'name')) {
  db.exec('ALTER TABLE users ADD COLUMN name TEXT');
}
if (!userColumns.some((col) => col.name === 'phone')) {
  db.exec('ALTER TABLE users ADD COLUMN phone TEXT');
}

// Must run after the migration above: on a pre-existing database the phone
// column doesn't exist until the ALTER TABLE just ran. Partial index (WHERE
// phone IS NOT NULL) enforces uniqueness among accounts that have a phone
// without rejecting older rows where it's still NULL.
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL');

// Clock starts at real wall-clock time the first time this database is
// opened, then only ever moves via clockService.advanceClock — so it
// persists across restarts instead of resetting to "now" each time.
const clockRow = db.prepare('SELECT 1 FROM clock WHERE id = 1').get();
if (!clockRow) {
  db.prepare("INSERT INTO clock (id, simulated_time) VALUES (1, datetime('now'))").run();
}

module.exports = db;
