import { create } from 'zustand';
import { Role } from '@supportstream/shared-types';

interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  role: Role;
}

interface AuthState {
  token: string | null;
  user: UserProfile | null;
  setAuth: (token: string, user: UserProfile) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => {
  // Read initial values from localStorage (safe SSR check)
  const isClient = typeof window !== 'undefined';
  const initialToken = isClient ? localStorage.getItem('supportstream_token') : null;
  const initialUser = isClient ? localStorage.getItem('supportstream_user') : null;

  return {
    token: initialToken,
    user: initialUser ? JSON.parse(initialUser) : null,
    
    setAuth: (token, user) => {
      if (isClient) {
        localStorage.setItem('supportstream_token', token);
        localStorage.setItem('supportstream_user', JSON.stringify(user));
      }
      set({ token, user });
    },
    
    logout: () => {
      if (isClient) {
        localStorage.removeItem('supportstream_token');
        localStorage.removeItem('supportstream_user');
      }
      set({ token: null, user: null });
    },
    
    isAuthenticated: () => {
      return !!get().token;
    },
  };
});
