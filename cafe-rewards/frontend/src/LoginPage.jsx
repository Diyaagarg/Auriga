import { useState } from 'react';
import api from './api';
import { useAuth } from './AuthContext';
import { getErrorMessage } from './errorMessage';

export default function LoginPage({ onSwitch }) {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
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
        <h1>Café Rewards — Staff Login</h1>
        <label>
          Username
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Logging in…' : 'Log in'}
        </button>
        <div className="auth-links">
          <button type="button" className="link-button" onClick={() => onSwitch('signup')}>
            New staff? Sign up
          </button>
          <button type="button" className="link-button" onClick={() => onSwitch('reset')}>
            Forgot password?
          </button>
        </div>
        <a className="back-link" href="/">
          ← Back to home
        </a>
      </form>
    </div>
  );
}
