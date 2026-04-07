-- 给供应商结算单表添加付款凭证和发票字段
-- 执行时间：2026-04-03

ALTER TABLE supplier_settlements
ADD COLUMN IF NOT EXISTS payment_voucher_url text,
ADD COLUMN IF NOT EXISTS invoice_url text;

COMMENT ON COLUMN supplier_settlements.payment_voucher_url IS '付款凭证 URL';
COMMENT ON COLUMN supplier_settlements.invoice_url IS '发票 URL';
