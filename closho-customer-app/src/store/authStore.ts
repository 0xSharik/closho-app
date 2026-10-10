import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { env } from '../config/env';
import { AuthState, User } from '../types/auth.types';

interface AuthStore extends AuthState {
  hasHydrated: boolean;
  pendingPhone: string | null;
  pendingEmail: string | null;
  pendingOtp: string | null;
  otpFlowUsed: 'phone_verification' | 'password_reset' | 'registration' | null;
  setAuth: (user: User, token: string) => Promise<void>;
  login: (emailOrPhone: string, password: string) => Promise<{ success: boolean; error?: string }>;
  googleLogin: (idToken: string) => Promise<{ success: boolean; error?: string }>;
  sendOtp: (phoneOrEmail: string) => Promise<{ success: boolean; error?: string; errorCode?: string }>;
  verifyOtp: (phoneOrEmail: string, otp: string) => Promise<{ success: boolean; error?: string }>;
  verifyRegistrationOtp: (email: string, otp: string) => Promise<{ success: boolean; error?: string }>;
  resendRegistrationOtp: () => Promise<{ success: boolean; error?: string }>;
  register: (fullName: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  setPendingPhone: (phone: string) => void;
  setPendingEmail: (email: string) => void;
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
      hasHydrated: false,
      isLoading: false,
      error: null,
      otpFlowUsed: null as ('phone_verification' | 'password_reset' | 'registration' | null),
      pendingOtp: null as string | null,
      pendingPhone: null as string | null,
      pendingEmail: null as string | null,

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
          const payload = {
            emailOrPhone,
            password,
            rememberMe: true,
          };

          const response = await api.post('/auth/login', payload);
          console.log('[AUTH DEBUG] LOGIN RESPONSE');
          console.log('[AUTH DEBUG] status:', response.status);
          console.log('[AUTH DEBUG] success:', response.data?.success);
          if (response.data.success) {
            const resData = response.data?.data || {};
            const user = resData.user;
            const accessToken = resData.accessToken || resData.token;
            const refreshToken = resData.refreshToken || null;
            const sessionId = resData.sessionId || resData.session?.id || (typeof resData.session === 'string' ? resData.session : null) || null;
            set({ user, token: accessToken, refreshToken, sessionId, isAuthenticated: true, error: null, isLoading: false });
            console.log('[AUTH DEBUG] LOGIN SESSION CREATED');
            console.log('[AUTH DEBUG] tokenExists:', !!accessToken);
            console.log('[AUTH DEBUG] tokenLength:', accessToken?.length ?? 0);
            console.log('[AUTH DEBUG] refreshTokenExists:', !!refreshToken);
            console.log('[AUTH DEBUG] sessionIdExists:', !!sessionId);
            console.log('[AUTH DEBUG] userExists:', !!user);
            console.log('[AUTH DEBUG] isAuthenticated: true');
            // Sync server cart to this device after login
            require('./cartStore').useCartStore.getState().syncCartAfterLogin();
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
            const resData = response.data?.data || {};
            const user = resData.user;
            const accessToken = resData.accessToken || resData.token;
            const refreshToken = resData.refreshToken || null;
            const sessionId = resData.sessionId || resData.session?.id || (typeof resData.session === 'string' ? resData.session : null) || null;
            set({ user, token: accessToken, refreshToken, sessionId, isAuthenticated: true, error: null, isLoading: false });
            // Sync server cart to this device after Google login
            require('./cartStore').useCartStore.getState().syncCartAfterLogin();
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

      sendOtp: async (phoneOrEmail: string) => {
        set({
          isLoading: true,
          error: null,
        });

        try {
          const api = require('../services/api').default;
          const isEmail = phoneOrEmail.includes('@');

          let payload: Record<string, string>;
          let normalizedIdentifier: string;

          if (isEmail) {
            normalizedIdentifier = phoneOrEmail.trim().toLowerCase();
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(normalizedIdentifier)) {
              const errorMsg = 'Please enter a valid email address.';
              set({
                isLoading: false,
                error: errorMsg,
              });
              return {
                success: false,
                error: errorMsg,
                errorCode: 'INVALID_EMAIL',
              };
            }
            payload = { email: normalizedIdentifier };
          } else {
            normalizedIdentifier = phoneOrEmail.replace(/\D/g, '');
            if (!/^\d{10}$/.test(normalizedIdentifier)) {
              const errorMsg = 'Please enter a valid 10-digit phone number.';
              set({
                isLoading: false,
                error: errorMsg,
              });
              return {
                success: false,
                error: errorMsg,
                errorCode: 'INVALID_PHONE',
              };
            }
            payload = { phone: normalizedIdentifier };
          }

          console.log('[AUTH DEBUG] ===== LOGIN OTP REQUEST START =====');
          console.log('[AUTH DEBUG] endpoint: /auth/login-otp/request');
          console.log('[AUTH DEBUG] payload:', payload);

          const response = await api.post('/auth/login-otp/request', payload);

          console.log('[AUTH DEBUG] LOGIN OTP REQUEST RESPONSE');
          console.log('[AUTH DEBUG] status:', response.status);
          console.log('[AUTH DEBUG] response:', JSON.stringify(response.data));

          if (response.data?.success) {
            set({
              isLoading: false,
              error: null,
              pendingPhone: isEmail ? null : normalizedIdentifier,
              pendingEmail: isEmail ? normalizedIdentifier : null,
              pendingOtp: null,
              otpFlowUsed: 'phone_verification',
            });

            console.log('[AUTH DEBUG] LOGIN OTP SENT SUCCESSFULLY');

            return {
              success: true,
            };
          }

          const errorMsg =
            response.data?.message ||
            response.data?.data?.message ||
            'Unable to send login OTP.';

          set({
            isLoading: false,
            error: errorMsg,
          });

          return {
            success: false,
            error: errorMsg,
            errorCode: response.data?.errorCode,
          };

        } catch (error: any) {
          const responseData = error?.response?.data;

          const errorMsg =
            responseData?.message ||
            responseData?.data?.message ||
            error?.message ||
            'Unable to send login OTP.';

          const errorCode =
            responseData?.errorCode ||
            responseData?.code ||
            'OTP_SEND_FAILED';

          console.log('[AUTH DEBUG] LOGIN OTP REQUEST ERROR:', {
            status: error?.response?.status,
            errorCode,
            message: errorMsg,
          });

          set({
            isLoading: false,
            error: errorMsg,
          });

          return {
            success: false,
            error: errorMsg,
            errorCode,
          };
        }
      },

      verifyOtp: async (phoneOrEmail: string, otp: string) => {
        set({
          isLoading: true,
          error: null,
          pendingOtp: otp,
          pendingPhone: phoneOrEmail.includes('@') ? null : phoneOrEmail,
          pendingEmail: phoneOrEmail.includes('@') ? phoneOrEmail : null,
        });

        try {
          const api = require('../services/api').default;
          const isEmail = phoneOrEmail.includes('@');

          let payload: Record<string, string>;
          let normalizedIdentifier: string;

          if (isEmail) {
            normalizedIdentifier = phoneOrEmail.trim().toLowerCase();
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(normalizedIdentifier)) {
              const errorMsg = 'Invalid email address.';
              set({
                isLoading: false,
                error: errorMsg,
              });
              return {
                success: false,
                error: errorMsg,
              };
            }
            payload = { email: normalizedIdentifier, otp };
          } else {
            normalizedIdentifier = phoneOrEmail.replace(/\D/g, '');
            if (!/^\d{10}$/.test(normalizedIdentifier)) {
              const errorMsg = 'Invalid phone number.';
              set({
                isLoading: false,
                error: errorMsg,
              });
              return {
                success: false,
                error: errorMsg,
              };
            }
            payload = { phone: normalizedIdentifier, otp };
          }

          if (!/^\d{4,6}$/.test(otp)) {
            const errorMsg = 'OTP must be 4 to 6 digits.';
            set({
              isLoading: false,
              error: errorMsg,
            });
            return {
              success: false,
              error: errorMsg,
            };
          }

          console.log('[AUTH DEBUG] ===== LOGIN OTP VERIFY START =====');
          console.log('[AUTH DEBUG] endpoint: /auth/login-otp/verify');
          console.log('[AUTH DEBUG] payload:', payload);

          const response = await api.post('/auth/login-otp/verify', payload);

          console.log('[AUTH DEBUG] LOGIN OTP VERIFY RESPONSE');
          console.log('[AUTH DEBUG] status:', response.status);
          console.log('[AUTH DEBUG] success:', response.data?.success);

          if (!response.data?.success) {
            const errorMsg =
              response.data?.message ||
              response.data?.data?.message ||
              'Invalid OTP.';

            set({
              isLoading: false,
              error: errorMsg,
            });

            return {
              success: false,
              error: errorMsg,
              errorCode: response.data?.errorCode,
            };
          }

          const data = response.data?.data || {};

          const accessToken =
            data.accessToken ||
            data.token;

          const refreshToken =
            data.refreshToken || null;

          const sessionId =
            data.sessionId || data.session?.id || (typeof data.session === 'string' ? data.session : null) || null;

          const user =
            data.user || {
              id: data.userId || 'usr_otp',
              fullName: data.fullName || data.name || '',
              name: data.fullName || data.name || '',
              phone: isEmail ? '' : normalizedIdentifier,
              email: isEmail ? normalizedIdentifier : '',
              role: 'customer',
            };

          if (!accessToken) {
            const errorMsg =
              'OTP verified but no access token was returned by the server.';

            set({
              isLoading: false,
              error: errorMsg,
            });

            return {
              success: false,
              error: errorMsg,
              errorCode: 'NO_ACCESS_TOKEN',
            };
          }

          // THIS IS THE ACTUAL LOGIN
          set({
            user,
            token: accessToken,
            refreshToken,
            sessionId,
            isAuthenticated: true,
            error: null,
            isLoading: false,
            pendingOtp: null,
            pendingPhone: null,
            pendingEmail: null,
            otpFlowUsed: null,
          });

          console.log('[AUTH DEBUG] ===== OTP LOGIN SUCCESS =====');
          console.log('[AUTH DEBUG] accessToken exists:', !!accessToken);
          console.log('[AUTH DEBUG] accessToken length:', accessToken.length);
          console.log('[AUTH DEBUG] refreshToken exists:', !!refreshToken);
          console.log('[AUTH DEBUG] user exists:', !!user);
          console.log('[AUTH DEBUG] isAuthenticated:', true);



          // Refresh complete user profile
          try {
            const profileRes = await api.get('/auth/me');

            if (profileRes.data?.data) {
              const u = profileRes.data.data.user || profileRes.data.data;
              const curUser = get().user;
              set({
                user: {
                  ...curUser,
                  ...u,
                  name: u.fullName || u.name || curUser?.name || '',
                  fullName: u.fullName || u.name || (curUser as any)?.fullName || '',
                  phone: u.phone_no || u.phone || curUser?.phone || '',
                  phone_no: u.phone_no || u.phone || (curUser as any)?.phone_no || '',
                  email: u.email || curUser?.email || '',
                  avatar: u.avatar || curUser?.avatar || '',
                },
              });

              console.log('[AUTH DEBUG] Profile refreshed after OTP login');
            }
          } catch (profileError) {
            console.log(
              '[AUTH DEBUG] Profile refresh skipped:',
              profileError
            );
          }

          // Sync cart after login
          try {
            require('./cartStore')
              .useCartStore
              .getState()
              .syncCartAfterLogin();
          } catch (cartError) {
            console.log(
              '[AUTH DEBUG] Cart sync failed:',
              cartError
            );
          }

          return {
            success: true,
          };

        } catch (error: any) {
          const responseData = error?.response?.data;

          const errorMsg =
            responseData?.message ||
            responseData?.data?.message ||
            error?.message ||
            'OTP verification failed.';

          const errorCode =
            responseData?.errorCode ||
            responseData?.code ||
            'OTP_VERIFY_FAILED';

          console.log('[AUTH DEBUG] LOGIN OTP VERIFY ERROR:', {
            status: error?.response?.status,
            errorCode,
            message: errorMsg,
          });

          set({
            isLoading: false,
            error: errorMsg,
          });

          return {
            success: false,
            error: errorMsg,
            errorCode,
          };
        }
      },
      verifyRegistrationOtp: async (email: string, otp: string) => {
        set({ isLoading: true, error: null });

        try {
          const api = require('../services/api').default;

          console.log('[AUTH DEBUG] ===== VERIFY REGISTRATION OTP START =====');

          const response = await api.post('/auth/verify-otp', {
            email,
            otp,
            purpose: 'registration',
          });

          console.log('[AUTH DEBUG] registration OTP status:', response.status);
          console.log('[AUTH DEBUG] registration OTP success:', response.data?.success);

          if (response.data?.success) {
            console.log('[AUTH DEBUG] REGISTRATION OTP VERIFY SUCCESS');
            console.log('[AUTH DEBUG] Account verification completed.');

            set({
              isLoading: false,
              error: null,
              otpFlowUsed: null,
              pendingOtp: null,
            });

            return { success: true };
          }

          const errorMsg = response.data?.message || 'Invalid registration OTP.';
          set({ isLoading: false, error: errorMsg });
          return { success: false, error: errorMsg };
        } catch (error: any) {
          const errorMsg =
            error.response?.data?.message ||
            error.message ||
            'Registration OTP verification failed.';

          console.warn('[AUTH DEBUG] Registration OTP error:', {
            status: error.response?.status,
            errorCode: error.response?.data?.errorCode,
            message: errorMsg,
          });

          set({ isLoading: false, error: errorMsg });
          return { success: false, error: errorMsg };
        }
      },

