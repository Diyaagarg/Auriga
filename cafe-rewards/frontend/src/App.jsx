import { useState } from 'react';
import { useAuth } from './AuthContext';
import AuthFlow from './AuthFlow';
import CounterView from './CounterView';
import MembersTable from './MembersTable';

export default function App() {
  const { token, username, logout } = useAuth();
  const [tab, setTab] = useState('counter');

  if (!token) {
    return <AuthFlow />;
  }

  return (
    <div>
      <header className="topbar">
        <div>
          <strong>Café Rewards</strong>
          <nav>
            <button className={tab === 'counter' ? 'active' : ''} onClick={() => setTab('counter')}>
              Counter
            </button>
            <button className={tab === 'members' ? 'active' : ''} onClick={() => setTab('members')}>
              All Members
            </button>
          </nav>
        </div>
        <div>
          <span className="username">{username}</span>
          <button onClick={logout}>Log out</button>
        </div>
      </header>

      {tab === 'counter' ? <CounterView /> : <MembersTable />}
    </div>
  );
}
