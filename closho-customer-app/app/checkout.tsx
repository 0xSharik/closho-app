import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Animated, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { spacing } from '../src/theme/spacing';
import { Button } from '../src/components/ui/Button';
import * as Haptics from 'expo-haptics';
import { useCartStore } from '../src/store/cartStore';
import { useProfileStore } from '../src/store/profileStore';
import { useOrderStore } from '../src/store/orderStore';
import { useStoreStore } from '../src/store/storeStore';
import { useSnackbar } from '../src/components/ui/SnackbarContext';
let RazorpayCheckout: any = null;
try {
  const RazorpayModule = require('react-native-razorpay');
  RazorpayCheckout = RazorpayModule.default || RazorpayModule;
  if (RazorpayCheckout && typeof RazorpayCheckout.open === 'function') {
    console.log('[Razorpay] ✅ Native module loaded successfully');
  } else {
    console.warn('[Razorpay] ⚠️ Module loaded but .open() not found:', Object.keys(RazorpayCheckout || {}));
    RazorpayCheckout = null;
  }
} catch (e: any) {
  console.log('[Razorpay] ❌ Native module not available:', e?.message);
}

export default function CheckoutScreen() {
  const router = useRouter();
  const { items, getCartTotal, discountAmount, clearCart, couponCode, activeStoreId: cartActiveStoreId } = useCartStore();
  const { addresses, paymentMethods } = useProfileStore();
  const { createOrder } = useOrderStore();
  const { currentStore } = useStoreStore();
  const { showSnackbar } = useSnackbar();

  const defaultAddress = addresses.find(a => a.isDefault) || addresses[0];
  const defaultPayment = paymentMethods.find(p => p.isDefault) || paymentMethods[0];

  const [selectedAddressId, setSelectedAddressId] = useState(defaultAddress?.id || '');
  const [selectedPaymentId, setSelectedPaymentId] = useState(defaultPayment?.id || 'razorpay');
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const successScaleAnim = useRef(new Animated.Value(0)).current;

  // --- Price calculations from real cart data ---
  const subtotal = getCartTotal();
  const shipping = subtotal > 0 ? 99 : 0; // flat ₹99 shipping
  const total = Math.max(0, subtotal - discountAmount + shipping);
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  const handleSelectAddress = (id: string) => {
    Haptics.selectionAsync();
    setSelectedAddressId(id);
  };

  const handleSelectPayment = (id: string) => {
    Haptics.selectionAsync();
    setSelectedPaymentId(id);
  };

  const handlePlaceOrder = async () => {
    if (!selectedAddressId) {
      showSnackbar('Please select a delivery address', 'error');
      return;
    }

    // Resolve storeId: cart's activeStoreId is most reliable (it's the store where items were added)
    // then fall back to currentStore, then fetch all stores
    let activeStore = currentStore || useStoreStore.getState().availableStores[0];
    
    // If cartActiveStoreId is set, prefer it — it's the authoritative store for this cart
    const resolvedStoreId = cartActiveStoreId 
      || currentStore?.id 
      || useStoreStore.getState().availableStores[0]?.id;

    if (!resolvedStoreId) {
      await useStoreStore.getState().fetchAllStores();
      activeStore = useStoreStore.getState().availableStores[0];
    }
    
    const finalStoreId = resolvedStoreId || activeStore?.id;
    console.log('[checkout] resolvedStoreId:', finalStoreId, '| cartActiveStoreId:', cartActiveStoreId, '| currentStore?.id:', currentStore?.id);

    if (!finalStoreId) {
      showSnackbar('No store available. Please try again later.', 'error');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsPlacingOrder(true);
    
    try {
      // Resolve payment method — works for both real saved methods and fallback defaults (id='cod', id='razorpay')
      const fallbackMethods: Record<string, string> = { cod: 'cod', razorpay: 'razorpay' };
      const savedMethod = paymentMethods.find(p => p.id === selectedPaymentId)?.brand?.toLowerCase();
      const resolvedMethod = savedMethod || fallbackMethods[selectedPaymentId] || 'cod';
      const isRazorpay = resolvedMethod === 'razorpay' || resolvedMethod === 'card' || resolvedMethod === 'upi';
      
      const response = await createOrder({
        storeId: finalStoreId,
        addressId: selectedAddressId,
        paymentMethod: isRazorpay ? 'razorpay' : 'cod',
        couponCode: couponCode
      });

      if (response.success) {
        // If COD, just show success directly
        if (!isRazorpay) {
          handleSuccessOrder();
          return;
        }

        // Razorpay Flow
        if (Platform.OS === 'web' || !RazorpayCheckout || typeof RazorpayCheckout.open !== 'function') {
          showSnackbar('Razorpay native checkout requires custom build. Simulating successful order...', 'info');
          handleSuccessOrder();
          return;
        }

        const options = {
          description: 'Closho Order Payment',
          image: 'https://closho.com/logo.png',
          currency: 'INR',
          key: 'rzp_test_TKk3WimBBVHPpT',
          amount: (total * 100).toString(),
          name: 'Closho',
          order_id: response.data?.razorpayOrderId || response.data?.id || '', // Provided by backend
          theme: { color: colors.primary }
        };

        try {
          console.log('[Razorpay] Opening checkout with options:', JSON.stringify({ ...options, key: '***' }));
          const data = await RazorpayCheckout.open(options);
          handleSuccessOrder();
        } catch (error: any) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          showSnackbar('Payment failed or cancelled', 'error');
        }
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        showSnackbar(response.error || 'Failed to place order', 'error');
      }
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showSnackbar('Something went wrong', 'error');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const handleSuccessOrder = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    clearCart();
    setShowSuccessModal(true);
    Animated.spring(successScaleAnim, {
      toValue: 1,
      tension: 50,
      friction: 5,
      useNativeDriver: true,
    }).start();
  };

  const navigateToOrders = () => {
    setShowSuccessModal(false);
    router.replace('/(tabs)/orders');
  };

  const selectedAddress = addresses.find(a => a.id === selectedAddressId);
  const selectedPayment = paymentMethods.find(p => p.id === selectedPaymentId);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Delivery Address */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Delivery Address</Text>
            <TouchableOpacity onPress={() => router.push('/addresses')}>
              <Text style={styles.actionText}>Manage</Text>
            </TouchableOpacity>
          </View>

          {addresses.length === 0 ? (
            <TouchableOpacity style={styles.addCard} onPress={() => router.push('/addresses')}>
              <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
              <Text style={styles.addCardText}>Add a delivery address</Text>
            </TouchableOpacity>
          ) : (
            addresses.map((addr) => (
              <TouchableOpacity
                key={addr.id}
                activeOpacity={0.7}
                style={[styles.optionCard, selectedAddressId === addr.id && styles.optionCardSelected]}
                onPress={() => handleSelectAddress(addr.id)}
              >
                <View style={styles.optionContent}>
                  <View style={[styles.optionIconContainer, selectedAddressId === addr.id && { backgroundColor: colors.primary + '20' }]}>
                    <Ionicons
                      name={addr.type === 'Home' ? 'home-outline' : addr.type === 'Work' ? 'business-outline' : 'location-outline'}
                      size={20}
                      color={selectedAddressId === addr.id ? colors.primary : colors.text.primary}
                    />
                  </View>
                  <View style={styles.optionDetails}>
                    <View style={styles.labelRow}>
                      <Text style={styles.optionLabel}>{addr.type}</Text>
                      {addr.isDefault && <View style={styles.defaultBadge}><Text style={styles.defaultBadgeText}>DEFAULT</Text></View>}
                    </View>
                    <Text style={styles.optionSub}>
                      {addr.addressLine1}
                      {addr.addressLine2 ? `, ${addr.addressLine2}` : ''}
                      {`\n${addr.city}, ${addr.state} - ${addr.pincode}`}
                    </Text>
                  </View>
                </View>
                <View style={[styles.radioOuter, selectedAddressId === addr.id && styles.radioOuterSelected]}>
                  {selectedAddressId === addr.id && <View style={styles.radioInner} />}
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Payment Method */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Payment Method</Text>
            <TouchableOpacity onPress={() => router.push('/payment-methods')}>
              <Text style={styles.actionText}>Manage</Text>
            </TouchableOpacity>
          </View>

          {(() => {
            const defaultMethods = [
              { id: 'razorpay', brand: 'Razorpay / Card / UPI', last4: '', exp: '', isDefault: true },
              { id: 'cod', brand: 'Cash on Delivery', last4: '', exp: '', isDefault: false }
            ];
            
            const displayMethods = paymentMethods.length > 0 ? paymentMethods : defaultMethods;

            return displayMethods.map((pm) => (
              <TouchableOpacity
                key={pm.id}
                activeOpacity={0.7}
                style={[styles.optionCard, (selectedPaymentId === pm.id || (!selectedPaymentId && pm.isDefault)) && styles.optionCardSelected]}
                onPress={() => handleSelectPayment(pm.id)}
              >
                <View style={styles.optionContent}>
                  <View style={[styles.optionIconContainer, (selectedPaymentId === pm.id || (!selectedPaymentId && pm.isDefault)) && { backgroundColor: colors.primary + '20' }]}>
                    <Ionicons name={pm.id === 'cod' ? 'cash-outline' : 'card-outline'} size={20} color={(selectedPaymentId === pm.id || (!selectedPaymentId && pm.isDefault)) ? colors.primary : colors.text.primary} />
                  </View>
                  <View style={styles.optionDetails}>
                    <View style={styles.labelRow}>
                      <Text style={styles.optionLabel}>
                        {pm.brand} {pm.last4 ? `•••• ${pm.last4}` : ''}
                      </Text>
                      {pm.isDefault && <View style={styles.defaultBadge}><Text style={styles.defaultBadgeText}>DEFAULT</Text></View>}
                    </View>
                    {pm.exp ? <Text style={styles.optionSub}>Expires {pm.exp}</Text> : null}
                  </View>
                </View>
                <View style={[styles.radioOuter, (selectedPaymentId === pm.id || (!selectedPaymentId && pm.isDefault)) && styles.radioOuterSelected]}>
                  {(selectedPaymentId === pm.id || (!selectedPaymentId && pm.isDefault)) && <View style={styles.radioInner} />}
                </View>
              </TouchableOpacity>
            ));
          })()}
        </View>

        {/* Order Summary — from real cart */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Summary</Text>
          <View style={styles.summaryContainer}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'items'})</Text>
              <Text style={styles.summaryValue}>₹{subtotal.toLocaleString('en-IN')}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Shipping</Text>
              <Text style={styles.summaryValue}>₹{shipping.toLocaleString('en-IN')}</Text>
            </View>
            {discountAmount > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Coupon Discount</Text>
                <Text style={[styles.summaryValue, { color: colors.status.success }]}>-₹{discountAmount.toLocaleString('en-IN')}</Text>
              </View>
            )}
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>₹{total.toLocaleString('en-IN')}</Text>
            </View>
          </View>
        </View>

      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerTotal}>
          <Text style={styles.footerTotalLabel}>Total</Text>
          <Text style={styles.footerTotalValue}>₹{total.toLocaleString('en-IN')}</Text>
        </View>
        <Button
          title="Place Order"
          onPress={handlePlaceOrder}
          isLoading={isPlacingOrder}
          style={styles.placeOrderBtn}
        />
      </View>

      {/* Success Modal */}
      <Modal visible={showSuccessModal} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.successCard, { transform: [{ scale: successScaleAnim }] }]}>
            <View style={styles.successIconCircle}>
              <Ionicons name="checkmark" size={40} color={colors.background} />
            </View>
            <Text style={styles.successTitle}>Order placed 🎉</Text>
            <Text style={styles.successText}>
              Your order has been successfully placed and will be arriving soon.
            </Text>
            <Button title="View My Orders" onPress={navigateToOrders} style={styles.successBtn} />
            <TouchableOpacity onPress={() => router.replace('/(tabs)')}>
              <Text style={styles.continueText}>Continue Shopping</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
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
    backgroundColor: colors.background,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: '900',
    color: colors.text.primary,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 140,
  },
  section: {
    marginBottom: spacing.xxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  actionText: {
    color: colors.primary,
    fontWeight: 'bold',
    fontSize: typography.fontSize.sm,
  },
  addCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderStyle: 'dashed',
  },
  addCardText: {
    color: colors.primary,
    fontWeight: '600',
    marginLeft: spacing.md,
    fontSize: typography.fontSize.md,
  },
  optionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 16,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  optionCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceLight,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  optionIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  optionDetails: {
    flex: 1,
    paddingRight: spacing.md,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  optionLabel: {
    fontSize: typography.fontSize.md,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginRight: spacing.sm,
  },
  defaultBadge: {
    backgroundColor: colors.primary + '20',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  defaultBadgeText: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  optionSub: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.text.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioOuterSelected: {
    borderColor: colors.primary,
  },
  radioInner: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  summaryContainer: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.xl,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  summaryLabel: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.md,
  },
  summaryValue: {
    color: colors.text.primary,
    fontSize: typography.fontSize.md,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.md,
  },
  totalLabel: {
    color: colors.text.primary,
    fontSize: typography.fontSize.lg,
    fontWeight: 'bold',
  },
  totalValue: {
    color: colors.primary,
    fontSize: typography.fontSize.xl,
    fontWeight: '900',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 34 : spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 20,
  },
  footerTotal: {
    marginRight: spacing.lg,
  },
  footerTotalLabel: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
  },
  footerTotalValue: {
    color: colors.primary,
    fontSize: typography.fontSize.xl,
    fontWeight: '900',
  },
  placeOrderBtn: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay.dark,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  successCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.xxl,
    width: '100%',
    alignItems: 'center',
  },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  successTitle: {
    color: colors.text.primary,
    fontSize: typography.fontSize.xxl,
    fontWeight: '900',
    marginBottom: spacing.sm,
  },
  successText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.md,
    textAlign: 'center',
    marginBottom: spacing.xxl,
    lineHeight: 22,
  },
  successBtn: {
    width: '100%',
    marginBottom: spacing.lg,
  },
  continueText: {
    color: colors.text.secondary,
    fontWeight: 'bold',
    fontSize: typography.fontSize.sm,
  },
});
