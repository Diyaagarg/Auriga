import { useState } from 'react';
import LoginPage from './LoginPage';
import SignupPage from './SignupPage';
import ResetPasswordPage from './ResetPasswordPage';

// Switches between login/signup/reset with local state, not a route — same
// pattern the authenticated app already uses for its Counter/All Members
// tabs, so there's no need for a router just for this.
export default function AuthFlow() {
  const [view, setView] = useState('login'); // 'login' | 'signup' | 'reset'

  if (view === 'signup') return <SignupPage onSwitch={setView} />;
  if (view === 'reset') return <ResetPasswordPage onSwitch={setView} />;
  return <LoginPage onSwitch={setView} />;
}
