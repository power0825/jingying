-- 创建产品图片存储桶
-- 执行时间：2026-04-06

-- 创建 storage schema（如果不存在）
CREATE SCHEMA IF NOT EXISTS storage;

-- 创建 product-images 存储桶
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-images', 'product-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- 允许匿名用户上传文件到 product-images 存储桶
CREATE POLICY "允许匿名用户上传图片"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'product-images');

-- 允许匿名用户查看图片
CREATE POLICY "允许匿名用户查看图片"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

-- 允许认证用户更新自己上传的图片
CREATE POLICY "允许认证用户更新自己的图片"
ON storage.objects FOR UPDATE
USING (bucket_id = 'product-images');

-- 允许认证用户删除自己上传的图片
CREATE POLICY "允许认证用户删除自己的图片"
ON storage.objects FOR DELETE
USING (bucket_id = 'product-images');
