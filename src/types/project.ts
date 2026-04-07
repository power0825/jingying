export type ProjectStatus = '草稿' | '待初审' | '待终审' | '已通过' | '已驳回';

export interface Project {
  id: string;
  code: string; // 项目编号
  name: string; // 项目名称
  created_at: string; // 立项时间
  participants: number; // 项目人数
  difficulties: string; // 执行难点
  income_with_tax: number; // 项目含税收入
  income_without_tax: number; // 项目收入（不含税）
  tax_amount: number; // 税额
  tax_rate: number; // 发票税点
  execution_days: number; // 执行周期
  
  customer_id?: string | null; // 客户ID
  
  bd_manager_id: string; // 商务人员 (BD经理/BD总监)
  
  quotation_id?: string | null; // 历史报价单ID
  reference_price_total: number; // 总参考价格（与 quotations 表保持一致）
  
  status: ProjectStatus; // 提交审核状态
  
  initial_approval_status?: '待审核' | '通过' | '驳回' | null; // 立项初审
  initial_approver_id?: string | null; // 初审人员
  
  final_approval_status?: '待审核' | '通过' | '驳回' | null; // 立项终审
  final_approver_id?: string | null; // 终审人员
  
  class_teacher_id?: string | null; // 班主任 (从运营经理中选择)
  team_leader_id?: string | null; // 项目负责人
  team_member_ids?: string[] | null; // 项目团队成员 (多选)
  itinerary?: any[] | null; // 行程安排 (立项阶段暂存)
  hotel_arrangement?: any | null; // 酒店安排
  client_name?: string; // 客户名称
}
