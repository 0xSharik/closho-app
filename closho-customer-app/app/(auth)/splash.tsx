import { useRouter } from 'expo-router';
import * as ExpoSplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useAuthStore } from '../../src/store/authStore';
import { colors } from '../../src/theme/colors';
import { spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';

export default function SplashScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading, hasHydrated } = useAuthStore();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    // Hide the native splash screen now that our custom one is mounted
    ExpoSplashScreen.hideAsync().catch(() => { });

    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, tension: 15, friction: 8, useNativeDriver: true })
    ]).start();

    // Only proceed if SecureStore loading is complete
    if (isLoading || !hasHydrated) return;

    const timer = setTimeout(() => {
      if (isAuthenticated) {
        router.replace('/(tabs)/reels');
      } else {
        router.replace('/(auth)/login');
      }
    }, 3000); // 3-second splash

    return () => clearTimeout(timer);
  }, [hasHydrated, isAuthenticated, isLoading, router]);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoMark}>CS</Text>
        </View>
        <Text style={styles.logoText}>CLOSHO</Text>
        <Text style={styles.subLogoText}>CLOTHES & SHOES</Text>
      </Animated.View>

      <View style={styles.bottomContent}>
        <Text style={styles.poweredBy}>Powered by 499 stores</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background, // Matte Black
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    marginBottom: spacing.md,
  },
  logoMark: {
    fontSize: 56,
    color: colors.primary, // Champagne gold
    fontFamily: typography.fontFamily.bold,
    letterSpacing: 2,
  },
  logoText: {
    fontSize: typography.fontSize.xxxl + 4,
    fontWeight: '300',
    color: colors.primary,
    letterSpacing: 8,
    marginBottom: spacing.xs,
  },
  subLogoText: {
    fontSize: typography.fontSize.xs,
    color: colors.primaryLight,
    letterSpacing: 4,
    fontWeight: '600',
  },
  bottomContent: {
    alignItems: 'center',
  },
  poweredBy: {
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
    letterSpacing: 1,
  },
});
