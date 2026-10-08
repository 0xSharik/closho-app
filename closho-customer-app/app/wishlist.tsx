import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { spacing } from '../src/theme/spacing';
import { ProductCard, Product } from '../src/components/product/ProductCard';
import * as Haptics from 'expo-haptics';
import { useWishlistStore } from '../src/store/wishlistStore';
import { useCartStore } from '../src/store/cartStore';
import { useSnackbar } from '../src/components/ui/SnackbarContext';
import { Button } from '../src/components/ui/Button';
import { goBackOrHome } from '../src/utils/navigation';

export default function WishlistScreen() {
  const router = useRouter();
  const { items, removeFromWishlist, fetchWishlist } = useWishlistStore();
  const { addToCart } = useCartStore();
  const { showSnackbar } = useSnackbar();

  React.useEffect(() => {
    fetchWishlist();
  }, []);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    goBackOrHome(router);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Wishlist</Text>
        <View style={{ width: 24 }} />
      </View>

      {items.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="heart-outline" size={80} color={colors.text.tertiary} />
          <Text style={{ color: colors.text.secondary, marginTop: spacing.md, fontSize: typography.fontSize.md }}>Your wishlist is empty.</Text>
        </View>
      ) : (

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.grid}>
          {items.map((product) => (
            <View key={product.id} style={styles.gridItem}>
              <ProductCard product={product} onPress={() => router.push(`/product/${product.id}`)} />
              <Button 
                title="Move to Cart" 
                variant="outline" 
                style={{ marginTop: spacing.xs, paddingVertical: spacing.sm }} 
                onPress={async () => {
                  Haptics.impactAsync();
                  const res = await addToCart({
                    productId: product.id,
                    name: product.name,
                    price: product.price,
                    size: 'M',
                    colorName: 'Default',
                    colorHex: '#000000',
                    quantity: 1,
                    image: product.imageUrl ?? '',
                  });
                  if (res.success) {
                    await removeFromWishlist(product.id);
                    showSnackbar('Moved to Cart', 'success');
                  } else {
                    showSnackbar(res.message || 'Failed to move to cart', 'error');
                  }
                }} 
              />
            </View>
          ))}
        </View>
      </ScrollView>
      )}
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl * 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridItem: {
    width: '48%',
    marginBottom: spacing.lg,
  },
});
