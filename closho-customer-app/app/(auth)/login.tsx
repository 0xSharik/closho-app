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
import { colors } from '../../src/theme/colors';
import { spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';

try {
  if (GoogleSignin && typeof GoogleSignin.configure === 'function') {
    //temp code
    console.log(
      '[GoogleSignIn] Web Client ID exists:',
      !!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
    );

    console.log(
      '[GoogleSignIn] Web Client ID suffix:',
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.slice(-25)
    );


    //upto here
    GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    });
  }
} catch (e) {
  console.log('[GoogleSignin] Not supported in Expo Go environment');
}

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginScreen() {
  const router = useRouter();
  const { showSnackbar } = useSnackbar();
  const [isLoading, setIsLoading] = useState(false);
  const [loginMethod, setLoginMethod] = useState<'mobile' | 'email'>('mobile');

  // Mobile OTP state
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);

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
      email: '',
      password: '',
    },
  });

  const onSubmitEmail = async (data: LoginForm) => {
    setIsLoading(true);
    const result = await useAuthStore.getState().login(data.email, data.password);
    setIsLoading(false);

    if (result.success) {
      showSnackbar('Successfully logged in!', 'success');
    } else {
      showSnackbar(result.error || 'Invalid credentials. Please try again.', 'error');
    }
  };

  const handleSendOtp = async () => {
    if (phone.length < 10) {
      showSnackbar('Please enter a valid 10-digit phone number', 'error');
      return;
    }
    setIsLoading(true);
    const result = await useAuthStore.getState().sendOtp(phone);
    setIsLoading(false);

    if (result.success) {
      setIsOtpSent(true);
      showSnackbar('OTP sent successfully!', 'success');
    } else {
      showSnackbar(result.error || 'Failed to send OTP.', 'error');
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length < 4) {
      showSnackbar('Please enter the OTP', 'error');
      return;
    }
    setIsLoading(true);
    const result = await useAuthStore.getState().verifyOtp(phone, otp) as { success: boolean; error?: string; resetToken?: string };
    setIsLoading(false);

    console.log('[AUTH DEBUG] ===== ROUTING STATE =====');
    console.log('[AUTH DEBUG] isAuthenticated:', useAuthStore.getState().isAuthenticated);
    console.log('[AUTH DEBUG] hasResetToken:', !!(result as any).resetToken);

    if (result.success) {
      if (result.resetToken) {
        // Password-reset OTP verified — user is NOT logged in, must reset password first.
        console.log('[AUTH DEBUG] ROUTING');
        console.log('[AUTH DEBUG] reason: password_reset');
        console.log('[AUTH DEBUG] isAuthenticated: false');
        console.log('[AUTH DEBUG] target: reset-password');
        showSnackbar('OTP verified! Please set your new password.', 'info');
        router.push({ pathname: '/(auth)/reset-password', params: { resetToken: result.resetToken } });
      } else {
        // Normal phone_verification login — user is authenticated.
        console.log('[AUTH DEBUG] ROUTING');
        console.log('[AUTH DEBUG] reason: authenticated');
        console.log('[AUTH DEBUG] isAuthenticated: true');
        console.log('[AUTH DEBUG] target: reels');
        showSnackbar('Successfully logged in!', 'success');
      }
    } else {
      showSnackbar(result.error || 'Invalid OTP.', 'error');
    }
  };

 const handleGoogleLogin = async () => {
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
    console.log('[GoogleSignIn] Calling GoogleSignin.signIn()...');

    const response = await GoogleSignin.signIn();

    console.log(
      '[GoogleSignIn] Response:',
      JSON.stringify(response, null, 2)
    );

    const idToken = response.data?.idToken;

    console.log('[GoogleSignIn] Has ID token:', !!idToken);
    console.log('[GoogleSignIn] Token length:', idToken?.length);

    if (idToken) {
      console.log('[GoogleSignIn] Calling backend /auth/google...');

      setIsLoading(true);

      const result = await useAuthStore
        .getState()
        .googleLogin(idToken);

      console.log('[GoogleSignIn] Backend result:', result);

      setIsLoading(false);

      if (result.success) {
        console.log('[GoogleSignIn] LOGIN SUCCESS');

        showSnackbar(
          'Successfully logged in with Google!',
          'success'
        );
      } else {
        console.log('[GoogleSignIn] BACKEND LOGIN FAILED:', result.error);

        showSnackbar(
          result.error || 'Google Login failed on server.',
          'error'
        );
      }
    } else {
      console.log('[GoogleSignIn] NO ID TOKEN');

      showSnackbar(
        'Google Sign In cancelled or missing token.',
        'error'
      );
    }

  } catch (error: any) {

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
        'Google Sign In error: ' + error.message,
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
              style={[styles.tab, loginMethod === 'mobile' && styles.activeTab]}
              onPress={() => setLoginMethod('mobile')}
            >
              <Text style={[styles.tabText, loginMethod === 'mobile' && styles.activeTabText]}>Mobile Number</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, loginMethod === 'email' && styles.activeTab]}
              onPress={() => setLoginMethod('email')}
            >
              <Text style={[styles.tabText, loginMethod === 'email' && styles.activeTabText]}>Email</Text>
            </TouchableOpacity>
          </View>

          {loginMethod === 'email' ? (
            <View>
              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input label="Email" placeholder="Enter your email" keyboardType="email-address" autoCapitalize="none" onBlur={onBlur} onChangeText={onChange} value={value} error={errors.email?.message} />
                )}
              />

              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, onBlur, value } }) => (
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
                onPress={handleSubmit(onSubmitEmail)}
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
                <Button
                  title={isLoading ? "Sending..." : "Send OTP"}
                  onPress={handleSendOtp}
                  disabled={isLoading || phone.length < 10}
                />
              ) : (
                <Button
                  title={isLoading ? "Verifying..." : "Verify OTP"}
                  onPress={handleVerifyOtp}
                  disabled={isLoading || otp.length < 4}
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
});
