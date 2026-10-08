import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Button } from '../src/components/ui/Button';
import { Input } from '../src/components/ui/Input';
import { useSnackbar } from '../src/components/ui/SnackbarContext';
import { useAuthStore } from '../src/store/authStore';
import { colors } from '../src/theme/colors';
import { spacing } from '../src/theme/spacing';
import { typography } from '../src/theme/typography';
import { getAvatarUrl } from '../src/utils/avatar';
import { goBackOrHome } from '../src/utils/navigation';

export default function EditProfileScreen() {
  const router = useRouter();
  const { user, updateUser, isLoading } = useAuthStore();
  const { showSnackbar } = useSnackbar();

  const [name, setName] = useState(user?.fullName || user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone_no || user?.phone || '');
  const [avatar, setAvatar] = useState(user?.avatar || '');

  useEffect(() => {
    if (!user) return;

    setName(user.fullName || user.name || '');
    setEmail(user.email || '');
    setPhone(user.phone_no || user.phone || '');
    setAvatar(user.avatar || '');
  }, [user]);

  const pickImage = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        showSnackbar(
          'Photo library permission is required to select a profile picture.',
          'error'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (
        !result.canceled &&
        result.assets &&
        result.assets.length > 0
      ) {
        const selectedUri = result.assets[0].uri;

        console.log('[PROFILE UI] Selected avatar:', selectedUri);
        setAvatar(selectedUri);
      }
    } catch (error) {
      console.error('[PROFILE UI] Image picker error:', error);
      showSnackbar('Unable to select the image.', 'error');
    }
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    goBackOrHome(router);
  };

  const handleSave = async () => {
    if (isLoading) return;

    try {
      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success
      );

      console.log('[PROFILE UI] Saving profile:', {
        hasName: !!name.trim(),
        hasEmail: !!email.trim(),
        hasPhone: !!phone.trim(),
        avatar,
        isLocalAvatar:
          avatar.startsWith('file://') ||
          avatar.startsWith('content://'),
      });

      const res = await updateUser({
        fullName: name.trim(),
        email: email.trim(),
        phone_no: phone.trim(),
        avatar,
      });

      if (!res?.success) {
        showSnackbar(
          res?.message || 'Failed to update profile',
          'error'
        );
        return;
      }

      showSnackbar(
        'Profile updated successfully',
        'success'
      );

      // updateUser already stores the server response in Zustand.
      // The avatar state is therefore replaced by the server URL, not file://.
      goBackOrHome(router);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('[PROFILE] Save failed:', {
          message: error.message,
          code: error.code,
          status: error.response?.status,
          response: error.response?.data,
          url: error.config?.url,
          baseURL: error.config?.baseURL,
          method: error.config?.method,
        });
      } else {
        console.error('[PROFILE] Save failed:', error);
      }

      showSnackbar(
        'Failed to update profile',
        'error'
      );
    }
  };

  const displayAvatar = avatar
    ? getAvatarUrl(avatar)
    : '';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={handleBack}
          disabled={isLoading}
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color={colors.text.primary}
          />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Edit Profile</Text>

        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        >
          <View style={styles.avatarSection}>
            <TouchableOpacity
              style={styles.avatarContainer}
              onPress={pickImage}
              activeOpacity={0.8}
              disabled={isLoading}
            >
              {displayAvatar ? (
                <Image
                  source={{ uri: displayAvatar }}
                  style={styles.avatar}
                  contentFit="cover"
                  transition={200}
                  cachePolicy="disk"
                  onError={(event) => {
                    console.warn(
                      '[PROFILE UI] Avatar image failed:',
                      event.error,
                      displayAvatar
                    );
                  }}
                />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitial}>
                    {(name.trim().charAt(0) || 'U').toUpperCase()}
                  </Text>
                </View>
              )}

              <View style={styles.editBadge}>
                <Ionicons
                  name="camera"
                  size={16}
                  color={colors.text.inverse}
                />
              </View>
            </TouchableOpacity>

            <Text style={styles.changePhotoText}>
              Tap to change photo
            </Text>
          </View>

          <View style={styles.formSection}>
            <Input
              label="Full Name"
              placeholder="Enter your name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              editable={!isLoading}
            />

            <View style={{ height: spacing.lg }} />

            <Input
              label="Email Address"
              placeholder="Enter your email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!isLoading}
            />

            <View style={{ height: spacing.lg }} />

            <Input
              label="Phone Number"
              placeholder="Enter your phone"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              editable={!isLoading}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        <Button
          title={isLoading ? 'Saving...' : 'Save Changes'}
          onPress={handleSave}
          disabled={isLoading}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  backBtn: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl * 5,
  },
  avatarSection: {
    alignItems: 'center',
    marginVertical: spacing.xl,
  },
  avatarContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: colors.primary,
    padding: 4,
    position: 'relative',
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 60,
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 60,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 48,
    fontWeight: '900',
    color: colors.text.primary,
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.background,
  },
  changePhotoText: {
    marginTop: spacing.sm,
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
  },
  formSection: {
    marginTop: spacing.md,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.xl,
    paddingBottom:
      Platform.OS === 'ios' ? 34 : spacing.xl,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
});
