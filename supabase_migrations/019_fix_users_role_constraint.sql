-- 修复 users 表的角色枚举约束
-- 执行时间：2026-04-06

-- 1. 先删除旧的约束
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- 2. 添加新的约束（包含所有角色）
ALTER TABLE users
ADD CONSTRAINT users_role_check
CHECK (role = ANY (ARRAY[
    '管理员',
    'BD 经理',
    'BD 总监',
    '运营经理',
    '运营总监',
    '财务',
    'CEO',
    '员工'  -- 钉钉登录默认创建的角色
]));

-- 3. 查看现有的所有角色值（调试用）
SELECT DISTINCT role FROM users ORDER BY role;
