-- 添加服务与商品提成字段到 projects 表
-- 执行时间：2026-04-06

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS service_commission_rate numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS product_commission_rate numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS service_commission_paid boolean DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS product_commission_paid boolean DEFAULT FALSE;

COMMENT ON COLUMN projects.service_commission_rate IS '服务提成比例（百分比）';
COMMENT ON COLUMN projects.product_commission_rate IS '商品提成比例（百分比）';
COMMENT ON COLUMN projects.service_commission_paid IS '服务提成是否已支付';
COMMENT ON COLUMN projects.product_commission_paid IS '商品提成是否已支付';
