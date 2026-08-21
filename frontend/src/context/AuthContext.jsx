import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setTokens, clearTokens } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/users/me')
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api.post('/auth/login', { email, password });
    if (data.requirePin) throw new Error('Invalid email or password');
    setTokens(data.access, data.refresh);
    setUser(data.user);
    return data.user;
  }, []);

  // Step 1 of admin login: username + password. Returns { requirePin, challenge } or the user.
  const loginAdmin = useCallback(async (identifier, password) => {
    const data = await api.post('/auth/login', { identifier, password });
    if (data.requirePin) return { requirePin: true, challenge: data.challenge };
    if (data.user) {
      setTokens(data.access, data.refresh);
      setUser(data.user);
      return data.user;
    }
    return null;
  }, []);

  // Step 2 of admin login: verify the 6-digit PIN, then issue tokens.
  const verifyAdminPin = useCallback(async (challenge, pin) => {
    const data = await api.post('/auth/pin', { challenge, pin });
    setTokens(data.access, data.refresh);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await api.post('/auth/register', payload);
    setTokens(data.access, data.refresh);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      const refresh = localStorage.getItem('tm_refresh');
      if (refresh) await api.post('/auth/logout', { refreshToken: refresh });
    } catch { /* ignore */ }
    clearTokens();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const u = await api.get('/users/me');
    setUser(u);
    return u;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, loginAdmin, verifyAdminPin, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
