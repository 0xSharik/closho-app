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

let refreshPromise: Promise<string | null> | null = null;

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
        config.headers = config.headers ?? {};
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      logUserActionFailure(
        'api.authorization_setup_failed',
        error
      );
    }

    return config;
  },
  (error) => Promise.reject(error)
);

const refreshAccessToken = async (): Promise<string | null> => {
  if (refreshPromise) {
    return refreshPromise;
  }

  const { refreshToken, sessionId } =
    useAuthStore.getState();

  if (!refreshToken || !sessionId) {
    return null;
  }

  refreshPromise = (async () => {
    try {
      const response = await axios.post(
        `${env.API_URL}/auth/refresh`,
        {
          sessionId,
          refreshToken,
        },
        {
          timeout: 30000,
        }
      );

      if (!response.data?.success) {
        return null;
      }

      const newAccessToken =
        response.data?.data?.accessToken;

      if (!newAccessToken) {
        return null;
      }

      const newRefreshToken =
        response.data?.data?.refreshToken;

      useAuthStore.setState({
        token: newAccessToken,
        ...(newRefreshToken
          ? { refreshToken: newRefreshToken }
          : {}),
      });

      return newAccessToken;
    } catch (error) {
      logUserActionFailure(
        'auth.token_refresh_failed',
        error
      );

      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

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

      const isAuthEndpoint =
        url.includes('/auth/');

      if (
        !isAuthEndpoint &&
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

        /*
         * Do NOT immediately logout here.
         *
         * A refresh failure can be caused by:
         * - no internet
         * - timeout
         * - backend 500
         * - server temporarily unavailable
         *
         * The user's local session should not be destroyed
         * because of a temporary network problem.
         */
        logUserEvent(
          'auth.session_refresh_unavailable',
          {
            path: url.split('?')[0],
          }
        );

        return Promise.reject(error);
      }

      if (!isAuthEndpoint) {
        const refreshErrorStatus =
          error.response?.status;

        /*
         * Only logout when the authenticated request
         * has already failed after a refresh attempt.
         */
        if (
          refreshErrorStatus === 401 ||
          refreshErrorStatus === 403
        ) {
          useAuthStore.getState().logout();
        }
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