import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logUserActionFailure, logUserEvent } from '../utils/userEventLogger';

export interface Address {
  id: string;
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
  type: string;
  isDefault: boolean;
}

export interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  exp: string;
  isDefault: boolean;
}

interface ProfileState {
  addresses: Address[];
  paymentMethods: PaymentMethod[];
  isLoading: boolean;
  error: string | null;
  fetchAddresses: () => Promise<void>;
  addAddress: (address: Omit<Address, 'id'>) => Promise<{success: boolean, message?: string}>;
  updateAddress: (id: string, address: Partial<Address>) => Promise<{success: boolean, message?: string}>;
  removeAddress: (id: string) => Promise<{success: boolean}>;
  setDefaultAddress: (id: string) => Promise<{success: boolean}>;
  
  fetchPaymentMethods: () => Promise<void>;
  addPaymentMethod: (payment: Omit<PaymentMethod, 'id'>) => Promise<{success: boolean, message?: string}>;
  removePaymentMethod: (id: string) => Promise<{success: boolean}>;
  setDefaultPaymentMethod: (id: string) => Promise<{success: boolean}>;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      addresses: [],
      paymentMethods: [],
      isLoading: false,
      error: null,
      
      fetchAddresses: async () => {
        set({ isLoading: true });
        try {
          const api = require('../services/api').default;
          const res = await api.get('/user/addresses');
          if (res.data.success) {
            // Normalize: backend may return data as an array, or { addresses: [...] }, or { data: [...] }
            const raw = res.data.data;
            const normalized: Address[] = Array.isArray(raw)
              ? raw
              : (Array.isArray(raw?.addresses) ? raw.addresses : (Array.isArray(raw?.items) ? raw.items : []));
            set({ addresses: normalized, isLoading: false, error: null });
          } else {
            set({ isLoading: false });
          }
        } catch (error: any) {
          set({ isLoading: false, error: error.message });
        }
      },
      addAddress: async (address) => {
        try {
          logUserEvent('address.create_submitted', { type: address.type, isDefault: address.isDefault });
          const api = require('../services/api').default;
          // Strip empty-string optional fields — some backends reject "" for optional fields
          const payload: any = { ...address };
          if (!payload.addressLine2) delete payload.addressLine2;
          // Normalize phone to E.164: bare 10-digit → +91XXXXXXXXXX
          if (payload.phone) {
            const digits = payload.phone.replace(/\s+/g, '');
            if (/^\d{10}$/.test(digits)) {
              payload.phone = `+91${digits}`;
            } else if (/^\d{12}$/.test(digits)) {
              payload.phone = `+${digits}`;
            }
          }
          const res = await api.post('/user/addresses', payload);
          if (res.data.success) {
            await get().fetchAddresses();
            logUserEvent('address.create_succeeded', { type: address.type });
            return { success: true };
          }
          logUserEvent('address.create_failed', { reason: 'rejected' });
          return { success: false, message: res.data.message };
        } catch (error: any) {
          // Surface the actual backend validation message, not just the axios error string
          const msg =
            error.response?.data?.message ||
            error.response?.data?.errors?.[0]?.message ||
            error.message ||
            'Failed to add address';
          logUserActionFailure('address.create_failed', error);
          return { success: false, message: msg };
        }
      },
      updateAddress: async (id, address) => {
        try {
          logUserEvent('address.update_submitted', { addressId: id });
          const api = require('../services/api').default;
          const res = await api.put(`/user/addresses/${id}`, address);
          if (res.data.success) {
            await get().fetchAddresses();
            logUserEvent('address.update_succeeded', { addressId: id });
            return { success: true };
          }
          logUserEvent('address.update_failed', { addressId: id, reason: 'rejected' });
          return { success: false, message: res.data.message };
        } catch (error: any) {
          logUserActionFailure('address.update_failed', error, { addressId: id });
          return { success: false, message: error.message };
        }
      },
      removeAddress: async (id) => {
        try {
          logUserEvent('address.remove_submitted', { addressId: id });
          const api = require('../services/api').default;
          await api.delete(`/user/addresses/${id}`);
          await get().fetchAddresses();
          logUserEvent('address.remove_succeeded', { addressId: id });
          return { success: true };
        } catch (error) {
          logUserActionFailure('address.remove_failed', error, { addressId: id });
          return { success: false };
        }
      },
      setDefaultAddress: async (id) => {
        try {
          logUserEvent('address.set_default_submitted', { addressId: id });
          const address = get().addresses.find(a => a.id === id);
          if (!address) {
            logUserEvent('address.set_default_failed', { addressId: id, reason: 'not_found' });
            return { success: false };
          }
          await get().updateAddress(id, { ...address, isDefault: true });
          logUserEvent('address.set_default_succeeded', { addressId: id });
          return { success: true };
        } catch (error) {
          logUserActionFailure('address.set_default_failed', error, { addressId: id });
          return { success: false };
        }
      },
      
      fetchPaymentMethods: async () => {
        try {
          const api = require('../services/api').default;
          const res = await api.get('/user/payment-methods');
          if (res.data.success) {
            set({ paymentMethods: res.data.data });
          }
        } catch (error) {
          console.error('Fetch payment methods error', error);
        }
      },
      addPaymentMethod: async (payment) => {
        try {
          const api = require('../services/api').default;
          const res = await api.post('/user/payment-methods', payment);
          if (res.data.success) {
            await get().fetchPaymentMethods();
            return { success: true };
          }
          return { success: false, message: res.data.message };
        } catch (error: any) {
          return { success: false, message: error.message };
        }
      },
      removePaymentMethod: async (id) => {
        try {
          const api = require('../services/api').default;
          await api.delete(`/user/payment-methods/${id}`);
          await get().fetchPaymentMethods();
          return { success: true };
        } catch (error) {
          return { success: false };
        }
      },
      setDefaultPaymentMethod: async (id) => {
         // Assuming there's a way to set default via PUT, or we wait for backend implementation
         // For now, optimistic update
         set((state) => ({
           paymentMethods: state.paymentMethods.map(p => ({
             ...p,
             isDefault: p.id === id
           }))
         }));
         return { success: true };
      }
    }),
    {
      name: 'closho-profile-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
