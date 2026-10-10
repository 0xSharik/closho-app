import { Stack, type ErrorBoundaryProps, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SnackbarProvider } from '../src/components/ui/SnackbarContext';
import { useAuthStore } from '../src/store/authStore';
import { useSettingsStore } from '../src/store/settingsStore';
import { AppErrorBoundary } from '../src/components/AppErrorBoundary';
import { isJwtExpired, refreshAccessToken } from '../src/services/api';

function ScreenErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={screenErrorStyles.container}>
      <Text style={screenErrorStyles.title}>This screen failed</Text>
      <Text style={screenErrorStyles.message}>{error.message || 'Unexpected application error.'}</Text>
      <Pressable onPress={retry} style={screenErrorStyles.button} accessibilityRole="button">
        <Text style={screenErrorStyles.buttonText}>Try again</Text>
      </Pressable>
    </View>
  );
}

export const unstable_settings = {
  screenErrorBoundary: ScreenErrorBoundary,
};

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
    // Load platform delivery rules & configuration on app startup
    useSettingsStore.getState().fetchConfig();

    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('[Global] Unhandled promise rejection:', event.reason);
      event.preventDefault();
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  }, []);

  useEffect(() => {
    if (hasHydrated && isAuthenticated) {
      const { token, refreshToken } = useAuthStore.getState();
      if (token && refreshToken && isJwtExpired(token, 120)) {
        console.log('[RootLayout] Restored token is expired/expiring soon. Proactively refreshing...');
        void refreshAccessToken();
      }
    }
  }, [hasHydrated, isAuthenticated]);

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
        router.replace('/(tabs)');
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
    <AppErrorBoundary>
      <SnackbarProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="product/[id]" />
        </Stack>
      </SnackbarProvider>
    </AppErrorBoundary>
  );
}


const screenErrorStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 12 },
  message: { color: '#bbb', textAlign: 'center', lineHeight: 21, maxWidth: 420 },
  button: { marginTop: 20, backgroundColor: '#fff', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 10 },
  buttonText: { color: '#000', fontWeight: '700' },
});
