import { useState, useEffect } from 'react';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export const useAuth = () => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  useEffect(() => {
    // Simulate checking for existing auth token
    const checkAuth = async () => {
      try {
        // This would normally check localStorage/cookies and validate with server
        const token = localStorage.getItem('authToken');
        
        if (token) {
          // In a real app, validate token with server
          // For now, simulate authenticated state
          setAuthState({
            user: {
              id: '1',
              email: 'demo@appliedmindfulness.com',
              firstName: 'Demo',
              lastName: 'User',
              role: 'student'
            },
            isLoading: false,
            isAuthenticated: true,
          });
        } else {
          setAuthState({
            user: null,
            isLoading: false,
            isAuthenticated: false,
          });
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        setAuthState({
          user: null,
          isLoading: false,
          isAuthenticated: false,
        });
      }
    };

    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      // This would normally make an API call
      console.log('Login attempt:', { email, password });
      // Simulate successful login
      localStorage.setItem('authToken', 'demo-token');
      setAuthState({
        user: {
          id: '1',
          email,
          firstName: 'Demo',
          lastName: 'User',
          role: 'student'
        },
        isLoading: false,
        isAuthenticated: true,
      });
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    setAuthState({
      user: null,
      isLoading: false,
      isAuthenticated: false,
    });
  };

  return {
    user: authState.user,
    isLoading: authState.isLoading,
    isAuthenticated: authState.isAuthenticated,
    login,
    logout,
  };
};