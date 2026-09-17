import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import LandingPage from './LandingPage.jsx';
import { AuthProvider } from './AuthContext.jsx';
import './style.css';

// No router library — this is the one split the app needs: a static
// marketing page at "/", the staff app (login + counter) at "/app".
const isAppRoute = window.location.pathname.startsWith('/app');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isAppRoute ? (
      <AuthProvider>
        <App />
      </AuthProvider>
    ) : (
      <LandingPage />
    )}
  </StrictMode>
);