      sendPasswordResetOtp: async (email: string) => {
        set({ isLoading: true, error: null });

        console.log('[AUTH DEBUG] ===== PASSWORD RESET OTP SEND START =====');
        console.log('[AUTH DEBUG] endpoint: /auth/forgot-password');
        console.log('[AUTH DEBUG] email:', email);

        try {
          const api = require('../services/api').default;

          console.log('[AUTH DEBUG] PASSWORD RESET OTP REQUEST START');

          const response = await api.post('/auth/forgot-password', { email });

          console.log('[AUTH DEBUG] PASSWORD RESET OTP RESPONSE');
          console.log('[AUTH DEBUG] status:', response.status);
          console.log('[AUTH DEBUG] success:', response.data?.success);
          console.log('[AUTH DEBUG] response:', JSON.stringify(response.data));

          if (response.data?.success) {
            set({
              isLoading: false,
              otpFlowUsed: 'password_reset',
              pendingEmail: email,
            });

            console.log('[AUTH DEBUG] PASSWORD RESET OTP STATE SAVED');
            console.log('[AUTH DEBUG] otpFlowUsed:', 'password_reset');
            console.log('[AUTH DEBUG] pendingEmail:', email);

            return { success: true };
          }

          const errorMsg = response.data?.message || 'Failed to send OTP';

          console.log('[AUTH DEBUG] PASSWORD RESET OTP SEND FAILED:', errorMsg);

          set({ error: errorMsg, isLoading: false });
          return { success: false, error: errorMsg };
        } catch (error: any) {
          const errorMsg =
            error.response?.data?.message ||
            error.message ||
            'Failed to send OTP';

          console.log('[AUTH DEBUG] PASSWORD RESET OTP SEND ERROR:', {
            status: error.response?.status,
            errorCode: error.response?.data?.errorCode,
            message: errorMsg,
          });

          set({ error: errorMsg, isLoading: false });
          return { success: false, error: errorMsg };
        }
      },

