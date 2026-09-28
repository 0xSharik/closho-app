import { zodResolver } from '@hookform/resolvers/zod';
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
import { colors } from '../../src/theme/colors';
import { spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';

const otpSchema = z.object({
  otp: z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
});

type OtpForm = z.infer<typeof otpSchema>;

type OtpPurpose = 'registration' | 'password_reset';

type AuthControllerField = {
  onChange: (value: string) => void;
  onBlur: () => void;
  value: string;
};

export default function OtpVerificationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    email?: string;
    purpose?: string;
  }>();

  const email = typeof params.email === 'string' ? params.email : '';
  const purpose = typeof params.purpose === 'string' ? params.purpose : undefined;

  const { showSnackbar } = useSnackbar();
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    console.log('[OTP SCREEN DEBUG] ===== OTP SCREEN MOUNT =====');
    console.log('[OTP SCREEN DEBUG] email:', email || 'MISSING');
    console.log('[OTP SCREEN DEBUG] purpose param:', purpose || 'MISSING');

    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true })
    ]).start();

    return () => {
      console.log('[OTP SCREEN DEBUG] ===== OTP SCREEN UNMOUNT =====');
    };
  }, []);

  const otpPurpose: OtpPurpose =
    purpose === 'registration' ? 'registration' : 'password_reset';

  const { control, handleSubmit, formState: { errors } } = useForm<OtpForm>({
    resolver: zodResolver(otpSchema),
  });

  const onSubmit = async (data: OtpForm) => {
    console.log('[OTP SCREEN DEBUG] ===== VERIFY BUTTON PRESSED =====');
    console.log('[OTP SCREEN DEBUG] purpose:', otpPurpose);
    console.log('[OTP SCREEN DEBUG] email:', email || 'MISSING');
    console.log('[OTP SCREEN DEBUG] otpLength:', data.otp?.length);

    if (isLoading) {
      console.log('[OTP SCREEN DEBUG] VERIFY BLOCKED: request already running');
      return;
    }

    if (!email) {
      console.log('[OTP SCREEN DEBUG] VERIFY BLOCKED: email missing');
      showSnackbar('Error: Email address is missing.', 'error');
      return;
    }

    setIsLoading(true);

    try {
      console.log('[OTP SCREEN DEBUG] Calling authStore OTP verification...');

      const result =
        otpPurpose === 'registration'
          ? await useAuthStore.getState().verifyRegistrationOtp(email, data.otp)
          : await useAuthStore.getState().verifyPasswordResetOtp(email, data.otp);

      console.log('[OTP SCREEN DEBUG] OTP VERIFY RESULT:', result);

      setIsLoading(false);

      if (result.success) {
        console.log('[OTP SCREEN DEBUG] OTP VERIFY SUCCESS');

        if (otpPurpose === 'registration') {
          console.log('[OTP SCREEN DEBUG] Registration OTP verified -> navigating to login');
          showSnackbar('Account verified successfully. Please login.', 'success');
          router.replace('/(auth)/login');
          return;
        }

        if ('resetToken' in result && typeof result.resetToken === 'string' && result.resetToken) {
          console.log('[OTP SCREEN DEBUG] Password reset OTP verified');
          console.log('[OTP SCREEN DEBUG] resetToken received:', true);
          console.log('[OTP SCREEN DEBUG] Navigating to reset-password');

          showSnackbar('OTP verified successfully.', 'success');
          router.push({
            pathname: '/(auth)/reset-password',
            params: { resetToken: result.resetToken },
          });
          return;
        }

        console.log('[OTP SCREEN DEBUG] OTP verified but resetToken missing');
        showSnackbar('OTP verified, but no reset token was received.', 'error');
        return;
      }

      console.log('[OTP SCREEN DEBUG] OTP VERIFY FAILED:', result.error);

      showSnackbar(friendlyError(result.error, 'The code you entered is incorrect. Please try again.'), 'error');
    } catch (error: any) {
      console.log('[OTP SCREEN DEBUG] OTP VERIFY UNEXPECTED ERROR:', {
        message: error?.message,
        error,
      });

      setIsLoading(false);
      showSnackbar(
        friendlyError(error?.message, 'We could not verify that code. Please try again.'),
        'error'
      );
    }
  };

  const resendOtp = async () => {
    console.log('[OTP SCREEN DEBUG] ===== RESEND OTP PRESSED =====');
    console.log('[OTP SCREEN DEBUG] purpose:', otpPurpose);
    console.log('[OTP SCREEN DEBUG] email:', email || 'MISSING');

    if (!email) {
      console.log('[OTP SCREEN DEBUG] RESEND BLOCKED: email missing');
      showSnackbar('Error: Email address is missing.', 'error');
      return;
    }

    if (isResending) {
      console.log('[OTP SCREEN DEBUG] RESEND BLOCKED: request already running');
      return;
    }

    setIsResending(true);

    try {
      if (otpPurpose === 'registration') {
        console.log('[OTP SCREEN DEBUG] Calling resendRegistrationOtp()');

        const result =
          await useAuthStore
            .getState()
            .resendRegistrationOtp();

        console.log('[OTP SCREEN DEBUG] REGISTRATION RESEND RESULT:', result);

        if (result.success) {
          console.log('[OTP SCREEN DEBUG] REGISTRATION OTP RESEND SUCCESS');
          showSnackbar(
            'A new registration OTP has been sent.',
            'success'
          );
        } else {
          console.log('[OTP SCREEN DEBUG] REGISTRATION OTP RESEND FAILED:', result.error);
          showSnackbar(
            friendlyError(result.error, 'We could not send a new code. Please try again.'),
            'error'
          );
        }

        return;
      }

      console.log('[OTP SCREEN DEBUG] Calling sendPasswordResetOtp()');

      const result =
        await useAuthStore.getState().sendPasswordResetOtp(email);

      console.log('[OTP SCREEN DEBUG] PASSWORD RESET RESEND RESULT:', result);

      if (result.success) {
        console.log('[OTP SCREEN DEBUG] PASSWORD RESET OTP RESEND SUCCESS');
        showSnackbar('A new OTP has been sent to your email', 'success');
      } else {
        console.log('[OTP SCREEN DEBUG] PASSWORD RESET OTP RESEND FAILED:', result.error);
        showSnackbar(
          friendlyError(result.error, 'We could not send a new code. Please try again.'),
          'error'
        );
      }
    } catch (error: any) {
      console.log('[OTP SCREEN DEBUG] RESEND UNEXPECTED ERROR:', {
        message: error?.message,
        error,
      });

      showSnackbar(
        friendlyError(error?.message, 'We could not send a new code. Please try again.'),
        'error'
      );
    } finally {
      setIsResending(false);
      console.log('[OTP SCREEN DEBUG] RESEND REQUEST FINISHED');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.header}>
            <Button
              variant="text"
              title="Back"
              style={styles.backBtn}
              onPress={() => {
                console.log('[OTP SCREEN DEBUG] Back button pressed');
                router.back();
              }}
            />
            <Text style={styles.title}>Verify Code</Text>
            <Text style={styles.subtitle}>Enter the 6-digit verification code sent to your email.</Text>
          </View>

          <View style={styles.form}>
            <Controller
              control={control}
              name="otp"
              render={({ field: { onChange, onBlur, value } }: { field: AuthControllerField }) => (
                <Input
                  label="OTP Code"
                  placeholder="000000"
                  keyboardType="numeric"
                  maxLength={6}
                  onBlur={onBlur}
                  onChangeText={(text) => onChange(text.replace(/\D/g, ''))}
                  value={value}
                  error={errors.otp?.message}
                  style={styles.otpInput}
                />
              )}
            />

            <Button
              title="Verify Code"
              onPress={handleSubmit(onSubmit, () => showSnackbar('Enter the 6-digit code from your email.', 'error'))}
              isLoading={isLoading}
              style={styles.verifyBtn}
            />

            <Button
              variant="text"
              title={isResending ? 'Sending...' : 'Resend OTP'}
              style={styles.resendBtn}
              onPress={resendOtp}
              disabled={isResending}
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
  backBtn: {
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
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
    lineHeight: 22,
  },
  form: {
    marginBottom: spacing.xl,
  },
  content: {
    flex: 1,
  },
  otpInput: {
    // In a real app, you might use a dedicated OTP input component
    // that splits the 6 digits into separate boxes.
  },
  verifyBtn: {
    marginTop: spacing.md,
  },
  resendBtn: {
    marginTop: spacing.lg,
  },
});
