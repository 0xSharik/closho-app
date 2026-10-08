import type { Router } from 'expo-router';

/**
 * Preserve the user's navigation history. A fresh deep link has no history,
 * so use Home as the safe fallback instead of Expo Router's initial tab.
 */
export function goBackOrHome(router: Router) {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace('/(tabs)');
}
