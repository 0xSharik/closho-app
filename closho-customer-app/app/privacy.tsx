import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../src/theme/colors';
import { spacing } from '../src/theme/spacing';
import { typography } from '../src/theme/typography';
import { goBackOrHome } from '../src/utils/navigation';

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  const [content, setContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPrivacy = async () => {
      try {
        const api = require('../src/services/api').default;
        let res;
        try {
          res = await api.get('/settings/privacy');
        } catch (_) {
          res = await api.get('/admin/settings/privacy');
        }
        if (res.data?.success && res.data?.data?.content) {
          setContent(res.data.data.content);
        }
      } catch (error) {
        console.log('Using default Privacy Policy');
      } finally {
        setIsLoading(false);
      }
    };
    fetchPrivacy();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => goBackOrHome(router)}>
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xxxl }} />
        ) : content ? (
          <Text style={styles.bodyText}>{content}</Text>
        ) : (
          <View style={styles.defaultContainer}>
            <Text style={styles.lastUpdated}>Last Updated: September 2026</Text>

            <Text style={styles.sectionHeading}>1. Information We Collect</Text>
            <Text style={styles.paragraph}>
              We collect information you provide directly, such as your phone number, email address, shipping address, and order history to provide a seamless fashion shopping experience.
            </Text>

            <Text style={styles.sectionHeading}>2. How We Use Your Data</Text>
            <Text style={styles.paragraph}>
              Your information is used strictly to process orders, communicate shipment updates, provide support, and improve store recommendation features.
            </Text>

            <Text style={styles.sectionHeading}>3. Data Security & Storage</Text>
            <Text style={styles.paragraph}>
              All transactions and profile credentials are encrypted using industry-standard protocols. We do not store sensitive payment details on local devices.
            </Text>

            <Text style={styles.sectionHeading}>4. Third-Party Services</Text>
            <Text style={styles.paragraph}>
              We share minimal necessary data with verified payment gateways and courier partners solely to fulfill purchases and transactions.
            </Text>

            <Text style={styles.sectionHeading}>5. Contact Privacy Team</Text>
            <Text style={styles.paragraph}>
              For data access requests or privacy inquiries, contact us at Support@closhoapp.in or call 8284929437.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    backgroundColor: colors.surface,
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
    paddingBottom: spacing.xxxl * 3,
  },
  defaultContainer: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  lastUpdated: {
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
    marginBottom: spacing.lg,
  },
  sectionHeading: {
    fontSize: typography.fontSize.md,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  paragraph: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  bodyText: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 22,
  },
});
