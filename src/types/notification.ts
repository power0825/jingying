export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'approval_request' | 'approval_feedback' | 'system';
  link?: string;
  is_read: boolean;
  created_at: string;
}
