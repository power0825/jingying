-- 添加供应商结算方式字段
-- 执行时间：2026-04-03

ALTER TABLE suppliers
ADD COLUMN IF NOT EXISTS settlement_method text DEFAULT '月结',  -- 结算方式：月结/先款后票/先票后款
ADD COLUMN IF NOT EXISTS settlement_day integer;  -- 结算日期（每月几号，月结方式下有效）

-- 添加注释
COMMENT ON COLUMN suppliers.settlement_method IS '结算方式：月结/先款后票/先票后款';
COMMENT ON COLUMN suppliers.settlement_day IS '结算日期（每月几号，月结方式下有效）';
