import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useStoreStore } from './storeStore';
import { logUserActionFailure, logUserEvent } from '../utils/userEventLogger';

export interface CartItem {
  id: string;
  productId: string;
  name: string;
  price: number;
  size: string;
  colorName: string;
  colorHex: string;
  quantity: number;
  image: string;
  variantId?: string;
  storeId?: string;
}

interface CartState {
  items: CartItem[];
  couponCode: string | null;
  discountAmount: number;
  // Tracks the most recently used store for existing checkout/coupon compatibility.
  activeStoreId: string | null;
  // Tracks every store currently represented in the unified customer cart.
  activeStoreIds: string[];
  addToCart: (item: Omit<CartItem, 'id'>) => Promise<{ success: boolean; message?: string }>;
  removeFromCart: (id: string) => Promise<void>;
  updateQuantity: (id: string, delta: number) => Promise<void>;
  applyCoupon: (code: string) => Promise<{ success: boolean; message: string }>;
  removeCoupon: () => void;
  clearCart: () => Promise<void>;
  getCartTotal: () => number;
  fetchCart: () => Promise<void>;
  /** Call this right after a successful login to sync the server cart to this device. */
  syncCartAfterLogin: () => Promise<void>;
  /** Call this on logout to wipe local cart state. */
  resetCartState: () => void;
}

