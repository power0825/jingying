-- 为 suppliers 表添加图片 URL 字段
-- 用于海报生成时自动匹配供应商图片
-- 执行时间：2026-04-23

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 添加注释
COMMENT ON COLUMN suppliers.image_url IS '供应商图片URL，用于海报生成等场景展示';
