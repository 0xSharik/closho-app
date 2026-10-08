import { create } from 'zustand';
import api from '../services/api';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

interface NotificationState {
  notifications: Notification[];
  isLoading: boolean;
  error: string | null;
  fetchNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: [],
  isLoading: false,
  error: null,

  fetchNotifications: async () => {
    set({ isLoading: true });
    try {
      const res = await api.get('/notifications?page=1&limit=10');
      if (res.data.success) {
        const notifs = Array.isArray(res.data.data) ? res.data.data : (res.data.data?.notifications || []);
        set({ notifications: notifs, isLoading: false, error: null });
      } else {
        set({ isLoading: false, error: res.data.message });
      }
    } catch (error: any) {
      set({ isLoading: false, error: error.message });
    }
  },

  markAsRead: async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, isRead: true } : n
        )
      }));
    } catch (error) {
      console.error('Failed to mark as read', error);
    }
  },

  markAllAsRead: async () => {
    try {
      await api.post('/notifications/read-all');
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, isRead: true }))
      }));
    } catch (error) {
      console.error('Failed to mark all as read', error);
    }
  }
}));
