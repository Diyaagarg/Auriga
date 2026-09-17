// Ordered ascending by threshold. multiplierNum/Den keep the earn-rate as an
// exact fraction so points math stays integer-only (no float rounding drift).
const TIERS = [
  { name: 'Base', minLifetimePoints: 0, multiplierNum: 1, multiplierDen: 1 },
  { name: 'Silver', minLifetimePoints: 500, multiplierNum: 3, multiplierDen: 2 },
  { name: 'Gold', minLifetimePoints: 2000, multiplierNum: 2, multiplierDen: 1 },
  // 0.3 pts per Re 1 == 3 pts per Rs 10 == 3x the Base rate.
  { name: 'Platinum', minLifetimePoints: 5000, multiplierNum: 3, multiplierDen: 1 },
];

function getTier(lifetimePoints) {
  let current = TIERS[0];
  for (const tier of TIERS) {
    if (lifetimePoints >= tier.minLifetimePoints) current = tier;
  }
  return current;
}

// amountRupees: number of rupees spent (may have paise, e.g. 149.50).
// Base rate is 1 point per Rs 10; tier multiplier is applied on top, floored once.
function pointsForPurchase(amountRupees, tier) {
  const amountPaise = Math.round(amountRupees * 100);
  return Math.floor((amountPaise * tier.multiplierNum) / (1000 * tier.multiplierDen));
}

// Builds a SQL CASE expression ranking tier by lifetime points (Base=0,
// Silver=1, Gold=2, ...) so `ORDER BY` can sort by tier without a stored
// column. Generated from TIERS itself so the SQL ranking can never drift
// out of sync with getTier() above.
function tierRankSql(column) {
  const whens = [...TIERS]
    .filter((tier) => tier.minLifetimePoints > 0)
    .sort((a, b) => b.minLifetimePoints - a.minLifetimePoints)
    .map((tier) => `WHEN ${column} >= ${tier.minLifetimePoints} THEN ${TIERS.indexOf(tier)}`)
    .join(' ');
  return `CASE ${whens} ELSE 0 END`;
}

module.exports = { TIERS, getTier, pointsForPurchase, tierRankSql };
