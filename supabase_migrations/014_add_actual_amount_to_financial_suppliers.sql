-- 添加实际成本字段到 project_financial_suppliers 表
-- 执行时间：2026-04-06

ALTER TABLE project_financial_suppliers
ADD COLUMN IF NOT EXISTS actual_amount numeric DEFAULT 0;

COMMENT ON COLUMN project_financial_suppliers.actual_amount IS '实际成本（运营总监可编辑）';

-- 迁移现有数据：将 amount 的值复制到 actual_amount
UPDATE project_financial_suppliers
SET actual_amount = amount
WHERE actual_amount IS NULL OR actual_amount = 0;
