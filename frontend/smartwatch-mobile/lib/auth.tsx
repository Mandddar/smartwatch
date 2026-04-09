import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { setOnAuthExpired } from './api';

const TOKEN_KEY = 'jwt_token';
const EMAIL_KEY = 'user_email';

interface AuthContextType {
  token: string | null;
  userEmail: string | null;
  loading: boolean;
  setAuth: (token: string | null, email: string | null) => Promise<void>;
  setToken: (t: string | null) => Promise<void>; // kept for logout compat
}

const AuthContext = createContext<AuthContextType | null>(null);

// Cross-platform storage solution
const storage = {
  async getItem(key: string): Promise<string | null> {
    try {
      if (SecureStore && SecureStore.getItemAsync) {
        return await SecureStore.getItemAsync(key);
      }
    } catch {}
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem(key);
    }
    return null;
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (SecureStore && SecureStore.setItemAsync) {
        await SecureStore.setItemAsync(key, value);
        return;
      }
    } catch {}
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(key, value);
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      if (SecureStore && SecureStore.deleteItemAsync) {
        await SecureStore.deleteItemAsync(key);
        return;
      }
    } catch {}
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(key);
    }
  },
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [userEmail, setUserEmailState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Clear auth on 401/403 from API (expired or invalid token)
  const handleAuthExpired = useCallback(() => {
    console.warn('[Auth] Token expired or invalid — signing out');
    storage.removeItem(TOKEN_KEY);
    storage.removeItem(EMAIL_KEY);
    setTokenState(null);
    setUserEmailState(null);
  }, []);

  useEffect(() => {
    setOnAuthExpired(handleAuthExpired);
  }, [handleAuthExpired]);

  useEffect(() => {
    Promise.all([
      storage.getItem(TOKEN_KEY),
      storage.getItem(EMAIL_KEY),
    ]).then(([t, e]) => {
      setTokenState(t);
      setUserEmailState(e);
      setLoading(false);
    });
  }, []);

  const setAuth = async (t: string | null, email: string | null) => {
    if (t) {
      await storage.setItem(TOKEN_KEY, t);
    } else {
      await storage.removeItem(TOKEN_KEY);
    }
    if (email) {
      await storage.setItem(EMAIL_KEY, email);
    } else {
      await storage.removeItem(EMAIL_KEY);
    }
    setTokenState(t);
    setUserEmailState(email);
  };

  // kept for backward compat (logout)
  const setToken = async (t: string | null) => {
    await setAuth(t, t === null ? null : userEmail);
  };

  return (
    <AuthContext.Provider value={{ token, userEmail, loading, setAuth, setToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
