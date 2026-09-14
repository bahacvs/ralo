import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, UserRole } from '../types/index.js';
import { api, setApiToken, getApiToken, UNAUTHORIZED_EVENT } from '../services/api.js';

interface AuthContextType {
  user: User | null;
  token: string | null;
  role: UserRole;
  isLoading: boolean;
  currentRoute: string;
  routeParams: Record<string, string>;
  navigate: (to: string) => void;
  demoSwitch: (targetRole: 'OYUNCU' | 'ISLETME_SAHIBI' | 'PERSONEL') => Promise<void>;
  loginWithOtp: (phone: string, code: string) => Promise<string>;
  logout: () => Promise<void>;
  returnTo: string | null;
  setReturnTo: (path: string | null) => void;
  updateUser: (user: User) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Safe path validation for returnTo
export function isValidInternalPath(target?: string | null): boolean {
  if (!target || typeof target !== 'string') return false;
  return target.startsWith('/') && !target.startsWith('//') && !target.includes('://') && !target.includes('\\');
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [returnTo, setReturnToState] = useState<string | null>(null);

  // Router state
  const [currentRoute, setCurrentRoute] = useState<string>(() => {
    const p = window.location.pathname;
    return (p && p !== '/') ? p : '/ana';
  });
  const [routeParams, setRouteParams] = useState<Record<string, string>>({});

  // Parse route and parameters
  const updateRouteFromPath = (path: string) => {
    let cleanPath = path.split('?')[0].split('#')[0];
    if (!cleanPath || cleanPath === '/') cleanPath = '/ana';

    // Check patterns
    const sahaMatch = cleanPath.match(/^\/saha\/([^/]+)$/);
    const macMatch = cleanPath.match(/^\/acik-mac\/([^/]+)$/);
    const panelMatch = cleanPath.match(/^\/panel\/([^/]+)\/([^/]+)$/);

    const params: Record<string, string> = {};
    if (sahaMatch) {
      params.sahaId = sahaMatch[1];
    } else if (macMatch) {
      params.rezervasyonId = macMatch[1];
    } else if (panelMatch) {
      params.isletmeId = panelMatch[1];
      params.section = panelMatch[2];
    }

    setRouteParams(params);
    setCurrentRoute(cleanPath);
  };

  const navigate = (to: string) => {
    if (!isValidInternalPath(to)) {
      to = '/ana';
    }
    window.history.pushState({}, '', to);
    updateRouteFromPath(to);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const setReturnTo = (path: string | null) => {
    if (isValidInternalPath(path)) {
      setReturnToState(path);
    } else {
      setReturnToState(null);
    }
  };

  // Listen to popstate (back/forward buttons)
  useEffect(() => {
    const handlePopState = () => {
      updateRouteFromPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Fetch session on boot
  useEffect(() => {
    const initAuth = async () => {
      if (!getApiToken()) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const res = await api.getMe();
        setUser(res.user);
        setToken(res.token);
        setApiToken(res.token);
      } catch {
        // Expired or invalid session: continue as guest
        setUser(null);
        setToken(null);
      } finally {
        setIsLoading(false);
      }
    };
    initAuth();
  }, []);

  // Server rejected the session: drop it, and send the user to login if they were trying to act
  useEffect(() => {
    const handleUnauthorized = (event: Event) => {
      const method = (event as CustomEvent<{ method: string }>).detail?.method;
      setUser(null);
      setToken(null);
      const here = window.location.pathname;
      if (method !== 'GET' && here !== '/giris') {
        setReturnTo(here);
        navigate('/giris');
      }
    };
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, []);

  const demoSwitch = async (targetRole: 'OYUNCU' | 'ISLETME_SAHIBI' | 'PERSONEL') => {
    setIsLoading(true);
    try {
      const res = await api.demoSwitch(targetRole);
      setUser(res.user);
      setToken(res.token);
      setApiToken(res.token);

      // Route accordingly
      if (targetRole === 'ISLETME_SAHIBI' || targetRole === 'PERSONEL') {
        const bId = res.user.businessId || 'biz_urla';
        navigate(`/panel/${bId}/takvim`);
      } else {
        navigate('/ana');
      }
    } catch (err) {
      console.error('Demo switch failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithOtp = async (phone: string, code: string): Promise<string> => {
    const safeTarget = isValidInternalPath(returnTo) ? returnTo! : '/ana';
    const res = await api.verifyOtp(phone, code, safeTarget);
    setUser(res.user);
    setToken(res.token);
    setApiToken(res.token);
    setReturnToState(null);

    const destination = (res.user.role === 'ISLETME_SAHIBI' || res.user.role === 'PERSONEL')
      ? `/panel/${res.user.businessId || 'biz_urla'}/takvim`
      : res.returnTo || '/ana';

    navigate(destination);
    return destination;
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // Ignore
    }
    setUser(null);
    setToken(null);
    setApiToken(null);
    navigate('/giris');
  };

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
  };

  const refreshUser = async () => {
    try {
      const res = await api.getMe();
      if (res?.user) {
        setUser(res.user);
      }
    } catch {
      // ignore
    }
  };

  const role: UserRole = user?.role || 'OYUNCU';

  return (
    <AuthContext.Provider value={{
      user,
      token,
      role,
      isLoading,
      currentRoute,
      routeParams,
      navigate,
      demoSwitch,
      loginWithOtp,
      logout,
      returnTo,
      setReturnTo,
      updateUser,
      refreshUser
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
