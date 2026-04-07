import { supabase } from './supabase';

export async function createNotification(
  userId: string,
  title: string,
  message: string,
  type: 'approval_request' | 'approval_feedback' | 'system',
  link?: string
) {
  const { error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      title,
      message,
      type,
      link,
      is_read: false
    });

  if (error) {
    console.error('Error creating notification:', error);
  }
}

export async function notifyFinanceUsers(
  title: string,
  message: string,
  type: 'approval_request' | 'approval_feedback' | 'system',
  link?: string
) {
  try {
    // Get all users with '财务' or '管理员' role
    const { data: financeUsers } = await supabase
      .from('users')
      .select('id')
      .or('role.eq.财务,role.eq.管理员');

    if (financeUsers && financeUsers.length > 0) {
      const notifications = financeUsers.map(user => ({
        user_id: user.id,
        title,
        message,
        type,
        link,
        is_read: false
      }));

      const { error } = await supabase
        .from('notifications')
        .insert(notifications);

      if (error) throw error;
    }
  } catch (err) {
    console.error('Error notifying finance users:', err);
  }
}
