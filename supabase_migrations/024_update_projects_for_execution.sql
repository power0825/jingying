-- 更新 projects 表，添加项目执行相关字段
-- 执行时间：2026-04-06

-- 添加客户经理字段
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS customer_manager_id UUID REFERENCES users(id);

-- 添加项目组人员字段（数组）
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS team_member_ids UUID[];

-- 添加项目阶段/类型字段（可选）
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS project_type VARCHAR(50) DEFAULT '培训';

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_projects_customer_manager ON projects(customer_manager_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- 添加注释
COMMENT ON COLUMN projects.customer_manager_id IS '客户经理（业务负责人）';
COMMENT ON COLUMN projects.team_member_ids IS '项目组成员 ID 数组';
COMMENT ON COLUMN projects.project_type IS '项目类型';
