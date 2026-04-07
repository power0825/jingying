-- 查看现有的所有角色值
SELECT DISTINCT role FROM users ORDER BY role;

-- 查看所有用户的详细信息
SELECT id, name, role FROM users ORDER BY role, created_at;
