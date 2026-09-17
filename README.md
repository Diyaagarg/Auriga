# Café Rewards Counter

A staff-facing counter application for a café chain's rewards programme. Staff look up members by phone number, record purchases, process redemptions, and always see an accurate live points balance.

## Who Uses This

- **Café staff** are the users of this application. They log in, search for a member by phone number, and perform actions (purchase, redemption) on that member's behalf.
- **Members (customers)** never log in or interact with the app directly — they are simply looked up by phone number at the counter.

## Project Workflow

### 1. Staff Authentication Flow
1. Staff opens the app and lands on the landing page (`/`).
2. Clicks "Staff Login" → navigates to `/app`.
3. Enters username/password → frontend calls `POST /api/auth/login`.
4. Backend verifies credentials (bcrypt-hashed password check), issues a JWT.
5. Frontend stores the JWT and attaches it as a Bearer token on all subsequent API calls.
6. Protected routes (purchase, redeem, member creation) reject requests without a valid token.

### 2. Member Lookup Flow
1. Staff types a phone number (full or partial) into the Counter search box.
2. Frontend calls `GET /api/members/:phone` (exact lookup) or `GET /api/members?search=` (partial match, for the "All Members" list view).
3. Backend queries SQLite, returns member details: name, phone, tier, lifetime points, current balance.
4. Frontend renders the member card with live balance and tier badge.

### 3. Purchase Flow (Earning Points)
1. Staff enters a purchase amount and clicks "Record Purchase."
2. Frontend calls `POST /api/purchase` with `{ phone, amount }`.
3. Backend, inside a single database transaction:
   - Looks up the member's **current tier** (based on `lifetime_points` *before* this purchase).
   - Calculates points earned using that tier's rate (Base/Silver/Gold/Platinum).
   - Inserts a `PURCHASE` row into the `transactions` ledger.
   - Updates `lifetime_points` and `points_balance` on the member.
   - Recalculates the member's **new tier** (based on updated `lifetime_points`).
   - If the new tier ranks higher than the old tier, inserts a notification into the `notifications` table (Level 3 twist).
4. Backend returns the updated balance, lifetime points, and tier.
5. Frontend updates the member card live with the new numbers.

### 4. Redemption Flow (Spending Points)
1. Staff enters a points amount and clicks "Redeem."
2. Frontend calls `POST /api/redeem` with `{ phone, points }`.
3. Backend checks the member's current `points_balance`:
   - If insufficient, rejects with a 409 error and a clear message — balance is left untouched.
   - If sufficient, inserts a `REDEMPTION` row into the ledger (negative `points_delta`), decrements `points_balance` only (never `lifetime_points`, so tier status is unaffected by spending).
4. Backend returns the updated balance.
5. Frontend updates the member card live.

### 5. Points Expiry Flow (Level 2 twist — simulated clock)
1. A simulated clock (stored server-side, independent of real wall-clock time) tracks "current time" for the whole system.
2. Grading/testing advances this clock via `POST /clock` with `{ advanceDays: N }`.
3. On every clock advance, the backend automatically runs `expireStalePoints()`:
   - For each member, checks their most recent purchase.
   - If that purchase is more than 90 *simulated* days old **and** no purchase/redemption has happened since, its points are expired.
   - An `EXPIRY` row (negative `points_delta`) is inserted into the ledger, and `points_balance` is decremented accordingly. `lifetime_points` and `tier` are never touched by expiry.
4. `GET /clock` and `GET /outbox` allow inspecting the current simulated time and notification history respectively, for verification.

### 6. Balance Integrity Guarantee (core requirement)
At every step above, the member's `points_balance` field is a **cache**, always updated inside the same database transaction as its corresponding ledger entry (`PURCHASE`, `REDEMPTION`, or `EXPIRY`). This guarantees:
- The cached balance can never silently drift from the ledger.
- At any point, `SUM(transactions.points_delta) for a member == members.points_balance` — this invariant is explicitly tested in `test.js`.

### 7. Member List / Search / Pagination Flow
1. Staff switches to the "All Members" tab.
2. Frontend calls `GET /api/members?search=&page=&limit=&sort=&order=`.
3. Backend runs a paginated, filtered, sorted SQL query (`LIMIT`/`OFFSET` — not client-side filtering, since the member list may be long).
4. Frontend renders the paginated table with working search and sort controls.

## Tech Stack
- **Backend**: Node.js, Express, better-sqlite3
- **Frontend**: React (Vite)
- **Auth**: JWT-based staff login, bcrypt password hashing

## Setup & Run

### Backend
```bash
cd backend
npm install
```

