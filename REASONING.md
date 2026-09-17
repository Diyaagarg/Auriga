# Reasoning

## Understanding the Problem
The core requirement, stated twice in the problem brief, is that the member's points balance must **always be exactly right** — this was treated as the central engineering constraint, more important than UI polish or feature breadth. Everything else (tiers, redemption, lookups) was built around ensuring this correctness first.

## Who This Is For
This is a staff-facing counter tool, not a customer-facing app. Staff log in and act on a member's account by looking them up via phone number — members themselves never log in or interact with the app directly.

## Solution Approach & Design Decisions

### Tier & Points Design
- Tiers (Base/Silver/Gold/Platinum) are computed **dynamically** from `lifetime_points` rather than stored as an independently-editable field. This means a member's tier can never drift out of sync with their actual earning history — it's always derived, never stale.
- The tier used for a purchase is locked in **before** that purchase's own points are added. This avoids a circular dependency: a purchase that pushes a member from Base into Silver still earns at the Base rate for that specific purchase, and only the *next* purchase benefits from the new tier.
- Redemptions only reduce `points_balance`, never `lifetime_points` — so spending points down never demotes a member's tier. Tier reflects total lifetime earning, not current spendable balance.

### Balance Correctness (the core requirement)
- Every purchase, redemption, and expiry is recorded as an entry in a `transactions` ledger table, not just an ad-hoc balance update.
- `points_balance` on the member record is treated as a **cache** of the ledger, always updated inside the **same database transaction** as its corresponding ledger insert — so the two can never go out of sync, even under concurrent operations.
- This was explicitly verified with an invariant check: `SUM(transactions.points_delta) for a member == members.points_balance`, asserted in `test.js` after every scenario (tier progression, redemption, expiry).

### Tier thresholds and rates (assumptions made, since the brief left these open)
- Base: 1 pt / ₹10
- Silver (lifetime ≥ 500): 1.5 pts / ₹10
- Gold (lifetime ≥ 2000): 2 pts / ₹10
- Platinum (lifetime ≥ 5000): 3 pts / ₹10 = 0.3 pts / ₹1

These specific numbers weren't specified in the brief (aside from Platinum's rate, which was given) — they were chosen to be simple, clearly-ordered, and easy to verify by hand.

## Twist Levels

**Level 1 — Platinum tier**: Added as a new threshold band. Since tier was already computed dynamically rather than stored, this required no migration or retroactive recalculation of existing members — an existing member only becomes Platinum once their `lifetime_points` naturally crosses 5000, exactly as the requirement specified ("existing members' tiers and balances must be unchanged unless they now qualify").

**Level 2 — Points expiry**: Implemented via a simulated clock (`POST /clock` to advance simulated time, `GET /clock` to inspect it), instead of relying on real wall-clock time — this allows deterministic testing of "90 days later" without waiting 90 real days.
- A purchase's points expire once more than 90 *simulated* days have passed since it was made **and** no purchase or redemption has occurred on that account since.
- Expiry is logged as its own `EXPIRY` ledger entry with a negative `points_delta`, preserving the ledger-sum-equals-balance invariant even after expiry runs.
- **Simplifying assumption**: only a member's single most recent purchase can ever become eligible for expiry, because eligibility requires "nothing since it" — any later purchase or redemption permanently protects everything before it. This is a literal reading of "unused for 90 days," not full per-purchase (FIFO-lot) expiry, which would require independently tracking how much of each individual purchase's points remain unspent over time. True per-lot expiry was judged out of scope given time constraints; flagging this here as a known limitation rather than leaving it unstated.

**Level 3 — Tier-upgrade notifications**: A notification fires only when a purchase causes an *upward* tier-rank change — determined by explicitly comparing tier rank before and after the purchase (not simply checking inequality, which could misfire incorrectly). The notification insert happens inside the same database transaction as the triggering purchase, so a notification and its tier-crossing purchase always commit together or not at all. `GET /outbox` exposes the full notification history for verification.

## How I Tested
All core logic is covered in `backend/test.js`, run against a fresh, isolated test database (not the live dev database), so tests never interfere with manually-tested data:
1. **Tier progression**: a sequence of purchases pushes a member through Base → Silver → Gold → Platinum, checking exact points earned at each tier's rate, and verifying the outbox gets exactly one notification per tier crossing (no false positives on same-tier purchases).
2. **Redemption**: verified balance decreases correctly, and that over-redemption is rejected with balance left untouched.
3. **Points expiry**: two members purchase at the same time; clock advances 30 days (nothing expires yet); one member makes a second purchase (resetting their "last activity"); clock advances 65 more days (95 total) — the inactive member's original purchase correctly expires (balance → 0, `lifetime_points` and tier unchanged), while the active member keeps all their points. Running expiry a second time confirms no double-expiry.
4. **Ledger consistency**: after every scenario, the sum of all ledger entries for each member is checked against their cached balance to confirm zero drift.

Beyond `test.js`, I also manually tested every API endpoint live via `curl` (member creation, purchase, redemption, error cases like unknown member/duplicate phone/insufficient balance, search/pagination/sorting) before building the frontend, and tested the full flow end-to-end in the browser (login → search → purchase → redeem → balance updates live) after the frontend was built.

## Issues Hit & How I Fixed Them
- **Stale server process**: After adding a new endpoint mid-session, requests still returned "Not found" even though the code was correct — because `node index.js` loads the file once and doesn't hot-reload on changes. Switched to `npm run dev` (using `node --watch`) so the server restarts automatically on file changes.
- **CORS failure between frontend and backend**: Since both frontend and backend run on separate forwarded Codespace URLs (not `localhost`), the browser blocked API calls with a CORS preflight error. Fixed by setting the backend's `CORS_ORIGIN` env var to the frontend's exact forwarded origin, and pointing the frontend's API base URL (`VITE_API_URL`) at the backend's forwarded URL instead of a hardcoded `localhost` address.
- **Simulated clock not affecting timestamps**: Initially, transaction timestamps used SQLite's real-time default regardless of the simulated clock. This would have broken expiry logic entirely — once the clock was advanced, everything would still appear to happen at real "now," so nothing would ever look stale. Fixed by stamping every ledger entry's timestamp from the simulated clock service instead.

## What Wasn't Fully Solved
- Points expiry (Level 2) uses a simplified single-purchase eligibility model rather than true per-purchase-lot expiry, as noted above — a known and documented limitation given time constraints, not an oversight.