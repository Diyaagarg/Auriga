import { useState } from 'react';
import api from './api';
import { useAuth } from './AuthContext';
import { getErrorMessage } from './errorMessage';

export default function SignupPage({ onSwitch }) {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/api/auth/register', { username, password, name, phone });
      // Sign up, then sign the new account straight in — no separate login step.
      const res = await api.post('/api/auth/login', { username, password });
      login(res.data.token, username);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page centered">
      <form className="card" onSubmit={handleSubmit}>
        <h1>Café Rewards — Staff Sign Up</h1>
        <label>
          Name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </label>
        <label>
          Phone number
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </label>
        <label>
          Username
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Signing up…' : 'Sign up'}
        </button>
        <div className="auth-links">
          <button type="button" className="link-button" onClick={() => onSwitch('login')}>
            Already have an account? Log in
          </button>
        </div>
      </form>
    </div>
  );
}
