import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
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
  sendOtp: (phone: string) => Promise<{ success: boolean; error?: string; errorCode?: string }>;
  verifyOtp: (phone: string, otp: string) => Promise<{ success: boolean; error?: string; resetToken?: string; directReset?: boolean }>;
  verifyRegistrationOtp: (email: string, otp: string) => Promise<{ success: boolean; error?: string }>;
  resendRegistrationOtp: () => Promise<{ success: boolean; error?: string }>;
  register: (fullName: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  setPendingPhone: (phone: string) => void;
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
            const { user, accessToken, refreshToken, sessionId } = response.data.data;
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

      sendOtp: async (phone: string) => {
        set({ isLoading: true, error: null });

        try {
          const api = require('../services/api').default;
          let normalizedPhone = phone.replace(/\s+/g, '');

          if (/^\d{10}$/.test(normalizedPhone)) normalizedPhone = `+91${normalizedPhone}`;
          else if (/^\d{12}$/.test(normalizedPhone)) normalizedPhone = `+${normalizedPhone}`;

          set({
            pendingPhone: normalizedPhone,
            pendingEmail: null,
            pendingOtp: null,
          });

          console.log('[AUTH DEBUG] ===== SEND OTP START =====');
          console.log('[AUTH DEBUG] normalizedPhone:', normalizedPhone);

          /*
           * Normal phone OTP login / verification.
           * If the backend says the phone is already verified (409),
           * do NOT treat that as a fatal error. An already-verified
           * account must go through the existing password-reset flow.
           */
          try {
            const response = await api.post('/auth/send-verification-otp', {
              phone: normalizedPhone,
            });

            console.log('[AUTH DEBUG] SEND VERIFICATION OTP status:', response.status);

            if (response.data?.success) {
              set({
                isLoading: false,
                otpFlowUsed: 'phone_verification',
                pendingPhone: normalizedPhone,
              });

              return { success: true };
            }
          } catch (sendErr: any) {
            const status = sendErr.response?.status;
            const errorCode = sendErr.response?.data?.errorCode;
            const errorMsg =
              sendErr.response?.data?.message ||
              sendErr.message ||
              'Failed to send OTP. Please try again.';

            console.log('[AUTH DEBUG] SEND PHONE OTP ERROR:', {
              status,
              errorCode,
              message: errorMsg,
            });

            // Unknown/unregistered phone: preserve the existing registration flow.
            if (status === 404 || errorCode === 'USER_NOT_FOUND') {
              set({
                isLoading: false,
                error: errorMsg,
                pendingPhone: normalizedPhone,
                otpFlowUsed: null,
              });

              return {
                success: false,
                error: errorMsg,
                errorCode: 'USER_NOT_FOUND',
              };
            }

            // Already verified is NOT an error for this OTP-login flow.
            // Continue into the existing password-reset flow below.
            if (status !== 409) {
              set({ isLoading: false, error: errorMsg });

              return {
                success: false,
                error: errorMsg,
                errorCode,
              };
            }

            console.log(
              '[AUTH DEBUG] Phone is already verified -> continuing with password-reset OTP flow.'
            );
          }

          /*
           * Existing verified phone:
           * use the existing forgot-password endpoint to issue the OTP.
           *
           * The backend implementation currently used by the app accepts
           * the phone here. If it returns the associated email, retain it
           * because /auth/verify-otp uses email for password_reset.
           */
          try {
            const response = await api.post('/auth/forgot-password', {
              phone: normalizedPhone,
            });

            console.log(
              '[AUTH DEBUG] /auth/forgot-password status:',
              response.status
            );
            console.log(
              '[AUTH DEBUG] /auth/forgot-password response:',
              JSON.stringify(response.data)
            );

            if (response.data?.success) {
              const responseData =
                response.data?.data?.data ||
                response.data?.data ||
                {};

              const email =
                responseData.email ||
                responseData.user?.email ||
                responseData.account?.email ||
                null;

              set({
                isLoading: false,
                otpFlowUsed: 'password_reset',
                pendingPhone: normalizedPhone,
                pendingEmail: email,
                pendingOtp: null,
                error: null,
              });

              console.log(
                '[AUTH DEBUG] VERIFIED PHONE -> PASSWORD RESET FLOW',
                {
                  phone: normalizedPhone,
                  email: email || 'not returned by backend',
                }
              );

              return { success: true };
            }

            const errorMsg =
              response.data?.message ||
              'Unable to send password reset OTP. Please try again.';

            set({ isLoading: false, error: errorMsg });

            return { success: false, error: errorMsg };
          } catch (resetOtpErr: any) {
            const status = resetOtpErr.response?.status;
            const errorCode = resetOtpErr.response?.data?.errorCode;
            const errorMsg =
              resetOtpErr.response?.data?.message ||
              resetOtpErr.message ||
              'Unable to send password reset OTP. Please try again.';

            console.log('[AUTH DEBUG] PASSWORD RESET OTP ERROR:', {
              status,
              errorCode,
              message: errorMsg,
            });

            set({
              isLoading: false,
              error: errorMsg,
              otpFlowUsed: null,
            });

            return {
              success: false,
              error: errorMsg,
              errorCode,
            };
          }
        } catch (error: any) {
          const status = error.response?.status;
          const errorCode = error.response?.data?.errorCode;
          const errorMsg =
            error.response?.data?.message ||
            error.message ||
            'Failed to send OTP. Please try again.';

          console.log('[AUTH DEBUG] SEND OTP ERROR:', {
            status,
            errorCode,
            message: errorMsg,
          });

          set({ isLoading: false, error: errorMsg });

          return {
            success: false,
            error: errorMsg,
            errorCode,
          };
        }
      },

      verifyOtp: async (phone: string, otp: string) => {
        set({
          isLoading: true,
          error: null,
          pendingOtp: otp,
          pendingPhone: phone,
        });

        console.log('[AUTH DEBUG] ===== VERIFY OTP START =====');

        try {
          const api = require('../services/api').default;
          const otpFlowUsed = get().otpFlowUsed;

          // Existing verified phone -> forgot-password OTP.
          // The API contract requires email for verify-otp, so use the email
          // returned by /auth/forgot-password instead of sending phone here.
          if (otpFlowUsed === 'password_reset') {
            const email = get().pendingEmail;

            if (!email) {
              const errorMsg =
                'The account email was not returned by the server. Please restart the OTP login flow.';
              set({ isLoading: false, error: errorMsg });
              return { success: false, error: errorMsg };
            }

            const result = await get().verifyPasswordResetOtp(email, otp);

            if (!result.success) {
              set({ isLoading: false, error: result.error || 'Invalid OTP' });
              return result;
            }

            return result;
          }

          // Registration is verified by verifyRegistrationOtp(), because the
          // API contract requires email + purpose=registration.
          if (otpFlowUsed === 'registration') {
            const email = get().pendingEmail;

            if (!email) {
              const errorMsg = 'Registration email is missing. Please restart registration.';
              set({ isLoading: false, error: errorMsg });
              return { success: false, error: errorMsg };
            }

            return await get().verifyRegistrationOtp(email, otp);
          }

          // Preserve the existing phone-verification flow for the backend
          // endpoint currently used by the app.
          try {
            const response = await api.post('/auth/verify-otp', {
              phone,
              otp,
              purpose: 'phone_verification',
            });

            console.log('[AUTH DEBUG] phone_verification status:', response.status);

            if (response.data?.success) {
              const data = response.data?.data || {};
              const accessToken = data.accessToken || data.token;

              if (!accessToken) {
                const errorMsg =
                  'OTP verified but the server did not return an access token.';
                set({ isLoading: false, error: errorMsg });
                return { success: false, error: errorMsg };
              }

              const user = data.user || {
                id: data.userId || 'usr_otp',
                name: data.fullName || data.name || '',
                phone,
                role: 'customer',
              };

              set({
                user,
                token: accessToken,
                refreshToken: data.refreshToken || null,
                sessionId: data.sessionId || null,
                isAuthenticated: true,
                error: null,
                isLoading: false,
                pendingOtp: null,
              });

              try {
                const profileRes = await api.get('/auth/me');
                if (profileRes.data?.data) {
                  set({ user: profileRes.data.data });
                }
              } catch (_) {
                // Profile fetch is optional after successful authentication.
              }

              // Sync server cart to this device after OTP login
              require('./cartStore').useCartStore.getState().syncCartAfterLogin();

              return { success: true };
            }
          } catch (phoneErr: any) {
            const errorMsg =
              phoneErr.response?.data?.message ||
              phoneErr.message ||
              'Invalid OTP';

            console.log('[AUTH DEBUG] phone_verification failed:', {
              status: phoneErr.response?.status,
              errorCode: phoneErr.response?.data?.errorCode,
              message: errorMsg,
            });

            set({ isLoading: false, error: errorMsg });
            return { success: false, error: errorMsg };
          }

          const errorMsg = 'OTP verification failed. Please try again.';
          set({ isLoading: false, error: errorMsg });
          return { success: false, error: errorMsg };
        } catch (error: any) {
          const errorMsg =
            error.response?.data?.message ||
            error.message ||
            'Verification failed';

          console.warn('[AUTH DEBUG] Verify OTP error:', errorMsg);
          set({ isLoading: false, error: errorMsg });
          return { success: false, error: errorMsg };
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

      updateUser: async (userData: Partial<User>) => {
        try {
          const api = require('../services/api').default;
          const currentUser = get().user;

          // Build complete payload matching backend field expectations (fullName, phone_no, phone, email, avatar)
          const payload: any = {
            fullName: userData.name || (userData as any).fullName || currentUser?.name,
            phone_no: userData.phone || (userData as any).phone_no || currentUser?.phone,
            phone: userData.phone || (userData as any).phone_no || currentUser?.phone,
            email: userData.email !== undefined ? userData.email : currentUser?.email,
            avatar: userData.avatar !== undefined ? userData.avatar : currentUser?.avatar,
          };

          let res;
          let lastError: any;
          console.log('[Profile] Bearer Token:', get().token);
          try {
            res = await api.put('/user/profile', payload);
          } catch (putErr: any) {
            lastError = putErr;
            console.log('[Profile] PUT /user/profile failed, trying PATCH /user/profile');
            console.log('[Profile] PUT error status:', putErr.response?.status);
            console.log('[Profile] PUT error body:', JSON.stringify(putErr.response?.data, null, 2));
            try {
              res = await api.patch('/user/profile', payload);
            } catch (patchErr: any) {
              lastError = patchErr;
              console.log('[Profile] PATCH /user/profile failed, trying PUT /auth/profile');
              console.log('[Profile] PATCH error status:', patchErr.response?.status);
              console.log('[Profile] PATCH error body:', JSON.stringify(patchErr.response?.data, null, 2));
              try {
                res = await api.put('/auth/profile', payload);
              } catch (authErr: any) {
                lastError = authErr;
                console.log('[Profile] PUT /auth/profile also failed');
                console.log('[Profile] /auth/profile error status:', authErr.response?.status);
                console.log('[Profile] /auth/profile error body:', JSON.stringify(authErr.response?.data, null, 2));
              }
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

          // API responded but not success
          if (res && res.data && !res.data.success) {
            return { success: false, message: res.data.message || 'Failed to update profile' };
          }

          // All endpoints failed — report the actual error
          if (lastError) {
            const errorMsg = lastError.response?.data?.message || lastError.message || 'Failed to update profile';
            return { success: false, message: errorMsg };
          }

          return { success: false, message: 'Failed to update profile' };
        } catch (error: any) {
          console.warn('Update profile error', error.message || error);
          return { success: false, message: error.response?.data?.message || error.message || 'Failed to update profile' };
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
