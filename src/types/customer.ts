export interface Customer {
  id: string;
  name: string; // 客户名称
  code: string; // 客户代码
  address: string; // 通信地址
  company_size: number; // 企业规模（人数）
  contact_person: string; // 联系人
  contact_phone: string; // 联系人电话
  customer_type: string; // 客户类型 (活跃客户, 沉睡客户, 潜在客户)
  customer_owner: string; // 客户归属
  customer_source?: string; // 客户来源
  created_at: string;
}
