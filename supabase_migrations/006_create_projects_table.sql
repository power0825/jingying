-- 创建 projects 表 schema（统一使用与 quotations 一致的字段名）
-- 执行时间：2026-04-02
-- 说明：定义 projects 表的所有字段，确保与前端代码一致

-- 如果表不存在则创建
CREATE TABLE IF NOT EXISTS projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL,
    name text NOT NULL,
    created_at timestamptz DEFAULT now(),
    participants integer NOT NULL DEFAULT 0,
    difficulties text,
    income_with_tax numeric NOT NULL DEFAULT 0,
    income_without_tax numeric NOT NULL DEFAULT 0,
    tax_amount numeric NOT NULL DEFAULT 0,
    tax_rate numeric NOT NULL DEFAULT 0,
    execution_days integer NOT NULL DEFAULT 0,
    customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
    bd_manager_id uuid REFERENCES users(id) NOT NULL,
    quotation_id uuid REFERENCES quotations(id) ON DELETE SET NULL,
    reference_price_total numeric NOT NULL DEFAULT 0,
    client_name text NOT NULL,
    status text NOT NULL DEFAULT '草稿',
    initial_approval_status text,
    initial_approver_id uuid REFERENCES users(id),
    final_approval_status text,
    final_approver_id uuid REFERENCES users(id),
    class_teacher_id uuid REFERENCES users(id),
    team_leader_id uuid REFERENCES users(id),
    team_member_ids uuid[],
    itinerary jsonb,
    hotel_arrangement jsonb,
    updated_at timestamptz DEFAULT now()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_projects_bd_manager ON projects(bd_manager_id);
CREATE INDEX IF NOT EXISTS idx_projects_customer ON projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_projects_quotation ON projects(quotation_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at);

-- 字段注释
COMMENT ON TABLE projects IS '项目立项表';
COMMENT ON COLUMN projects.code IS '项目编号';
COMMENT ON COLUMN projects.name IS '项目名称';
COMMENT ON COLUMN projects.participants IS '项目人数';
COMMENT ON COLUMN projects.difficulties IS '执行难点';
COMMENT ON COLUMN projects.income_with_tax IS '项目含税收入';
COMMENT ON COLUMN projects.income_without_tax IS '项目收入（不含税）';
COMMENT ON COLUMN projects.tax_amount IS '税额';
COMMENT ON COLUMN projects.tax_rate IS '发票税点';
COMMENT ON COLUMN projects.execution_days IS '执行周期（天）';
COMMENT ON COLUMN projects.customer_id IS '客户 ID';
COMMENT ON COLUMN projects.bd_manager_id IS '商务人员（BD 经理/BD 总监）';
COMMENT ON COLUMN projects.quotation_id IS '关联报价单 ID';
COMMENT ON COLUMN projects.reference_price_total IS '总参考价格（基于报价单 reference_price_total，与 quotations 表保持一致）';
COMMENT ON COLUMN projects.client_name IS '客户名称';
COMMENT ON COLUMN projects.status IS '项目状态：草稿/待初审/待终审/已通过/已驳回';
COMMENT ON COLUMN projects.initial_approval_status IS '立项初审状态';
COMMENT ON COLUMN projects.initial_approver_id IS '初审人员';
COMMENT ON COLUMN projects.final_approval_status IS '立项终审状态';
COMMENT ON COLUMN projects.final_approver_id IS '终审人员';
COMMENT ON COLUMN projects.class_teacher_id IS '班主任（运营经理）';
COMMENT ON COLUMN projects.team_leader_id IS '项目负责人';
COMMENT ON COLUMN projects.team_member_ids IS '项目团队成员';
COMMENT ON COLUMN projects.itinerary IS '行程安排（JSON）';
COMMENT ON COLUMN projects.hotel_arrangement IS '酒店安排（JSON）';