      resendRegistrationOtp: async () => {
        set({ isLoading: true, error: null });

        console.log('[AUTH DEBUG] ===== REGISTRATION OTP RESEND START =====');

        try {
          const api = require('../services/api').default;
          const pendingPhone = get().pendingPhone;
          const pendingEmail = get().pendingEmail;

          console.log('[AUTH DEBUG] registration resend pendingPhone:', pendingPhone);
          console.log('[AUTH DEBUG] registration resend pendingEmail:', pendingEmail);

          if (!pendingPhone) {
            const errorMsg =
              'Mobile number is missing. Please restart registration.';

            console.log('[AUTH DEBUG] REGISTRATION OTP RESEND BLOCKED:', errorMsg);

            set({ isLoading: false, error: errorMsg });
            return { success: false, error: errorMsg };
          }

          console.log('[AUTH DEBUG] endpoint: /auth/send-verification-otp');
          console.log('[AUTH DEBUG] registration resend phone:', pendingPhone);

          const response = await api.post('/auth/send-verification-otp', {
            phone: pendingPhone,
          });

          console.log('[AUTH DEBUG] REGISTRATION OTP RESEND RESPONSE');
          console.log('[AUTH DEBUG] status:', response.status);
          console.log('[AUTH DEBUG] success:', response.data?.success);
          console.log('[AUTH DEBUG] response:', JSON.stringify(response.data));

          if (response.data?.success) {
            set({
              isLoading: false,
              otpFlowUsed: 'registration',
              pendingPhone,
              pendingEmail,
              pendingOtp: null,
              error: null,
            });

            console.log('[AUTH DEBUG] REGISTRATION OTP RESEND SUCCESS');
            console.log('[AUTH DEBUG] otpFlowUsed:', 'registration');

            return { success: true };
          }

          const errorMsg =
            response.data?.message ||
            'Failed to resend registration OTP.';

          console.log('[AUTH DEBUG] REGISTRATION OTP RESEND FAILED:', errorMsg);

          set({ isLoading: false, error: errorMsg });
          return { success: false, error: errorMsg };
        } catch (error: any) {
          const errorMsg =
            error.response?.data?.message ||
            error.message ||
            'Failed to resend registration OTP.';

          console.log('[AUTH DEBUG] REGISTRATION OTP RESEND ERROR:', {
            status: error.response?.status,
            errorCode: error.response?.data?.errorCode,
            message: errorMsg,
          });

          set({ isLoading: false, error: errorMsg });
          return { success: false, error: errorMsg };
        }
      },

