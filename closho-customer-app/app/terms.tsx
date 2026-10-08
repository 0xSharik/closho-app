import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { spacing } from '../src/theme/spacing';
import { goBackOrHome } from '../src/utils/navigation';

export default function TermsConditionsScreen() {
  const router = useRouter();
  const [content, setContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchTerms = async () => {
      try {
        const api = require('../src/services/api').default;
        let res;
        try {
          res = await api.get('/settings/terms');
        } catch (_) {
          res = await api.get('/admin/settings/terms');
        }
        if (res.data?.success && res.data?.data?.content) {
          setContent(res.data.data.content);
        }
      } catch (error) {
        console.log('Using default Terms & Conditions');
      } finally {
        setIsLoading(false);
      }
    };
    fetchTerms();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => goBackOrHome(router)}>
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms & Conditions</Text>
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

            <Text style={styles.sectionHeading}>1. Welcome to Closho</Text>
            <Text style={styles.paragraph}>
              Welcome to Closho ("the App"). By accessing or placing orders through Closho, you agree to be bound by these Terms and Conditions. Please read them carefully.
            </Text>

            <Text style={styles.sectionHeading}>2. Account & Eligibility</Text>
            <Text style={styles.paragraph}>
              You must provide accurate contact details including phone number and email when registering or making purchases. You are responsible for safeguarding your login credentials.
            </Text>

            <Text style={styles.sectionHeading}>3. Orders & Pricing</Text>
            <Text style={styles.paragraph}>
              All prices listed on Closho are inclusive of applicable taxes unless stated otherwise. We reserve the right to modify pricing, cancel unauthorized transactions, or update availability.
            </Text>

            <Text style={styles.sectionHeading}>4. Returns & Refunds</Text>
            <Text style={styles.paragraph}>
              Items can be returned within 7 days of delivery provided they remain unworn, unwashed, and in original packaging. Refunds are processed to the original payment source within 3-5 business days upon inspection.
            </Text>

            <Text style={styles.sectionHeading}>5. Customer Support & Contact</Text>
            <Text style={styles.paragraph}>
              For any queries regarding terms, orders, or services, contact customer support at Support@closhoapp.in or call +91 8284929437.
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
