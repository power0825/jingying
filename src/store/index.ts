import { create } from 'zustand';
import { User } from '../types/user';
import { Notification } from '../types/notification';

interface AppState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  user: User | null;
  setUser: (user: User | null) => void;
  notifications: Notification[];
  unreadCount: number;
  setNotifications: (notifications: Notification[]) => void;
  addNotification: (notification: Notification) => void;
  markAsRead: (id: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  setUser: (user) => {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('user');
    }
    set({ user });
  },
  notifications: [],
  unreadCount: 0,
  setNotifications: (notifications) => set({ 
    notifications, 
    unreadCount: notifications.filter(n => !n.is_read).length 
  }),
  addNotification: (notification) => set((state) => {
    const newNotifications = [notification, ...state.notifications];
    return {
      notifications: newNotifications,
      unreadCount: newNotifications.filter(n => !n.is_read).length
    };
  }),
  markAsRead: (id) => set((state) => {
    const newNotifications = state.notifications.map(n => 
      n.id === id ? { ...n, is_read: true } : n
    );
    return {
      notifications: newNotifications,
      unreadCount: newNotifications.filter(n => !n.is_read).length
    };
  }),
}));