      verifyPasswordResetOtp: async (email: string, otp: string) => {
        set({ isLoading: true, error: null, pendingOtp: otp });

        console.log('[AUTH DEBUG] ===== PASSWORD RESET OTP VERIFY START =====');
        console.log('[AUTH DEBUG] endpoint: /auth/verify-otp');
        console.log('[AUTH DEBUG] email:', email);
        console.log('[AUTH DEBUG] otpLength:', otp?.length);

        try {
          const api = require('../services/api').default;

          const response = await api.post('/auth/verify-otp', {
            email,
            otp,
            purpose: 'password_reset',
          });

          console.log('[AUTH DEBUG] PASSWORD RESET OTP VERIFY RESPONSE');
          console.log('[AUTH DEBUG] status:', response.status);
          console.log('[AUTH DEBUG] success:', response.data?.success);
          console.log('[AUTH DEBUG] response:', JSON.stringify(response.data));

          if (response.data?.success) {
            set({
              isLoading: false,
              pendingOtp: otp,
              pendingEmail: email,
              otpFlowUsed: 'password_reset',
            });

            const resetToken = response.data.data?.resetToken || null;

            console.log('[AUTH DEBUG] resetTokenReceived:', !!resetToken);
            console.log('[AUTH DEBUG] otpFlowUsed:', 'password_reset');

            if (!resetToken) {
              const errorMsg =
                'OTP verified but no reset token received. Please try again.';

              console.log('[AUTH DEBUG] PASSWORD RESET OTP VERIFY FAILED:', errorMsg);

              set({ error: errorMsg, isLoading: false });
              return { success: false, error: errorMsg };
            }

            console.log('[AUTH DEBUG] PASSWORD RESET OTP VERIFY SUCCESS');
            return { success: true, resetToken };
          }

          const errorMsg =
            response.data?.message || 'Invalid OTP';

          console.log('[AUTH DEBUG] PASSWORD RESET OTP VERIFY REJECTED:', errorMsg);

          set({ error: errorMsg, isLoading: false });
          return { success: false, error: errorMsg };
        } catch (error: any) {
          const errorMsg =
            error.response?.data?.message ||
            error.message ||
            'Verification failed';

          console.log('[AUTH DEBUG] PASSWORD RESET OTP VERIFY ERROR:', {
            status: error.response?.status,
            errorCode: error.response?.data?.errorCode,
            message: errorMsg,
          });

          set({ error: errorMsg, isLoading: false });
          return { success: false, error: errorMsg };
        }
      },

