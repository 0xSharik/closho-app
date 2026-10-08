import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Button } from '../../src/components/ui/Button';
import api from '../../src/services/api';
import { useOrderStore } from '../../src/store/orderStore';
import { colors } from '../../src/theme/colors';
import { spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';

export default function OrderDetailsScreen() {
  const { id, orderData } = useLocalSearchParams();
  const router = useRouter();

  // Parse orderData passed from Orders screen (avoids extra network call)
  const parsedOrderData = useMemo(() => {
    if (!orderData) return null;
    if (typeof orderData === 'object') return orderData;
    try { return JSON.parse(orderData as string); } catch { return null; }
  }, [orderData]);

  const [order, setOrder] = useState<any>(parsedOrderData);
  const [isLoading, setIsLoading] = useState(!parsedOrderData);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const cancelOrder = useOrderStore(state => state.cancelOrder);

  // Only fetch from network if we don't have orderData
  useEffect(() => {
    if (parsedOrderData) return;
    const fetch = async () => {
      try {
        setIsLoading(true);
        const response = await api.get(`/orders/${id}`);
        console.log('[ORDER DETAIL] raw response:', JSON.stringify(response.data, null, 2));
        setOrder(response.data?.data?.order || response.data?.data || response.data);
      } catch (err: any) {
        console.warn('[ORDER DETAIL] fetch error:', err.message);
        setError(err.message || 'Failed to load order');
      } finally {
        setIsLoading(false);
      }
    };
    fetch();
  }, [id]);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };


  const handleCancelOrder = () => {
    Alert.alert(
      'Cancel Order',
      'Are you sure you want to cancel this order?',
      [
        { text: 'Keep Order', style: 'cancel' },
        {
          text: 'Cancel Order',
          style: 'destructive',
          onPress: async () => {
            if (!id || isCancelling) return;

            setIsCancelling(true);
            try {
              const result = await cancelOrder(String(id));

              if (!result.success) {
                Alert.alert('Unable to cancel', result.error || 'The order could not be cancelled.');
                return;
              }

              setOrder((current: any) => ({
                ...current,
                status: 'cancelled',
              }));

              Alert.alert('Order Cancelled', 'Your order has been cancelled.', [
                { text: 'OK', onPress: () => router.back() },
              ]);
            } catch (err: any) {
              Alert.alert(
                'Unable to cancel',
                err?.message || 'The order could not be cancelled.',
              );
            } finally {
              setIsCancelling(false);
            }
          },
        },
      ],
    );
  };

  // Never invent a tracking number. A tracking number is a server-side
  // shipment identifier and must only be shown when the backend provides it.
  const fallbackTrackingNumber = 'Not assigned yet';

  if (isLoading && !order) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error && !order) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.text.secondary, marginBottom: spacing.md }}>{error}</Text>
        <Button title="Go Back" onPress={handleBack} />
      </View>
    );
  }

  if (!order) return null;

  const displayOrder = order;
  const canCancelOrder = ['pending', 'confirmed', 'processing'].includes(
    String(displayOrder?.status || '').toLowerCase(),
  );
  const orderTitle = displayOrder.items?.length > 0
    ? displayOrder.items.length === 1
      ? displayOrder.items[0].name
      : `${displayOrder.items[0].name} +${displayOrder.items.length - 1} more`
    : `Order #${String(displayOrder.id).slice(-8)}`;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Order Details</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Order Info */}
        <View style={styles.section}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text numberOfLines={1} ellipsizeMode="tail" style={styles.orderId}>
                {orderTitle}
              </Text>
              <Text style={[styles.orderDate, { marginTop: 2, fontSize: 12 }]}>
                Order ID: {displayOrder.id}
              </Text>
            </View>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>
                {(displayOrder.status || 'CONFIRMED').toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={styles.orderDate}>
            Placed on {displayOrder.date || (displayOrder.createdAt ? new Date(displayOrder.createdAt).toLocaleDateString() : 'N/A')}
          </Text>
          <View style={styles.trackingContainer}>
            <Text style={styles.trackingLabel}>Tracking Number:</Text>
            <Text style={styles.trackingNumber}>
              {displayOrder.trackingNumber || fallbackTrackingNumber}
            </Text>
          </View>
        </View>

        {/* Timeline */}
        {displayOrder.timeline && displayOrder.timeline.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Delivery Status</Text>
            <View style={styles.timeline}>
              {displayOrder.timeline.map((step: any, index: number) => (
                <View key={index} style={styles.timelineStep}>
                  <View style={styles.timelineLeft}>
                    <View style={[styles.timelineDot, step.completed && styles.timelineDotActive]} />
                    {index !== displayOrder.timeline.length - 1 && (
                      <View style={[styles.timelineLine, step.completed && styles.timelineLineActive]} />
                    )}
                  </View>
                  <View style={styles.timelineContent}>
                    <Text style={[styles.stepStatus, !step.completed && styles.stepStatusPending]}>
                      {step.status}
                    </Text>
                    <Text style={styles.stepDate}>{step.date}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Items Ordered */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items Ordered</Text>
          {(displayOrder.items || []).map((item: any, idx: number) => (
            <TouchableOpacity
              key={item.id || idx}
              style={styles.itemCard}
              onPress={() => router.push(`/product/${item.productId || item.id}`)}
            >
              {/* Image or Icon Fallback */}
              <View style={styles.itemImageContainer}>
                {item.image ? (
                  <Image
                    source={{ uri: item.image }}
                    style={styles.itemImage}
                    resizeMode="cover"
                    onLoad={() => {
                      console.log(
                        '[ORDER IMAGE] LOADED:',
                        item.image
                      );
                    }}
                    onError={() => {
                      console.error('[ORDER IMAGE] FAILED');
                      console.error('[ORDER IMAGE] URL:', item.image);
                    }}
                  />
                ) : (
                  <Ionicons
                    name="shirt-outline"
                    size={32}
                    color={colors.text.tertiary}
                  />
                )}
              </View>

              <View style={styles.itemDetails}>
                <Text style={styles.itemName}>{item.name || 'Product'}</Text>
                <Text style={styles.itemVariant}>
                  Size: {item.size || 'N/A'} | Color: {item.colorName || 'Default'}
                </Text>
                <View style={styles.itemFooter}>
                  <Text style={styles.itemPrice}>₹{Number(item.price || 0).toFixed(2)}</Text>
                  <Text style={styles.itemQty}>Qty: {item.quantity || 1}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Price Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Price Details</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Items Total</Text>
            <Text style={styles.priceValue}>
              ₹{Number(
                displayOrder.subtotal ??
                (displayOrder.items || []).reduce((s: number, i: any) => s + Number(i.price || 0) * (i.quantity || 1), 0)
              ).toFixed(2)}
            </Text>
          </View>
          {displayOrder.discountAmount != null && Number(displayOrder.discountAmount) > 0 && (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Discount</Text>
              <Text style={[styles.priceValue, { color: colors.status.success }]}>
                -₹{Number(displayOrder.discountAmount).toFixed(2)}
              </Text>
            </View>
          )}
          {displayOrder.shippingAmount != null && (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Shipping</Text>
              <Text style={styles.priceValue}>
                ₹{Number(displayOrder.shippingAmount).toFixed(2)}
              </Text>
            </View>
          )}
          <View style={[styles.priceRow, { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderLight }]}>
            <Text style={[styles.priceLabel, { fontWeight: 'bold', color: colors.text.primary }]}>Total</Text>
            <Text style={[styles.priceValue, { fontWeight: '900', color: colors.primary, fontSize: typography.fontSize.lg }]}>
              ₹{Number(displayOrder.total || 0).toFixed(2)}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        {canCancelOrder && (
          <Button
            title={isCancelling ? 'Cancelling...' : 'Cancel Order'}
            disabled={isCancelling}
            onPress={handleCancelOrder}
            style={{ marginBottom: spacing.sm }}
          />
        )}
        <Button title="Download Invoice" onPress={() => Haptics.impactAsync()} />
      </View>
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
    paddingBottom: 120,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  orderId: {
    fontSize: typography.fontSize.lg,
    fontWeight: '900',
    color: colors.text.primary,
  },
  statusBadge: {
    backgroundColor: colors.primary + '20',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    color: colors.primary,
    fontWeight: 'bold',
    fontSize: typography.fontSize.xs,
  },
  orderDate: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.md,
  },
  trackingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: 12,
  },
  trackingLabel: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    marginRight: spacing.sm,
  },
  trackingNumber: {
    color: colors.text.primary,
    fontWeight: 'bold',
    fontSize: typography.fontSize.sm,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: spacing.lg,
  },
  timeline: {
    paddingLeft: spacing.sm,
  },
  timelineStep: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  timelineLeft: {
    alignItems: 'center',
    width: 20,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.surfaceLight,
    borderWidth: 2,
    borderColor: colors.borderLight,
    zIndex: 2,
  },
  timelineDotActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  timelineLine: {
    width: 2,
    height: 40,
    backgroundColor: colors.borderLight,
    position: 'absolute',
    top: 10,
    zIndex: 1,
  },
  timelineLineActive: {
    backgroundColor: colors.primary,
  },
  timelineContent: {
    marginLeft: spacing.lg,
    flex: 1,
  },
  stepStatus: {
    fontSize: typography.fontSize.md,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 4,
  },
  stepStatusPending: {
    color: colors.text.tertiary,
  },
  stepDate: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
  itemCard: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  itemImageContainer: {
    width: 70,
    height: 90,
    borderRadius: 8,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  itemDetails: {
    flex: 1,
    marginLeft: spacing.md,
    justifyContent: 'center',
  },
  itemName: {
    fontSize: typography.fontSize.md,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 4,
  },
  itemVariant: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemPrice: {
    fontSize: typography.fontSize.md,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  itemQty: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    fontWeight: 'bold',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  priceLabel: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.md,
  },
  priceValue: {
    color: colors.text.primary,
    fontSize: typography.fontSize.md,
    fontWeight: '600',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.xl,
    paddingBottom: Platform.OS === 'ios' ? 34 : spacing.xl,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
});
