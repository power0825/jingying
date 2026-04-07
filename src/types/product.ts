export interface Product {
  id: string;
  name: string; // 商品名称
  code: string; // 商品编码
  category: string; // 商品分类
  specification: string; // 规格型号
  unit: string; // 计量单位
  cost_price: number; // 成本价（仅财务可见）
  suggested_price: number; // 建议售价
  stock_quantity: number; // 库存数量
  min_stock: number; // 最低库存预警
  description?: string; // 商品描述
  image_url?: string; // 商品图片 URL
  created_at: string;
  updated_at: string;
}

export interface ProductSale {
  id: string;
  product_id: string;
  project_id: string;
  quantity: number; // 销售数量
  sale_price: number; // 销售单价
  total_amount: number; // 总金额
  payment_method: '银行转账' | '支付宝' | '微信' | '现金' | '月结' | '其他';
  payment_status: '未收款' | '部分收款' | '已收款';
  received_amount?: number; // 已收款金额
  sale_date: string;
  sale_user_id: string; // 销售人
  remarks?: string; // 备注
  created_at: string;
}
