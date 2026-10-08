import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { logUserActionFailure, logUserEvent } from '../utils/userEventLogger';
import { useStoreStore } from './storeStore';

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
  removeFromCart: (id: string) => Promise<{ success: boolean; message?: string }>;
  updateQuantity: (id: string, delta: number) => Promise<{ success: boolean; message?: string }>;
  applyCoupon: (code: string) => Promise<{ success: boolean; message: string }>;
  removeCoupon: () => void;
  clearCart: () => Promise<{ success: boolean; message?: string }>;
  getCartTotal: () => number;
  fetchCart: () => Promise<void>;
  /** Call this right after a successful login to sync the server cart to this device. */
  syncCartAfterLogin: () => Promise<void>;
  /** Call this on logout to wipe local cart state. */
  resetCartState: () => void;
}

// ─── Module-level lock: prevents concurrent addToCart calls regardless of component re-renders ───
let _isAddingToCart = false;
let _isClearingCart = false;
let _cartRequestVersion = 0;

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

          // Checkout is intentionally single-store. A customer may buy
          // multiple products/variants, but every cart item must belong to
          // the same nearest/selected store.
          const existingStoreIds = Array.from(
            new Set(
              get().items
                .map(item => item.storeId)
                .filter(Boolean) as string[]
            )
          );

          if (
            resolvedStoreId &&
            existingStoreIds.length > 0 &&
            !existingStoreIds.includes(resolvedStoreId)
          ) {
            logUserEvent('cart.add_blocked', {
              reason: 'multiple_stores_not_supported',
              existingStoreId: existingStoreIds[0],
              requestedStoreId: resolvedStoreId,
            });

            return {
              success: false,
              message:
                'Your cart contains products from another store. Clear your cart before adding products from this store.',
            };
          }

          // A cart item is unique by product + variant inside the selected store.
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
            const quantityResult = await get().updateQuantity(existingItem.id, 1);

            if (!quantityResult.success) {
              logUserEvent('cart.quantity_increment_failed', {
                itemId: existingItem.id,
              });
              return {
                success: false,
                message: quantityResult.message || 'Could not update cart quantity.',
              };
            }

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

          if (res.status >= 200 && res.status < 300 && res.data?.success !== false) {
            if (resolvedStoreId) {
              set({
                activeStoreId: resolvedStoreId,
                activeStoreIds: [resolvedStoreId],
              });

              console.log(
                '[CART] Saved single-store cart:',
                resolvedStoreId
              );
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
        const previousItems = get().items;

        try {
          if (!id) {
            return { success: false, message: 'Cart item ID is missing.' };
          }

          logUserEvent('cart.remove_submitted', { itemId: id });

          const api = require('../services/api').default;
          const response = await api.delete(`/cart/items/${encodeURIComponent(id)}`);

          // Axios resolving does NOT necessarily mean the API accepted the
          // operation. Some backends return HTTP 200 with success:false.
          if (response.status < 200 || response.status >= 300 || response.data?.success === false) {
            const message =
              response.data?.message ||
              response.data?.errors?.[0]?.message ||
              'The item could not be removed from the cart.';

            console.warn('[CART] Remove rejected by server:', response.data);
            await get().fetchCart();
            return { success: false, message };
          }

          // Update local state ONLY after the server confirms deletion.
          set((state) => ({
            items: state.items.filter((item) => item.id !== id),
          }));

          // If the last item was removed, reset store-scoped cart metadata too.
          if (get().items.length === 0) {
            set({
              couponCode: null,
              discountAmount: 0,
              activeStoreId: null,
              activeStoreIds: [],
            });
          }

          logUserEvent('cart.remove_succeeded', { itemId: id });
          return { success: true };
        } catch (error: any) {
          logUserActionFailure('cart.remove_failed', error, { itemId: id });
          console.warn('[CART] Remove error', error);

          // Never trust the optimistic UI after a failed network request.
          set({ items: previousItems });
          await get().fetchCart();

          const message =
            error?.response?.data?.errors?.[0]?.message ||
            error?.response?.data?.message ||
            error?.message ||
            'Could not remove the item from your cart.';

          return { success: false, message };
        }
      },

      updateQuantity: async (id, delta) => {
        const previousItems = get().items;

        try {
          const state = get();
          const item = state.items.find(i => i.id === id);
          if (!item) {
            logUserEvent('cart.quantity_change_failed', { itemId: id, reason: 'item_not_found' });
            return { success: false, message: 'Cart item was not found.' };
          }

          const newQty = item.quantity + delta;

          // Quantity cannot be zero through the stepper. The trash button
          // is the explicit remove action and uses DELETE /cart/items/:itemId.
          if (newQty < 1) {
            return { success: true, message: 'Minimum quantity is 1.' };
          }

          if (newQty === item.quantity) {
            return { success: true };
          }

          logUserEvent('cart.quantity_change_submitted', {
            itemId: id,
            previousQuantity: item.quantity,
            quantity: newQty,
          });

          const api = require('../services/api').default;
          const response = await api.patch(
            `/cart/items/${encodeURIComponent(id)}`,
            { quantity: newQty }
          );

          if (response.status < 200 || response.status >= 300 || response.data?.success === false) {
            const message =
              response.data?.message ||
              response.data?.errors?.[0]?.message ||
              'The cart quantity could not be updated.';

            console.warn('[CART] Quantity update rejected by server:', response.data);
            await get().fetchCart();
            return { success: false, message };
          }

          // Update local state only after backend confirmation.
          set((state) => ({
            items: state.items.map((i) =>
              i.id === id ? { ...i, quantity: newQty } : i
            ),
          }));

          logUserEvent('cart.quantity_change_succeeded', { itemId: id, quantity: newQty });
          return { success: true };
        } catch (error: any) {
          logUserActionFailure('cart.quantity_change_failed', error, { itemId: id });
          console.warn('[CART] Update quantity error', error);

          set({ items: previousItems });
          await get().fetchCart();

          const message =
            error?.response?.data?.errors?.[0]?.message ||
            error?.response?.data?.message ||
            error?.message ||
            'Could not update the cart quantity.';

          return { success: false, message };
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
        if (_isClearingCart) {
          return { success: false, message: 'Cart clearing is already in progress.' };
        }

        _isClearingCart = true;
        const clearVersion = ++_cartRequestVersion;

        const previousState = {
          items: get().items,
          couponCode: get().couponCode,
          discountAmount: get().discountAmount,
          activeStoreId: get().activeStoreId,
          activeStoreIds: get().activeStoreIds,
        };

        try {
          logUserEvent('cart.clear_submitted', {
            itemCount: previousState.items.length,
          });

          if (previousState.items.length === 0) {
            return { success: true };
          }

          const api = require('../services/api').default;

          // API contract: DELETE /cart clears the authenticated customer's
          // cart. Do not append ?storeId here; that is only documented for GET
          // /cart and caused the previous implementation to hit the backend
          // differently from the actual clear-cart route.
          const response = await api.delete('/cart');

          if (response.status < 200 || response.status >= 300 || response.data?.success === false) {
            const message =
              response.data?.message ||
              response.data?.errors?.[0]?.message ||
              'The cart could not be cleared.';

            console.warn('[CART] Clear cart rejected by server:', response.data);
            return { success: false, message };
          }

          // Do not trust a successful DELETE response by itself. Some backend
          // deployments return 200 before the cart mutation has actually been
          // persisted. Verify the server cart before declaring success.
          const verifyStoreId = previousState.activeStoreId || useStoreStore.getState().currentStore?.id;
          const verifyResponse = await api.get(
            verifyStoreId ? `/cart?storeId=${encodeURIComponent(verifyStoreId)}` : '/cart'
          );
          const verifyRaw = verifyResponse.data?.data;
          const verifyItems: any[] = Array.isArray(verifyRaw)
            ? verifyRaw
            : verifyRaw?.items ?? verifyRaw?.cart?.items ?? verifyRaw?.cartItems ?? [];

          if (verifyItems.length > 0) {
            // Fallback for older backend deployments where DELETE /cart is
            // exposed but does not actually remove every cart item. Remove
            // the server-side item IDs individually, then verify again.
            console.warn('[CART] Bulk clear did not empty server cart; falling back to item deletes.');
            for (const item of verifyItems) {
              if (item?.id) {
                await api.delete(`/cart/items/${encodeURIComponent(item.id)}`);
              }
            }

            const finalResponse = await api.get(
              verifyStoreId ? `/cart?storeId=${encodeURIComponent(verifyStoreId)}` : '/cart'
            );
            const finalRaw = finalResponse.data?.data;
            const finalItems: any[] = Array.isArray(finalRaw)
              ? finalRaw
              : finalRaw?.items ?? finalRaw?.cart?.items ?? finalRaw?.cartItems ?? [];

            if (finalItems.length > 0) {
              throw new Error('The server still contains cart items after clearing.');
            }
          }

          // Only clear local state after the backend is confirmed empty.
          set({
            items: [],
            couponCode: null,
            discountAmount: 0,
            activeStoreId: null,
            activeStoreIds: [],
          });

          logUserEvent('cart.clear_succeeded');
          return { success: true };
        } catch (error: any) {
          logUserActionFailure('cart.clear_failed', error);
          console.warn('[CART] Clear cart error', error);

          // Restore only if no newer cart mutation has superseded this clear.
          if (clearVersion === _cartRequestVersion) {
            set(previousState);
            await get().fetchCart();
          }

          const message =
            error?.response?.data?.errors?.[0]?.message ||
            error?.response?.data?.message ||
            error?.message ||
            'Could not clear your cart.';

          return { success: false, message };
        } finally {
          _isClearingCart = false;
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

        set({
          items: [],
          couponCode: null,
          discountAmount: 0,
          activeStoreId: null,
          activeStoreIds: [],
        });

        try {
          const storeState =
            require('./storeStore').useStoreStore.getState();

          if (!storeState.currentStore) {
            await storeState.fetchAllStores();
          }

          const currentStore =
            require('./storeStore').useStoreStore.getState()
              .currentStore;

          if (currentStore?.id) {
            set({
              activeStoreId: currentStore.id,
              activeStoreIds: [currentStore.id],
            });
          }

          await get().fetchCart();

          console.log(
            '[CART] syncCartAfterLogin completed. items:',
            get().items.length
          );
        } catch (err: any) {
          console.warn(
            '[CART] syncCartAfterLogin error:',
            err?.message || err
          );
        }
      },

      fetchCart: async () => {
        if (_isClearingCart) return;
        const requestVersion = _cartRequestVersion;
        try {
          const api = require('../services/api').default;

          const currentStoreId =
            useStoreStore.getState().currentStore?.id;
          const savedStoreId = get().activeStoreId;

          // A customer cart is intentionally scoped to one store.
          // Prefer the cart's persisted store, then the current store.
          const storeId = savedStoreId || currentStoreId;

          console.log('[CART] ===== SINGLE-STORE FETCH START =====');
          console.log('[CART] storeId:', storeId);

          if (!storeId) {
            const res = await api.get('/cart');
            const raw = res.data?.data;
            const rawItems: any[] = Array.isArray(raw)
              ? raw
              : raw?.items ??
              raw?.cart?.items ??
              raw?.cartItems ??
              [];

            if (res.data?.success) {
              const mappedItems: CartItem[] = rawItems.map(
                (item: any) => {
                  const image =
                    item.product?.images?.[0] ||
                    item.product?.thumbnail ||
                    '';

                  const price = Number(
                    item.variant?.price ??
                    item.product?.price ??
                    item.unitPrice ??
                    item.price ??
                    0
                  );

                  return {
                    id: item.id,
                    productId:
                      item.product?.id ||
                      item.productId ||
                      '',
                    name:
                      item.product?.name ||
                      item.productName ||
                      item.name ||
                      'Unknown Product',
                    price,
                    size:
                      item.variant?.size ||
                      item.size ||
                      'N/A',
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
                    variantId:
                      item.variant?.id ||
                      item.variantId ||
                      undefined,
                    storeId:
                      item.storeId ||
                      item.store?.id ||
                      undefined,
                  };
                }
              );

              const itemStoreIds = Array.from(
                new Set(
                  mappedItems
                    .map(item => item.storeId)
                    .filter(Boolean) as string[]
                )
              );

              // If the fallback endpoint unexpectedly returns multiple
              // stores, do not silently create a multi-store checkout.
              if (requestVersion !== _cartRequestVersion || _isClearingCart) return;

              if (itemStoreIds.length > 1) {
                console.warn(
                  '[CART] Server returned multiple stores in /cart. Keeping cart empty until store is resolved.'
                );
                set({
                  items: [],
                  activeStoreId: null,
                  activeStoreIds: [],
                });
              } else {
                set({
                  items: mappedItems,
                  activeStoreId:
                    itemStoreIds[0] || null,
                  activeStoreIds:
                    itemStoreIds.length === 1
                      ? itemStoreIds
                      : [],
                });
              }
            }

            return;
          }

          const res = await api.get(
            `/cart?storeId=${storeId}`
          );

          if (!res.data?.success || !res.data?.data) {
            console.warn(
              '[CART] Store cart returned unsuccessful:',
              storeId,
              res.data
            );
            return;
          }

          const raw = res.data.data;
          const rawItems: any[] = Array.isArray(raw)
            ? raw
            : raw.items ??
            raw.cart?.items ??
            raw.cartItems ??
            [];

          const mappedItems: CartItem[] = rawItems.map(
            (item: any) => {
              const image =
                item.product?.images?.[0] ||
                item.product?.thumbnail ||
                '';

              const price = Number(
                item.variant?.price ??
                item.product?.price ??
                item.unitPrice ??
                item.price ??
                0
              );

              const variantId =
                item.variant?.id ||
                item.variantId ||
                undefined;

              const resolvedItemStoreId =
                item.storeId ||
                item.store?.id ||
                storeId;

              return {
                id: item.id,
                productId:
                  item.product?.id ||
                  item.productId ||
                  '',
                name:
                  item.product?.name ||
                  item.productName ||
                  item.name ||
                  'Unknown Product',
                price,
                size:
                  item.variant?.size ||
                  item.size ||
                  'N/A',
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
            }
          );

          const itemStoreIds = Array.from(
            new Set(
              mappedItems
                .map(item => item.storeId)
                .filter(Boolean) as string[]
            )
          );

          if (
            itemStoreIds.length > 1 ||
            (itemStoreIds.length === 1 &&
              itemStoreIds[0] !== storeId)
          ) {
            console.warn(
              '[CART] Server cart/store mismatch:',
              itemStoreIds
            );
            return;
          }

          if (requestVersion !== _cartRequestVersion || _isClearingCart) return;

          set({
            items: mappedItems,
            activeStoreId:
              mappedItems.length > 0
                ? storeId
                : null,
            activeStoreIds:
              mappedItems.length > 0
                ? [storeId]
                : [],
          });

          console.log(
            '[CART] Single-store cart loaded:',
            storeId,
            '| items:',
            mappedItems.length
          );
        } catch (error: any) {
          console.warn(
            '[CART] Cart fetch error:',
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
