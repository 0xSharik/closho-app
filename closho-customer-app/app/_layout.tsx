import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { useAuthStore } from '../src/store/authStore';
import { SnackbarProvider } from '../src/components/ui/SnackbarContext';

const PUBLIC_AUTH_ROUTES = new Set([
  'login',
  'register',
  'forgot-password',
  'otp-verification',
  'reset-password',
  'splash',
]);

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();

  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );
  const isLoading = useAuthStore(
    (state) => state.isLoading
  );
  const hasHydrated = useAuthStore(
    (state) => state.hasHydrated
  );

  const inAuthGroup =
    segments[0] === '(auth)';
  const currentRoute =
    segments[1] || '';
  const isPublicAuthRoute =
    PUBLIC_AUTH_ROUTES.has(currentRoute);
  const isSplash =
    currentRoute === 'splash';

  useEffect(() => {
    console.log('[AUTH GUARD DEBUG]', {
      currentRoute,
      inAuthGroup,
      isAuthenticated,
      isPublicAuthRoute,
      isSplash,
      isLoading,
    });

    if (!hasHydrated || isLoading) {
      console.log(
        '[AUTH GUARD DEBUG] Auth operation in progress. Skipping routing.'
      );
      return;
    }

    if (inAuthGroup) {
      if (
        isAuthenticated &&
        !isSplash
      ) {
        console.log(
          '[AUTH GUARD DEBUG] Authenticated user leaving auth flow -> tabs.'
        );
        router.replace(
          '/(tabs)/reels'
        );
        return;
      }

      if (
        !isAuthenticated &&
        isPublicAuthRoute
      ) {
        console.log(
          '[AUTH GUARD DEBUG] Public auth route allowed:',
          currentRoute
        );
        return;
      }

      return;
    }

    if (!isAuthenticated) {
      console.log(
        '[AUTH GUARD DEBUG] Protected route without auth -> login.'
      );
      router.replace(
        '/(auth)/login'
      );
      return;
    }

    console.log(
      '[AUTH GUARD DEBUG] Protected route allowed.'
    );
  }, [
    currentRoute,
    inAuthGroup,
    isAuthenticated,
    hasHydrated,
    isLoading,
    isPublicAuthRoute,
    isSplash,
    router,
  ]);

  return (
    <SnackbarProvider>
      <Slot />
    </SnackbarProvider>
  );
}
