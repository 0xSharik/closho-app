import axios from 'axios';
import { env } from '../config/env';
import { useAuthStore } from '../store/authStore';
import { logUserActionFailure, logUserEvent } from '../utils/userEventLogger';

const api = axios.create({
  baseURL: env.API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});
// Request interceptor to attach token
api.interceptors.request.use(
  async (config) => {
    try {
      const token = useAuthStore.getState().token;

      logUserEvent('api.request', {
        method: config.method?.toUpperCase(),
        path: config.url?.split('?')[0],
        authenticated: Boolean(token),
      });

      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      logUserActionFailure('api.authorization_setup_failed', error);
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for handling common errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      error.message = 'The server is taking longer than usual to respond. It might be waking up, please try again.';
    } else if (error.response?.status === 401) {
      const originalRequest = error.config;
      const url = originalRequest?.url || '';

      // NEVER trigger logout/refresh for any /auth/ endpoint.
      // A 401 on /auth/verify-otp = "wrong OTP", NOT "session expired".
      const isAuthEndpoint = url.includes('/auth/');

      if (!isAuthEndpoint && !originalRequest._retry) {
        originalRequest._retry = true;
        const { refreshToken, sessionId, logout } = useAuthStore.getState();

        if (refreshToken && sessionId) {
          try {
            console.log('Attempting to refresh token...');
            const refreshResponse = await axios.post(`${env.API_URL}/auth/refresh`, {
              sessionId,
              refreshToken
            });

            if (refreshResponse.data.success) {
              const newAccessToken = refreshResponse.data.data.accessToken;
              useAuthStore.setState({ token: newAccessToken });
              originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
              return api(originalRequest);
            }
          } catch (refreshError) {
            logUserActionFailure('auth.token_refresh_failed', refreshError);
            logout();
            return Promise.reject(refreshError);
          }
        }

        const currentToken = useAuthStore.getState().token;
        logUserEvent('auth.session_expired', { path: url.split('?')[0], hasToken: Boolean(currentToken) });
        logout();
      }
    }
    return Promise.reject(error);
  }
);

export default api;
