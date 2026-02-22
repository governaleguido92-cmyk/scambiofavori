import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, User, CURRENCY_NAME } from '../services/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, referralCode?: string) => Promise<void>;
  exchangeSessionId: (sessionId: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const saveToken = async (newToken: string) => {
    await AsyncStorage.setItem('token', newToken);
    setToken(newToken);
  };

  const clearToken = async () => {
    await AsyncStorage.removeItem('token');
    setToken(null);
  };

  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      const userData = await api.getMe(token);
      setUser(userData);
    } catch (error) {
      console.log('Error refreshing user:', error);
    }
  }, [token]);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const storedToken = await AsyncStorage.getItem('token');
        if (storedToken) {
          setToken(storedToken);
          const userData = await api.getMe(storedToken);
          setUser(userData);
        }
      } catch (error) {
        console.log('Auth check error:', error);
        await clearToken();
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await api.login(email, password);
    await saveToken(response.token);
    setUser(response.user);
  };

  const register = async (email: string, password: string, name: string, referralCode?: string) => {
    const response = await api.register(email, password, name, referralCode);
    await saveToken(response.token);
    setUser(response.user);
  };

  const exchangeSessionId = async (sessionId: string) => {
    const response = await api.exchangeSession(sessionId);
    await saveToken(response.token);
    setUser(response.user);
  };

  const logout = async () => {
    try {
      if (token) {
        await api.logout(token);
      }
    } catch (error) {
      console.log('Logout error:', error);
    }
    await clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        register,
        exchangeSessionId,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Export currency name for use in components
export { CURRENCY_NAME };
