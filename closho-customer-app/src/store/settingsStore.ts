import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import api from '../services/api';
import { CartItem } from './cartStore';

export interface PlatformConfig {
  globalDeliveryCharge: number;
  freeDeliveryFirstUser: boolean;
  freeDeliveryPromotional: boolean;
  taxPercentage?: number;
  freeDeliveryAbove?: number;
  maintenanceMode?: boolean;
}

export interface DeliveryCalculation {
  totalDeliveryCharge: number;
  productCharges: number;
  baseCharge: number;
  isFree: boolean;
  reason?: 'promotional' | 'first_order' | null;
}

interface SettingsState {
  globalDeliveryCharge: number;
  freeDeliveryFirstUser: boolean;
  freeDeliveryPromotional: boolean;
  isLoaded: boolean;
  fetchConfig: () => Promise<void>;
  calculateDeliveryCharge: (
    items: CartItem[],
    pastOrdersCount?: number
  ) => DeliveryCalculation;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      globalDeliveryCharge: 0,
      freeDeliveryFirstUser: false,
      freeDeliveryPromotional: false,
      isLoaded: false,

      fetchConfig: async () => {
        try {
          const response = await api.get('/settings/config');
          const data = response.data?.data || response.data || {};

          set({
            globalDeliveryCharge: Number(
              data.globalDeliveryCharge ?? data.deliveryCharges ?? 0
            ),
            freeDeliveryFirstUser: Boolean(data.freeDeliveryFirstUser ?? false),
            freeDeliveryPromotional: Boolean(
              data.freeDeliveryPromotional ?? false
            ),
            isLoaded: true,
          });

          console.log('[SETTINGS] Platform config fetched successfully:', {
            globalDeliveryCharge: data.globalDeliveryCharge,
            freeDeliveryFirstUser: data.freeDeliveryFirstUser,
            freeDeliveryPromotional: data.freeDeliveryPromotional,
          });
        } catch (error: any) {
          // If endpoint is not yet deployed or route is missing (e.g. 404),
          // fallback gracefully to defaults without breaking the app.
          console.log(
            '[SETTINGS] GET /settings/config not reachable or failed, using defaults:',
            error?.response?.status || error?.message
          );
          set({ isLoaded: true });
        }
      },

      calculateDeliveryCharge: (
        items: CartItem[],
        pastOrdersCount: number = 0
      ): DeliveryCalculation => {
        const { globalDeliveryCharge, freeDeliveryFirstUser, freeDeliveryPromotional } =
          get();

        // 1. Calculate Product-Specific Delivery Charges: Sum of (item.quantity * item.deliveryCharge)
        const productCharges = items.reduce((sum, item) => {
          const charge = Number((item as any).deliveryCharge ?? 0);
          return sum + (charge * (item.quantity || 1));
        }, 0);

        // 2. Check Free Delivery Rules:
        // Rule A: Promotional Free Delivery overrides everything
        if (freeDeliveryPromotional) {
          return {
            totalDeliveryCharge: 0,
            productCharges,
            baseCharge: globalDeliveryCharge,
            isFree: true,
            reason: 'promotional',
          };
        }

        // Rule B: First order free delivery if user has 0 past orders
        if (freeDeliveryFirstUser && pastOrdersCount === 0) {
          return {
            totalDeliveryCharge: 0,
            productCharges,
            baseCharge: globalDeliveryCharge,
            isFree: true,
            reason: 'first_order',
          };
        }

        // 3. Normal Calculation: Global Base Charge + Product-Specific Charges
        const totalDeliveryCharge = Math.max(0, globalDeliveryCharge + productCharges);

        return {
          totalDeliveryCharge,
          productCharges,
          baseCharge: globalDeliveryCharge,
          isFree: totalDeliveryCharge === 0,
          reason: null,
        };
      },
    }),
    {
      name: 'closho-settings-config',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
