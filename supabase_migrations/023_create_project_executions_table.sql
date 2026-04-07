-- 创建项目执行信息表
-- 执行时间：2026-04-06

CREATE TABLE IF NOT EXISTS project_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- 展厅信息
  has_brain_exhibition BOOLEAN DEFAULT FALSE, -- 含强脑展厅

  -- 人数
  participant_count INTEGER DEFAULT 0, -- 人数

  -- 开票信息
  is_invoiced BOOLEAN DEFAULT FALSE, -- 是否开票

  -- 销售数据
  product_sales DECIMAL(12,2) DEFAULT 0, -- 产品销售额
  service_commission DECIMAL(10,2) DEFAULT 0, -- 服务提成
  product_commission DECIMAL(10,2) DEFAULT 0, -- 商品提成

  -- 回款信息
  payment_status VARCHAR(20) DEFAULT '未回款', -- 已回款 | 部分回款 | 未回款

  -- 备注
  remarks TEXT,

  -- 时间戳
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- 唯一约束（一个项目只有一条执行记录）
  UNIQUE(project_id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_project_executions_project_id ON project_executions(project_id);
CREATE INDEX IF NOT EXISTS idx_project_executions_payment_status ON project_executions(payment_status);
CREATE INDEX IF NOT EXISTS idx_project_executions_created_at ON project_executions(created_at);

-- 添加注释
COMMENT ON TABLE project_executions IS '项目执行信息表';
COMMENT ON COLUMN project_executions.has_brain_exhibition IS '是否含强脑展厅';
COMMENT ON COLUMN project_executions.participant_count IS '参与人数';
COMMENT ON COLUMN project_executions.is_invoiced IS '是否已开票';
COMMENT ON COLUMN project_executions.product_sales IS '产品销售额';
COMMENT ON COLUMN project_executions.service_commission IS '服务提成';
COMMENT ON COLUMN project_executions.product_commission IS '商品提成';
COMMENT ON COLUMN project_executions.payment_status IS '回款状态：已回款 | 部分回款 | 未回款';
COMMENT ON COLUMN project_executions.remarks IS '备注';
