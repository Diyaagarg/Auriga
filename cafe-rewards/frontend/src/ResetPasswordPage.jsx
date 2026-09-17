import { useState } from 'react';
import api from './api';
import { getErrorMessage } from './errorMessage';

export default function ResetPasswordPage({ onSwitch }) {
  const [phone, setPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await api.post('/api/auth/reset-password', { phone, newPassword });
      setSuccess(`Password updated for "${res.data.username}". You can log in with it now.`);
      setPhone('');
      setNewPassword('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page centered">
      <form className="card" onSubmit={handleSubmit}>
        <h1>Café Rewards — Reset Password</h1>
        <p className="reset-note">
          Enter the phone number on your staff account and a new password. There's no verification
          step in this build — anyone who knows the phone number can reset that account's password.
        </p>
        <label>
          Phone number
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus required />
        </label>
        <label>
          New password
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        {success && <p className="success">{success}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Updating…' : 'Reset password'}
        </button>
        <div className="auth-links">
          <button type="button" className="link-button" onClick={() => onSwitch('login')}>
            ← Back to login
          </button>
        </div>
      </form>
    </div>
  );
}
