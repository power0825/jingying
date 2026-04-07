-- 添加供应商结算方式字段到 project_financial_suppliers 表
-- 执行时间：2026-04-03
-- 说明：用于记录每个供应商在项目中的结算方式

ALTER TABLE project_financial_suppliers
ADD COLUMN IF NOT EXISTS settlement_method text DEFAULT '月结';  -- 结算方式：月结/先款后票/先票后款

-- 添加注释
COMMENT ON COLUMN project_financial_suppliers.settlement_method IS '结算方式：月结/先款后票/先票后款';
