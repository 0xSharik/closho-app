import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Image, KeyboardAvoidingView, LayoutAnimation, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity,
  UIManager, View,
} from 'react-native';
import { Button } from '../../src/components/ui/Button';
import { useSnackbar } from '../../src/components/ui/SnackbarContext';
import { getShippingFee } from '../../src/constants/commerce';
import { useCartStore } from '../../src/store/cartStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useOrderStore } from '../../src/store/orderStore';
import { colors } from '../../src/theme/colors';
import { spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';
import { friendlyError } from '../../src/utils/friendlyError';
import { logUserEvent } from '../../src/utils/userEventLogger';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function CartScreen() {
  const router = useRouter();
  const {
    items, updateQuantity: storeUpdateQuantity, removeFromCart,
    getCartTotal, applyCoupon, discountAmount, clearCart, fetchCart,
  } = useCartStore();
  const [couponCode, setCouponCode] = useState('');
  const [isClearingCart, setIsClearingCart] = useState(false);
  const { showSnackbar } = useSnackbar();
  const { calculateDeliveryCharge } = useSettingsStore();
  const pastOrdersCount = useOrderStore((state) => state.orders.length);

  // Always sync from server when the cart screen comes into focus.
  // This ensures multi-device cart changes are reflected immediately.
  useFocusEffect(
    useCallback(() => {
      console.log('[CART SCREEN] ===== SCREEN FOCUSED — syncing from server =====');

      let cancelled = false;

      const refresh = async () => {
        try {
          await fetchCart();

          if (!cancelled) {
            const latestItems = useCartStore.getState().items;
            console.log('[CART SCREEN] fetchCart completed. item count:', latestItems.length);
          }
        } catch (error: any) {
          console.error('[CART SCREEN] fetchCart FAILED:', error?.message || error);
        }
      };

      refresh();

      return () => {
        cancelled = true;
        console.log('[CART SCREEN] ===== SCREEN BLURRED =====');
      };
    }, [fetchCart]),
  );


  const updateQuantity = async (id: string, delta: number) => {
    logUserEvent('cart.quantity_change_requested', { itemId: id, delta });
    Haptics.selectionAsync();

    const result = await storeUpdateQuantity(id, delta);

    if (!result.success && result.message) {
      showSnackbar(result.message, 'error');
    }
  };

  const removeItem = async (id: string) => {
    logUserEvent('cart.remove_requested', { itemId: id });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const result = await removeFromCart(id);

    if (result.success) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    } else if (result.message) {
      showSnackbar(result.message, 'error');
    }
  };

  const handleClearCart = async () => {
    if (isClearingCart || items.length === 0) return;

    setIsClearingCart(true);
    logUserEvent('cart.clear_requested', { itemCount: items.length });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const result = await clearCart();

      if (result.success) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }

      showSnackbar(
        result.success
          ? 'Cart cleared'
          : result.message || 'Could not clear your cart. Please try again.',
        result.success ? 'info' : 'error'
      );
    } finally {
      setIsClearingCart(false);
    }

  };

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      logUserEvent('cart.coupon_validation_failed', { fields: 'couponCode' });
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await applyCoupon(couponCode.trim());
    if (result.success) {
      showSnackbar(result.message, 'success');
      setCouponCode('');
    } else {
      showSnackbar(friendlyError(result.message, 'That coupon could not be applied. Please check the code and try again.'), 'error');
    }
  };

  useEffect(() => {
    console.log('[CART SCREEN] ===== STATE UPDATED =====');
    console.log('[CART SCREEN] items:', JSON.stringify(items.map((item) => ({
      id: item.id, productId: item.productId, name: item.name, price: item.price,
      quantity: item.quantity, image: item.image, storeId: item.storeId, variantId: item.variantId,
    })), null, 2));
    console.log('[CART SCREEN] item count:', items.length);
    console.log('[CART SCREEN] total:', getCartTotal());
    console.log('[CART SCREEN] discount:', discountAmount);
  }, [items, getCartTotal, discountAmount]);

  if (items.length === 0) {
    return (
      <View style={[styles.container, styles.emptyContainer]}>
        <View style={styles.emptyIconCircle}>
          <Ionicons name="cart" size={60} color={colors.primary} />
        </View>
        <Text style={styles.emptyTitle}>Your cart is empty!</Text>
        <Text style={styles.emptySubtitle}>
          Explore our wide range of products and find your next favorite outfit.
        </Text>
        <Button
          title="Start Shopping"
          onPress={() => router.push('/(tabs)')}
          style={styles.shopBtn}
        />
      </View>
    );
  }

  const subtotal = getCartTotal();
  const deliveryCalc = calculateDeliveryCharge(items, pastOrdersCount);
  const total = Math.max(0, subtotal - discountAmount + deliveryCalc.totalDeliveryCharge);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>My Cart</Text>
            <TouchableOpacity
              onPress={handleClearCart}
              style={[styles.clearBtn, isClearingCart && styles.clearBtnDisabled]}
              disabled={isClearingCart}
              accessibilityRole="button"
              accessibilityLabel={isClearingCart ? 'Clearing cart' : 'Clear all cart items'}
            >
              <Ionicons name="trash-outline" size={20} color={colors.status.error} />
              <Text style={styles.clearBtnText}>{isClearingCart ? 'Clearing...' : 'Clear All'}</Text>
            </TouchableOpacity>
          </View>

          {/* Items */}
          <View style={styles.itemsList}>
            {items.map(item => (
              <TouchableOpacity key={item.id} style={styles.cartItem} activeOpacity={0.85} onPress={() => router.push(`/product/${item.productId}`)}>
                {/* Product Image — show icon if no URL */}
                {item.image ? (
                  <Image
                    source={{ uri: item.image }}
                    style={styles.itemImage}
                    onError={() => console.warn('[CART] Image load error for:', item.image)}
                  />
                ) : (
                  <View style={[styles.itemImage, styles.itemImageFallback]}>
                    <Ionicons name="shirt-outline" size={36} color={colors.text.tertiary} />
                  </View>
                )}

                <View style={styles.itemDetails}>
                  <View style={styles.itemHeader}>
                    <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                    <TouchableOpacity onPress={(event) => { event.stopPropagation(); removeItem(item.id); }} style={styles.removeBtn}>
                      <Ionicons name="trash-outline" size={20} color={colors.status.error} />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.itemVariant}>
                    Size: {item.size} | Color: {item.colorName}
                  </Text>

                  <View style={styles.itemFooter}>
                    <Text style={styles.itemPrice}>₹{item.price.toFixed(2)}</Text>
                    <View style={styles.stepper}>
                      <TouchableOpacity style={styles.stepBtn} onPress={(event) => { event.stopPropagation(); updateQuantity(item.id, -1); }}>
                        <Ionicons name="remove" size={16} color={colors.text.primary} />
                      </TouchableOpacity>
                      <Text style={styles.qtyText}>{item.quantity}</Text>
                      <TouchableOpacity style={styles.stepBtn} onPress={(event) => { event.stopPropagation(); updateQuantity(item.id, 1); }}>
                        <Ionicons name="add" size={16} color={colors.text.primary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Coupon */}
          <View style={styles.couponContainer}>
            <TextInput
              style={styles.couponInput}
              placeholder="Apply Promo Code"
              placeholderTextColor={colors.text.tertiary}
              value={couponCode}
              onChangeText={setCouponCode}
              autoCapitalize="characters"
            />
            <TouchableOpacity style={styles.applyBtn} onPress={handleApplyCoupon}>
              <Text style={styles.applyBtnText}>Apply</Text>
            </TouchableOpacity>
          </View>

          {/* Promotional / First Order Free Delivery Banner */}
          {deliveryCalc.isFree && deliveryCalc.reason && (
            <View style={styles.promoBanner}>
              <Ionicons name="sparkles" size={18} color={colors.status.success} />
              <Text style={styles.promoBannerText}>
                {deliveryCalc.reason === 'promotional'
                  ? 'Promotional Free Delivery Weekend Active!'
                  : 'Free delivery applied on your first order!'}
              </Text>
            </View>
          )}

          {/* Summary */}
          <View style={styles.summaryContainer}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>₹{subtotal.toFixed(2)}</Text>
            </View>
            {deliveryCalc.productCharges > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Product Shipping Fee</Text>
                <Text style={[styles.summaryValue, deliveryCalc.isFree && { textDecorationLine: 'line-through', color: colors.text.secondary }]}>
                  ₹{deliveryCalc.productCharges.toFixed(2)}
                </Text>
              </View>
            )}
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Delivery Charge</Text>
              {deliveryCalc.isFree ? (
                <Text style={[styles.summaryValue, { color: colors.status.success, fontWeight: '700' }]}>
                  FREE
                </Text>
              ) : (
                <Text style={styles.summaryValue}>₹{deliveryCalc.totalDeliveryCharge.toFixed(2)}</Text>
              )}
            </View>
            {discountAmount > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Discount</Text>
                <Text style={[styles.summaryValue, { color: colors.status.success }]}>
                  -₹{discountAmount.toFixed(2)}
                </Text>
              </View>
            )}
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>₹{total.toFixed(2)}</Text>
            </View>
          </View>
        </ScrollView>

        {/* Sticky Checkout Button */}
        <View style={styles.footer}>
          <Button
            title="Proceed to Checkout"
            onPress={() => {
              logUserEvent('checkout.started', { itemCount: items.length });
              Haptics.impactAsync();
              router.push('/checkout');
            }}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: '900',
    color: colors.text.primary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontSize: typography.fontSize.md,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.xxxl,
    lineHeight: 24,
    paddingHorizontal: spacing.xl,
  },
  emptyIconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  shopBtn: {
    width: '100%',
    maxWidth: 300,
  },
  scrollContent: {
    padding: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: 150, // keeps the last cart content above the checkout bar
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  headerTitle: {
    fontSize: typography.fontSize.xxl,
    fontWeight: '900',
    color: colors.text.primary,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.xs,
  },
  clearBtnDisabled: {
    opacity: 0.55,
  },
  clearBtnText: {
    color: colors.status.error,
    fontWeight: 'bold',
    marginLeft: 4,
    fontSize: typography.fontSize.sm,
  },
  itemsList: {
    marginBottom: spacing.xl,
  },
  cartItem: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  itemImage: {
    width: 90,
    height: 110,
    borderRadius: 12,
    backgroundColor: colors.surfaceLight,
  },
  itemImageFallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemDetails: {
    flex: 1,
    marginLeft: spacing.md,
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemName: {
    fontSize: typography.fontSize.md,
    fontWeight: 'bold',
    color: colors.text.primary,
    flex: 1,
    marginRight: spacing.sm,
  },
  removeBtn: {
    padding: 4,
  },
  itemVariant: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginTop: 4,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  itemPrice: {
    fontSize: typography.fontSize.lg,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  stepBtn: {
    padding: 8,
  },
  qtyText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.md,
    fontWeight: 'bold',
    marginHorizontal: spacing.sm,
    minWidth: 20,
    textAlign: 'center',
  },
  couponContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.xs,
    marginBottom: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  couponInput: {
    flex: 1,
    color: colors.text.primary,
    paddingHorizontal: spacing.md,
    height: 48,
    fontSize: typography.fontSize.md,
  },
  applyBtn: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    borderRadius: 8,
  },
  applyBtnText: {
    color: colors.text.primary,
    fontWeight: 'bold',
  },
  summaryContainer: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.xl,
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
    // Tab bar: bottom=24, height=70 → top edge at 94px from bottom
    // Add 8px gap so checkout sits neatly above it
    bottom: 102,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 12,
  },
  promoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.status.success + '18',
    borderColor: colors.status.success + '40',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  promoBannerText: {
    color: colors.status.success,
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    flex: 1,
  },
});
