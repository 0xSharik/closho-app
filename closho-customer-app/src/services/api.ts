import axios, {
  AxiosError,
  AxiosRequestConfig,
  AxiosResponse,
} from 'axios';
import { env } from '../config/env';
import { useAuthStore } from '../store/authStore';
import {
  logUserActionFailure,
  logUserEvent,
} from '../utils/userEventLogger';

const api = axios.create({
  baseURL: env.API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface CreateOrderRequest {
  storeId: string;
  addressId: string;
  paymentMethod: string;
  couponCode?: string | null;
  deliveryFee?: number;
  subtotal?: number;
  discountAmount?: number;
  totalAmount?: number;
}

/**
 * Safely decodes JWT payload claims across Hermes, Native, and Web runtimes.
 */
export function getJwtPayload(token: string | null | undefined): Record<string, any> | null {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');

    let binaryStr = '';
    if (typeof atob === 'function') {
      binaryStr = atob(base64);
    } else {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
      let buffer = 0;
      let bits = 0;
      for (let i = 0; i < base64.length; i++) {
        const char = base64[i];
        if (char === '=') break;
        const idx = chars.indexOf(char);
        if (idx === -1) continue;
        buffer = (buffer << 6) | idx;
        bits += 6;
        if (bits >= 8) {
          bits -= 8;
          binaryStr += String.fromCharCode((buffer >> bits) & 0xff);
        }
      }
    }

    try {
      return JSON.parse(decodeURIComponent(escape(binaryStr)));
    } catch {
      return JSON.parse(binaryStr);
    }
  } catch {
    return null;
  }
}

/**
 * Checks if the JWT access token is expired or within the expiration buffer window (default: 60s).
 */
export function isJwtExpired(token: string | null | undefined, offsetSeconds: number = 60): boolean {
  if (!token) return true;
  const payload = getJwtPayload(token);
  if (!payload || !payload.exp) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  return payload.exp <= nowSec + offsetSeconds;
}

/**
 * Single-flight promise to prevent multiple concurrent token refresh requests.
 */
let refreshPromise: Promise<string | null> | null = null;

export const refreshAccessToken = async (): Promise<string | null> => {
  if (refreshPromise) {
    return refreshPromise;
  }

  const { refreshToken, token } = useAuthStore.getState();
  let { sessionId } = useAuthStore.getState();

  if (!refreshToken) {
    return null;
  }

  // Attempt to recover sessionId from JWT claims if missing in the store
  if (!sessionId) {
    const refreshClaims = getJwtPayload(refreshToken);
    const tokenClaims = getJwtPayload(token);
    sessionId =
      refreshClaims?.sessionId ||
      refreshClaims?.sid ||
      refreshClaims?.session_id ||
      tokenClaims?.sessionId ||
      tokenClaims?.sid ||
      tokenClaims?.session_id ||
      null;

    if (sessionId) {
      useAuthStore.setState({ sessionId });
    }
  }

  if (!sessionId) {
    console.warn('[AUTH] Cannot refresh token: sessionId is missing.');
    return null;
  }

  refreshPromise = (async () => {
    try {
      console.log('[AUTH] Requesting token refresh from /auth/refresh...');
      const response = await axios.post(
        `${env.API_URL}/auth/refresh`,
        {
          sessionId,
          refreshToken,
        },
        {
          timeout: 25000,
        }
      );

      if (!response.data?.success) {
        console.warn('[AUTH] Token refresh failed with response:', response.data);
        return null;
      }

      const resData = response.data?.data || response.data;
      const newAccessToken = resData?.accessToken || resData?.token;

      if (!newAccessToken) {
        console.warn('[AUTH] No accessToken in refresh response:', response.data);
        return null;
      }

      const newRefreshToken = resData?.refreshToken;
      const newSessionId = resData?.sessionId;

      console.log('[AUTH] Token refresh succeeded. Session preserved.');
      useAuthStore.setState({
        token: newAccessToken,
        ...(newRefreshToken ? { refreshToken: newRefreshToken } : {}),
        ...(newSessionId ? { sessionId: newSessionId } : {}),
      });

      return newAccessToken;
    } catch (error: any) {
      const status = error.response?.status;
      const errorCode = error.response?.data?.errorCode;
      console.warn('[AUTH] Token refresh request failed:', {
        status,
        errorCode,
        message: error.message,
      });

      logUserActionFailure('auth.token_refresh_failed', error);

      // Crucial: Only logout if the server explicitly rejected the refresh token as invalid/unauthorized
      if (status === 401 || status === 403) {
        console.warn('[AUTH] Refresh token invalidated by server. Logging out.');
        useAuthStore.getState().logout();
      }

      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

api.interceptors.request.use(
  async (config) => {
    try {
      const url = config.url || '';
      const isAuthEndpoint =
        url.includes('/auth/login') ||
        url.includes('/auth/register') ||
        url.includes('/auth/refresh') ||
        url.includes('/auth/login-otp') ||
        url.includes('/auth/verify-otp') ||
        url.includes('/auth/send-verification-otp') ||
        url.includes('/auth/forgot-password') ||
        url.includes('/auth/reset-password');

      let token = useAuthStore.getState().token;
      const refreshToken = useAuthStore.getState().refreshToken;

      // Proactively refresh access token before it expires
      if (!isAuthEndpoint && token && refreshToken && isJwtExpired(token, 60)) {
        console.log('[AUTH] Token expired or expiring in <60s. Proactively refreshing before request...');
        const refreshedToken = await refreshAccessToken();
        if (refreshedToken) {
          token = refreshedToken;
        }
      }

      logUserEvent('api.request', {
        method: config.method?.toUpperCase(),
        path: url.split('?')[0],
        authenticated: Boolean(token),
      });

      if (token) {
        config.headers = config.headers ?? {};
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      logUserActionFailure('api.authorization_setup_failed', error);
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response: AxiosResponse) => response,

  async (error: AxiosError) => {
    const errorMessage =
      typeof error?.message === 'string'
        ? error.message
        : '';

    if (
      error?.code === 'ECONNABORTED' ||
      errorMessage.toLowerCase().includes('timeout')
    ) {
      error.message =
        'The server is taking longer than usual to respond. Please try again.';

      return Promise.reject(error);
    }

    if (!error.response) {
      logUserActionFailure(
        'api.network_error',
        error
      );

      return Promise.reject(error);
    }

    if (error.response.status === 401) {
      const originalRequest =
        error.config as AxiosRequestConfig & {
          _retry?: boolean;
        };

      const url = originalRequest?.url || '';

      const isRefreshEndpoint = url.includes('/auth/refresh');
      const isLoginEndpoint = url.includes('/auth/login');

      // Attempt to refresh if authenticated request got 401
      if (
        !isRefreshEndpoint &&
        !isLoginEndpoint &&
        originalRequest &&
        !originalRequest._retry
      ) {
        originalRequest._retry = true;

        const newAccessToken =
          await refreshAccessToken();

        if (newAccessToken) {
          originalRequest.headers =
            originalRequest.headers ?? {};

          originalRequest.headers.Authorization =
            `Bearer ${newAccessToken}`;

          return api(originalRequest);
        }

        logUserEvent(
          'auth.session_refresh_unavailable',
          {
            path: url.split('?')[0],
          }
        );

        return Promise.reject(error);
      }
    }

    if (
      error.response.status >= 500 &&
      error.response.status <= 599
    ) {
      logUserActionFailure(
        'api.server_error',
        error
      );
    }

    return Promise.reject(error);
  }
);


/**
 * Create backend order.
 */
export const createOrder = async (
  data: CreateOrderRequest
) => {
  const response = await api.post(
    '/orders',
    data
  );

  return response.data;
};

export default api;