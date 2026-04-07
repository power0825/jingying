export type SupplierType = '酒店' | '餐饮' | '场地' | '老师' | '参访点' | '大巴' | '其他';

export interface QuoteInfo {
  unit?: number; // 用于 酒店 (间*夜), 餐饮 (人*餐), 参访点 (人), 其他 (元)
  hour?: number; // 用于 场地，老师，大巴
  half_day?: number; // 用于 场地，老师，大巴
  day?: number; // 用于 场地，老师，大巴
  billing_form?: string; // 计费形式 (仅限"其他"类型)
}

export interface Supplier {
  id: string;
  name: string; // 供应商名称
  code: string; // 供应商编码 (00001 开始)
  type: SupplierType; // 供应商类型
  contact_person?: string; // 联系人
  contact_phone?: string; // 联系电话
  address?: string; // 地址
  internal_contact_id?: string; // 我司对接人 (UUID)
  price?: number; // 保持兼容性，暂时保留

  // 报价及结算信息
  reference_quote: QuoteInfo; // 参考报价
  actual_cost: QuoteInfo;     // 实际成本
  account_name?: string;      // 开户名称
  tax_id?: string;            // 税号
  bank_name?: string;         // 开户行
  bank_account?: string;      // 银行账号

  // 结算方式
  settlement_method?: '月结' | '先款后票' | '先票后款'; // 结算方式
  settlement_day?: number;  // 结算日期（每月几号，月结方式下有效）

  remarks?: string; // 备注
  extended_data: {
    // 酒店
    star_rating?: string; // 星级
    room_count?: number;  // 房间数量

    // 餐饮
    cuisine?: string;     // 菜系
    is_halal?: boolean;   // 是否可以清真

    // 场地
    area?: number;        // 面积
    capacity?: number;    // 容纳人数
    equipment?: string;   // 设备情况

    // 老师
    course_name?: string; // 课程名称
    language?: string;    // 授课语言

    // 参访点
    industry?: string;           // 所属行业
    has_guide?: boolean;         // 是否有讲解
    guide_language?: string;     // 讲解语言
    has_teaching?: boolean;      // 是否有授课
    max_capacity?: number;       // 最高容纳人数
    // equipment?: string;       // 设备情况 (共用)

    // 大巴
    passenger_count?: number;    // 乘客人数

    [key: string]: any;
  };

  created_at: string;
  updated_at: string;
}
