import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Animated, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '../src/components/ui/Button';
import { useSnackbar } from '../src/components/ui/SnackbarContext';
import { getShippingFee } from '../src/constants/commerce';
import { useCartStore } from '../src/store/cartStore';
import { useOrderStore } from '../src/store/orderStore';
import { useProfileStore } from '../src/store/profileStore';
import { useStoreStore } from '../src/store/storeStore';
import { colors } from '../src/theme/colors';
import { spacing } from '../src/theme/spacing';
import { typography } from '../src/theme/typography';
import { friendlyError } from '../src/utils/friendlyError';
import { goBackOrHome } from '../src/utils/navigation';
import { logUserActionFailure, logUserEvent } from '../src/utils/userEventLogger';
let RazorpayCheckout: any = null;
if (Platform.OS !== 'web') {
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
}

export default function CheckoutScreen() {
  const router = useRouter();
  const { items, getCartTotal, discountAmount, clearCart, couponCode, activeStoreId: cartActiveStoreId } = useCartStore();
  const { addresses, paymentMethods } = useProfileStore();
  const { createOrder, verifyPayment, cancelOrder } = useOrderStore();
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
  const shipping = getShippingFee(subtotal);
  const total = Math.max(0, subtotal - discountAmount + shipping);
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  const handleSelectAddress = (id: string) => {
    logUserEvent('checkout.address_selected', { addressId: id });
    Haptics.selectionAsync();
    setSelectedAddressId(id);
  };

  const handleSelectPayment = (id: string) => {
    logUserEvent('checkout.payment_method_selected', { paymentMethodId: id });
    Haptics.selectionAsync();
    setSelectedPaymentId(id);
  };

  const handlePlaceOrder = async () => {
    if (!selectedAddressId) {
      logUserEvent('checkout.validation_failed', {
        fields: 'address',
      });
      showSnackbar(
        'Please select a delivery address',
        'error'
      );
      return;
    }

    if (!items.length) {
      showSnackbar(
        'Your cart is empty.',
        'error'
      );
      return;
    }

    // A checkout is always one-store only. The cart may contain many
    // products and quantities, but all of them must belong to the same store.
    const itemStoreIds = Array.from(
      new Set(
        items
          .map(item => item.storeId)
          .filter(Boolean) as string[]
      )
    );

    const finalStoreId =
      itemStoreIds.length === 1
        ? itemStoreIds[0]
        : itemStoreIds.length === 0
          ? cartActiveStoreId || currentStore?.id
          : null;

    console.log(
      '[checkout] itemStoreIds:',
      itemStoreIds,
      '| cartActiveStoreId:',
      cartActiveStoreId,
      '| currentStoreId:',
      currentStore?.id,
      '| finalStoreId:',
      finalStoreId
    );

    if (itemStoreIds.length > 1) {
      logUserEvent(
        'checkout.validation_failed',
        {
          fields: 'multiple_stores',
        }
      );
      showSnackbar(
        'Your cart contains products from multiple stores. Please keep products from one store only.',
        'error'
      );
      return;
    }

    if (!finalStoreId) {
      logUserEvent(
        'checkout.validation_failed',
        {
          fields: 'store',
        }
      );
      showSnackbar(
        'We could not determine the delivery store. Please return to the store and try again.',
        'error'
      );
      return;
    }

    // Do not use the saved card brand to determine payment type.
    // Saved cards are not a separate backend payment rail here.
    // Every non-COD option goes through Razorpay.
    const isRazorpay =
      selectedPaymentId !== 'cod';

    Haptics.impactAsync(
      Haptics.ImpactFeedbackStyle.Medium
    );
    setIsPlacingOrder(true);

    let createdOrderId: string | null = null;

    try {
      const response = await createOrder({
        storeId: finalStoreId,
        addressId: selectedAddressId,
        paymentMethod: isRazorpay
          ? 'razorpay'
          : 'cod',
        couponCode: couponCode || null,
        // The UI has always charged this amount, but it was never sent to the
        // order API. The backend therefore created a Razorpay order for the
        // merchandise subtotal only. Keep the server order total aligned with
        // the checkout summary by sending the explicit delivery fee.
        deliveryFee: shipping,
        subtotal,
        discountAmount,
        totalAmount: total,
      });

      if (!response.success) {
        logUserEvent(
          'checkout.order_creation_failed',
          {
            reason: 'rejected',
          }
        );
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Error
        );
        showSnackbar(
          friendlyError(
            response.error,
            'We could not place your order. Please try again.'
          ),
          'error'
        );
        return;
      }

      const orderData = response.data || {};
      createdOrderId =
        orderData.orderId ||
        orderData.id ||
        null;

      logUserEvent(
        'checkout.payment_session_created',
        {
          paymentMethod: isRazorpay
            ? 'razorpay'
            : 'cod',
          itemCount,
          storeId: finalStoreId,
        }
      );

      // COD is already a confirmed customer order.
      if (!isRazorpay) {
        await handleSuccessOrder();
        return;
      }

      const razorpayOrderId =
        orderData.razorpayOrderId ||
        orderData.payment?.orderId ||
        '';

      const razorpayKey =
        orderData.key_id ||
        orderData.keyId ||
        orderData.payment?.key_id ||
        orderData.payment?.key ||
        '';

      const backendAmount =
        Number(orderData.amount);

      const expectedAmountPaise = Math.round(total * 100);
      const amountPaise =
        Number.isFinite(backendAmount) &&
          backendAmount > 0
          ? Math.round(backendAmount)
          : expectedAmountPaise;

      // Never silently show one total to the customer and charge another.
      // If the backend has not yet incorporated deliveryFee, stop before
      // opening Razorpay rather than charging the wrong amount.
      if (isRazorpay && Number.isFinite(backendAmount) && backendAmount > 0 && amountPaise !== expectedAmountPaise) {
        console.error('[Razorpay] Backend amount does not match checkout total.', {
          backendAmountPaise: amountPaise,
          expectedAmountPaise,
          subtotal,
          discountAmount,
          deliveryFee: shipping,
        });

        if (createdOrderId) {
          await cancelOrder(createdOrderId);
        }

        showSnackbar(
          'Payment total is out of sync. Please try again after the order total is recalculated.',
          'error'
        );
        return;
      }

      if (
        Platform.OS === 'web' ||
        !RazorpayCheckout ||
        typeof RazorpayCheckout.open !== 'function'
      ) {
        if (createdOrderId) {
          await cancelOrder(createdOrderId);
        }

        logUserActionFailure(
          'checkout.payment_unavailable',
          new Error(
            'Razorpay native checkout is unavailable in this build.'
          ),
          {
            provider: 'razorpay',
          }
        );

        showSnackbar(
          'Online payment is unavailable in this build. Please use Cash on Delivery or install the Android build with Razorpay enabled.',
          'error'
        );
        return;
      }

      if (!razorpayOrderId || !razorpayKey) {
        if (createdOrderId) {
          await cancelOrder(createdOrderId);
        }

        console.error(
          '[Razorpay] Missing gateway configuration:',
          {
            createdOrderId,
            razorpayOrderId,
            hasKey: Boolean(razorpayKey),
            amountPaise,
          }
        );

        showSnackbar(
          'Payment could not be started because the payment gateway configuration is incomplete.',
          'error'
        );
        return;
      }

      // The verification endpoint expects the internal Closho order id,
      // not only Razorpay's order id. Do not open the gateway if we cannot
      // establish that mapping safely.
      if (!createdOrderId) {
        console.error(
          '[Razorpay] Backend did not return/resolve the internal orderId.',
          {
            razorpayOrderId,
          }
        );

        showSnackbar(
          'Payment could not be started because the order could not be linked to the payment.',
          'error'
        );
        return;
      }

      const options = {
        description:
          'Closho Order Payment',
        image:
          'https://closho.com/logo.png',
        currency:
          orderData.currency || 'INR',
        key: razorpayKey,
        amount:
          String(amountPaise),
        name: 'Closho',
        order_id:
          razorpayOrderId,
        theme: {
          color: colors.primary,
        },
      };

      let paymentReturnedFromGateway = false;

      try {
        console.log(
          '[Razorpay] Opening checkout:',
          JSON.stringify(
            {
              ...options,
              key: '***',
            },
            null,
            2
          )
        );

        const paymentResult =
          await RazorpayCheckout.open(
            options
          );

        const paymentId =
          paymentResult?.razorpay_payment_id ||
          paymentResult?.razorpayPaymentId ||
          '';

        // From this point onward the gateway has returned a payment id.
        // Never cancel the server order blindly if verification later fails,
        // because the customer may already have been charged.
        paymentReturnedFromGateway = Boolean(paymentId);

        const returnedOrderId =
          paymentResult?.razorpay_order_id ||
          paymentResult?.razorpayOrderId ||
          razorpayOrderId;

        const signature =
          paymentResult?.razorpay_signature ||
          paymentResult?.razorpaySignature ||
          '';

        if (!paymentId || !signature) {
          throw new Error(
            'Razorpay completed without payment verification data.'
          );
        }

        // Never treat the native checkout callback alone as proof of payment.
        // The backend must verify the Razorpay signature first.
        const verification =
          await verifyPayment({
            orderId:
              createdOrderId || returnedOrderId,
            paymentId,
            signature,
          });

        if (!verification.success) {
          // Do not cancel an order after Razorpay has returned a payment.
          // A verification/network failure can happen after the customer
          // was actually charged. The backend must reconcile that payment.
          throw new Error(
            verification.error ||
            'Payment verification failed.'
          );
        }

        logUserEvent(
          'checkout.payment_succeeded',
          {
            provider: 'razorpay',
            paymentId,
          }
        );

        await handleSuccessOrder();
      } catch (error: any) {
        logUserActionFailure(
          'checkout.payment_failed',
          error,
          {
            provider: 'razorpay',
            orderId: createdOrderId,
          }
        );

        // If the native checkout was cancelled/failed before returning a
        // payment id, clean up the server-side payment attempt. If Razorpay
        // returned a payment, leave reconciliation to the backend instead.
        if (
          !paymentReturnedFromGateway &&
          createdOrderId
        ) {
          const cancelResult =
            await cancelOrder(
              createdOrderId
            );

          console.log(
            '[checkout] unpaid order cleanup:',
            cancelResult
          );
        }

        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Error
        );

        const code =
          error?.code ||
          error?.error?.code;

        const message =
          code === 'BAD_REQUEST_ERROR'
            ? 'Payment was not completed. No order was placed.'
            : 'Payment failed or was cancelled. No order was placed.';

        showSnackbar(
          message,
          'error'
        );
      }
    } catch (e: any) {
      logUserActionFailure(
        'checkout.order_creation_failed',
        e
      );
      Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Error
      );
      showSnackbar(
        friendlyError(
          e?.message,
          'Something went wrong while starting checkout.'
        ),
        'error'
      );
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const handleSuccessOrder = async () => {
    logUserEvent('checkout.completed', { itemCount });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const clearResult = await clearCart();
    if (!clearResult.success) {
      console.warn('[checkout] Order succeeded but cart cleanup failed.');
    }
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
        <TouchableOpacity style={styles.backBtn} onPress={() => goBackOrHome(router)}>
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      >

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
