-- 添加商品图片字段到 products 表
-- 执行时间：2026-04-06

ALTER TABLE products
ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN products.image_url IS '商品图片 URL';
