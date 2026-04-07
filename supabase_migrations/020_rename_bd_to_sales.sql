-- 修改 users 表中的角色值：BD 经理 -> 客户经理，BD 总监 -> 客户总监
-- 执行时间：2026-04-06

-- 更新现有用户的角色
UPDATE users SET role = '客户经理' WHERE role = 'BD 经理';
UPDATE users SET role = '客户总监' WHERE role = 'BD 总监';

-- 删除旧的约束（如果有）
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- 添加新的约束（使用新角色名称）
ALTER TABLE users
ADD CONSTRAINT users_role_check
CHECK (role = ANY (ARRAY[
    '管理员',
    '客户经理',
    '客户总监',
    '运营经理',
    '运营总监',
    '财务',
    'CEO',
    '员工'
]));
