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
import { useCartStore } from '../../src/store/cartStore';
import { colors } from '../../src/theme/colors';
import { spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';

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
  const { showSnackbar } = useSnackbar();

  // Do not replace an existing local cart with an empty server response.
  // The current backend request is using a different store ID than the active
  // store, so fetching here would erase the item already present in Zustand.
  useFocusEffect(
    useCallback(() => {
      console.log('[CART SCREEN] ===== SCREEN FOCUSED =====');

      const currentItems = useCartStore.getState().items;

      console.log('[CART SCREEN] Current items:', currentItems.length);

      if (currentItems.length > 0) {
        console.log(
          '[CART SCREEN] Local cart already contains items. Skipping fetchCart() ' +
          'to prevent an empty response from clearing the cart.'
        );
        console.log(
          '[CART SCREEN] Preserved items:',
          JSON.stringify(currentItems, null, 2)
        );

        return () => {
          console.log('[CART SCREEN] ===== SCREEN BLURRED =====');
        };
      }

      let cancelled = false;

      const refresh = async () => {
        try {
          console.log('[CART SCREEN] Local cart is empty. Calling fetchCart()');

          await fetchCart();

          if (!cancelled) {
            const latestItems = useCartStore.getState().items;

            console.log(
              '[CART SCREEN] fetchCart completed. Current item count:',
              latestItems.length
            );

            console.log(
              '[CART SCREEN] Current cart items:',
              JSON.stringify(latestItems, null, 2)
            );
          }
        } catch (error: any) {
          console.error(
            '[CART SCREEN] fetchCart FAILED:',
            error?.message || error
          );
        }
      };

      refresh();

      return () => {
        cancelled = true;
        console.log('[CART SCREEN] ===== SCREEN BLURRED =====');
      };
    }, [fetchCart]),
  );

  const updateQuantity = (id: string, delta: number) => {
    Haptics.selectionAsync();
    storeUpdateQuantity(id, delta);
  };

  const removeItem = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    removeFromCart(id);
  };

  const handleClearCart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    clearCart();
    showSnackbar('Cart cleared', 'info');
  };

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await applyCoupon(couponCode.trim());
    if (result.success) {
      showSnackbar(result.message, 'success');
      setCouponCode('');
    } else {
      showSnackbar(result.message, 'error');
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
  const shipping = subtotal > 0 ? 99 : 0;
  const total = Math.max(0, subtotal - discountAmount + shipping);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>My Cart</Text>
            <TouchableOpacity onPress={handleClearCart} style={styles.clearBtn}>
              <Ionicons name="trash-outline" size={20} color={colors.status.error} />
              <Text style={styles.clearBtnText}>Clear All</Text>
            </TouchableOpacity>
          </View>

          {/* Items */}
          <View style={styles.itemsList}>
            {items.map(item => (
              <View key={item.id} style={styles.cartItem}>
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
                    <TouchableOpacity onPress={() => removeItem(item.id)} style={styles.removeBtn}>
                      <Ionicons name="trash-outline" size={20} color={colors.status.error} />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.itemVariant}>
                    Size: {item.size} | Color: {item.colorName}
                  </Text>

                  <View style={styles.itemFooter}>
                    <Text style={styles.itemPrice}>₹{item.price.toFixed(2)}</Text>
                    <View style={styles.stepper}>
                      <TouchableOpacity style={styles.stepBtn} onPress={() => updateQuantity(item.id, -1)}>
                        <Ionicons name="remove" size={16} color={colors.text.primary} />
                      </TouchableOpacity>
                      <Text style={styles.qtyText}>{item.quantity}</Text>
                      <TouchableOpacity style={styles.stepBtn} onPress={() => updateQuantity(item.id, 1)}>
                        <Ionicons name="add" size={16} color={colors.text.primary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
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

          {/* Summary */}
          <View style={styles.summaryContainer}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>₹{subtotal.toFixed(2)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Shipping</Text>
              <Text style={styles.summaryValue}>₹{shipping.toFixed(2)}</Text>
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
});