      resetPassword: async (resetToken: string, newPassword: string) => {
        set({ isLoading: true, error: null });

        if (!resetToken) {
          const errorMsg =
            'Missing reset token. Please restart the password reset flow.';

          set({ isLoading: false, error: errorMsg });

          return { success: false, error: errorMsg };
        }

        try {
          const api = require('../services/api').default;

          const payload = {
            resetToken,
            newPassword,
            confirmPassword: newPassword,
          };

          console.log('[AUTH DEBUG] ===== RESET PASSWORD START =====');
          console.log('[AUTH DEBUG] resetTokenProvided:', !!resetToken);
          console.log('[AUTH DEBUG] newPasswordProvided:', !!newPassword);

          const response = await api.post('/auth/reset-password', payload);

          console.log('[AUTH DEBUG] RESET PASSWORD RESPONSE');
          console.log('[AUTH DEBUG] status:', response.status);
          console.log('[AUTH DEBUG] success:', response.data?.success);

          if (!response.data?.success) {
            const errorMsg =
              response.data?.message || 'Failed to reset password.';

            set({ isLoading: false, error: errorMsg });

            return { success: false, error: errorMsg };
          }

          /*
           * Password reset succeeded.
           *
           * The reset endpoint does not authenticate the session, so use the
           * existing /auth/login endpoint immediately with the same account.
           *
           * For the verified-phone OTP flow, pendingPhone is available even
           * when the forgot-password response did not return an email.
           * For email reset, pendingEmail is preferred.
           */
          const pendingEmail = get().pendingEmail;
          const pendingPhone = get().pendingPhone;
          const loginIdentifier = pendingEmail || pendingPhone;

          if (!loginIdentifier) {
            const errorMsg =
              'Password was updated, but the account identifier is missing. Please log in again.';

            set({
              isLoading: false,
              error: errorMsg,
              otpFlowUsed: null,
              pendingOtp: null,
            });

            return { success: false, error: errorMsg };
          }

          console.log('[AUTH DEBUG] ===== AUTO LOGIN AFTER PASSWORD RESET =====');
          console.log('[AUTH DEBUG] loginIdentifier:', loginIdentifier);
          console.log('[AUTH DEBUG] identifierType:', pendingEmail ? 'email' : 'phone');

          try {
            const loginResponse = await api.post('/auth/login', {
              emailOrPhone: loginIdentifier,
              password: newPassword,
              rememberMe: true,
            });

            console.log('[AUTH DEBUG] AUTO LOGIN RESPONSE');
            console.log('[AUTH DEBUG] status:', loginResponse.status);
            console.log('[AUTH DEBUG] success:', loginResponse.data?.success);
            console.log(
              '[AUTH DEBUG] hasAccessToken:',
              !!loginResponse.data?.data?.accessToken
            );
            console.log(
              '[AUTH DEBUG] hasUser:',
              !!loginResponse.data?.data?.user
            );

            if (!loginResponse.data?.success) {
              const errorMsg =
                loginResponse.data?.message ||
                'Password updated, but automatic login failed. Please log in again.';

              set({
                isLoading: false,
                error: errorMsg,
                otpFlowUsed: null,
                pendingOtp: null,
                pendingPhone: null,
                pendingEmail: null,
              });

              return { success: false, error: errorMsg };
            }

            const data = loginResponse.data?.data || {};
            const accessToken = data.accessToken || data.token;
            const user = data.user;

            if (!accessToken || !user) {
              const errorMsg =
                'Password updated, but the server did not return a valid login session. Please log in again.';

              set({
                isLoading: false,
                error: errorMsg,
                otpFlowUsed: null,
                pendingOtp: null,
                pendingPhone: null,
                pendingEmail: null,
              });

              return { success: false, error: errorMsg };
            }

            set({
              user,
              token: accessToken,
              refreshToken: data.refreshToken || null,
              sessionId: data.sessionId || null,
              isAuthenticated: true,
              isLoading: false,
              error: null,
              otpFlowUsed: null,
              pendingOtp: null,
              pendingPhone: null,
              pendingEmail: null,
            });

            console.log('[AUTH DEBUG] AUTO LOGIN SUCCESS');
            console.log('[AUTH DEBUG] isAuthenticated:', true);
            console.log('[AUTH DEBUG] tokenExists:', !!accessToken);

            return { success: true };
          } catch (loginError: any) {
            const errorMsg =
              loginError.response?.data?.message ||
              loginError.message ||
              'Password updated, but automatic login failed. Please log in again.';

            console.log('[AUTH DEBUG] AUTO LOGIN ERROR:', {
              status: loginError.response?.status,
              errorCode: loginError.response?.data?.errorCode,
              message: errorMsg,
            });

            set({
              isLoading: false,
              error: errorMsg,
              otpFlowUsed: null,
              pendingOtp: null,
              pendingPhone: null,
              pendingEmail: null,
            });

            return { success: false, error: errorMsg };
          }
        } catch (error: any) {
          const errorMsg =
            error.response?.data?.message ||
            error.message ||
            'Failed to reset password';

          console.warn('[AUTH DEBUG] Reset password error:', {
            status: error.response?.status,
            errorCode: error.response?.data?.errorCode,
            message: errorMsg,
          });

          set({ isLoading: false, error: errorMsg });

          return { success: false, error: errorMsg };
        }
      },

