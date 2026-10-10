import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { useSnackbar } from '../../src/components/ui/SnackbarContext';
import { useAuthStore } from '../../src/store/authStore';
import { colors } from '../../src/theme/colors';
import { spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';
import { friendlyError } from '../../src/utils/friendlyError';
import { logUserActionFailure, logUserEvent } from '../../src/utils/userEventLogger';

export default function LoginScreen() {
  const router = useRouter();
  const { showSnackbar } = useSnackbar();
  const [isLoading, setIsLoading] = useState(false);

  // Single identifier for phone or email
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [userNotFound, setUserNotFound] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true })
    ]).start();
  }, []);

  const handleSendOtp = async () => {
    const trimmed = identifier.trim();
    if (!trimmed) {
      showSnackbar('Please enter your mobile number or email', 'error');
      return;
    }

    const isEmail = trimmed.includes('@');
    if (isEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmed)) {
        showSnackbar('Please enter a valid email address', 'error');
        return;
      }
    } else {
      const cleanPhone = trimmed.replace(/\D/g, '');
      if (cleanPhone.length < 10) {
        showSnackbar('Please enter a valid 10-digit phone number', 'error');
        return;
      }
    }

    setUserNotFound(false);
    setIsLoading(true);
    const result = await useAuthStore.getState().sendOtp(trimmed);
    setIsLoading(false);

    if (result.success) {
      logUserEvent('auth.otp_sent', { flow: 'login', channel: isEmail ? 'email' : 'phone' });
      setIsOtpSent(true);
      showSnackbar(`OTP sent successfully to your ${isEmail ? 'email' : 'phone'}!`, 'success');
    } else if (result.errorCode === 'USER_NOT_FOUND') {
      logUserEvent('auth.otp_send_failed', { reason: 'user_not_found' });
      setUserNotFound(true);
      if (isEmail) {
        useAuthStore.getState().setPendingEmail(trimmed);
      } else {
        useAuthStore.getState().setPendingPhone(trimmed.replace(/\D/g, ''));
      }
      logUserEvent('auth.registration_suggested', { reason: 'user_not_found' });
    } else {
      logUserEvent('auth.otp_send_failed', { reason: 'rejected' });
      showSnackbar(friendlyError(result.error, 'We could not send a code. Please try again.'), 'error');
    }
  };

  const handleVerifyOtp = async () => {
    const trimmed = identifier.trim();
    if (!trimmed || otp.length < 4) {
      showSnackbar('Please enter the OTP', 'error');
      return;
    }

    setIsLoading(true);
    const result = await useAuthStore.getState().verifyOtp(trimmed, otp);
    setIsLoading(false);

    if (!result.success) {
      showSnackbar(
        result.error || 'Invalid OTP',
        'error'
      );
      return;
    }

    const authState = useAuthStore.getState();

    if (
      authState.isAuthenticated &&
      authState.token
    ) {
      logUserEvent(
        'auth.login_succeeded',
        { method: 'otp' }
      );

      showSnackbar(
        'Successfully logged in!',
        'success'
      );

      router.replace('/(tabs)');
    }
  };

  const handleGoogleLogin = async () => {
    let statusCodes: any;
    logUserEvent('auth.login_submitted', { method: 'google' });
    console.log('[GoogleSignIn] ===== BUTTON PRESSED =====');

    try {
      console.log('[GoogleSignIn] Platform:', Platform.OS);

      if (Platform.OS === 'web') {
        console.log('[GoogleSignIn] Web platform, stopping');
        showSnackbar('Google Login is not supported on Web in this demo.', 'info');
        return;
      }

      let GoogleSignin: any;
      try {
        const googleModule = require('@react-native-google-signin/google-signin');
        GoogleSignin = googleModule.GoogleSignin;
        statusCodes = googleModule.statusCodes;
        if (typeof GoogleSignin?.configure === 'function') {
          GoogleSignin.configure({
            webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
          });
        }
      } catch (loadError: any) {
        console.warn('[GoogleSignIn] Native module unavailable:', loadError?.message || loadError);
        showSnackbar('Google Sign In is unavailable in this build.', 'info');
        return;
      }

      console.log('[GoogleSignIn] GoogleSignin exists:', !!GoogleSignin);
      console.log(
        '[GoogleSignIn] hasPlayServices exists:',
        typeof GoogleSignin?.hasPlayServices === 'function'
      );

      if (!GoogleSignin || typeof GoogleSignin.hasPlayServices !== 'function') {
        console.log('[GoogleSignIn] GoogleSignin unavailable');

        showSnackbar(
          'Google Sign In requires a custom development build (not available in standard Expo Go).',
          'info'
        );
        return;
      }

      console.log('[GoogleSignIn] Checking Play Services...');

      await GoogleSignin.hasPlayServices();

      console.log('[GoogleSignIn] Play Services OK');
      console.log('[GoogleSignIn] Signing out any existing session to force account picker...');

      // Always sign out first so Google shows the account chooser every time.
      // Without this, Google silently reuses the last signed-in account.
      try {
        await GoogleSignin.signOut();
        console.log('[GoogleSignIn] Signed out of previous session');
      } catch (signOutErr) {
        // Not fatal — continue even if sign-out fails (e.g. no prior session)
        console.log('[GoogleSignIn] signOut skipped (no prior session):', signOutErr);
      }

      console.log('[GoogleSignIn] Calling GoogleSignin.signIn()...');

      const response = await GoogleSignin.signIn();

      const idToken = response.data?.idToken;

      if (idToken) {
        console.log('[GoogleSignIn] Calling backend /auth/google...');

        setIsLoading(true);

        const result = await useAuthStore
          .getState()
          .googleLogin(idToken);

        setIsLoading(false);

        if (result.success) {
          logUserEvent('auth.login_succeeded', { method: 'google' });
          console.log('[GoogleSignIn] LOGIN SUCCESS');

          showSnackbar(
            'Successfully logged in with Google!',
            'success'
          );
        } else {
          logUserEvent('auth.login_failed', { method: 'google', reason: 'backend_rejected' });
          console.log('[GoogleSignIn] BACKEND LOGIN FAILED:', result.error);

          showSnackbar(
            friendlyError(result.error, 'Google sign-in failed. Please try again.'),
            'error'
          );
        }
      } else {
        logUserEvent('auth.login_failed', { method: 'google', reason: 'missing_token' });
        console.log('[GoogleSignIn] NO ID TOKEN');

        showSnackbar(
          'Google Sign In cancelled or missing token.',
          'error'
        );
      }

    } catch (error: any) {
      logUserActionFailure('auth.login_failed', error, { method: 'google' });

      console.log('[GoogleSignIn] ===== ERROR =====');
      console.log('[GoogleSignIn] Error:', error);
      console.log('[GoogleSignIn] Error message:', error?.message);
      console.log('[GoogleSignIn] Error code:', error?.code);
      console.log('[GoogleSignIn] Error response:', error?.response?.data);

      if (error.code === statusCodes?.SIGN_IN_CANCELLED) {
        console.log('[GoogleSignIn] User cancelled');
      } else if (error.code === statusCodes?.IN_PROGRESS) {
        console.log('[GoogleSignIn] Sign in already in progress');

        showSnackbar(
          'Google Sign In is already in progress.',
          'info'
        );
      } else if (error.code === statusCodes?.PLAY_SERVICES_NOT_AVAILABLE) {
        console.log('[GoogleSignIn] Play Services unavailable');

        showSnackbar(
          'Google Play Services not available or outdated.',
          'error'
        );
      } else {
        console.log('[GoogleSignIn] UNKNOWN GOOGLE ERROR');

        showSnackbar(
          friendlyError(error?.message, 'Google sign-in failed. Please try again.'),
          'error'
        );
      }
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      >
        <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <Text style={styles.logoText}>CLOSHO</Text>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Login with OTP using your mobile number or email</Text>
        </Animated.View>

        <Animated.View style={[styles.form, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View>
            <Input
              label="Mobile Number or Email"
              placeholder="Enter 10-digit mobile or email address"
              autoCapitalize="none"
              keyboardType="email-address"
              value={identifier}
              onChangeText={(text) => {
                setIdentifier(text);
                if (userNotFound) setUserNotFound(false);
              }}
              editable={!isOtpSent}
            />

            {isOtpSent && (
              <Input
                label="Verification Code (OTP)"
                placeholder="Enter 6-digit OTP"
                keyboardType="number-pad"
                value={otp}
                onChangeText={setOtp}
                maxLength={6}
              />
            )}

            {!isOtpSent ? (
              <>
                <Button
                  title={isLoading ? "Sending..." : "Send OTP"}
                  onPress={handleSendOtp}
                  disabled={isLoading || identifier.trim().length === 0}
                />
                {userNotFound && (
                  <View style={styles.notFoundBox}>
                    <Ionicons name="alert-circle-outline" size={20} color={colors.status?.error || '#FF4444'} />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.notFoundTitle}>Account not registered</Text>
                      <Text style={styles.notFoundSub}>This mobile number or email doesn't exist in our system.</Text>
                    </View>
                  </View>
                )}
                {userNotFound && (
                  <Button
                    title="Create Account"
                    variant="outline"
                    style={{ marginTop: 8 }}
                    onPress={() =>
                      router.push({
                        pathname: '/(auth)/register',
                        params: identifier.includes('@')
                          ? { email: identifier.trim() }
                          : { phone: identifier.replace(/\D/g, '') },
                      })
                    }
                  />
                )}
              </>
            ) : (
              <>
                <Button
                  title={isLoading ? "Verifying..." : "Verify OTP"}
                  onPress={handleVerifyOtp}
                  disabled={isLoading || otp.length < 4}
                />

                <View style={styles.forgotPasswordContainer}>
                  <Button
                    variant="text"
                    title="Change Number or Email"
                    style={{ height: 'auto', paddingHorizontal: 0, marginTop: 10 }}
                    onPress={() => { setIsOtpSent(false); setOtp(''); }}
                  />
                </View>
              </>
            )}
          </View>

          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.divider} />
          </View>

          <Button
            title="Continue with Google"
            variant="secondary"
            style={{ marginBottom: spacing.md }}
            onPress={handleGoogleLogin}
            disabled={isLoading}
          />
        </Animated.View>

        <Animated.View style={[styles.footer, { opacity: fadeAnim }]}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <Button
            variant="text"
            title="Register"
            onPress={() => router.push('/(auth)/register')}
          />
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.xl,
    justifyContent: 'center',
  },
  header: {
    marginBottom: spacing.xxl,
  },
  logoText: {
    fontSize: 28,
    color: colors.primary,
    letterSpacing: 4,
    marginBottom: spacing.lg,
    alignSelf: 'flex-start',
  },
  title: {
    fontSize: typography.fontSize.xxxl,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.fontSize.md,
    color: colors.text.secondary,
  },
  form: {
    marginBottom: spacing.xl,
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: typography.fontSize.sm,
    fontWeight: 'bold',
    color: colors.text.secondary,
  },
  activeTabText: {
    color: colors.background,
  },
  forgotPasswordContainer: {
    alignItems: 'flex-end',
    marginBottom: spacing.lg,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
    marginTop: spacing.xl,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    color: colors.text.tertiary,
    paddingHorizontal: spacing.md,
    fontSize: typography.fontSize.xs,
    fontWeight: 'bold',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    color: colors.text.secondary,
  },
  notFoundBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FF444415',
    borderWidth: 1,
    borderColor: '#FF444440',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  notFoundTitle: {
    color: '#FF4444',
    fontWeight: 'bold',
    fontSize: 13,
    marginBottom: 2,
  },
  notFoundSub: {
    color: colors.text.secondary,
    fontSize: 12,
    lineHeight: 16,
  },
});
