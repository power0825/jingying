-- 添加财务视角相关的提成比例字段到 projects 表
-- 执行时间：2026-04-06

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS service_commission_rate numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS product_commission_rate numeric DEFAULT 0;

COMMENT ON COLUMN projects.service_commission_rate IS '服务板块提成比例（百分比）';
COMMENT ON COLUMN projects.product_commission_rate IS '商品板块提成比例（百分比）';
