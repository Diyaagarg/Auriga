import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000',
});

// The token lives in React state (see AuthContext); this module just needs a
// place to read it from when attaching the Authorization header.
let authToken = null;

export function setAuthToken(token) {
  authToken = token;
}

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

export default api;
