-- 添加实际成本字段到 quotations 表
ALTER TABLE quotations
ADD COLUMN IF NOT EXISTS actual_cost NUMERIC DEFAULT 0;

-- 注释说明
COMMENT ON COLUMN quotations.actual_cost IS '实际成本（基于供应商 actual_cost 计算，隐藏字段）';
