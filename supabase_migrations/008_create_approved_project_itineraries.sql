-- 创建审批通过的项目行程表
-- 执行时间：2026-04-02
-- 说明：存储审批通过的项目行程数据，与立项行程结构保持一致

-- 如果表不存在则创建
CREATE TABLE IF NOT EXISTS approved_project_itineraries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    day_index integer NOT NULL DEFAULT 0,
    date text,
    morning jsonb DEFAULT '[]'::jsonb,
    noon jsonb DEFAULT '{"supplierId": "", "cost": 0, "actualCost": 0}'::jsonb,
    afternoon jsonb DEFAULT '[]'::jsonb,
    evening jsonb DEFAULT '{"supplierId": "", "cost": 0, "actualCost": 0}'::jsonb,
    busId text DEFAULT '',
    busDuration text DEFAULT 'full',
    busHours integer DEFAULT 0,
    busCost numeric DEFAULT 0,
    busActualCost numeric DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(project_id, day_index)
);

-- 添加 actual_cost 备用字段（存储每一项的实际成本）
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
COMMENT ON COLUMN approved_project_itineraries.busId IS '大巴供应商 ID';
COMMENT ON COLUMN approved_project_itineraries.busDuration IS '大巴时长：hour/half/full/none';
COMMENT ON COLUMN approved_project_itineraries.busHours IS '大巴小时数';
COMMENT ON COLUMN approved_project_itineraries.busCost IS '大巴预算成本';
COMMENT ON COLUMN approved_project_itineraries.busActualCost IS '大巴实际成本';
COMMENT ON COLUMN approved_project_itineraries.morning_actual IS '上午活动实际成本 (JSON，备用)';
COMMENT ON COLUMN approved_project_itineraries.afternoon_actual IS '下午活动实际成本 (JSON，备用)';
COMMENT ON COLUMN approved_project_itineraries.noon_actual_cost IS '午餐实际成本 (备用)';
COMMENT ON COLUMN approved_project_itineraries.evening_actual_cost IS '晚餐实际成本 (备用)';
