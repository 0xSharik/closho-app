import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Product } from '../components/product/ProductCard';
import { logUserActionFailure, logUserEvent } from '../utils/userEventLogger';

interface WishlistState {
  items: Product[];
  toggleWishlist: (product: Product) => Promise<void>;
  removeFromWishlist: (id: string) => Promise<void>;
  isInWishlist: (id: string) => boolean;
  fetchWishlist: () => Promise<void>;
}

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      items: [],
      toggleWishlist: async (product) => {
        const { items } = get();
        const exists = items.some(item => item.id === product.id);
        const api = require('../services/api').default;
        try {
          if (exists) {
            logUserEvent('wishlist.remove_submitted', { productId: product.id });
            await api.delete(`/wishlist/${product.id}`);
            set({ items: items.filter(item => item.id !== product.id) });
            logUserEvent('wishlist.remove_succeeded', { productId: product.id });
          } else {
            logUserEvent('wishlist.add_submitted', { productId: product.id });
            await api.post('/wishlist', { productId: product.id });
            set({ items: [...items, product] });
            logUserEvent('wishlist.add_succeeded', { productId: product.id });
          }
        } catch (error) {
          logUserActionFailure(exists ? 'wishlist.remove_failed' : 'wishlist.add_failed', error, { productId: product.id });
          console.error('Toggle wishlist error', error);
        }
      },
      removeFromWishlist: async (id) => {
        try {
          logUserEvent('wishlist.remove_submitted', { productId: id });
          const api = require('../services/api').default;
          await api.delete(`/wishlist/${id}`);
          set({ items: get().items.filter(item => item.id !== id) });
          logUserEvent('wishlist.remove_succeeded', { productId: id });
        } catch (error) {
          logUserActionFailure('wishlist.remove_failed', error, { productId: id });
          console.error('Remove from wishlist error', error);
        }
      },
      isInWishlist: (id) => {
        return get().items.some(item => item.id === id);
      },
      fetchWishlist: async () => {
        try {
          const api = require('../services/api').default;
          const res = await api.get('/wishlist');
          if (res.data.success && res.data.data) {
            const rawItems = Array.isArray(res.data.data)
              ? res.data.data
              : (res.data.data.items || []);
            // Normalize items: backend may return { id, product: { id, name, price, thumbnail, ... } }
            const normalizedItems: Product[] = rawItems.map((item: any) => {
              const p = item.product || item;
              return {
                id: p.id || item.productId || item.id,
                name: p.name || 'Unknown',
                price: Number(p.price) || 0,
                originalPrice: p.originalPrice ? Number(p.originalPrice) : undefined,
                discount: p.discountPercent,
                rating: p.rating || 0,
                reviews: p.reviewCount || 0,
                imageUrl: p.thumbnail || p.images?.[0] || p.imageUrl || '',
              };
            });
            set({ items: normalizedItems });
          }
        } catch (error) {
          console.error('Fetch wishlist error', error);
        }
      }
    }),
    {
      name: 'closho-wishlist-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
