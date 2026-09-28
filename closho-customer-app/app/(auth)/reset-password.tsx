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

const resetSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type ResetForm = z.infer<typeof resetSchema>;

type AuthControllerField = {
  onChange: (value: string) => void;
  onBlur: () => void;
  value: string;
};

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ resetToken?: string }>();

  const resetToken =
    typeof params.resetToken === 'string'
      ? params.resetToken
      : '';
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

  const { control, handleSubmit, formState: { errors } } = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
  });

  const onSubmit = async (data: ResetForm) => {
    if (isLoading) return;

    if (!resetToken) {
      showSnackbar('Error: Missing reset token. Please restart the password reset process.', 'error');
      return;
    }

    setIsLoading(true);
    const result = await useAuthStore.getState().resetPassword(resetToken, data.password);
    setIsLoading(false);

    if (result.success) {
      showSnackbar(
        'Password updated successfully. You are now logged in.',
        'success'
      );
      router.replace('/(tabs)/reels');
    } else {
      showSnackbar(friendlyError(result.error, 'We could not update your password. Please try again.'), 'error');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Reset Password</Text>
            <Text style={styles.subtitle}>Enter your new password below</Text>
          </View>

          <View style={styles.form}>
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }: { field: AuthControllerField }) => (
                <Input label="New Password" placeholder="Enter new password" isPassword onBlur={onBlur} onChangeText={onChange} value={value} error={errors.password?.message} />
              )}
            />

            <Controller
              control={control}
              name="confirmPassword"
              render={({ field: { onChange, onBlur, value } }: { field: AuthControllerField }) => (
                <Input label="Confirm Password" placeholder="Confirm new password" isPassword onBlur={onBlur} onChangeText={onChange} value={value} error={errors.confirmPassword?.message} />
              )}
            />

            <Button title="Update Password" onPress={handleSubmit(onSubmit)} isLoading={isLoading} style={styles.btn} />
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
  btn: {
    marginTop: spacing.md,
  },
  resetBtn: {
    marginTop: spacing.md,
  },
});
