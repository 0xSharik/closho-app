import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Animated, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import * as Haptics from 'expo-haptics';
import { useWishlistStore } from '../../store/wishlistStore';

export interface Product {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  rating: number;
  reviews?: number;
  category?: string;
  imageUrl: string;
  isWishlisted?: boolean;
}

interface ProductCardProps {
  product: Product;
  onPress: () => void;
  onWishlistPress?: () => void;
  style?: any;
}

export const ProductCard = ({ product, onPress, style }: ProductCardProps) => {
  const { width } = useWindowDimensions();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const { toggleWishlist, isInWishlist } = useWishlistStore();
  const isWishlisted = isInWishlist(product.id);

  // Dynamic responsive layout calculation
  const isTablet = width >= 600;
  const columns = isTablet ? (width >= 900 ? 4 : 3) : 2;
  const computedWidth = Math.min(
    isTablet ? 240 : 200,
    (width - spacing.md * (columns + 1)) / columns
  );

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
      speed: 20,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      bounciness: 8,
    }).start();
  };

  const handleWishlist = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleWishlist(product);
  };

  return (
    <Animated.View style={[styles.container, { width: computedWidth }, style, { transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity 
        activeOpacity={0.9} 
        onPressIn={handlePressIn} 
        onPressOut={handlePressOut} 
        onPress={onPress}
      >
        <View style={[styles.imageContainer, { height: computedWidth * 1.05 }]}>
          <Image source={{ uri: product.imageUrl || 'https://placehold.co/300x300' }} style={styles.image} resizeMode="cover" />
          
          <TouchableOpacity style={styles.wishlistBtn} onPress={handleWishlist}>
            <View style={styles.wishlistIconBg}>
              <Ionicons 
                name={isWishlisted ? "heart" : "heart-outline"} 
                size={18} 
                color={isWishlisted ? colors.primary : colors.text.inverse} 
              />
            </View>
          </TouchableOpacity>

          <View style={styles.badgesBottom}>
            <View style={styles.ratingBadge}>
              <Text style={styles.ratingText}>{product.rating}</Text>
              <Ionicons name="star" size={10} color={colors.primary} style={{ marginLeft: 2 }} />
            </View>
          </View>
        </View>

        <View style={styles.infoContainer}>
          <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
          
          <View style={styles.priceContainer}>
            <Text style={styles.price}>₹{(Number(product.price) || 0).toLocaleString('en-IN')}</Text>
            {!!product.originalPrice && product.originalPrice > 0 && (
              <Text style={styles.originalPrice}>₹{product.originalPrice.toLocaleString('en-IN')}</Text>
            )}
            {!!product.discount && product.discount > 0 && (
              <Text style={styles.discountText}>({product.discount}% OFF)</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
    backgroundColor: colors.overlay.glass,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.overlay.light,
    paddingBottom: spacing.xs,
  },
  imageContainer: {
    width: '100%',
    backgroundColor: 'transparent',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  wishlistBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 10,
  },
  wishlistIconBg: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(10, 10, 10, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgesBottom: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    flexDirection: 'row',
  },
  ratingBadge: {
    backgroundColor: 'rgba(10, 10, 10, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  ratingText: {
    color: colors.text.primary,
    fontSize: 9,
    fontWeight: 'bold',
  },
  infoContainer: {
    paddingHorizontal: 8,
  },
  name: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.xs,
    fontWeight: '500',
    marginBottom: 2,
    lineHeight: 16,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  price: {
    color: colors.text.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: 'bold',
    marginRight: spacing.xs,
  },
  originalPrice: {
    color: colors.text.tertiary,
    fontSize: typography.fontSize.xs,
    textDecorationLine: 'line-through',
    marginRight: spacing.xs,
  },
  discountText: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: 'bold',
  },
});
