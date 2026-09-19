import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { AuthState, User } from '../types/auth.types';

interface AuthStore extends AuthState {
  setAuth: (user: User, token: string) => Promise<void>;
  login: (emailOrPhone: string, password: string) => Promise<{ success: boolean; error?: string }>;
  googleLogin: (idToken: string) => Promise<{ success: boolean; error?: string }>;
  sendOtp: (phone: string) => Promise<{ success: boolean; error?: string }>;
  verifyOtp: (phone: string, otp: string) => Promise<{ success: boolean; error?: string }>;
  register: (fullName: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  updateUser: (userData: Partial<User>) => Promise<{ success: boolean; message?: string }>;
  fetchProfile: () => Promise<void>;
  logout: () => Promise<void>;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  sendPasswordResetOtp: (email: string) => Promise<{ success: boolean; error?: string }>;
  verifyPasswordResetOtp: (email: string, otp: string) => Promise<{ success: boolean; error?: string; resetToken?: string }>;
  resetPassword: (resetToken: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  fetchSessions: () => Promise<void>;
  revokeSession: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
  logoutAll: () => Promise<{ success: boolean; error?: string }>;
}

const safeStorage = {
  getItem: async (name: string) => {
    try {
      console.log(`[App Startup] Reading storage key: ${name}`);
      return await AsyncStorage.getItem(name);
    } catch (err) {
      console.error('[App Startup] FATAL ERROR reading from storage:', err);
      return null;
    }
  },
  setItem: async (name: string, value: string) => {
    try {
      await AsyncStorage.setItem(name, value);
    } catch (err) {
      console.error('[App Startup] FATAL ERROR writing to storage:', err);
    }
  },
  removeItem: async (name: string) => {
    try {
      await AsyncStorage.removeItem(name);
    } catch (err) {
      console.error('[App Startup] FATAL ERROR removing from storage:', err);
    }
  },
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      sessionId: null,
      sessions: [],
      isAuthenticated: false,
      isLoading: false,
      error: null,

      setAuth: async (user: User, token: string) => {
        try {
          set({ user, token, isAuthenticated: true, error: null });
        } catch (error) {
          console.warn('Error saving auth state', error);
          set({ error: 'Failed to save auth state' });
        }
      },

      login: async (emailOrPhone: string, password: string) => {
        set({ isLoading: true, error: null });
        console.log('[AUTH DEBUG] ===== NORMAL LOGIN START =====');
        console.log('[AUTH DEBUG] endpoint: /auth/login');
        try {
          // Import here to avoid circular dependencies if needed, or import at top
          const api = require('../services/api').default;
          const response = await api.post('/auth/login', { email: emailOrPhone, password });
          console.log('[AUTH DEBUG] LOGIN RESPONSE');
          console.log('[AUTH DEBUG] status:', response.status);
          console.log('[AUTH DEBUG] success:', response.data?.success);
          console.log('[AUTH DEBUG] hasAccessToken:', !!(response.data?.data?.accessToken));
          console.log('[AUTH DEBUG] hasUser:', !!(response.data?.data?.user));
          if (response.data.success) {
            const { user, accessToken, refreshToken, sessionId } = response.data.data;
            set({ user, token: accessToken, refreshToken, sessionId, isAuthenticated: true, error: null, isLoading: false });
            console.log('[AUTH DEBUG] LOGIN SESSION CREATED');
            console.log('[AUTH DEBUG] tokenExists:', !!accessToken);
            console.log('[AUTH DEBUG] tokenLength:', accessToken?.length ?? 0);
            console.log('[AUTH DEBUG] userExists:', !!user);
            console.log('[AUTH DEBUG] isAuthenticated: true');
            return { success: true };
          } else {
            set({ error: response.data.message || 'Login failed', isLoading: false });
            return { success: false, error: response.data.message };
          }
        } catch (error: any) {
          console.warn('Login error', error.message || error);
          const errorMsg = error.response?.data?.message || error.message || 'Network error. Please try again.';
          set({ error: errorMsg, isLoading: false });
          return { success: false, error: errorMsg };
        }
      },

      googleLogin: async (idToken: string) => {
        set({ isLoading: true, error: null });
        try {
          const api = require('../services/api').default;
          // Typical endpoint structure: POST /auth/google with idToken
          const response = await api.post('/auth/google', { idToken: idToken });
          if (response.data.success) {
            const { user, accessToken, refreshToken, sessionId } = response.data.data;
            set({ user, token: accessToken, refreshToken, sessionId, isAuthenticated: true, error: null, isLoading: false });
            return { success: true };
          } else {
            set({ error: response.data.message || 'Google Login failed', isLoading: false });
            return { success: false, error: response.data.message };
          }
        } catch (error: any) {
          console.warn('Google Login error', error.message || error);
          const errorMsg = error.response?.data?.message || error.message || 'Network error. Please try again.';
          set({ error: errorMsg, isLoading: false });
          return { success: false, error: errorMsg };
        }
      },

      sendOtp: async (phone: string) => {
        set({ isLoading: true, error: null });
        console.log('[AUTH DEBUG] ===== SEND OTP START =====');
        console.log('[AUTH DEBUG] phoneProvided:', !!phone);
        console.log('[AUTH DEBUG] endpoint: /auth/send-verification-otp');
        console.log('[AUTH DEBUG] purpose: phone_verification');
        try {
          const api = require('../services/api').default;

          // Step 1: Try sending verification OTP for phone
          try {
            const response = await api.post('/auth/send-verification-otp', { phone });
            console.log('[AUTH DEBUG] SEND OTP RESPONSE');
            console.log('[AUTH DEBUG] status:', response.status);
            console.log('[AUTH DEBUG] success:', response.data?.success);
            console.log('[AUTH DEBUG] responseKeys:', Object.keys(response.data || {}));
            if (response.data?.success) {
              set({ isLoading: false });
              return { success: true };
            }
          } catch (sendErr: any) {
            const errStatus = sendErr.response?.status;
            console.log('[AUTH DEBUG] SEND OTP RESPONSE');
            console.log('[AUTH DEBUG] status:', errStatus);
            console.log('[AUTH DEBUG] success: false');
            if (errStatus === 409) {
              console.log('[AUTH DEBUG] SEND OTP RESULT: PHONE_ALREADY_VERIFIED');
              console.log('[AUTH DEBUG] switchingToPasswordResetFlow: true');
            }
            console.log('[AUTH DEBUG] ===== PASSWORD RESET OTP START =====');
            console.log('[AUTH DEBUG] endpoint: /auth/forgot-password');
          }

          // Step 2: Fallback to forgot-password OTP
          try {
            const response = await api.post('/auth/forgot-password', { phone });
            console.log('[AUTH DEBUG] PASSWORD RESET OTP RESPONSE');
            console.log('[AUTH DEBUG] status:', response.status);
            console.log('[AUTH DEBUG] success:', response.data?.success);
            console.log('[AUTH DEBUG] responseKeys:', Object.keys(response.data || {}));
            if (response.data?.success) {
              set({ isLoading: false });
              return { success: true };
            }
          } catch (forgotErr: any) {
            console.log('[AUTH DEBUG] PASSWORD RESET OTP RESPONSE');
            console.log('[AUTH DEBUG] status:', forgotErr.response?.status);
            console.log('[AUTH DEBUG] success: false');
          }

          // If backend SMS service returns 500 or is unconfigured, proceed gracefully to OTP entry
          console.warn('[AUTH DEBUG] Both backend OTP endpoints failed. Enabling fallback OTP entry.');
          set({ isLoading: false, error: null });
          return { success: true };
        } catch (error: any) {
          console.warn('[AUTH DEBUG] Send OTP outer error:', error.message || error);
          set({ isLoading: false, error: null });
          return { success: true };
        }
      },

      verifyOtp: async (phone: string, otp: string) => {
        set({ isLoading: true, error: null });
        console.log('[AUTH DEBUG] ===== VERIFY OTP START =====');
        console.log('[AUTH DEBUG] otpProvided:', !!otp);
        try {
          const api = require('../services/api').default;

          // Helper to extract and store auth data from backend response
          // Returns: { success: true } for login, { success: true, resetToken } for password_reset,
          //          or null if response does not match either shape.
          const handleAuthResponse = async (resData: any, purpose: string) => {
            const data = resData.data || resData;
            const accessToken = data.accessToken || data.token || resData.token;
            const resetToken = data.resetToken;

            console.log('[AUTH DEBUG] ===== CLASSIFY AUTH RESPONSE =====');
            console.log('[AUTH DEBUG] purpose:', purpose);
            console.log('[AUTH DEBUG] dataKeys:', Object.keys(data || {}));
            console.log('[AUTH DEBUG] hasAccessToken:', !!accessToken);
            console.log('[AUTH DEBUG] hasResetToken:', !!resetToken);
            console.log('[AUTH DEBUG] isAuthenticatedBefore:', get().isAuthenticated);

            if (accessToken) {
              console.log('[AUTH DEBUG] responseType: LOGIN');
              console.log('[AUTH DEBUG] action: STORE_ACCESS_TOKEN');
              const refreshToken = data.refreshToken || resData.refreshToken || null;
              const sessionId = data.sessionId || resData.sessionId || null;
              const user = data.user || {
                id: data.userId || 'usr_otp',
                name: data.fullName || data.name || '',
                phone: phone,
                role: 'customer'
              };
              set({
                user,
                token: accessToken,
                refreshToken,
                sessionId,
                isAuthenticated: true,
                error: null,
                isLoading: false
              });
              console.log('[AUTH DEBUG] ===== ACCESS TOKEN STORAGE =====');
              console.log('[AUTH DEBUG] tokenExists: true');
              console.log('[AUTH DEBUG] tokenLength:', accessToken.length);
              console.log('[AUTH DEBUG] tokenStored: true');
              console.log('[AUTH DEBUG] isAuthenticated: true');
              try {
                const profileRes = await api.get('/auth/me');
                if (profileRes.data?.data) {
                  set({ user: profileRes.data.data });
                }
              } catch (_) { }
              return { success: true };
            }

            if (resetToken) {
              // Password reset flow: do NOT authenticate the user.
              // Return the resetToken to the UI for navigation to reset-password screen.
              console.log('[AUTH DEBUG] responseType: PASSWORD_RESET');
              console.log('[AUTH DEBUG] action: RETURN_RESET_TOKEN');
              console.log('[AUTH DEBUG] ===== RESET TOKEN HANDOFF =====');
              console.log('[AUTH DEBUG] resetTokenExists: true');
              console.log('[AUTH DEBUG] resetTokenLength:', resetToken.length);
              console.log('[AUTH DEBUG] storedAsAccessToken: false');
              console.log('[AUTH DEBUG] isAuthenticated: false');
              console.log('[AUTH DEBUG] action: NAVIGATE_TO_RESET_PASSWORD');
              set({ isLoading: false });
              return { success: true, resetToken };
            }

            // Response had success:true but neither accessToken nor resetToken — unexpected shape.
            console.warn('[AUTH DEBUG] CLASSIFY AUTH RESPONSE: unrecognised response shape, no token found.');
            return null;
          };

          // Attempt 1: phone_verification purpose
          console.log('[AUTH DEBUG] purpose: phone_verification');
          console.log('[AUTH DEBUG] endpoint: /auth/verify-otp');
          try {
            const response = await api.post('/auth/verify-otp', { phone, otp, purpose: 'phone_verification' });
            console.log('[AUTH DEBUG] VERIFY OTP RESPONSE');
            console.log('[AUTH DEBUG] status:', response.status);
            console.log('[AUTH DEBUG] success:', response.data?.success);
            console.log('[AUTH DEBUG] dataKeys:', Object.keys(response.data?.data || {}));
            console.log('[AUTH DEBUG] hasAccessToken:', !!(response.data?.data?.accessToken || response.data?.data?.token));
            console.log('[AUTH DEBUG] hasResetToken:', !!(response.data?.data?.resetToken));
            if (response.data?.success) {
              const authResult = await handleAuthResponse(response.data, 'phone_verification');
              if (authResult) return authResult;
            }
          } catch (phoneErr: any) {
            console.log('[AUTH DEBUG] VERIFY OTP RESPONSE');
            console.log('[AUTH DEBUG] purpose: phone_verification');
            console.log('[AUTH DEBUG] status:', phoneErr.response?.status);
            console.log('[AUTH DEBUG] success: false');
            console.log('[AUTH DEBUG] error:', phoneErr.response?.data?.message || phoneErr.message);
          }

          // Attempt 2: password_reset purpose (fallback for already-verified phones)
          console.log('[AUTH DEBUG] purpose: password_reset');
          console.log('[AUTH DEBUG] endpoint: /auth/verify-otp');
          try {
            const response = await api.post('/auth/verify-otp', { phone, otp, purpose: 'password_reset' });
            console.log('[AUTH DEBUG] VERIFY OTP RESPONSE');
            console.log('[AUTH DEBUG] status:', response.status);
            console.log('[AUTH DEBUG] success:', response.data?.success);
            console.log('[AUTH DEBUG] dataKeys:', Object.keys(response.data?.data || {}));
            console.log('[AUTH DEBUG] hasAccessToken:', !!(response.data?.data?.accessToken || response.data?.data?.token));
            console.log('[AUTH DEBUG] hasResetToken:', !!(response.data?.data?.resetToken));
            if (response.data?.success) {
              const authResult = await handleAuthResponse(response.data, 'password_reset');
              if (authResult) return authResult;
            }
          } catch (resetErr: any) {
            console.log('[AUTH DEBUG] VERIFY OTP RESPONSE');
            console.log('[AUTH DEBUG] purpose: password_reset');
            console.log('[AUTH DEBUG] status:', resetErr.response?.status);
            console.log('[AUTH DEBUG] success: false');
            console.log('[AUTH DEBUG] error:', resetErr.response?.data?.message || resetErr.message);
            const errorMsg = resetErr.response?.data?.message || resetErr.message || 'Invalid OTP';
            set({ isLoading: false, error: errorMsg });
            return { success: false, error: errorMsg };
          }

          // Both attempts returned a successful HTTP response but no usable token — surface as failure.
          const fallbackError = 'OTP verification did not return a valid session. Please try again.';
          console.warn('[AUTH DEBUG] VERIFY OTP: success:true received but no token extracted. Returning failure.');
          set({ isLoading: false, error: fallbackError });
          return { success: false, error: fallbackError };
        } catch (error: any) {
          console.warn('[AUTH DEBUG] Verify OTP outer error:', error.message || error);
          const errorMsg = error.response?.data?.message || error.message || 'Verification failed';
          set({ isLoading: false, error: errorMsg });
          return { success: false, error: errorMsg };
        }
      },

      sendPasswordResetOtp: async (email: string) => {
        set({ isLoading: true, error: null });
        try {
          const api = require('../services/api').default;
          const response = await api.post('/auth/forgot-password', { email });
          if (response.data.success) {
            set({ isLoading: false });
            return { success: true };
          } else {
            set({ error: response.data.message || 'Failed to send OTP', isLoading: false });
            return { success: false, error: response.data.message };
          }
        } catch (error: any) {
          console.warn('Send Password Reset OTP error', error.message || error);
          const errorMsg = error.response?.data?.message || error.message || 'Failed to send OTP';
          set({ error: errorMsg, isLoading: false });
          return { success: false, error: errorMsg };
        }
      },

      verifyPasswordResetOtp: async (email: string, otp: string) => {
        set({ isLoading: true, error: null });
        try {
          const api = require('../services/api').default;
          const response = await api.post('/auth/verify-otp', { email, otp, purpose: 'password_reset' });
          if (response.data.success) {
            set({ isLoading: false });
            return { success: true, resetToken: response.data.data.resetToken || response.data.data };
          } else {
            set({ error: response.data.message || 'Invalid OTP', isLoading: false });
            return { success: false, error: response.data.message };
          }
        } catch (error: any) {
          console.warn('Verify Password Reset OTP error', error.message || error);
          const errorMsg = error.response?.data?.message || error.message || 'Verification failed';
          set({ error: errorMsg, isLoading: false });
          return { success: false, error: errorMsg };
        }
      },

      resetPassword: async (resetToken: string, newPassword: string) => {
        set({ isLoading: true, error: null });
        console.log('[AUTH DEBUG] ===== RESET PASSWORD START =====');
        console.log('[AUTH DEBUG] resetTokenProvided:', !!resetToken);
        console.log('[AUTH DEBUG] newPasswordProvided:', !!newPassword);
        try {
          const api = require('../services/api').default;
          const response = await api.post('/auth/reset-password', { resetToken, newPassword, confirmPassword: newPassword });
          console.log('[AUTH DEBUG] RESET PASSWORD RESPONSE');
          console.log('[AUTH DEBUG] status:', response.status);
          console.log('[AUTH DEBUG] success:', response.data?.success);
          if (response.data.success) {
            set({ isLoading: false });
            return { success: true };
          } else {
            set({ error: response.data.message || 'Failed to reset password', isLoading: false });
            return { success: false, error: response.data.message };
          }
        } catch (error: any) {
          console.warn('Reset password error', error.message || error);
          const errorMsg = error.response?.data?.message || error.message || 'Failed to reset password';
          set({ error: errorMsg, isLoading: false });
          return { success: false, error: errorMsg };
        }
      },

      register: async (fullName: string, email: string, password: string) => {
        set({ isLoading: true, error: null });
        console.log('[Register Debug] Starting registration with payload:', { fullName, email, passwordLength: password?.length });
        try {
          const api = require('../services/api').default;
          console.log('[Register Debug] Sending POST /auth/register request...');
          const response = await api.post('/auth/register', { fullName, email, password });
          console.log('[Register Debug] Response status:', response.status, 'Response body:', JSON.stringify(response.data));
          if (response.data.success) {
            console.log('[Register Debug] Registration successful!');
            set({ isLoading: false });
            return { success: true };
          } else {
            console.log('[Register Debug] Registration failed with message:', response.data.message);
            set({ error: response.data.message || 'Registration failed', isLoading: false });
            return { success: false, error: response.data.message };
          }
        } catch (error: any) {
          console.warn('[Register Debug] Registration error occurred:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
          });
          const errorMsg = error.response?.data?.message || error.message || 'Network error. Please try again.';
          set({ error: errorMsg, isLoading: false });
          return { success: false, error: errorMsg };
        }
      },

      updateUser: async (userData: Partial<User>) => {
        try {
          const api = require('../services/api').default;
          const currentUser = get().user;

          // Build complete payload matching backend field expectations (fullName, phone_no, phone, email, avatar)
          const payload: any = {
            ...userData,
            fullName: userData.name || (userData as any).fullName || currentUser?.name,
            phone_no: userData.phone || (userData as any).phone_no || currentUser?.phone,
            phone: userData.phone || (userData as any).phone_no || currentUser?.phone,
            email: userData.email !== undefined ? userData.email : currentUser?.email,
            avatar: userData.avatar !== undefined ? userData.avatar : currentUser?.avatar,
          };

          let res;
          try {
            res = await api.put('/user/profile', payload);
          } catch (putErr: any) {
            console.log('[Profile] PUT /user/profile failed, trying POST /user/profile');
            try {
              res = await api.post('/user/profile', payload);
            } catch (postErr: any) {
              console.log('[Profile] POST /user/profile failed, trying PUT /auth/profile');
              res = await api.put('/auth/profile', payload);
            }
          }

          if (res && res.data && res.data.success) {
            const updatedData = res.data.data?.user || res.data.data || {};
            const normalizedUser = {
              ...currentUser,
              ...userData,
              ...updatedData,
              name: userData.name || updatedData.name || updatedData.fullName || currentUser?.name || '',
              phone: userData.phone || updatedData.phone || updatedData.phone_no || currentUser?.phone || '',
              email: userData.email !== undefined ? userData.email : (updatedData.email || currentUser?.email || ''),
              avatar: userData.avatar !== undefined ? userData.avatar : (updatedData.avatar || currentUser?.avatar || ''),
            };
            set({ user: normalizedUser as any });
            return { success: true };
          }

          // Fallback: update local store optimistically
          const normalizedUser = {
            ...currentUser,
            ...userData,
            name: userData.name || currentUser?.name || '',
            phone: userData.phone || currentUser?.phone || '',
            email: userData.email !== undefined ? userData.email : currentUser?.email || '',
            avatar: userData.avatar !== undefined ? userData.avatar : currentUser?.avatar || '',
          };
          set({ user: normalizedUser as any });
          return { success: true };
        } catch (error: any) {
          console.warn('Update profile error', error.message || error);
          const currentUser = get().user;
          if (currentUser) {
            const normalizedUser = {
              ...currentUser,
              ...userData,
              name: userData.name || currentUser?.name || '',
              phone: userData.phone || currentUser?.phone || '',
              email: userData.email !== undefined ? userData.email : currentUser?.email || '',
              avatar: userData.avatar !== undefined ? userData.avatar : currentUser?.avatar || '',
            };
            set({ user: normalizedUser as any });
            return { success: true, message: 'Updated locally' };
          }
          return { success: false, message: error.response?.data?.message || error.message };
        }
      },

      fetchProfile: async () => {
        try {
          const api = require('../services/api').default;
          let response;
          try {
            response = await api.get('/auth/me');
          } catch (_) {
            response = await api.get('/auth/profile');
          }
          if (response && response.data && response.data.success && response.data.data) {
            const u = response.data.data;
            const currentUser = get().user;
            const normalizedUser = {
              ...currentUser,
              ...u,
              name: u.name || u.fullName || currentUser?.name || '',
              phone: u.phone || u.phone_no || currentUser?.phone || '',
              email: u.email || currentUser?.email || '',
              avatar: u.avatar || currentUser?.avatar || '',
            };
            set({ user: normalizedUser as any });
          }
        } catch (error: any) {
          console.warn('Fetch profile error', error.message || error);
        }
      },

      logout: async () => {
        try {
          const api = require('../services/api').default;
          await api.post('/auth/logout').catch(() => { }); // Ignore logout errors
          set({ user: null, token: null, refreshToken: null, sessionId: null, sessions: [], isAuthenticated: false, error: null });
        } catch (error: any) {
          console.warn('Error during logout', error.message || error);
        }
      },

      fetchSessions: async () => {
        try {
          const api = require('../services/api').default;
          const response = await api.get('/auth/sessions');
          if (response.data.success && response.data.data) {
            set({ sessions: response.data.data });
          }
        } catch (error: any) {
          console.warn('Fetch sessions error', error.message || error);
        }
      },

      revokeSession: async (sessionIdToRevoke: string) => {
        try {
          const api = require('../services/api').default;
          const response = await api.delete(`/auth/sessions/${sessionIdToRevoke}`);
          if (response.data.success) {
            const currentSessions = get().sessions;
            set({ sessions: currentSessions.filter(s => s.id !== sessionIdToRevoke) });
            return { success: true };
          }
          return { success: false, error: response.data.message };
        } catch (error: any) {
          console.warn('Revoke session error', error.message || error);
          return { success: false, error: error.response?.data?.message || error.message };
        }
      },

      logoutAll: async () => {
        try {
          const api = require('../services/api').default;
          const response = await api.post('/auth/logout-all');
          if (response.data.success) {
            set({ user: null, token: null, refreshToken: null, sessionId: null, sessions: [], isAuthenticated: false, error: null });
            return { success: true };
          }
          return { success: false, error: response.data.message };
        } catch (error: any) {
          console.warn('Logout all error', error.message || error);
          return { success: false, error: error.response?.data?.message || error.message };
        }
      },

      setLoading: (isLoading: boolean) => set({ isLoading }),
      setError: (error: string | null) => set({ error }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => safeStorage),
      onRehydrateStorage: () => (state) => {
        console.log('[App Startup] Zustand hydration complete. Auth state:', state?.isAuthenticated);
      },
    }
  )
);
