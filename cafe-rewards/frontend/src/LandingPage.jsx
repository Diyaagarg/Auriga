const FEATURES = [
  'Tiered earning — Base, Silver, Gold, and Platinum rates applied automatically',
  'Purchase & redemption tracking — every point earned or spent is logged',
  'Phone-based member lookup — find any member at the counter in seconds',
  'Paginated member search — sort and filter the full member list, even at scale',
];

const ROADMAP = [
  'SMS/email notifications when a member is upgraded to a new tier',
  'Automatic points expiry',
  'Multi-branch analytics dashboard',
];

export default function LandingPage() {
  return (
    <div className="landing">
      <header className="landing-hero">
        <h1>Café Rewards Counter</h1>
        <p className="landing-tagline">
          A counter system for café staff to track member points, tiers, and redemptions —
          with balances that are always accurate.
        </p>
        <a className="landing-cta" href="/app">
          Staff Login →
        </a>
      </header>

      <section className="landing-section">
        <h2>What it is</h2>
        <p>
          Café Rewards Counter is the point-of-sale companion your counter staff use to record
          purchases and redemptions in real time. Every transaction is written to an append-only
          ledger, so a member&apos;s points balance can never drift out of sync — what staff see
          on screen is always what the member actually has.
        </p>
      </section>

      <section className="landing-section">
        <h2>Key features</h2>
        <ul className="landing-list">
          {FEATURES.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </section>

      <section className="landing-section">
        <h2>Who it&apos;s for</h2>
        <p>Café chains and their counter staff, at any number of locations.</p>
      </section>

      <section className="landing-section">
        <h2>How it helps</h2>
        <p>
          It eliminates the manual point-tracking errors that come with spreadsheets or paper
          punch cards, and gives staff an instant, accurate balance lookup for any member — no
          more guessing, no more disputes at the till.
        </p>
      </section>

      <section className="landing-section">
        <h2>Coming next</h2>
        <ul className="landing-list">
          {ROADMAP.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <footer className="landing-footer">
        <a href="/app">Staff Login →</a>
      </footer>
    </div>
  );
}
