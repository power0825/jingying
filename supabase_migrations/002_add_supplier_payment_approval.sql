-- 添加供应商付款审批流程字段
ALTER TABLE project_financial_suppliers
ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
ADD COLUMN IF NOT EXISTS ops_director_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- 发起申请的运营总监
ADD COLUMN IF NOT EXISTS ceo_approver_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- CEO 审核人
ADD COLUMN IF NOT EXISTS ceo_approval_date TIMESTAMPTZ,  -- CEO 审核时间
ADD COLUMN IF NOT EXISTS ceo_approval_notes TEXT;  -- CEO 审核意见

-- 迁移现有数据：将"已申请"改为"待 CEO 审核"
UPDATE project_financial_suppliers
SET
  approval_status = 'pending',
  payment_status = '待 CEO 审核'
WHERE payment_status = '已申请';

-- 注意：payment_status 的新状态值（待 CEO 审核、CEO 已审核）不需要修改数据库约束
-- 因为原约束是 CHECK (payment_status IN ('未付款', '已申请', '已付款'))
-- 如果需要支持新状态，需要删除并重建约束
-- 但由于我们使用直接 UPDATE，PostgreSQL 会先检查约束再更新，所以可能会失败
-- 解决方法是先删除约束，更新数据，再添加新约束

-- 删除旧的 CHECK 约束（如果存在）
DO $$
BEGIN
  ALTER TABLE project_financial_suppliers DROP CONSTRAINT IF EXISTS project_financial_suppliers_payment_status_check;
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- 添加新的 CHECK 约束包含新状态
ALTER TABLE project_financial_suppliers
ADD CONSTRAINT project_financial_suppliers_payment_status_check
CHECK (payment_status IN ('未付款', '待 CEO 审核', 'CEO 已审核', '已付款'));
