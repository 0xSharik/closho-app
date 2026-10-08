import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuthStore } from '../../src/store/authStore';
import { colors } from '../../src/theme/colors';
import { spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';
import { getAvatarUrl } from '../../src/utils/avatar';

export default function ProfileScreen() {
  const { user, logout, fetchProfile } = useAuthStore();
  const router = useRouter();

  React.useEffect(() => {
    fetchProfile();
  }, []);

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await logout();
  };

  const handleMenuPress = (href: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (href) {
      router.push(href as any);
    }
  };

  const menuItems = [
    { icon: 'person-outline', title: 'Edit Profile', href: '/edit-profile' },
    { icon: 'location-outline', title: 'My Addresses', href: '/addresses' },
    { icon: 'heart-outline', title: 'Wishlist', href: '/wishlist' },
    { icon: 'notifications-outline', title: 'Notifications', href: '/notifications' },
    { icon: 'document-text-outline', title: 'Terms & Conditions', href: '/terms' },
    { icon: 'shield-checkmark-outline', title: 'Privacy Policy', href: '/privacy' },
    { icon: 'help-buoy-outline', title: 'Help & Support', href: '/help' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

      {/* Profile Header */}
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          {user?.avatar ? (
            <Image
              source={{ uri: getAvatarUrl(user.avatar) }}
              style={styles.avatar}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitial}>{(user?.fullName || user?.name || user?.phone || 'U').charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </View>
        <Text style={styles.name}>{user?.fullName || user?.name || user?.phone || 'Guest User'}</Text>
        <Text style={styles.email}>{user?.email || user?.phone_no || user?.phone || ''}</Text>
      </View>

      {/* Menu Options */}
      <View style={styles.menuContainer}>
        {menuItems.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={[styles.menuItem, index === menuItems.length - 1 && styles.menuItemLast]}
            activeOpacity={0.7}
            onPress={() => handleMenuPress(item.href)}
          >
            <View style={styles.menuItemLeft}>
              <View style={styles.iconContainer}>
                <Ionicons name={item.icon as any} size={20} color={colors.primary} />
              </View>
              <Text style={styles.menuTitle}>{item.title}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
        <Ionicons name="log-out-outline" size={20} color={colors.status.error} />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>

      <Text style={styles.version}>App Version 1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: spacing.xxxl * 2,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xxxl,
    marginTop: spacing.md,
  },
  avatarContainer: {
    width: 110,
    height: 110,
    borderRadius: 55,
    marginBottom: spacing.lg,
    borderWidth: 3,
    borderColor: colors.primary,
    padding: 4,
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 50,
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 50,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 44,
    fontWeight: '900',
    color: colors.text.primary,
  },
  name: {
    fontSize: typography.fontSize.xxl,
    fontWeight: '900',
    color: colors.text.primary,
    marginBottom: 4,
  },
  email: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  menuContainer: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  menuTitle: {
    fontSize: typography.fontSize.md,
    color: colors.text.primary,
    fontWeight: '600',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: 16,
    marginBottom: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  logoutText: {
    color: colors.status.error,
    fontSize: typography.fontSize.md,
    fontWeight: 'bold',
    marginLeft: spacing.sm,
  },
  version: {
    textAlign: 'center',
    color: colors.text.tertiary,
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
  }
});
