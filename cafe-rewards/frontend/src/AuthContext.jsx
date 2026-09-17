import { createContext, useContext, useState, useCallback } from 'react';
import { setAuthToken } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Token lives only in React state — never persisted to localStorage, so a
  // page refresh logs the user out. That's intentional per the "in memory"
  // requirement, keeping this minimal (no refresh tokens, no session store).
  const [token, setToken] = useState(null);
  const [username, setUsername] = useState(null);

  const login = useCallback((newToken, newUsername) => {
    setToken(newToken);
    setUsername(newUsername);
    setAuthToken(newToken);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUsername(null);
    setAuthToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, username, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
