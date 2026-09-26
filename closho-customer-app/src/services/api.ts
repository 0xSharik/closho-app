import axios from 'axios';
import { env } from '../config/env';
import { useAuthStore } from '../store/authStore';

const api = axios.create({
  baseURL: env.API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});
// Request interceptor to attach token
console.log('[API CONFIG] API_URL:', env.API_URL);
api.interceptors.request.use(
  async (config) => {
    try {
      const token = useAuthStore.getState().token;

      console.log('[AUTH DEBUG] ===== PROTECTED REQUEST =====');
      console.log('[AUTH DEBUG] endpoint:', config.url);
      console.log('[AUTH DEBUG] hasToken:', !!token);

      // TEMPORARY DEBUG ONLY
      console.log('[AUTH DEBUG] TOKEN:', token);
      console.log(
        '[AUTH DEBUG] AUTHORIZATION HEADER:',
        token ? `Bearer ${token}` : 'NONE'
      );

      const tokenType = !token
        ? 'NONE'
        : token === 'mock-token'
          ? 'MOCK_TOKEN'
          : 'REAL_ACCESS_TOKEN';

      console.log('[AUTH DEBUG] tokenType:', tokenType);

      console.log('[API] ===== REQUEST =====');
      console.log('[API] Method:', config.method);
      console.log('[API] Base URL:', config.baseURL);
      console.log('[API] URL:', config.url);
      console.log(
        '[API] Full URL:',
        `${config.baseURL || ''}${config.url || ''}`
      );
      console.log('[API] Has auth token:', !!token);

      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('Error fetching token from storage', error);
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
            console.warn('Token refresh failed -> Forcing logout');
            logout();
            return Promise.reject(refreshError);
          }
        }

        const currentToken = useAuthStore.getState().token;
        console.log('[AUTH DEBUG] ===== AUTHORIZATION FAILURE =====');
        console.log('[AUTH DEBUG] endpoint:', url);
        console.log('[AUTH DEBUG] status: 401');
        console.log('[AUTH DEBUG] tokenExists:', !!currentToken);
        console.log('[AUTH DEBUG] action: LOGOUT');
        logout();
      }
    }
    return Promise.reject(error);
  }
);

export default api;
