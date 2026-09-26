import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Modal, Animated, ActivityIndicator, RefreshControl, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { spacing } from '../../src/theme/spacing';
import { ProductCard, Product } from '../../src/components/product/ProductCard';
import { Button } from '../../src/components/ui/Button';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSnackbar } from '../../src/components/ui/SnackbarContext';
import { useCategoryStore } from '../../src/store/categoryStore';
import { ProductGridSkeleton } from '../../src/components/ui/SkeletonLoader';

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterVisible, setIsFilterVisible] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeSort, setActiveSort] = useState('Recommended');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const { showSnackbar } = useSnackbar();
  
  const parentId = (params.parentId as string) || null;
  const categoryName = (params.categoryName as string) || 'All Products';
  
  const { fetchSubCategories, fetchTopCategories, getAllCategoriesForParent, isLoadingCategories } = useCategoryStore();
  const displayCategories = getAllCategoriesForParent(parentId);

  useEffect(() => {
    if (parentId) {
      fetchSubCategories(parentId);
    } else {
      fetchTopCategories();
    }
  }, [parentId]);

  // Removed old params.category effect as activeCategory now tracks ID

  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  const fetchProducts = async () => {
    setIsLoading(true);
    try {
      const api = require('../../src/services/api').default;
      
      // Build query string based on filters
      let query = `/products?page=1&limit=50`;
      if (searchQuery) query += `&search=${encodeURIComponent(searchQuery)}`;
      if (activeCategory) query += `&category=${encodeURIComponent(activeCategory)}`;
      if (minPrice) query += `&minPrice=${minPrice}`;
      if (maxPrice) query += `&maxPrice=${maxPrice}`;
      
      let sortParam = 'recommended';
      if (activeSort === 'Price: Low to High') sortParam = 'price_asc';
      if (activeSort === 'Price: High to Low') sortParam = 'price_desc';
      if (activeSort === 'Newest Arrivals') sortParam = 'newest';
      query += `&sort=${sortParam}`;

      console.log(`=== PRODUCTS LIST REQUEST (EXPLORE) === URL: ${query}`);
      const response = await api.get(query);
      console.log(`=== PRODUCTS LIST RESPONSE (EXPLORE) ===`, JSON.stringify(response.data, null, 2));
      if (response.data) {
        const responseData = response.data.data !== undefined ? response.data.data : response.data;
        const productsArray = Array.isArray(responseData) ? responseData : (responseData?.products || []);
        
        if (Array.isArray(productsArray) && productsArray.length > 0) {
          let formattedProducts = productsArray.map((p: any) => ({
            ...p,
            price: Number(p.price) || 0,
            originalPrice: p.originalPrice ? Number(p.originalPrice) : undefined,
            imageUrl: p.thumbnail || p.images?.[0] || 'https://via.placeholder.com/400x500?text=No+Image',
          }));
          
          // Client-side fallback filter just in case the backend ignores the category query param
          if (activeCategory) {
            const filtered = formattedProducts.filter((p: any) => p.categoryId === activeCategory || p.category === activeCategory || (p.category && p.category.id === activeCategory));
            if (filtered.length > 0) formattedProducts = filtered;
          }
          
          setProducts(formattedProducts);
        } else {
          console.log('Explore products array is empty or invalid:', productsArray);
          showSnackbar('No products found', 'info');
        }
      } else {
        showSnackbar('Failed to load products', 'error');
      }
    } catch (error) {
      console.log('Explore products fetch error:', error);
      showSnackbar('Error connecting to server', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts();
    }, 500); // 500ms debounce
    return () => clearTimeout(timer);
  }, [searchQuery, activeCategory, activeSort]);

  const handleProductPress = (id: string) => {
    router.push(`/product/${id}`);
  };

  const applyFilters = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsFilterVisible(false);
    fetchProducts();
    showSnackbar('Filters applied', 'success');
  };

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await fetchProducts();
    setRefreshing(false);
  }, [searchQuery, activeCategory, activeSort, minPrice, maxPrice]);

  const topInsetPadding = Math.max(insets.top, Platform.OS === 'android' ? 36 : 44) + spacing.xs;

  return (
    <View style={styles.container}>
      {/* Search Header */}
      <View style={[styles.header, { paddingTop: topInsetPadding }]}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={colors.text.tertiary} style={styles.searchIcon} />
          <TextInput 
            placeholder="Search for clothes, shoes..."
            placeholderTextColor={colors.text.tertiary}
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={18} color={colors.text.tertiary} />
            </TouchableOpacity>
          )}
          <View style={styles.divider} />
          <TouchableOpacity 
            style={styles.filterBtn} 
            onPress={() => {
              Haptics.selectionAsync();
              setIsFilterVisible(true);
            }}
          >
            <Ionicons name="options-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <Animated.ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false} 
        style={{ opacity: fadeAnim }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        
        {/* Dynamic Category Chips */}
        {displayCategories.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.exploreChipsContainer}>
            {displayCategories.map(cat => (
              <TouchableOpacity
                key={cat.id}
                style={[styles.exploreChip, activeCategory === cat.id && styles.exploreChipActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setActiveCategory(activeCategory === cat.id ? null : cat.id);
                }}
              >
                <Text style={[styles.exploreChipText, activeCategory === cat.id && styles.exploreChipTextActive]}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{categoryName}</Text>
          <Text style={styles.resultsCount}>{products.length} results</Text>
        </View>

        {isLoading ? (
          <View style={{ paddingHorizontal: spacing.sm, marginTop: spacing.md }}>
            <ProductGridSkeleton count={6} />
          </View>
        ) : products.length === 0 ? (
          <View style={{ alignItems: 'center', marginTop: spacing.xxxl }}>
            <Ionicons name="search-outline" size={64} color={colors.text.tertiary} />
            <Text style={{ color: colors.text.secondary, marginTop: spacing.md }}>No products found</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {products.map((product) => (
              <ProductCard 
                key={product.id} 
                product={product} 
                onPress={() => handleProductPress(product.id)} 
                onWishlistPress={() => console.log('Toggle wishlist', product.id)}
              />
            ))}
          </View>
        )}
      </Animated.ScrollView>

      {/* Filter Modal */}
      <Modal visible={isFilterVisible} animationType="slide" transparent={true} onRequestClose={() => setIsFilterVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filters</Text>
              <TouchableOpacity onPress={() => setIsFilterVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.filterScroll}>
              <Text style={styles.filterSectionTitle}>Categories</Text>
              <View style={styles.filterChips}>
                {displayCategories.map(cat => (
                  <TouchableOpacity 
                    key={cat.id} 
                    style={[styles.filterChip, activeCategory === cat.id && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setActiveCategory(activeCategory === cat.id ? null : cat.id);
                    }}
                  >
                    <Text style={[styles.filterChipText, activeCategory === cat.id && { color: colors.primary, fontWeight: 'bold' }]}>{cat.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.filterSectionTitle}>Price Range</Text>
              <View style={styles.priceRow}>
                <View style={styles.priceInputBox}>
                  <Text style={{ color: colors.text.secondary, position: 'absolute', left: 10 }}>₹</Text>
                  <TextInput 
                    style={[styles.priceInputText, { paddingLeft: 20 }]} 
                    placeholder="0" 
                    placeholderTextColor={colors.text.tertiary}
                    keyboardType="numeric"
                    value={minPrice}
                    onChangeText={setMinPrice}
                  />
                </View>
                <Text style={styles.priceDivider}>to</Text>
                <View style={styles.priceInputBox}>
                  <Text style={{ color: colors.text.secondary, position: 'absolute', left: 10 }}>₹</Text>
                  <TextInput 
                    style={[styles.priceInputText, { paddingLeft: 20 }]} 
                    placeholder="Max" 
                    placeholderTextColor={colors.text.tertiary}
                    keyboardType="numeric"
                    value={maxPrice}
                    onChangeText={setMaxPrice}
                  />
                </View>
              </View>

              <Text style={styles.filterSectionTitle}>Sort By</Text>
              <View style={styles.sortOptions}>
                {['Recommended', 'Newest Arrivals', 'Price: Low to High', 'Price: High to Low'].map(opt => (
                  <TouchableOpacity 
                    key={opt}
                    style={[styles.sortOption, activeSort === opt && styles.sortOptionActive]}
                    onPress={() => { Haptics.selectionAsync(); setActiveSort(opt); }}
                  >
                    <Text style={[styles.sortOptionText, activeSort === opt && styles.sortOptionTextActive]}>{opt}</Text>
                    {activeSort === opt && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Button title="Reset" variant="outline" style={styles.resetBtn} onPress={() => {
                setActiveCategory(null);
                setSearchQuery('');
                setMinPrice('');
                setMaxPrice('');
                setActiveSort('Recommended');
              }} />
              <Button title="Apply Filters" style={styles.applyBtn} onPress={applyFilters} />
            </View>
          </View>
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
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    height: 52,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: typography.fontSize.md,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: colors.borderLight,
    marginHorizontal: spacing.sm,
  },
  filterBtn: {
    padding: spacing.xs,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxxl * 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    color: colors.text.primary,
    fontSize: typography.fontSize.xl,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  resultsCount: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay.dark,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  modalTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  filterScroll: {
    padding: spacing.xl,
  },
  filterSectionTitle: {
    color: colors.text.primary,
    fontSize: typography.fontSize.md,
    fontWeight: 'bold',
    marginBottom: spacing.md,
    marginTop: spacing.md,
  },
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.md,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  filterChipText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.sm,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  priceInputBox: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  priceInputText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.md,
    flex: 1,
  },
  priceDivider: {
    color: colors.text.secondary,
    marginHorizontal: spacing.md,
  },
  sortOptions: {
    marginBottom: spacing.xxxl,
  },
  sortOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  sortOptionActive: {
    borderBottomColor: colors.primary,
  },
  sortOptionText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.md,
  },
  sortOptionTextActive: {
    color: colors.primary,
    fontWeight: 'bold',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  resetBtn: {
    flex: 1,
    marginRight: spacing.md,
  },
  applyBtn: {
    flex: 2,
  },
  exploreChipsContainer: {
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  exploreChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
  },
  exploreChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  exploreChipText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    fontWeight: '500',
  },
  exploreChipTextActive: {
    color: colors.text.inverse,
    fontWeight: 'bold',
  },
});
