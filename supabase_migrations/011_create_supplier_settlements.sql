-- 创建供应商结算单表
-- 执行时间：2026-04-03
-- 说明：用于管理供应商月结结算流程

CREATE TABLE IF NOT EXISTS supplier_settlements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    settlement_no text NOT NULL,           -- 结算单号 JS202604-001
    supplier_id uuid REFERENCES suppliers(id) ON DELETE CASCADE NOT NULL,
    supplier_name text NOT NULL,           -- 供应商名称（冗余存储）
    period_month date NOT NULL,            -- 结算月份 2026-04-01
    total_amount numeric NOT NULL DEFAULT 0, -- 结算总额
    project_count integer NOT NULL DEFAULT 0, -- 项目数量
    status text NOT NULL DEFAULT '待提交',   -- 待提交/待审核/已审核/已付款/已驳回
    submitted_by uuid REFERENCES users(id),  -- 提交人
    submitted_at timestamptz,
    audited_by uuid REFERENCES users(id),    -- 审核人
    audited_at timestamptz,
    audit_notes text,                        -- 审核意见
    paid_by uuid REFERENCES users(id),       -- 付款确认人
    paid_at timestamptz,
    finance_notes text,                      -- 财务备注
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(supplier_id, period_month)
);

-- 创建结算单明细表
CREATE TABLE IF NOT EXISTS supplier_settlement_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    settlement_id uuid REFERENCES supplier_settlements(id) ON DELETE CASCADE NOT NULL,
    project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
    project_code text,                       -- 项目编码（冗余）
    project_name text,                       -- 项目名称（冗余）
    cost_type text NOT NULL,                 -- 费用类型：餐饮/大巴/酒店/活动/场地
    cost_detail text,                        -- 费用明细：午餐/晚餐/大巴等
    itinerary_date date,                     -- 行程日期
    amount numeric NOT NULL DEFAULT 0,       -- 金额
    created_at timestamptz DEFAULT now()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_settlements_supplier ON supplier_settlements(supplier_id);
CREATE INDEX IF NOT EXISTS idx_settlements_period ON supplier_settlements(period_month);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON supplier_settlements(status);
CREATE INDEX IF NOT EXISTS idx_settlement_items_settlement ON supplier_settlement_items(settlement_id);
CREATE INDEX IF NOT EXISTS idx_settlement_items_project ON supplier_settlement_items(project_id);

-- 表注释
COMMENT ON TABLE supplier_settlements IS '供应商结算单';
COMMENT ON COLUMN supplier_settlements.settlement_no IS '结算单号';
COMMENT ON COLUMN supplier_settlements.supplier_id IS '供应商 ID';
COMMENT ON COLUMN supplier_settlements.period_month IS '结算月份';
COMMENT ON COLUMN supplier_settlements.total_amount IS '结算总额';
COMMENT ON COLUMN supplier_settlements.project_count IS '项目数量';
COMMENT ON COLUMN supplier_settlements.status IS '状态：待提交/待审核/已审核/已付款/已驳回';
COMMENT ON COLUMN supplier_settlements.submitted_by IS '提交人';
COMMENT ON COLUMN supplier_settlements.submitted_at IS '提交时间';
COMMENT ON COLUMN supplier_settlements.audited_by IS '审核人';
COMMENT ON COLUMN supplier_settlements.audited_at IS '审核时间';
COMMENT ON COLUMN supplier_settlements.audit_notes IS '审核意见';
COMMENT ON COLUMN supplier_settlements.paid_by IS '付款确认人';
COMMENT ON COLUMN supplier_settlements.paid_at IS '付款时间';
COMMENT ON COLUMN supplier_settlements.finance_notes IS '财务备注';

COMMENT ON TABLE supplier_settlement_items IS '供应商结算单明细';
COMMENT ON COLUMN supplier_settlement_items.settlement_id IS '结算单 ID';
COMMENT ON COLUMN supplier_settlement_items.project_id IS '项目 ID';
COMMENT ON COLUMN supplier_settlement_items.cost_type IS '费用类型';
COMMENT ON COLUMN supplier_settlement_items.cost_detail IS '费用明细';
COMMENT ON COLUMN supplier_settlement_items.itinerary_date IS '行程日期';
COMMENT ON COLUMN supplier_settlement_items.amount IS '金额';
