import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../src/theme/colors';
import { spacing } from '../src/theme/spacing';
import { typography } from '../src/theme/typography';
import { goBackOrHome } from '../src/utils/navigation';

interface FAQItem {
  question: string;
  answer: string;
}

const FAQS: FAQItem[] = [
  {
    question: 'How do I track my order?',
    answer: 'You can track your order in real-time by going to Profile > Orders, or by selecting the order directly on the Home Screen.',
  },
  {
    question: 'What is the return & exchange policy?',
    answer: 'We offer hassle-free 7-day returns & exchanges for all unworn items with original tags intact.',
  },
  {
    question: 'What payment methods are supported?',
    answer: 'Closho supports Cash on Delivery (COD), Credit/Debit Cards, UPI (GPay, PhonePe, Paytm), and Net Banking via secure gateways.',
  },
  {
    question: 'How long does delivery take?',
    answer: 'Standard delivery takes 2-4 business days. Same-day delivery is available for select local store locations.',
  },
  {
    question: 'How do I modify or cancel my order?',
    answer: 'Orders can be cancelled directly from the Orders section before they enter the processing state. Contact customer support for immediate assistance.',
  },
];

export default function HelpSupportScreen() {
  const router = useRouter();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);

  const handleCall = () => {
    Haptics.impactAsync();
    Linking.openURL('tel:8284929437');
  };

  const handleEmail = () => {
    Haptics.impactAsync();
    Linking.openURL('mailto:Support@closhoapp.in');
  };

  const handleWhatsApp = () => {
    Haptics.impactAsync();
    Linking.openURL('https://wa.me/918284929437?text=Hello%20Closho%20Support%2C%20I%20need%20assistance');
  };

  const toggleFAQ = (index: number) => {
    Haptics.selectionAsync();
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => goBackOrHome(router)}>
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help & Support</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Banner Card */}
        <View style={styles.heroCard}>
          <Ionicons name="headset-outline" size={48} color={colors.primary} />
          <Text style={styles.heroTitle}>How can we help you today?</Text>
          <Text style={styles.heroSubtitle}>We're here 24/7 to make your Closho shopping experience smooth & enjoyable.</Text>
        </View>

        {/* Quick Contact Buttons */}
        <Text style={styles.sectionTitle}>Get in Touch</Text>

        <View style={styles.contactRow}>
          <TouchableOpacity style={styles.contactCard} onPress={handleCall} activeOpacity={0.8}>
            <View style={[styles.contactIconBg, { backgroundColor: '#4CAF50' + '20' }]}>
              <Ionicons name="call" size={24} color="#4CAF50" />
            </View>
            <Text style={styles.contactLabel}>Call Us</Text>
            <Text style={styles.contactValue}>8284929437</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.contactCard} onPress={handleEmail} activeOpacity={0.8}>
            <View style={[styles.contactIconBg, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name="mail" size={24} color={colors.primary} />
            </View>
            <Text style={styles.contactLabel}>Email Us</Text>
            <Text style={styles.contactValue} numberOfLines={1}>Support@closhoapp.in</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.whatsappCard} onPress={handleWhatsApp} activeOpacity={0.85}>
          <Ionicons name="logo-whatsapp" size={28} color="#25D366" />
          <View style={styles.whatsappTextContainer}>
            <Text style={styles.whatsappTitle}>Chat on WhatsApp</Text>
            <Text style={styles.whatsappSubtitle}>Instant support with our dedicated agent</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
        </TouchableOpacity>

        {/* FAQs Section */}
        <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
        <View style={styles.faqList}>
          {FAQS.map((faq, idx) => {
            const isExpanded = expandedIndex === idx;
            return (
              <View key={idx} style={styles.faqCard}>
                <TouchableOpacity style={styles.faqHeader} onPress={() => toggleFAQ(idx)} activeOpacity={0.7}>
                  <Text style={styles.faqQuestion}>{faq.question}</Text>
                  <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.text.secondary} />
                </TouchableOpacity>
                {isExpanded && (
                  <View style={styles.faqBody}>
                    <Text style={styles.faqAnswer}>{faq.answer}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
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
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  heroTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: spacing.md,
    marginTop: spacing.md,
  },
  contactRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  contactCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  contactIconBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  contactLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
    fontWeight: '600',
  },
  contactValue: {
    fontSize: typography.fontSize.sm,
    color: colors.text.primary,
    fontWeight: 'bold',
    marginTop: 2,
  },
  whatsappCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#25D366' + '40',
    marginBottom: spacing.xl,
  },
  whatsappTextContainer: {
    flex: 1,
    marginLeft: spacing.md,
  },
  whatsappTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  whatsappSubtitle: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    marginTop: 2,
  },
  faqList: {
    gap: spacing.sm,
  },
  faqCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
  },
  faqQuestion: {
    fontSize: typography.fontSize.md,
    fontWeight: '600',
    color: colors.text.primary,
    flex: 1,
    marginRight: spacing.sm,
  },
  faqBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight + '50',
    paddingTop: spacing.sm,
  },
  faqAnswer: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 20,
  },
});
