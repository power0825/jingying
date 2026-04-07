-- 修复结算单号重复问题
-- 执行时间：2026-04-06

-- 创建全局结算单号序列
CREATE SEQUENCE IF NOT EXISTS settlement_no_seq START 1;

-- 添加索引到 supplier_settlement_items 表，用于根据 settlement_id 和 supplier_id 查询
CREATE INDEX IF NOT EXISTS idx_settlement_items_supplier ON supplier_settlement_items USING btree (settlement_id);

-- 注意：supplier_settlement_items 表没有 supplier_id 字段
-- 需要通过关联 supplier_settlements 表来获取 supplier_id

-- 创建获取下一个结算单号的函数
CREATE OR REPLACE FUNCTION get_next_settlement_no()
RETURNS INTEGER AS $$
BEGIN
  RETURN nextval('settlement_no_seq');
END;
$$ LANGUAGE plpgsql;
