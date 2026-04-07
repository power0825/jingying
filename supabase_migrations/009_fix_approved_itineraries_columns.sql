-- 修复 approved_project_itineraries 表的字段名
-- 执行时间：2026-04-02
-- 说明：PostgreSQL 会将未加引号的标识符转换为小写，需要重建表以确保字段名正确

-- 备份现有数据
CREATE TABLE IF NOT EXISTS approved_project_itineraries_backup AS
SELECT * FROM approved_project_itineraries;

-- 删除旧表
DROP TABLE IF EXISTS approved_project_itineraries;

-- 重新创建表，使用下划线命名
CREATE TABLE approved_project_itineraries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    day_index integer NOT NULL DEFAULT 0,
    date text,
    morning jsonb DEFAULT '[]'::jsonb,
    noon jsonb DEFAULT '{"supplierId": "", "cost": 0, "actualCost": 0}'::jsonb,
    afternoon jsonb DEFAULT '[]'::jsonb,
    evening jsonb DEFAULT '{"supplierId": "", "cost": 0, "actualCost": 0}'::jsonb,
    bus_id text DEFAULT '',
    bus_duration text DEFAULT 'full',
    bus_hours integer DEFAULT 0,
    bus_cost numeric DEFAULT 0,
    bus_actual_cost numeric DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(project_id, day_index)
);

-- 添加实际成本备用字段
ALTER TABLE approved_project_itineraries
ADD COLUMN IF NOT EXISTS morning_actual jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS afternoon_actual jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS noon_actual_cost numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS evening_actual_cost numeric DEFAULT 0;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_approved_itineraries_project ON approved_project_itineraries(project_id);
CREATE INDEX IF NOT EXISTS idx_approved_itineraries_day_index ON approved_project_itineraries(day_index);

-- 表注释
COMMENT ON TABLE approved_project_itineraries IS '审批通过的项目行程表';
COMMENT ON COLUMN approved_project_itineraries.project_id IS '项目 ID';
COMMENT ON COLUMN approved_project_itineraries.day_index IS '第几天';
COMMENT ON COLUMN approved_project_itineraries.date IS '日期';
COMMENT ON COLUMN approved_project_itineraries.morning IS '上午活动 (JSON)';
COMMENT ON COLUMN approved_project_itineraries.noon IS '午餐 (JSON)';
COMMENT ON COLUMN approved_project_itineraries.afternoon IS '下午活动 (JSON)';
COMMENT ON COLUMN approved_project_itineraries.evening IS '晚餐 (JSON)';
COMMENT ON COLUMN approved_project_itineraries.bus_id IS '大巴供应商 ID';
COMMENT ON COLUMN approved_project_itineraries.bus_duration IS '大巴时长：hour/half/full/none';
COMMENT ON COLUMN approved_project_itineraries.bus_hours IS '大巴小时数';
COMMENT ON COLUMN approved_project_itineraries.bus_cost IS '大巴预算成本';
COMMENT ON COLUMN approved_project_itineraries.bus_actual_cost IS '大巴实际成本';
