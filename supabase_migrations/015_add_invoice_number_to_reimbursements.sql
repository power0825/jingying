-- 添加发票号字段到 project_reimbursements 表
-- 执行时间：2026-04-06

ALTER TABLE project_reimbursements
ADD COLUMN IF NOT EXISTS invoice_number text;

COMMENT ON COLUMN project_reimbursements.invoice_number IS '发票号码（自动识别或手动输入）';

-- 创建索引以加速重复检测
CREATE INDEX IF NOT EXISTS idx_project_reimbursements_invoice_number
ON project_reimbursements(invoice_number);
