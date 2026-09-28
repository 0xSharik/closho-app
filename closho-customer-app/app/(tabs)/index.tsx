import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Product, ProductCard } from '../../src/components/product/ProductCard';
import { colors } from '../../src/theme/colors';
import { spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';

import * as Location from 'expo-location';
import { ProductGridSkeleton } from '../../src/components/ui/SkeletonLoader';
import api from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';
import { useProfileStore } from '../../src/store/profileStore';
import { useReelsStore } from '../../src/store/reelsStore';
import { useStoreStore } from '../../src/store/storeStore';
import { useSnackbar } from '../../src/components/ui/SnackbarContext';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currentStore, availableStores, fetchAllStores, fetchNearestStore, setCurrentStore } = useStoreStore();
  const { reels, fetchReels } = useReelsStore();
  const { addresses, fetchAddresses } = useProfileStore();
  const { user } = useAuthStore();
  const { showSnackbar } = useSnackbar();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAddressModalVisible, setIsAddressModalVisible] = useState(false);
  const [isStoreModalVisible, setIsStoreModalVisible] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [gpsLocationLabel, setGpsLocationLabel] = useState<string | null>(null);
  const [isResolvingLocation, setIsResolvingLocation] = useState(false);

  // Stable shuffle for Recommendations — only re-shuffles when products array changes
  const shuffledProducts = useMemo(
    () => [...products].sort(() => 0.5 - Math.random()),
    [products]
  );

  // Subtle entrance animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 800, useNativeDriver: true })
    ]).start();

    // Fetch all stores and reels
    fetchAllStores();
    fetchReels();

    const initLocationAndStores = async () => {
      if (currentStore) return;

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.log('Location permission denied, fetching default stores');
          await fetchNearestStore(19.1197, 72.8468, 99999, false);
          return;
        }

        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        // Reverse geocode to get a human-readable label for the header
        resolveLocationLabel(location.coords.latitude, location.coords.longitude);

        await fetchNearestStore(location.coords.latitude, location.coords.longitude, 15);
      } catch (error) {
        console.warn('Error getting location', error);
        await fetchNearestStore(19.1197, 72.8468, 99999);
      }
    };
    initLocationAndStores();
  }, []);

  /**
   * Reverse-geocodes lat/lng and updates the header location label.
   * Priority: sublocality (neighbourhood) → district → city → region
   */
  const resolveLocationLabel = async (lat: number, lng: number) => {
    try {
      setIsResolvingLocation(true);
      const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (results && results.length > 0) {
        const r = results[0];
        // Build a concise label: prefer subregion/district over full city
        const label =
          r.subregion ||
          r.district ||
          r.sublocality ||
          r.name ||
          r.city ||
          r.region ||
          'Current Location';
        setGpsLocationLabel(label);
      }
    } catch (err) {
      console.warn('[Location] Reverse geocode failed:', err);
    } finally {
      setIsResolvingLocation(false);
    }
  };

  const useCurrentLocationForHeader = async () => {
    try {
      setIsResolvingLocation(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showSnackbar('Location permission is needed.', 'error');
        return;
      }
      if (Platform.OS === 'android') {
        await Location.enableNetworkProviderAsync().catch(() => undefined);
      }
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      await resolveLocationLabel(location.coords.latitude, location.coords.longitude);
      showSnackbar('Location updated.', 'success');
      setIsAddressModalVisible(false);
    } catch (err) {
      console.warn('[Location] Could not get current location:', err);
      showSnackbar('Could not get your current location.', 'error');
    } finally {
      setIsResolvingLocation(false);
    }
  };

  const selectNearestStoreFromCurrentLocation = async () => {
    if (isLocating) return;

    setIsLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showSnackbar('Location permission is needed to find stores near you.', 'error');
        return;
      }

      if (Platform.OS === 'android') {
        await Location.enableNetworkProviderAsync().catch(() => undefined);
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      // Also update header label when re-selecting location from store modal
      resolveLocationLabel(location.coords.latitude, location.coords.longitude);
      await fetchNearestStore(location.coords.latitude, location.coords.longitude, 15, true);
      setIsStoreModalVisible(false);
      showSnackbar('Nearest store selected.', 'success');
    } catch (error) {
      console.warn('Unable to select nearest store from current location', error);
      showSnackbar('We could not get your current location. Please check location services and try again.', 'error');
    } finally {
      setIsLocating(false);
    }
  };

  // Fetch products + addresses when store changes (guarded to prevent double-fire on startup)
  const prevStoreIdRef = React.useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const newId = currentStore?.id ?? null;
    if (prevStoreIdRef.current === undefined || prevStoreIdRef.current !== newId) {
      prevStoreIdRef.current = newId;
      fetchAddresses();
      fetchProducts();
    }
  }, [currentStore]);

  const fetchProducts = async () => {
    try {
      const url = `/products?limit=14`;
      const res = await api.get(url);
      if (res.data) {
        const responseData = res.data.data !== undefined ? res.data.data : res.data;
        const productsArray = Array.isArray(responseData) ? responseData : (responseData?.products || []);
        if (Array.isArray(productsArray) && productsArray.length > 0) {
          const formattedProducts = productsArray.map((p: any) => ({
            ...p,
            price: Number(p.price) || 0,
            originalPrice: p.originalPrice ? Number(p.originalPrice) : undefined,
            imageUrl: p.thumbnail || p.images?.[0] || '',
          }));
          setProducts(formattedProducts);
        }
      }
    } catch (err: any) {
      console.warn('Failed to fetch home products:', err?.message || err);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      fetchAllStores(),
      fetchReels(),
      fetchProducts()
    ]);
    setRefreshing(false);
  }, []);

  const handleSelectStore = async (store: any) => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }
    await setCurrentStore(store);
    router.push('/(tabs)/explore');
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? 36 : 44) + spacing.xs }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >

        {/* ── HEADER ── */}
        <Animated.View style={[styles.topHeader, { opacity: fadeAnim }]}>
          <View style={styles.headerLeft}>
            <Text style={styles.logoText}>CLOSHO</Text>
            <Text style={styles.wearItTodayText}>WEAR IT TODAY</Text>
            <TouchableOpacity style={styles.locationRow} activeOpacity={0.7} onPress={() => {
              Haptics.selectionAsync();
              setIsAddressModalVisible(true);
            }}>
              <Ionicons name="location-outline" size={14} color={colors.text.secondary} />
              <Text style={styles.deliveryLabel}>Delivery To: </Text>
              <Text style={styles.storeName} numberOfLines={1}>
                {isResolvingLocation ? 'Locating...' : (gpsLocationLabel || 'Set Location')}
              </Text>
              <Ionicons name="chevron-down" size={12} color={colors.text.secondary} style={{ marginLeft: 4, marginTop: 2 }} />
            </TouchableOpacity>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7} onPress={() => router.push('/(tabs)/profile')}>
              <View style={styles.profileImageWrapper}>
                {user?.avatar ? (
                  <Image source={{ uri: user.avatar }} style={styles.profileImage} />
                ) : (
                  <View style={[styles.profileImage, { backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ color: colors.text.inverse, fontWeight: 'bold', fontSize: 14 }}>
                      {(user?.name || user?.email || 'U').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7} onPress={() => router.push('/notifications')}>
              <View style={styles.notificationWrapper}>
                <Ionicons name="notifications-outline" size={22} color={colors.text.primary} />
              </View>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* ── NEAREST STORE ── */}
        <Animated.View style={[styles.nearestStoreContainer, { opacity: fadeAnim }]}>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center' }}
            onPress={() => {
              Haptics.selectionAsync();
              setIsStoreModalVisible(true);
            }}
          >
            <Text style={styles.nearestStoreText}>
              Store: <Text style={{ color: colors.text.primary, fontWeight: 'bold' }}>{currentStore?.name || 'Select Store'}</Text>
            </Text>
            <Ionicons name="chevron-down" size={12} color={colors.text.tertiary} style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        </Animated.View>

        {/* ── SEARCH BAR ── */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => router.push('/(tabs)/explore')}
        >
          <Animated.View style={[styles.searchContainer, { opacity: fadeAnim }]}>
            <Ionicons name="search" size={20} color={colors.text.tertiary} style={styles.searchIcon} />
            <Text style={[styles.searchInput, { color: colors.text.tertiary, paddingVertical: 14 }]}>
              Track order or search...
            </Text>
            <Ionicons name="options-outline" size={20} color={colors.text.tertiary} />
          </Animated.View>
        </TouchableOpacity>

        {/* ── BANNER ── */}
        <Animated.View style={[styles.bannerContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <Image
            source={{ uri: 'https://images.unsplash.com/photo-1523381294911-8d3cead13475?q=80&w=800&auto=format&fit=crop' }}
            style={styles.bannerImage}
          />
          <View style={styles.bannerOverlay}>
            <Text style={styles.bannerSub}>FAST. RELIABLE. YOURS.</Text>
            <Text style={styles.bannerTitle}>Delivered{'\n'}in just{'\n'}one day.</Text>
            <TouchableOpacity style={styles.bannerBtn} onPress={() => { Haptics.impactAsync(); router.push('/(tabs)/explore'); }}>
              <Text style={styles.bannerBtnText}>Shop Now</Text>
              <Ionicons name="arrow-forward-circle" size={20} color={colors.text.inverse} style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* ── STORES ── */}
        <Animated.View style={[styles.sectionContainer, { opacity: fadeAnim }]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Stores</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storesHorizontalList}>
            {availableStores.map((store, index) => {
              const isActive = currentStore?.id === store.id;
              return (
                <TouchableOpacity
                  key={store.id || index}
                  style={[styles.storeCardBox, isActive && styles.storeCardBoxActive]}
                  activeOpacity={0.8}
                  onPress={() => handleSelectStore(store)}
                >
                  <View style={styles.storeCardImageContainer}>
                    <Ionicons
                      name="storefront-outline"
                      size={20}
                      color={isActive ? colors.background : colors.text.primary}
                    />
                  </View>
                  <Text style={[styles.storeCardTitle, isActive && styles.storeCardTitleActive]} numberOfLines={1}>
                    {store.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Animated.View>

        {/* ── TRENDING REELS ── */}
        {reels.length > 0 && (
          <Animated.View style={[styles.sectionContainer, { opacity: fadeAnim }]}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Trending</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/reels')}>
                <Text style={styles.seeAllText}>See All</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
              {reels.slice(0, 5).map((reel, index) => (
                <TouchableOpacity
                  key={reel.id}
                  style={styles.reelCard}
                  onPress={() => {
                    Haptics.impactAsync();
                    router.push('/(tabs)/reels');
                  }}
                >
                  {(reel.thumbnail || reel.videoUrl) ? (
                    <Image
                      style={styles.reelVideo}
                      source={{ uri: reel.thumbnail || reel.videoUrl }}
                    />
                  ) : (
                    <View style={[styles.reelVideo, { backgroundColor: colors.surfaceLight, justifyContent: 'center', alignItems: 'center' }]}>
                      <Ionicons name="videocam-outline" size={28} color={colors.text.tertiary} />
                    </View>
                  )}
                  <View style={styles.playIconContainer}>
                    <Ionicons name="play-circle" size={40} color="rgba(255,255,255,0.7)" />
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Animated.View>
        )}

        {/* ── BEST SELLERS ── */}
        {products.length > 0 && (
          <Animated.View style={[styles.sectionContainer, { opacity: fadeAnim }]}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Best Sellers</Text>
            </View>
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
                {products
                  .filter((p, idx, arr) => arr.findIndex(x => x.id === p.id) === idx)
                  .slice(0, 6)
                  .map(product => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      style={styles.horizontalProductCard}
                      onPress={() => router.push(`/product/${product.id}`)}
                    />
                  ))}
              </ScrollView>
            )}
          </Animated.View>
        )}

        {/* ── RECOMMENDATIONS ── */}
        {products.length > 0 && (
          <Animated.View style={[styles.sectionContainer, { opacity: fadeAnim }]}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recommendations for You</Text>
            </View>
            {isLoading ? (
              <View style={{ paddingHorizontal: spacing.sm }}>
                <ProductGridSkeleton count={4} />
              </View>
            ) : (
              <View style={styles.gridContainer}>
                {/* Randomize items to simulate random for new users, related for old */}
                {shuffledProducts.slice(0, 8).map(product => (
                  <View key={product.id} style={styles.gridItem}>
                    <ProductCard
                      product={product}
                      onPress={() => router.push(`/product/${product.id}`)}
                    />
                  </View>
                ))}
              </View>
            )}
          </Animated.View>
        )}
      </ScrollView>

      {/* ADDRESS SELECTION MODAL */}
      <Modal visible={isAddressModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Delivery Address</Text>
              <TouchableOpacity onPress={() => setIsAddressModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: spacing.xl }}>
              {/* Use Current GPS Location */}
              <TouchableOpacity
                style={styles.autoSelectBtn}
                disabled={isResolvingLocation}
                onPress={useCurrentLocationForHeader}
              >
                <Ionicons name="locate" size={20} color={colors.text.inverse} style={{ marginRight: 8 }} />
                <Text style={{ color: colors.text.inverse, fontWeight: 'bold' }}>
                  {isResolvingLocation ? 'Getting Location...' : 'Use Current Location'}
                </Text>
              </TouchableOpacity>

              {addresses.length === 0 ? (
                <Text style={{ color: colors.text.secondary, marginBottom: spacing.lg, textAlign: 'center' }}>No saved addresses yet.</Text>
              ) : (
                addresses.map(address => (
                  <TouchableOpacity key={address.id} style={styles.addressItem} onPress={() => setIsAddressModalVisible(false)}>
                    <Ionicons name={address.type === 'home' ? 'home' : address.type === 'office' ? 'briefcase' : 'location'} size={20} color={colors.text.tertiary} style={{ marginRight: spacing.md }} />
                    <View>
                      <Text style={styles.addressTitle}>{address.type.charAt(0).toUpperCase() + address.type.slice(1)}</Text>
                      <Text style={styles.addressDesc}>{address.addressLine1}</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
              <TouchableOpacity style={styles.addAddressBtn} onPress={() => { setIsAddressModalVisible(false); router.push('/addresses'); }}>
                <Ionicons name="add" size={20} color={colors.primary} />
                <Text style={styles.addAddressText}>Add New Address</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* STORE SELECTION MODAL */}
      <Modal visible={isStoreModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Store</Text>
              <TouchableOpacity onPress={() => setIsStoreModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: spacing.xl }}>
              <TouchableOpacity
                style={styles.autoSelectBtn}
                disabled={isLocating}
                onPress={selectNearestStoreFromCurrentLocation}
              >
                <Ionicons name="locate" size={20} color={colors.text.inverse} style={{ marginRight: 8 }} />
                <Text style={{ color: colors.text.inverse, fontWeight: 'bold' }}>
                  {isLocating ? 'Finding your location...' : 'Auto-select Nearest Store'}
                </Text>
              </TouchableOpacity>

              {availableStores.map(store => (
                <TouchableOpacity
                  key={store.id}
                  style={[styles.addressItem, currentStore?.id === store.id && { borderColor: colors.primary, borderWidth: 1 }]}
                  onPress={() => {
                    handleSelectStore(store);
                    setIsStoreModalVisible(false);
                  }}
                >
                  <Ionicons name="storefront" size={20} color={currentStore?.id === store.id ? colors.primary : colors.text.tertiary} style={{ marginRight: spacing.md }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.addressTitle, currentStore?.id === store.id && { color: colors.primary }]}>{store.name}</Text>
                    <Text style={styles.addressDesc}>{store.address}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
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
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 100, // extra padding for floating tab bar
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  headerLeft: {
    flex: 1,
    paddingRight: spacing.md,
  },
  logoText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.xxl,
    fontWeight: '800',
    letterSpacing: 1,
  },
  wearItTodayText: {
    color: colors.primary,
    fontSize: typography.fontSize.xs,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deliveryLabel: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
  },
  storeName: {
    color: colors.text.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    maxWidth: 120,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    marginLeft: spacing.sm,
  },
  profileImageWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  profileImage: {
    width: '100%',
    height: '100%',
  },
  notificationWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nearestStoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: spacing.lg,
  },
  nearestStoreText: {
    color: colors.text.tertiary,
    fontSize: typography.fontSize.xs,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: 30,
    paddingHorizontal: spacing.lg,
    height: 50,
    marginBottom: spacing.xl,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: typography.fontSize.md,
  },
  bannerContainer: {
    height: 240,
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: spacing.xxl,
    backgroundColor: colors.surface,
  },
  bannerImage: {
    width: '100%',
    height: '100%',
    opacity: 0.6,
  },
  bannerOverlay: {
    ...(StyleSheet.absoluteFill as object),
    padding: spacing.xl,
    justifyContent: 'center',
  },
  bannerSub: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.xs,
    letterSpacing: 2,
    marginBottom: spacing.md,
    fontWeight: '600',
  },
  bannerTitle: {
    color: colors.text.primary,
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 38,
    marginBottom: spacing.lg,
  },
  bannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 20,
  },
  bannerBtnText: {
    color: colors.text.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
  },
  storesHorizontalList: {
    paddingRight: spacing.lg,
    alignItems: 'center',
    paddingVertical: 4,
  },
  storeCardBox: {
    minWidth: 160,
    height: 70,
    flexDirection: 'row',
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: spacing.md,
  },
  storeCardBoxActive: {
    backgroundColor: colors.surface,
    borderColor: colors.text.primary,
  },
  storeCardImageContainer: {
    marginRight: spacing.xs,
  },
  storeCardTitle: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
  },
  storeCardTitleActive: {
    color: colors.text.primary,
  },
  sectionContainer: {
    marginBottom: spacing.xxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.text.primary,
    fontSize: typography.fontSize.lg,
    fontWeight: 'bold',
  },
  seeAllText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
  },
  horizontalList: {
    paddingRight: spacing.lg,
  },
  horizontalProductCard: {
    marginRight: spacing.md,
  },
  reelCard: {
    width: 120,
    height: 180,
    borderRadius: 16,
    marginRight: spacing.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceLight,
  },
  reelVideo: {
    width: '100%',
    height: '100%',
  },
  playIconContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
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
  addressItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    marginBottom: spacing.md,
  },
  addressTitle: {
    color: colors.text.primary,
    fontWeight: 'bold',
    fontSize: typography.fontSize.md,
  },
  addressDesc: {
    color: colors.text.tertiary,
    fontSize: typography.fontSize.sm,
    marginTop: 2,
  },
  addAddressBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 12,
    borderStyle: 'dashed',
    marginTop: spacing.sm,
    marginBottom: spacing.xxxl * 2,
  },
  addAddressText: {
    color: colors.primary,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  autoSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: 12,
    marginBottom: spacing.lg,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridItem: {
    width: '48%',
    marginBottom: spacing.lg,
  }
});
