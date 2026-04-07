-- 重命名 quotations 表的字段，使语义更清晰
-- 执行时间：2026-04-01
-- 说明：将「成本」相关字段更名为「参考价格」和「实际成本」，避免概念混淆

-- 1. 重命名字段
ALTER TABLE quotations
    RENAME COLUMN cost TO reference_price_total;

ALTER TABLE quotations
    RENAME COLUMN actual_cost TO actual_cost_total;

ALTER TABLE quotations
    RENAME COLUMN profit TO markup_amount;

ALTER TABLE quotations
    RENAME COLUMN profit_margin TO markup_rate;

-- 2. 更新字段注释
COMMENT ON COLUMN quotations.reference_price_total IS '总参考价格（基于供应商 reference_quote 计算，用于立项时预估成本）';
COMMENT ON COLUMN quotations.actual_cost_total IS '总实际成本（基于供应商 actual_cost 计算，隐藏字段，仅高管可见）';
COMMENT ON COLUMN quotations.markup_amount IS '参考价上浮金额（对外报价 - 总参考价格）';
COMMENT ON COLUMN quotations.markup_rate IS '参考价上浮率（markup_amount / 对外报价 × 100%）';
