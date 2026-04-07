-- 添加手机号字段到 users 表
-- 执行时间：2026-04-06

ALTER TABLE users
ADD COLUMN IF NOT EXISTS phone character varying(20),
ADD COLUMN IF NOT EXISTS is_phone_verified boolean DEFAULT FALSE;

COMMENT ON COLUMN users.phone IS '手机号（用于登录）';
COMMENT ON COLUMN users.is_phone_verified IS '手机号是否已验证';

-- 创建手机号唯一索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL;
