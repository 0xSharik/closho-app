import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Animated, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { z } from 'zod';
import { Button } from '../../src/components/ui/Button';
import { Input } from '../../src/components/ui/Input';
import { useSnackbar } from '../../src/components/ui/SnackbarContext';
import { useAuthStore } from '../../src/store/authStore';
import { friendlyError } from '../../src/utils/friendlyError';
import { logUserActionFailure, logUserEvent, logValidationFailure } from '../../src/utils/userEventLogger';
import { colors } from '../../src/theme/colors';
import { spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';

try {
  if (GoogleSignin && typeof GoogleSignin.configure === 'function') {
    GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    });
  }
} catch (e) {
  console.log('[GoogleSignin] Not supported in Expo Go environment');
}

const loginSchema = z.object({
  emailOrPhone: z.string().min(3, 'Please enter a valid email or phone number'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginForm = z.infer<typeof loginSchema>;

type AuthControllerField = {
  onChange: (value: string) => void;
  onBlur: () => void;
  value: string;
};

export default function LoginScreen() {
  const router = useRouter();
  const { showSnackbar } = useSnackbar();
  const [isLoading, setIsLoading] = useState(false);
  const [loginMethod, setLoginMethod] = useState<'mobile' | 'email'>('email');

  // Mobile OTP state
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [phoneNotFound, setPhoneNotFound] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true })
    ]).start();
  }, []);

  const { control, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      emailOrPhone: '',
      password: '',
    },
  });

  const onSubmitEmail = async (data: LoginForm) => {
    logUserEvent('auth.login_submitted', { method: 'password' });
    setIsLoading(true);
    const result = await useAuthStore.getState().login(data.emailOrPhone, data.password);
    setIsLoading(false);

    if (result.success) {
      logUserEvent('auth.login_succeeded', { method: 'password' });
      showSnackbar('Successfully logged in!', 'success');
    } else {
      const reason = /invalid|wrong|credential|unauthorized/i.test(result.error || '')
        ? 'invalid_credentials'
        : 'rejected';
      logUserEvent('auth.login_failed', { method: 'password', reason });
      showSnackbar(friendlyError(result.error, 'The email or password you entered is incorrect.'), 'error');
    }
  };

  const handleSendOtp = async () => {
    if (phone.length < 10) {
      logValidationFailure('auth.otp_login', ['phone']);
      showSnackbar('Please enter a valid 10-digit phone number', 'error');
      return;
    }
    setPhoneNotFound(false);
    setIsLoading(true);
    const result = await useAuthStore.getState().sendOtp(phone);
    setIsLoading(false);

    if (result.success) {
      logUserEvent('auth.otp_sent', { flow: 'login' });
      setIsOtpSent(true);
      showSnackbar('OTP sent successfully!', 'success');
    } else if (result.errorCode === 'USER_NOT_FOUND') {
      logUserEvent('auth.otp_send_failed', { reason: 'user_not_found' });
      setPhoneNotFound(true);
      useAuthStore.getState().setPendingPhone(phone);
      logUserEvent('auth.registration_suggested', { reason: 'user_not_found' });
    } else {
      logUserEvent('auth.otp_send_failed', { reason: 'rejected' });
      showSnackbar(friendlyError(result.error, 'We could not send a code. Please try again.'), 'error');
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      logValidationFailure('auth.otp_verification', ['otp']);
      showSnackbar('Please enter the 6-digit OTP', 'error');
      return;
    }

    setIsLoading(true);
    const result = await useAuthStore.getState().verifyOtp(phone, otp);
    setIsLoading(false);

    console.log('[AUTH DEBUG] ===== ROUTING STATE =====');
    console.log('[AUTH DEBUG] isAuthenticated:', useAuthStore.getState().isAuthenticated);
    console.log('[AUTH DEBUG] hasResetToken:', !!result.resetToken);

    if (!result.success) {
      logUserEvent('auth.otp_verification_failed', { reason: 'invalid_or_expired' });
      showSnackbar(friendlyError(result.error, 'The code you entered is incorrect. Please try again.'), 'error');
      return;
    }

    if (result.resetToken) {
      console.log('[AUTH DEBUG] OTP is password-reset flow -> reset-password');
      showSnackbar('OTP verified! Please set your new password.', 'info');

      router.push({
        pathname: '/(auth)/reset-password',
        params: { resetToken: result.resetToken },
      });
      return;
    }

    if (useAuthStore.getState().isAuthenticated) {
      logUserEvent('auth.login_succeeded', { method: 'otp' });
      console.log('[AUTH DEBUG] OTP login succeeded with real access token.');
      showSnackbar('Successfully logged in!', 'success');
    }
  };

  const handleGoogleLogin = async () => {
    logUserEvent('auth.login_submitted', { method: 'google' });
    console.log('[GoogleSignIn] ===== BUTTON PRESSED =====');

    try {
      console.log('[GoogleSignIn] Platform:', Platform.OS);

      if (Platform.OS === 'web') {
        console.log('[GoogleSignIn] Web platform, stopping');
        showSnackbar('Google Login is not supported on Web in this demo.', 'info');
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

      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        console.log('[GoogleSignIn] User cancelled');
      } else if (error.code === statusCodes.IN_PROGRESS) {
        console.log('[GoogleSignIn] Sign in already in progress');

        showSnackbar(
          'Google Sign In is already in progress.',
          'info'
        );
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
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
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <Text style={styles.logoText}>CLOSHO</Text>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Login to your account to continue</Text>
        </Animated.View>

        <Animated.View style={[styles.form, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

          {/* Tabs */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, loginMethod === 'email' && styles.activeTab]}
              onPress={() => setLoginMethod('email')}
            >
              <Text style={[styles.tabText, loginMethod === 'email' && styles.activeTabText]}>Email / Mobile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, loginMethod === 'mobile' && styles.activeTab]}
              onPress={() => setLoginMethod('mobile')}
            >
              <Text style={[styles.tabText, loginMethod === 'mobile' && styles.activeTabText]}>Phone</Text>
            </TouchableOpacity>
          </View>

          {loginMethod === 'email' ? (
            <View>
              <Controller
                control={control}
                name="emailOrPhone"
                render={({ field: { onChange, onBlur, value } }: { field: AuthControllerField }) => (
                  <Input label="Email or Mobile" placeholder="Enter email or mobile" autoCapitalize="none" onBlur={onBlur} onChangeText={onChange} value={value} error={errors.emailOrPhone?.message} />
                )}
              />

              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, onBlur, value } }: { field: AuthControllerField }) => (
                  <Input label="Password" placeholder="Enter your password" isPassword onBlur={onBlur} onChangeText={onChange} value={value} error={errors.password?.message} />
                )}
              />

              <View style={styles.forgotPasswordContainer}>
                <Button
                  variant="text"
                  title="Forgot Password?"
                  style={{ height: 'auto', paddingHorizontal: 0 }}
                  onPress={() => router.push('/(auth)/forgot-password')}
                />
              </View>

              <Button
                title={isLoading ? "Signing in..." : "Sign In"}
                onPress={handleSubmit(onSubmitEmail, (formErrors) => logValidationFailure('auth.login', Object.keys(formErrors)))}
                disabled={isLoading}
              />
            </View>
          ) : (
            <View>
              <Input
                label="Mobile Number"
                placeholder="Enter 10-digit number"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                editable={!isOtpSent}
              />

              {isOtpSent && (
                <Input
                  label="OTP"
                  placeholder="Enter 6-digit OTP"
                  keyboardType="number-pad"
                  value={otp}
                  onChangeText={setOtp}
                />
              )}

              {!isOtpSent ? (
                <>
                  <Button
                    title={isLoading ? "Sending..." : "Send OTP"}
                    onPress={handleSendOtp}
                    disabled={isLoading || phone.length < 10}
                  />
                  {phoneNotFound && (
                    <View style={styles.notFoundBox}>
                      <Ionicons name="alert-circle-outline" size={20} color={colors.status?.error || '#FF4444'} />
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text style={styles.notFoundTitle}>Number not registered</Text>
                        <Text style={styles.notFoundSub}>This mobile number doesn't exist in our system.</Text>
                      </View>
                    </View>
                  )}
                  {phoneNotFound && (
                    <Button
                      title="Create Account"
                      variant="outline"
                      style={{ marginTop: 8 }}
                      onPress={() =>
                        router.push({
                          pathname: '/(auth)/register',
                          params: { phone },
                        })
                      }
                    />
                  )}
                </>
              ) : (
                <Button
                  title={isLoading ? "Verifying..." : "Verify OTP"}
                  onPress={handleVerifyOtp}
                  disabled={isLoading || otp.length !== 6}
                />
              )}

              {isOtpSent && (
                <View style={styles.forgotPasswordContainer}>
                  <Button
                    variant="text"
                    title="Change Number"
                    style={{ height: 'auto', paddingHorizontal: 0, marginTop: 10 }}
                    onPress={() => { setIsOtpSent(false); setOtp(''); }}
                  />
                </View>
              )}
            </View>
          )}

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
