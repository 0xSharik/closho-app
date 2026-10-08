import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Button } from '../src/components/ui/Button';
import { useProfileStore } from '../src/store/profileStore';
import { colors } from '../src/theme/colors';
import { spacing } from '../src/theme/spacing';
import { typography } from '../src/theme/typography';
import { goBackOrHome } from '../src/utils/navigation';

export default function PaymentMethodsScreen() {
  const router = useRouter();
  const { paymentMethods, isLoading, fetchPaymentMethods, addPaymentMethod, removePaymentMethod, setDefaultPaymentMethod } = useProfileStore();
  const [isModalVisible, setModalVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');

  useEffect(() => {
    fetchPaymentMethods();
  }, [fetchPaymentMethods]);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    goBackOrHome(router);
  };

  const handleAddCard = async () => {
    if (cardNumber.length < 4) {
      Alert.alert('Error', 'Please enter a valid card number');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSubmitting(true);

    const last4 = cardNumber.slice(-4);
    // Simple logic to guess brand from first digit
    const brand = cardNumber.startsWith('4') ? 'Visa' : (cardNumber.startsWith('5') ? 'Mastercard' : 'Card');

    const res = await addPaymentMethod({
      brand,
      last4,
      exp: expiry || '12/30',
      isDefault: paymentMethods.length === 0
    });

    setIsSubmitting(false);

    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModalVisible(false);
      setCardNumber('');
      setExpiry('');
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', res.message || 'Failed to add payment method');
    }
  };

  const handleDelete = async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert('Remove Card', 'Are you sure you want to remove this card?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removePaymentMethod(id) }
    ]);
  };

  const handleSetDefault = async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await setDefaultPaymentMethod(id);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment Methods</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
        {isLoading && paymentMethods.length === 0 ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : paymentMethods.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="card-outline" size={64} color={colors.text.tertiary} />
            <Text style={styles.emptyText}>No payment methods saved.</Text>
          </View>
        ) : (
          paymentMethods.map((card) => (
            <View key={card.id} style={styles.cardItemWrapper}>
              <View style={styles.cardItem}>
                <View style={styles.cardLeft}>
                  <View style={styles.iconWrapper}>
                    <Ionicons name="card" size={24} color={colors.primary} />
                  </View>
                  <View>
                    <Text style={styles.cardBrand}>{card.brand} ending in {card.last4}</Text>
                    <Text style={styles.cardExp}>Expires {card.exp}</Text>
                  </View>
                </View>
                {card.isDefault && (
                  <View style={styles.defaultBadge}>
                    <Text style={styles.defaultText}>Default</Text>
                  </View>
                )}
              </View>
              <View style={styles.actions}>
                {!card.isDefault && (
                  <TouchableOpacity style={styles.actionBtn} onPress={() => handleSetDefault(card.id)}>
                    <Text style={styles.actionText}>Make Default</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(card.id)}>
                  <Text style={[styles.actionText, { color: colors.status.error }]}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="Add New Payment Method"
          onPress={() => { Haptics.impactAsync(); setModalVisible(true); }}
        />
      </View>

      <Modal visible={isModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Card</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Card Number</Text>
              <TextInput
                style={styles.textInput}
                placeholder="0000 0000 0000 0000"
                placeholderTextColor={colors.text.tertiary}
                value={cardNumber}
                onChangeText={setCardNumber}
                keyboardType="number-pad"
                maxLength={19}
              />

              <Text style={styles.inputLabel}>Expiry Date</Text>
              <TextInput
                style={styles.textInput}
                placeholder="MM/YY"
                placeholderTextColor={colors.text.tertiary}
                value={expiry}
                onChangeText={setExpiry}
                keyboardType="number-pad"
                maxLength={5}
              />

              <Button
                title={isSubmitting ? "Saving..." : "Save Card"}
                disabled={isSubmitting}
                onPress={handleAddCard}
                style={{ marginTop: spacing.xl, marginBottom: spacing.xl }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  backBtn: { padding: spacing.xs },
  headerTitle: { fontSize: typography.fontSize.lg, fontWeight: 'bold', color: colors.text.primary },
  scrollContent: { padding: spacing.lg, paddingBottom: 100 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl * 2 },
  emptyText: { fontSize: typography.fontSize.md, color: colors.text.tertiary, marginTop: spacing.md },
  cardItemWrapper: { backgroundColor: colors.surface, borderRadius: 16, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.borderLight, overflow: 'hidden' },
  cardItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg },
  cardLeft: { flexDirection: 'row', alignItems: 'center' },
  iconWrapper: { width: 48, height: 32, backgroundColor: colors.background, borderRadius: 4, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md, borderWidth: 1, borderColor: colors.borderLight },
  cardBrand: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.text.primary, marginBottom: 2 },
  cardExp: { fontSize: typography.fontSize.sm, color: colors.text.secondary },
  defaultBadge: { backgroundColor: colors.primary + '20', paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 12 },
  defaultText: { fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.primary },
  actions: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.borderLight, padding: spacing.md, backgroundColor: colors.surface },
  actionBtn: { marginRight: spacing.xl },
  actionText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.primary },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: spacing.lg, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.borderLight },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: spacing.lg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  modalTitle: { fontSize: typography.fontSize.lg, fontWeight: 'bold', color: colors.text.primary },
  closeBtn: { padding: spacing.xs },
  modalBody: { paddingVertical: spacing.lg },
  inputLabel: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.text.primary, marginBottom: spacing.xs, marginTop: spacing.md },
  textInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight, borderRadius: 8, padding: spacing.md, fontSize: typography.fontSize.md, color: colors.text.primary },
});
