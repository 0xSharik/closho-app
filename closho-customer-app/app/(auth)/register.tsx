import { zodResolver } from '@hookform/resolvers/zod';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Animated, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
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

const registerSchema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().regex(/^\d{10}$/, 'Please enter a valid 10-digit mobile number'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type RegisterForm = z.infer<typeof registerSchema>;

type AuthControllerField = {
  onChange: (value: string) => void;
  onBlur: () => void;
  value: string;
};

export default function RegisterScreen() {
  const router = useRouter();
  const { phone: phoneParam } = useLocalSearchParams<{ phone?: string }>();
  const { showSnackbar } = useSnackbar();
  const [isLoading, setIsLoading] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true })
    ]).start();
  }, []);

  const initialPhone = typeof phoneParam === 'string'
    ? phoneParam.replace(/\D/g, '').slice(-10)
    : '';

  const { control, handleSubmit, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: initialPhone,
      password: '',
    },
  });

  const onSubmit = async (data: RegisterForm) => {
    if (isLoading) return;

    logUserEvent('auth.registration_submitted', { method: 'password' });

    // Keep the existing register() signature unchanged.
    // The store reads the pending phone and sends it as part of /auth/register.
    useAuthStore.getState().setPendingPhone(data.phone);

    setIsLoading(true);
    const result = await useAuthStore.getState().register(data.fullName, data.email, data.password);
    setIsLoading(false);

    if (result.success) {
      logUserEvent('auth.registration_succeeded', { method: 'password' });
      showSnackbar('Registration successful! Please login.', 'success');
      router.replace('/(auth)/login');
    } else {
      logUserEvent('auth.registration_failed', { method: 'password', reason: 'rejected' });
      showSnackbar(friendlyError(result.error, 'We could not create your account. Please try again.'), 'error');
    }
  };

  const handleGoogleLogin = async () => {
    logUserEvent('auth.registration_submitted', { method: 'google' });
    try {
      if (!GoogleSignin || typeof GoogleSignin.hasPlayServices !== 'function') {
        showSnackbar('Google Sign In requires a custom development build (not available in standard Expo Go).', 'info');
        return;
      }
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      const idToken = response.data?.idToken;

      if (idToken) {
        setIsLoading(true);
        const result = await useAuthStore.getState().googleLogin(idToken);
        setIsLoading(false);

        if (result.success) {
          logUserEvent('auth.registration_succeeded', { method: 'google' });
          router.replace('/(tabs)/reels');
          showSnackbar('Successfully logged in with Google!', 'success');
        } else {
          logUserEvent('auth.registration_failed', { method: 'google', reason: 'backend_rejected' });
          showSnackbar(friendlyError(result.error, 'Google sign-in failed. Please try again.'), 'error');
        }
      } else {
        logUserEvent('auth.registration_failed', { method: 'google', reason: 'missing_token' });
        showSnackbar('Google Sign In cancelled or missing token.', 'error');
      }
    } catch (error: any) {
      logUserActionFailure('auth.registration_failed', error, { method: 'google' });
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        // user cancelled the login flow
      } else if (error.code === statusCodes.IN_PROGRESS) {
        showSnackbar('Google Sign In is already in progress.', 'info');
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        showSnackbar('Google Play Services not available or outdated.', 'error');
      } else {
        showSnackbar(friendlyError(error?.message, 'Google sign-in failed. Please try again.'), 'error');
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <Text style={styles.logoText}>CLOSHO</Text>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Sign up to start shopping</Text>
        </Animated.View>

        <Animated.View style={[styles.form, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <Controller
            control={control}
            name="fullName"
            render={({ field: { onChange, onBlur, value } }: { field: AuthControllerField }) => (
              <Input
                label="Full Name"
                placeholder="John Doe"
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                error={errors.fullName?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }: { field: AuthControllerField }) => (
              <Input
                label="Email"
                placeholder="Enter your email"
                keyboardType="email-address"
                autoCapitalize="none"
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                error={errors.email?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="phone"
            render={({ field: { onChange, onBlur, value } }: { field: AuthControllerField }) => (
              <Input
                label="Mobile Number"
                placeholder="Enter 10-digit mobile number"
                keyboardType="phone-pad"
                maxLength={10}
                onBlur={onBlur}
                onChangeText={(text) => onChange(text.replace(/\D/g, ''))}
                value={value}
                error={errors.phone?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }: { field: AuthControllerField }) => (
              <Input
                label="Password"
                placeholder="Create a password"
                isPassword
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                error={errors.password?.message}
              />
            )}
          />

          <Button
            title="Register"
            onPress={handleSubmit(onSubmit, (formErrors) => logValidationFailure('auth.registration', Object.keys(formErrors)))}
            isLoading={isLoading}
            style={styles.registerBtn}
          />

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
          {/* <Button 
            title="Continue with Apple" 
            variant="outline" 
            onPress={() => {}}
          /> */}

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Button
              variant="text"
              title="Sign In"
              onPress={() => router.push('/(auth)/login')}
            />
          </View>
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
  registerBtn: {
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
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
  googleBtn: {
    marginBottom: spacing.lg,
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
