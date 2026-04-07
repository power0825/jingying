import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, X, ExternalLink, Mail, Info, AlertCircle } from 'lucide-react';
import { useAppStore } from '../store';
import { supabase } from '../lib/supabase';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

export const NotificationPopover: React.FC = () => {
  const { user, notifications, unreadCount, setNotifications, markAsRead } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;

    const fetchNotifications = async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && data) {
        setNotifications(data);
      }
    };

    fetchNotifications();

    // Subscribe to new notifications
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotifications([payload.new as any, ...notifications]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAsRead = async (id: string) => {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);

    if (!error) {
      markAsRead(id);
    }
  };

  const handleNotificationClick = (notification: any) => {
    if (!notification.is_read) {
      handleMarkAsRead(notification.id);
    }
    if (notification.link) {
      navigate(notification.link);
    }
    setIsOpen(false);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'approval_request':
        return <Mail className="w-4 h-4 text-amber-500" />;
      case 'approval_feedback':
        return <Check className="w-4 h-4 text-emerald-500" />;
      case 'system':
        return <Info className="w-4 h-4 text-blue-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-slate-400 hover:text-slate-500 relative p-1 rounded-full hover:bg-slate-100 transition-colors"
      >
        <Bell className="h-6 w-6" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in zoom-in duration-200 origin-top-right">
          <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h3 className="text-sm font-bold text-slate-900">站内通知</h3>
            {unreadCount > 0 && (
              <button 
                onClick={async () => {
                  const { error } = await supabase
                    .from('notifications')
                    .update({ is_read: true })
                    .eq('user_id', user?.id)
                    .eq('is_read', false);
                  if (!error) {
                    setNotifications(notifications.map(n => ({ ...n, is_read: true })));
                  }
                }}
                className="text-[10px] font-medium text-indigo-600 hover:underline"
              >
                全部标记为已读
              </button>
            )}
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length > 0 ? (
              <div className="divide-y divide-slate-50">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer relative group ${
                      !n.is_read ? 'bg-indigo-50/30' : ''
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <div className={`mt-0.5 p-1.5 rounded-lg ${!n.is_read ? 'bg-white shadow-sm' : 'bg-slate-100'}`}>
                        {getIcon(n.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${!n.is_read ? 'font-bold text-slate-900' : 'text-slate-600'}`}>
                          {n.title}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">
                          {n.message}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1.5 flex items-center">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: zhCN })}
                        </p>
                      </div>
                      {!n.is_read && (
                        <div className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-12 text-center">
                <div className="h-12 w-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Bell className="w-6 h-6 text-slate-300" />
                </div>
                <p className="text-sm text-slate-400">暂无新通知</p>
              </div>
            )}
          </div>

          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/50 text-center">
            <button className="text-[11px] font-medium text-slate-500 hover:text-indigo-600 transition-colors">
              查看全部历史通知
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
