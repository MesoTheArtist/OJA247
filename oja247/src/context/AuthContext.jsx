import React, { createContext, useState, useContext, useEffect } from 'react';
import axiosInstance from '../services/api';
import { clearCsrfToken } from '../services/csrf';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [business, setBusiness] = useState(null);
  const [authRole, setAuthRole] = useState(localStorage.getItem('authRole') || 'vendor');
  const [token, setToken] = useState(Boolean(localStorage.getItem('authRole')));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('marketerToken');
    if (token) {
      loadUser();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const loadUser = async () => {
    try {
      if (authRole === 'customer') {
        const response = await axiosInstance.get('/api/customer-auth/me');
        setUser(response.data);
        setBusiness(null);
      } else {
        const response = await axiosInstance.get('/api/auth/me');
        setUser(response.data.user);
        setBusiness(response.data.business);
      }
    } catch (error) {
      console.error('Load user error:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const register = async (email, password, businessData, referralCodeUsed = null, acceptedSellerTerms = false) => {
    try {
      const response = await axiosInstance.post('/api/auth/register', {
        email,
        password,
        businessData,
        referralCodeUsed,
        acceptedSellerTerms
      });

      const { user, business } = response.data;

      localStorage.setItem('authRole', 'vendor');
      setAuthRole('vendor');
      setToken(true);
      setUser(user);
      setBusiness(business);

      return { success: true, business };
    } catch (error) {
      const backendMessage = error.response?.data?.message;
      const backendDetails = error.response?.data?.details;

      return {
        success: false,
        message: backendMessage || backendDetails || error.message || 'Registration failed'
      };
    }
  };

  const login = async (email, password) => {
    try {
      const response = await axiosInstance.post('/api/auth/login', {
        email,
        password
      });

      // Admin accounts route through TOTP before a real session starts —
      // no token yet, just a short-lived preAuthToken the caller uses to
      // finish setup or submit a code (see LoginPage.jsx).
      if (response.data.requiresTotpSetup || response.data.requiresTotpCode) {
        return {
          success: true,
          requiresTotpSetup: response.data.requiresTotpSetup || false,
          requiresTotpCode: response.data.requiresTotpCode || false,
          preAuthToken: response.data.preAuthToken
        };
      }

      const { user, business } = response.data;

      localStorage.setItem('authRole', 'vendor');
      setAuthRole('vendor');
      setToken(true);
      setUser(user);
      setBusiness(business);

      return { success: true, user, business };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Login failed'
      };
    }
  };

  // Google Sign-In — login only, matches an existing account by the
  // verified email in the Google credential. Mirrors login()'s response
  // handling exactly (including the admin TOTP branch) so LoginPage.jsx
  // can reuse the same downstream code either way.
  const googleLogin = async (credential) => {
    try {
      const response = await axiosInstance.post('/api/auth/google', { credential });

      if (response.data.requiresTotpSetup || response.data.requiresTotpCode) {
        return {
          success: true,
          requiresTotpSetup: response.data.requiresTotpSetup || false,
          requiresTotpCode: response.data.requiresTotpCode || false,
          preAuthToken: response.data.preAuthToken
        };
      }

      const { user, business } = response.data;

      localStorage.setItem('authRole', 'vendor');
      setAuthRole('vendor');
      setToken(true);
      setUser(user);
      setBusiness(business);

      return { success: true, user, business };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Google sign-in failed'
      };
    }
  };

  // --- Customer auth ---
  // Customers and vendors share the HttpOnly session cookie; authRole only
  // selects the correct /me endpoint after a page refresh.

  const customerRegister = async (email, password, fullName, phone) => {
    try {
      const response = await axiosInstance.post('/api/customer-auth/register', {
        email,
        password,
        fullName,
        phone,
      });

      const { user } = response.data;
      localStorage.setItem('authRole', 'customer');
      setAuthRole('customer');
      setToken(true);
      setUser(user);
      setBusiness(null);

      return { success: true, user };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Registration failed',
      };
    }
  };

  const customerLogin = async (email, password) => {
    try {
      const response = await axiosInstance.post('/api/customer-auth/login', { email, password });

      const { user } = response.data;
      localStorage.setItem('authRole', 'customer');
      setAuthRole('customer');
      setToken(true);
      setUser(user);
      setBusiness(null);

      return { success: true, user };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Login failed',
      };
    }
  };

  // Unlike the vendor googleLogin above, this auto-creates an account on
  // first click — see customerAuthController.js's customerGoogleAuth for
  // why (no separate "sign up first" step for customers).
  const customerGoogleLogin = async (credential) => {
    try {
      const response = await axiosInstance.post('/api/customer-auth/google', { credential });

      const { user } = response.data;
      localStorage.setItem('authRole', 'customer');
      setAuthRole('customer');
      setToken(true);
      setUser(user);
      setBusiness(null);

      return { success: true, user };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Google sign-in failed',
      };
    }
  };

  // Fetches the QR code for an admin setting up TOTP for the first time.
  // Uses preAuthToken explicitly, not the (nonexistent yet) session token.
  const getTotpSetupQr = async (preAuthToken) => {
    try {
      const response = await axiosInstance.post(
        '/api/auth/totp/setup-init',
        {},
        { headers: { Authorization: `Bearer ${preAuthToken}` } }
      );
      return { success: true, ...response.data };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Could not load 2FA setup' };
    }
  };

  // Confirms TOTP setup with a code from the authenticator app — on
  // success this is what actually completes login and issues a real token.
  const completeTotpSetup = async (preAuthToken, code) => {
    try {
      const response = await axiosInstance.post(
        '/api/auth/totp/setup-verify',
        { code },
        { headers: { Authorization: `Bearer ${preAuthToken}` } }
      );
      const { user, business } = response.data;
      localStorage.setItem('authRole', 'vendor');
      setAuthRole('vendor');
      setToken(true);
      setUser(user);
      setBusiness(business);
      return { success: true, user, business };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Invalid code' };
    }
  };

  // Normal-login TOTP step for an admin who already has 2FA enabled.
  const verifyTotpLogin = async (preAuthToken, code) => {
    try {
      const response = await axiosInstance.post(
        '/api/auth/totp/verify',
        { code },
        { headers: { Authorization: `Bearer ${preAuthToken}` } }
      );
      const { user, business } = response.data;
      localStorage.setItem('authRole', 'vendor');
      setAuthRole('vendor');
      setToken(true);
      setUser(user);
      setBusiness(business);
      return { success: true, user, business };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Invalid code' };
    }
  };

  const logout = () => {
    axiosInstance.post('/api/auth/logout').catch(() => {});
    clearCsrfToken();
    localStorage.removeItem('token');
    localStorage.removeItem('authRole');
    setToken(null);
    setAuthRole('vendor');
    setUser(null);
    setBusiness(null);
  };

  const updatePassword = async (currentPassword, newPassword) => {
    try {
      await axiosInstance.put('/api/auth/password', {
        currentPassword,
        newPassword
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Password update failed'
      };
    }
  };

  const value = {
    user,
    business,
    token,
    authRole,
    loading,
    register,
    login,
    googleLogin,
    customerRegister,
    customerLogin,
    customerGoogleLogin,
    // Re-reads the signed-in user from the API, e.g. after they confirm their
    // email in another tab so emailVerified updates without a reload.
    refreshUser: loadUser,
    logout,
    updatePassword,
    getTotpSetupQr,
    completeTotpSetup,
    verifyTotpLogin,
    isAuthenticated: !!token,
    isCustomer: !!token && authRole === 'customer',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};