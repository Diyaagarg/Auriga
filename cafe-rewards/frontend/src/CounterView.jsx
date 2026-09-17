import { useState } from 'react';
import api from './api';
import { getErrorMessage } from './errorMessage';

export default function CounterView() {
  const [phone, setPhone] = useState('');
  const [member, setMember] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);

  const [registerName, setRegisterName] = useState('');
  const [registerError, setRegisterError] = useState('');
  const [registering, setRegistering] = useState(false);

  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [purchaseError, setPurchaseError] = useState('');
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [lastPurchase, setLastPurchase] = useState(null);

  const [redeemAmount, setRedeemAmount] = useState('');
  const [redeemError, setRedeemError] = useState('');
  const [redeemBusy, setRedeemBusy] = useState(false);

  async function handleSearch(e) {
    e.preventDefault();
    setSearchError('');
    setRegisterError('');
    setPurchaseError('');
    setRedeemError('');
    setLastPurchase(null);
    setMember(null);
    setNotFound(false);
    if (!phone.trim()) return;

    setSearching(true);
    try {
      const res = await api.get(`/api/members/${encodeURIComponent(phone.trim())}`);
      setMember(res.data);
    } catch (err) {
      if (err?.response?.status === 404) {
        setNotFound(true);
      } else {
        setSearchError(getErrorMessage(err));
      }
    } finally {
      setSearching(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setRegisterError('');
    setRegistering(true);
    try {
      const res = await api.post('/api/members', { name: registerName.trim(), phone: phone.trim() });
      setMember(res.data);
      setNotFound(false);
      setRegisterName('');
    } catch (err) {
      setRegisterError(getErrorMessage(err));
    } finally {
      setRegistering(false);
    }
  }

  async function handlePurchase(e) {
    e.preventDefault();
    setPurchaseError('');
    setPurchaseBusy(true);
    try {
      const res = await api.post('/api/purchase', {
        phone: member.phone,
        amount: Number(purchaseAmount),
      });
      setMember((prev) => ({
        ...prev,
        lifetime_points: res.data.lifetimePoints,
        points_balance: res.data.balance,
        tier: res.data.tier,
      }));
      setLastPurchase(res.data);
      setPurchaseAmount('');
    } catch (err) {
      setPurchaseError(getErrorMessage(err));
    } finally {
      setPurchaseBusy(false);
    }
  }

  async function handleRedeem(e) {
    e.preventDefault();
    setRedeemError('');
    setRedeemBusy(true);
    try {
      const res = await api.post('/api/redeem', {
        phone: member.phone,
        points: Number(redeemAmount),
      });
      setMember((prev) => ({
        ...prev,
        lifetime_points: res.data.lifetimePoints,
        points_balance: res.data.balance,
        tier: res.data.tier,
      }));
      setRedeemAmount('');
    } catch (err) {
      setRedeemError(getErrorMessage(err));
    } finally {
      setRedeemBusy(false);
    }
  }

  return (
    <div className="page">
      <h2>Counter</h2>

      <form className="row" onSubmit={handleSearch}>
        <input
          type="text"
          placeholder="Member phone number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <button type="submit" disabled={searching}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>
      {searchError && <p className="error">{searchError}</p>}

      {notFound && (
        <div className="card">
          <p>No member found for phone {phone}.</p>
          <form className="row" onSubmit={handleRegister}>
            <input
              type="text"
              placeholder="Name for new member"
              value={registerName}
              onChange={(e) => setRegisterName(e.target.value)}
              required
            />
            <button type="submit" disabled={registering}>
              {registering ? 'Registering…' : 'Register member'}
            </button>
          </form>
          {registerError && <p className="error">{registerError}</p>}
        </div>
      )}

      {member && (
        <div className="card">
          <h3>{member.name}</h3>
          <p className="member-meta">Phone: {member.phone}</p>
          <div className="stats">
            <div>
              <span className="stat-label">Tier</span>
              <span className={`tier-badge tier-${member.tier.toLowerCase()}`}>{member.tier}</span>
            </div>
            <div>
              <span className="stat-label">Balance</span>
              <span className="stat-value">{member.points_balance} pts</span>
            </div>
            <div>
              <span className="stat-label">Lifetime points</span>
              <span className="stat-value">{member.lifetime_points} pts</span>
            </div>
          </div>

          <div className="actions">
            <form className="row" onSubmit={handlePurchase}>
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Purchase amount (Rs)"
                value={purchaseAmount}
                onChange={(e) => setPurchaseAmount(e.target.value)}
                required
              />
              <button type="submit" disabled={purchaseBusy}>
                {purchaseBusy ? 'Recording…' : 'Record Purchase'}
              </button>
            </form>
            {purchaseError && <p className="error">{purchaseError}</p>}
            {lastPurchase && (
              <p className="success">
                Earned {lastPurchase.pointsEarned} pts at {lastPurchase.tierApplied} rate.
              </p>
            )}

            <form className="row" onSubmit={handleRedeem}>
              <input
                type="number"
                min="1"
                step="1"
                placeholder="Points to redeem"
                value={redeemAmount}
                onChange={(e) => setRedeemAmount(e.target.value)}
                required
              />
              <button type="submit" disabled={redeemBusy}>
                {redeemBusy ? 'Redeeming…' : 'Redeem'}
              </button>
            </form>
            {redeemError && <p className="error">{redeemError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
