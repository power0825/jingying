export type UserRole =
  | '管理员'
  | '客户经理'
  | '客户总监'
  | '运营经理'
  | '运营总监'
  | '财务'
  | 'CEO';

export interface User {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  password?: string;
  role: UserRole;
  manager_id?: string | null;
  dashboard_config?: string[];
  created_at: string;
}