// ─── Module-level lock: prevents concurrent addToCart calls regardless of component re-renders ───
let _isAddingToCart = false;

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      couponCode: null,
      discountAmount: 0,
      activeStoreId: null,
      activeStoreIds: [],

      addToCart: async (newItem) => {
        // Hard lock — if already in-flight, reject immediately
        if (_isAddingToCart) {
          logUserEvent('cart.add_blocked', { reason: 'request_in_progress' });
          return { success: false, message: 'Please wait, adding to cart...' };
        }
        _isAddingToCart = true;

        try {
          logUserEvent('cart.add_submitted', { productId: newItem.productId, hasVariant: Boolean(newItem.variantId) });
          const api = require('../services/api').default;
          const currentStore = useStoreStore.getState().currentStore;

          // Resolve storeId: the product's own store always takes priority.
          const resolvedStoreId = (newItem as any).storeId || currentStore?.id;

          // A cart item is unique by store + product + variant.
          // This prevents the same product from two different stores being merged.
          const existingItem = get().items.find(
            i =>
              i.storeId === resolvedStoreId &&
              i.productId === newItem.productId &&
              i.variantId === newItem.variantId
          );

          if (existingItem) {
            logUserEvent('cart.quantity_increment_submitted', { itemId: existingItem.id });
            console.log('[CART] Same store/product/variant already exists.');
            console.log('[CART] Existing item:', existingItem.id);
            console.log('[CART] Incrementing quantity by 1.');
            await get().updateQuantity(existingItem.id, 1);
            logUserEvent('cart.quantity_increment_succeeded', { itemId: existingItem.id });
            return { success: true, message: 'Cart updated' };
          }

          const payload: any = {
            productId: newItem.productId,
            quantity: newItem.quantity,
          };
          if (resolvedStoreId) payload.storeId = resolvedStoreId;
          if (newItem.variantId) payload.variantId = newItem.variantId;

          console.log('[CART] === ADD TO CART ===');
          console.log('[CART] Payload:', JSON.stringify(payload, null, 2));
          console.log('[CART] resolvedStoreId:', resolvedStoreId);
          console.log('[CART] currentStore?.id:', currentStore?.id);
          console.log('[CART] item storeId:', (newItem as any).storeId);

          const res = await api.post('/cart/items', payload);
          console.log('[CART] Response status:', res.data.success);

          if (res.data.success) {
            // Keep every store represented in the unified cart.
            // Do NOT replace the previous store when a product from another store is added.
            if (resolvedStoreId) {
              const currentStoreIds = get().activeStoreIds || [];
              const nextStoreIds = currentStoreIds.includes(resolvedStoreId)
                ? currentStoreIds
                : [...currentStoreIds, resolvedStoreId];

              set({
                activeStoreId: resolvedStoreId,
                activeStoreIds: nextStoreIds,
              });

              console.log('[CART] Saved activeStoreId:', resolvedStoreId);
              console.log('[CART] activeStoreIds:', nextStoreIds);
            }
            await get().fetchCart();
            logUserEvent('cart.add_succeeded', { productId: newItem.productId });
            return { success: true };
          }
          logUserEvent('cart.add_failed', { productId: newItem.productId, reason: 'rejected' });
          return { success: false, message: res.data.message || 'Failed to add to cart' };
        } catch (error: any) {
          logUserActionFailure('cart.add_failed', error, { productId: newItem.productId });
          console.warn('[CART] === ADD TO CART ERROR ===');
          console.warn('[CART] Error data:', JSON.stringify(error.response?.data, null, 2));
          console.warn('[CART] Error message:', error.message);
          const errorMsg = error.response?.data?.errors?.[0]?.message
            || error.response?.data?.message
            || error.message
            || 'Network error';
          return { success: false, message: errorMsg };
        } finally {
          _isAddingToCart = false;
        }
      },

      removeFromCart: async (id) => {
        try {
          logUserEvent('cart.remove_submitted', { itemId: id });
          set((state) => ({ items: state.items.filter((item) => item.id !== id) }));
          const api = require('../services/api').default;
          await api.delete(`/cart/items/${id}`);
          logUserEvent('cart.remove_succeeded', { itemId: id });
        } catch (error) {
          logUserActionFailure('cart.remove_failed', error, { itemId: id });
          console.warn('[CART] Remove error', error);
          await get().fetchCart();
        }
      },

      updateQuantity: async (id, delta) => {
        try {
          const state = get();
          const item = state.items.find(i => i.id === id);
          if (!item) {
            logUserEvent('cart.quantity_change_failed', { itemId: id, reason: 'item_not_found' });
            return;
          }
          const newQty = Math.max(1, item.quantity + delta);

          set((state) => ({
            items: state.items.map((i) =>
              i.id === id ? { ...i, quantity: newQty } : i
            ),
          }));

          const api = require('../services/api').default;
          await api.patch(`/cart/items/${id}`, { quantity: newQty });
          logUserEvent('cart.quantity_change_succeeded', { itemId: id, quantity: newQty });
        } catch (error) {
          logUserActionFailure('cart.quantity_change_failed', error, { itemId: id });
          console.warn('[CART] Update quantity error', error);
          await get().fetchCart();
        }
      },

      applyCoupon: async (code) => {
        try {
          logUserEvent('cart.coupon_apply_submitted', { hasCode: Boolean(code) });
          const api = require('../services/api').default;
          const savedStoreId = get().activeStoreId;
          const currentStoreId = useStoreStore.getState().currentStore?.id;
          const storeId = savedStoreId || currentStoreId;
          const payload = storeId ? { code, storeId } : { code };
          const res = await api.post('/cart/apply-coupon', payload);
          if (res.data.success) {
            const discount = res.data.data?.discountAmount || 0;
            set({ couponCode: code.toUpperCase(), discountAmount: discount });
            logUserEvent('cart.coupon_apply_succeeded', { hasDiscount: discount > 0 });
            return { success: true, message: 'Coupon applied successfully!' };
          }
          logUserEvent('cart.coupon_apply_failed', { reason: 'invalid_or_rejected' });
          return { success: false, message: res.data.message || 'Invalid coupon.' };
        } catch (error: any) {
          logUserActionFailure('cart.coupon_apply_failed', error);
          console.warn('[CART] Apply coupon error', error?.message || error);
          return { success: false, message: error.response?.data?.message || 'Failed to apply coupon.' };
        }
      },

      removeCoupon: () => set({ couponCode: null, discountAmount: 0 }),

      clearCart: async () => {
        try {
          logUserEvent('cart.clear_submitted', { itemCount: get().items.length });
          const api = require('../services/api').default;
          const currentStoreId = useStoreStore.getState().currentStore?.id;
          const savedStoreId = get().activeStoreId;
          const savedStoreIds = get().activeStoreIds || [];

          const storeIds = Array.from(
            new Set(
              [
                ...savedStoreIds,
                savedStoreId,
                currentStoreId,
              ].filter(Boolean) as string[]
            )
          );

          console.log('[CART] ===== CLEAR ALL STORES =====');
          console.log('[CART] Stores to clear:', storeIds);

          set({
            items: [],
            couponCode: null,
            discountAmount: 0,
            activeStoreId: null,
            activeStoreIds: [],
          });

          if (storeIds.length === 0) {
            await api.delete('/cart');
            logUserEvent('cart.clear_succeeded', { storeCount: 0 });
            return;
          }

          await Promise.all(
            storeIds.map(async (storeId) => {
              try {
                await api.delete(`/cart?storeId=${storeId}`);
                console.log('[CART] Cleared store:', storeId);
              } catch (error: any) {
                console.warn(
                  '[CART] Failed to clear store:',
                  storeId,
                  error?.message || error
                );
              }
            })
          );
          logUserEvent('cart.clear_succeeded', { storeCount: storeIds.length });
        } catch (error) {
          logUserActionFailure('cart.clear_failed', error);
          console.warn('[CART] Clear cart error', error);
          await get().fetchCart();
        }
      },

      getCartTotal: () => {
        return get().items.reduce((total, item) => total + item.price * item.quantity, 0);
      },

      resetCartState: () => {
        set({
          items: [],
          couponCode: null,
          discountAmount: 0,
          activeStoreId: null,
          activeStoreIds: [],
        });
      },

      syncCartAfterLogin: async () => {
        console.log('[CART] ===== SYNC AFTER LOGIN =====');
        // 1. Wipe any stale local cart from a different device/session.
        set({
          items: [],
          couponCode: null,
          discountAmount: 0,
          activeStoreId: null,
          activeStoreIds: [],
        });

        try {
          // 2. Fetch all available stores.
          // IMPORTANT: call getState() again AFTER fetchAllStores resolves so we
          // read the freshly updated store list, not the snapshot from before the fetch.
          const useStoreStoreModule = require('./storeStore').useStoreStore;
          await useStoreStoreModule.getState().fetchAllStores();

          // Re-read state after the async fetch completes
          const freshStoreState = useStoreStoreModule.getState();
          const allStores: any[] = freshStoreState.availableStores || [];
          const currentStore = freshStoreState.currentStore;

          // Build the list of store IDs to check.
          const storeIds = Array.from(
            new Set(
              [
                currentStore?.id,
                ...allStores.map((s: any) => s.id),
              ].filter(Boolean) as string[]
            )
          );

          console.log('[CART] syncCartAfterLogin — stores found:', storeIds.length, '| ids:', storeIds);

          if (storeIds.length > 0) {
            // Seed activeStoreIds so fetchCart knows which stores to query.
            set({
              activeStoreIds: storeIds,
              activeStoreId: currentStore?.id || storeIds[0] || null,
            });
          }

          // 3. Fetch the merged server cart (uses the storeIds we just seeded).
          await get().fetchCart();
          console.log('[CART] syncCartAfterLogin — completed. items:', get().items.length);
        } catch (err: any) {
          console.warn('[CART] syncCartAfterLogin error:', err?.message || err);
        }
      },

      fetchCart: async () => {
        try {
          const api = require('../services/api').default;

          const currentStoreId = useStoreStore.getState().currentStore?.id;
          const savedStoreId = get().activeStoreId;
          const savedStoreIds = get().activeStoreIds || [];

          // Build the list of stores whose carts belong to this customer.
          // Existing activeStoreId is retained for backward compatibility.
          const storeIds = Array.from(
            new Set(
              [
                ...savedStoreIds,
                savedStoreId,
                currentStoreId,
              ].filter(Boolean) as string[]
            )
          );

          console.log('[CART] ===== MULTI-STORE FETCH START =====');
          console.log('[CART] activeStoreIds:', storeIds);
          console.log('[CART] activeStoreId:', savedStoreId);
          console.log('[CART] currentStoreId:', currentStoreId);

          // Preserve the original fallback when no store is known.
          if (storeIds.length === 0) {
            const res = await api.get('/cart');
            const raw = res.data?.data;
            const rawItems: any[] = Array.isArray(raw)
              ? raw
              : raw?.items ?? raw?.cart?.items ?? raw?.cartItems ?? [];

            console.log('[CART] No known store. /cart rawItems:', rawItems.length);

            if (res.data?.success) {
              const mappedItems: CartItem[] = rawItems.map((item: any) => {
                const image = item.product?.images?.[0]
                  || item.product?.thumbnail
                  || '';

                const price = Number(
                  item.variant?.price
                  ?? item.product?.price
                  ?? item.unitPrice
                  ?? item.price
                  ?? 0
                );

                return {
                  id: item.id,
                  productId: item.product?.id || item.productId || '',
                  name: item.product?.name || item.productName || item.name || 'Unknown Product',
                  price,
                  size: item.variant?.size || item.size || 'N/A',
                  colorName: item.variant?.color || item.colorName || item.color || 'Default',
                  colorHex: item.variant?.colorHex || item.colorHex || '#888888',
                  quantity: item.quantity || 1,
                  image,
                  variantId: item.variant?.id || item.variantId || undefined,
                  storeId: item.storeId || item.store?.id,
                };
              });

              set({ items: mappedItems });
            }

            return;
          }

          // Each backend cart is store-scoped. Fetch every known store cart and
          // merge them into one customer-facing cart.
          const results = await Promise.all(
            storeIds.map(async (storeId) => {
              try {
                const url = `/cart?storeId=${storeId}`;

                console.log('[CART] Fetching store cart:', storeId);
                console.log('[CART] URL:', url);

                const res = await api.get(url);

                if (!res.data?.success || !res.data?.data) {
                  console.warn(
                    '[CART] Store cart returned unsuccessful:',
                    storeId,
                    res.data
                  );
                  return {
                    storeId,
                    items: [] as CartItem[],
                    success: false,
                  };
                }

                const raw = res.data.data;
                const rawItems: any[] = Array.isArray(raw)
                  ? raw
                  : raw.items ?? raw.cart?.items ?? raw.cartItems ?? [];

                console.log(
                  '[CART] Store:',
                  storeId,
                  '| rawItems:',
                  rawItems.length
                );

                const mappedItems: CartItem[] = rawItems.map((item: any) => {
                  const image = item.product?.images?.[0]
                    || item.product?.thumbnail
                    || '';

                  const price = Number(
                    item.variant?.price
                    ?? item.product?.price
                    ?? item.unitPrice
                    ?? item.price
                    ?? 0
                  );

                  const variantId =
                    item.variant?.id ||
                    item.variantId ||
                    undefined;

                  const resolvedItemStoreId =
                    item.storeId ||
                    item.store?.id ||
                    storeId;

                  const mapped: CartItem = {
                    id: item.id,
                    productId: item.product?.id || item.productId || '',
                    name:
                      item.product?.name ||
                      item.productName ||
                      item.name ||
                      'Unknown Product',
                    price,
                    size: item.variant?.size || item.size || 'N/A',
                    colorName:
                      item.variant?.color ||
                      item.colorName ||
                      item.color ||
                      'Default',
                    colorHex:
                      item.variant?.colorHex ||
                      item.colorHex ||
                      '#888888',
                    quantity: item.quantity || 1,
                    image,
                    variantId,
                    storeId: resolvedItemStoreId,
                  };

                  console.log(
                    `[CART] item "${mapped.name}" | store=${mapped.storeId} | product=${mapped.productId} | variant=${mapped.variantId || 'none'} | quantity=${mapped.quantity}`
                  );

                  return mapped;
                });

                return {
                  storeId,
                  items: mappedItems,
                  success: true,
                };
              } catch (error: any) {
                console.warn(
                  '[CART] Failed to fetch store cart:',
                  storeId,
                  error?.message || error
                );

                return {
                  storeId,
                  items: [] as CartItem[],
                  success: false,
                };
              }
            })
          );

          const mergedItems = results.flatMap(result => result.items);

          console.log('[CART] ===== MULTI-STORE FETCH RESULT =====');
          console.log('[CART] Stores checked:', storeIds);
          console.log('[CART] Total cart items:', mergedItems.length);
          console.log(
            '[CART] Items by store:',
            results.map(result => ({
              storeId: result.storeId,
              count: result.items.length,
              success: result.success,
            }))
          );

          set({
            items: mergedItems,
            activeStoreIds: storeIds,
            activeStoreId:
              savedStoreId ||
              currentStoreId ||
              storeIds[0] ||
              null,
          });
        } catch (error: any) {
          console.warn(
            '[CART] Multi-store fetch error:',
            error?.message || error
          );
        }
      },
    }),
    {
      name: 'closho-cart-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
