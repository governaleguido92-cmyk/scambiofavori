import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, User, CURRENCY_NAME } from '../services/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  legalAccepted: boolean;
  showLegalModal: boolean;
  showOnboarding: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, referralCode?: string) => Promise<{ requiresVerification: boolean; userId?: string }>;
  verifyEmail: (userId: string, code: string) => Promise<void>;
  exchangeSessionId: (sessionId: string) => Promise<void>;
  loginWithToken: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  acceptLegal: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  deleteAccount: (confirmEmail: string, reason?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const saveToken = async (newToken: string) => {
    await AsyncStorage.setItem('token', newToken);
    setToken(newToken);
  };

  const clearToken = async () => {
    await AsyncStorage.removeItem('token');
    setToken(null);
  };

  const checkLegalStatus = useCallback(async (authToken: string) => {
    try {
      const status = await api.getLegalStatus(authToken);
      setLegalAccepted(status.legal_accepted);
      setShowLegalModal(!status.legal_accepted);
    } catch (error) {
      console.log('Error checking legal status:', error);
      setShowLegalModal(true);
    }
  }, []);

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
          try {
            const userData = await api.getMe(storedToken);
            setUser(userData);
            await checkLegalStatus(storedToken);
          } catch (apiError) {
            console.log('API error during auth check:', apiError);
            // Token might be invalid, clear it
            await clearToken();
          }
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
    await checkLegalStatus(response.token);
  };

  const register = async (email: string, password: string, name: string, referralCode?: string): Promise<void> => {
    const response = await api.register(email, password, name, referralCode);
    await saveToken(response.token!);
    setUser(response.user!);
    // New users always need to accept legal terms
    setLegalAccepted(false);
    setShowLegalModal(true);
  };

  const exchangeSessionId = async (sessionId: string) => {
    const response = await api.exchangeSession(sessionId);
    await saveToken(response.token);
    setUser(response.user);
    await checkLegalStatus(response.token);
  };

  const loginWithToken = async (newToken: string, newUser: User) => {
    await saveToken(newToken);
    setUser(newUser);
    await checkLegalStatus(newToken);
  };

  const acceptLegal = async () => {
    if (!token) {
      // Nessun token - chiudi comunque il modal
      setShowLegalModal(false);
      return;
    }
    
    try {
      // Timeout di 10 secondi per evitare blocchi infiniti
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 10000)
      );
      
      await Promise.race([
        api.acceptLegalTerms(token),
        timeoutPromise
      ]);
      
      // Successo - chiudi il modal
      setLegalAccepted(true);
      setShowLegalModal(false);
      
      // Controlla se l'utente ha già visto l'onboarding
      const hasSeenOnboarding = await AsyncStorage.getItem('hasSeenOnboarding');
      if (!hasSeenOnboarding) {
        setShowOnboarding(true);
      }
    } catch (error) {
      console.error('Error accepting legal terms:', error);
      // Anche in caso di errore, chiudi il modal per non bloccare l'utente
      setLegalAccepted(true);
      setShowLegalModal(false);
      
      // Mostra comunque l'onboarding se non l'ha mai visto
      const hasSeenOnboarding = await AsyncStorage.getItem('hasSeenOnboarding');
      if (!hasSeenOnboarding) {
        setShowOnboarding(true);
      }
    }
  };

  const completeOnboarding = async () => {
    await AsyncStorage.setItem('hasSeenOnboarding', 'true');
    setShowOnboarding(false);
  };

  const deleteAccount = async (confirmEmail: string, reason?: string) => {
    if (!token) return;
    try {
      await api.deleteAccount(confirmEmail, reason, token);
      await clearToken();
      setUser(null);
      setLegalAccepted(false);
    } catch (error) {
      console.log('Error deleting account:', error);
      throw error;
    }
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
    setLegalAccepted(false);
    setShowLegalModal(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        legalAccepted,
        showLegalModal,
        showOnboarding,
        login,
        register,
        verifyEmail,
        exchangeSessionId,
        loginWithToken,
        logout,
        refreshUser,
        acceptLegal,
        completeOnboarding,
        deleteAccount,
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
