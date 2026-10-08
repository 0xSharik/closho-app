import { env } from '../config/env';

/**
 * Converts the avatar value returned by the backend into an image URI.
 * Absolute URLs are returned unchanged. Local picker URIs are also returned
 * unchanged so the selected image can be previewed before upload.
 */
export const getAvatarUrl = (avatar?: string | null): string => {
  if (!avatar || typeof avatar !== 'string') {
    return '';
  }

  const value = avatar.trim();

  if (!value) {
    return '';
  }

  // Already a complete URL from the backend.
  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  // Local Expo / Android picker URI.
  if (
    value.startsWith('file://') ||
    value.startsWith('content://')
  ) {
    return value;
  }

  const baseUrl = env.API_URL.replace(/\/$/, '');
  const path = value.replace(/^\/+/, '');

  // Backend normally returns paths such as /images/profiles/file.jpg.
  return `${baseUrl}/${path}`;
};