      register: async (fullName: string, email: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
          const api = require('../services/api').default;
          const pendingPhone = get().pendingPhone;

          if (!pendingPhone) {
            const errorMsg =
              'Mobile number is missing. Please enter your mobile number and try again.';
            set({ isLoading: false, error: errorMsg });
            return { success: false, error: errorMsg };
          }

          const normalizedPhone = pendingPhone.replace(/\s+/g, '');

          console.log('[Register Debug] Starting registration:', {
            fullName,
            email,
            phone: normalizedPhone,
            passwordLength: password?.length,
          });

          const response = await api.post('/auth/register', {
            fullName,
            email,
            phone: normalizedPhone,
            password,
          });

          console.log(
            '[Register Debug] Response status:',
            response.status,
            'Response body:',
            JSON.stringify(response.data)
          );

          if (response.data?.success) {
            set({
              isLoading: false,
              pendingPhone: normalizedPhone,
              pendingEmail: email,
              otpFlowUsed: 'registration',
              pendingOtp: null,
              error: null,
            });

            return { success: true };
          }

          const errorMsg =
            response.data?.message || 'Registration failed';

          set({ error: errorMsg, isLoading: false });
          return { success: false, error: errorMsg };
        } catch (error: any) {
          const errorCode = error.response?.data?.errorCode;
          const errorMsg =
            error.response?.data?.message ||
            error.message ||
            'Network error. Please try again.';

          console.warn('[Register Debug] Registration error:', {
            status: error.response?.status,
            errorCode,
            message: errorMsg,
          });

          set({ error: errorMsg, isLoading: false });
          return { success: false, error: errorMsg };
        }
      },

      setPendingPhone: (phone: string) => {
        const normalizedPhone = phone.replace(/\s+/g, '');
        set({ pendingPhone: normalizedPhone });
      },

      setPendingEmail: (email: string) => {
        set({ pendingEmail: email.trim().toLowerCase() });
      },

      updateUser: async (updates: any) => {
        set({
          isLoading: true,
          error: null,
        });

        try {
          const api = require('../services/api').default;
          const token = get().token;
          const currentUser: any = get().user;

          const fullName = updates.fullName || updates.name || '';
          const phoneNo = updates.phone_no || updates.phone || '';
          const email = updates.email || '';

          // Backend has separate profile endpoints for admins and customers.
          const rawRole = currentUser?.role;
          const roleName =
            typeof rawRole === 'string'
              ? rawRole
              : rawRole?.name;

          const isAdmin =
            typeof roleName === 'string' &&
            roleName.toLowerCase() === 'admin';

          const endpoint = isAdmin
            ? '/admin/profile'
            : '/user/profile';

          const hasLocalAvatar =
            typeof updates.avatar === 'string' &&
            (
              updates.avatar.startsWith('file://') ||
              updates.avatar.startsWith('content://')
            );

          console.log('[PROFILE] updateUser start:', {
            endpoint,
            role: roleName,
            isAdmin,
            hasLocalAvatar,
            hasToken: !!token,
          });

          let updatedUserData: any = null;

          if (hasLocalAvatar) {
            const formData = new FormData();

            // Admin contract: fullName, email, avatar
            // Customer contract: fullName, phone_no, avatar
            if (fullName) {
              formData.append('fullName', fullName);
            }

            if (isAdmin) {
              if (email) {
                formData.append('email', email);
              }
            } else if (phoneNo) {
              formData.append('phone_no', phoneNo);
            }

            const uri = updates.avatar;
            const filename =
              uri.split('/').pop() ||
              `profile-${Date.now()}.jpg`;

            const extension =
              filename.split('.').pop()?.toLowerCase() || 'jpg';

            const mimeType =
              extension === 'png'
                ? 'image/png'
                : extension === 'webp'
                  ? 'image/webp'
                  : extension === 'heic' || extension === 'heif'
                    ? 'image/heic'
                    : 'image/jpeg';

            formData.append(
              'avatar',
              {
                uri,
                name: filename,
                type: mimeType,
              } as any
            );

            console.log('[PROFILE] multipart upload:', {
              url: `${env.API_URL}${endpoint}`,
              filename,
              mimeType,
              fields: isAdmin
                ? ['fullName', 'email', 'avatar']
                : ['fullName', 'phone_no', 'avatar'],
            });

            const uploadResult = await new Promise<{
              ok: boolean;
              status: number;
              data: any;
            }>((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              const url = `${env.API_URL}${endpoint}`;

              xhr.open('PUT', url);
              xhr.timeout = 60000;

              if (token) {
                xhr.setRequestHeader(
                  'Authorization',
                  `Bearer ${token}`
                );
              }

              xhr.setRequestHeader(
                'Accept',
                'application/json'
              );

              // IMPORTANT:
              // Do not manually set Content-Type here.
              // React Native must generate the multipart boundary.
              xhr.onload = () => {
                console.log('[PROFILE] upload response:', {
                  status: xhr.status,
                  response: xhr.responseText,
                });

                let data: any;

                try {
                  data = JSON.parse(xhr.responseText || '{}');
                } catch {
                  data = {
                    message: xhr.responseText || 'Invalid server response',
                  };
                }

                resolve({
                  ok: xhr.status >= 200 && xhr.status < 300,
                  status: xhr.status,
                  data,
                });
              };

              xhr.onerror = () => {
                console.error('[PROFILE] XHR network error:', {
                  url,
                  status: xhr.status,
                });

                reject(
                  new Error(
                    `Network error while uploading profile image to ${endpoint}`
                  )
                );
              };

              xhr.ontimeout = () => {
                reject(
                  new Error(
                    `Profile image upload timed out after 60 seconds (${endpoint})`
                  )
                );
              };

              xhr.onabort = () => {
                reject(new Error('Profile image upload was aborted'));
              };

              xhr.send(formData);
            });

            if (
              !uploadResult.ok ||
              !uploadResult.data?.success
            ) {
              const message =
                uploadResult.data?.message ||
                `Failed to update profile (${uploadResult.status})`;

              set({
                isLoading: false,
                error: message,
              });

              return {
                success: false,
                message,
              };
            }

            // Your admin API returns data as an array:
            // { success: true, data: [ { ...user } ] }
            // Other API versions may return data.user or an object.
            const responseData = uploadResult.data?.data;

            updatedUserData = Array.isArray(responseData)
              ? responseData[0]
              : responseData?.user || responseData;

            console.log('[PROFILE] parsed uploaded user:', {
              avatar: updatedUserData?.avatar,
              fullName: updatedUserData?.fullName,
              email: updatedUserData?.email,
            });

          } else {
            // Text-only update.
            // Do not send fields that do not belong to the current role.
            const payload: any = {
              fullName,
            };

            if (isAdmin) {
              if (email) {
                payload.email = email;
              }
            } else {
              if (phoneNo) {
                payload.phone_no = phoneNo;
              }
            }

            console.log('[PROFILE] text update:', {
              endpoint,
              payload,
            });

            const response = await api.put(
              endpoint,
              payload
            );

            if (!response.data?.success) {
              const message =
                response.data?.message ||
                'Failed to update profile';

              set({
                isLoading: false,
                error: message,
              });

              return {
                success: false,
                message,
              };
            }

            const responseData = response.data?.data;

            updatedUserData = Array.isArray(responseData)
              ? responseData[0]
              : responseData?.user || responseData;
          }

          const latestUser: any = get().user;

          // NEVER store file:// or content:// as the user's permanent avatar.
          // Those are temporary device URIs. The backend URL is the canonical value.
          const serverAvatar =
            typeof updatedUserData?.avatar === 'string' &&
              !updatedUserData.avatar.startsWith('file://') &&
              !updatedUserData.avatar.startsWith('content://')
              ? updatedUserData.avatar
              : latestUser?.avatar || '';

          const normalizedUser: any = {
            ...latestUser,
            ...updatedUserData,

            name:
              updatedUserData?.fullName ||
              updatedUserData?.name ||
              fullName ||
              latestUser?.name ||
              '',

            fullName:
              updatedUserData?.fullName ||
              updatedUserData?.name ||
              fullName ||
              latestUser?.fullName ||
              '',

            phone:
              updatedUserData?.phone_no ||
              updatedUserData?.phone ||
              phoneNo ||
              latestUser?.phone ||
              '',

            phone_no:
              updatedUserData?.phone_no ||
              updatedUserData?.phone ||
              phoneNo ||
              latestUser?.phone_no ||
              '',

            email:
              updatedUserData?.email ||
              email ||
              latestUser?.email ||
              '',

            avatar: serverAvatar,
          };

          set({
            user: normalizedUser,
            isLoading: false,
            error: null,
          });

          console.log('[PROFILE] updateUser success:', {
            endpoint,
            avatar: normalizedUser.avatar,
          });

          return {
            success: true,
            user: normalizedUser,
          };

        } catch (error: any) {
          const message =
            error?.response?.data?.message ||
            error?.message ||
            'Failed to update profile';

          console.error(
            '[PROFILE] updateUser error:',
            error?.response?.data || error
          );

          set({
            isLoading: false,
            error: message,
          });

          return {
            success: false,
            message,
          };
        }
      },

      fetchProfile: async () => {
        try {
          const api = require('../services/api').default;
          let response;
          try {
            response = await api.get('/auth/me');
          } catch (authMeErr) {
            try {
              response = await api.get('/user/me');
            } catch (_) {
              response = await api.get('/user/profile');
            }
          }

          if (response && response.data && response.data.success && response.data.data) {
            const u = response.data.data.user || response.data.data;
            const currentUser = get().user;
            const normalizedUser = {
              ...currentUser,
              ...u,
              name: u.fullName || u.name || currentUser?.name || '',
              fullName: u.fullName || u.name || (currentUser as any)?.fullName || '',
              phone: u.phone_no || u.phone || currentUser?.phone || '',
              phone_no: u.phone_no || u.phone || (currentUser as any)?.phone_no || '',
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
          // Clear local cart so it doesn't bleed into next login/account
          require('./cartStore').useCartStore.getState().resetCartState();
          set({
            user: null,
            token: null,
            refreshToken: null,
            sessionId: null,
            sessions: [],
            isAuthenticated: false,
            error: null,
            otpFlowUsed: null,
            pendingOtp: null,
            pendingPhone: null,
            pendingEmail: null,
          });
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
            // Clear local cart so it doesn't bleed into next login/account
            require('./cartStore').useCartStore.getState().resetCartState();
            set({
              user: null,
              token: null,
              refreshToken: null,
              sessionId: null,
              sessions: [],
              isAuthenticated: false,
              error: null,
              otpFlowUsed: null,
              pendingOtp: null,
              pendingPhone: null,
              pendingEmail: null,
            });
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
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn('[App Startup] Unable to restore auth state:', error);
        }
        // `setState` notifies subscribers such as the root navigation guard.
        // Mark failure as complete too, so a storage error cannot trap the app
        // behind its splash screen.
        useAuthStore.setState({ hasHydrated: true, isLoading: false });
        console.log('[App Startup] Zustand hydration complete. Auth state:', state?.isAuthenticated);
      },
    }
  )
);
