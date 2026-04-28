'use client';
import { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const stored = api.getUser();
    const token = api.getToken();
    if (stored && token) {
      setUser(stored);
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const res = await api.login(email, password);
    setUser(res.user);
    return res;
  };

  const register = async (data) => {
    const res = await api.register(data);
    setUser(res.user);
    return res;
  };

  const logout = () => {
    api.clearToken();
    setUser(null);
    router.push('/auth/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be within AuthProvider');
  return ctx;
}
