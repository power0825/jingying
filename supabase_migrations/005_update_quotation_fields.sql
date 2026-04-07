-- 更新 quotations 表的字段（如果 004 未执行则执行重命名）
-- 执行时间：2026-04-02
-- 说明：添加 IF EXISTS 检查，避免重复执行报错

-- 1. 重命名字段（如果字段存在）
DO $$
BEGIN
    -- 检查 cost 字段是否存在，存在则重命名
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'quotations' AND column_name = 'cost'
    ) THEN
        ALTER TABLE quotations RENAME COLUMN cost TO reference_price_total;
    END IF;

    -- 检查 actual_cost 字段是否存在，存在则重命名
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'quotations' AND column_name = 'actual_cost'
    ) THEN
        ALTER TABLE quotations RENAME COLUMN actual_cost TO actual_cost_total;
    END IF;

    -- 检查 profit 字段是否存在，存在则重命名
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'quotations' AND column_name = 'profit'
    ) THEN
        ALTER TABLE quotations RENAME COLUMN profit TO markup_amount;
    END IF;

    -- 检查 profit_margin 字段是否存在，存在则重命名
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'quotations' AND column_name = 'profit_margin'
    ) THEN
        ALTER TABLE quotations RENAME COLUMN profit_margin TO markup_rate;
    END IF;
END $$;

-- 2. 更新字段注释
COMMENT ON COLUMN quotations.reference_price_total IS '总参考价格（基于供应商 reference_quote 计算，用于立项时预估成本）';
COMMENT ON COLUMN quotations.actual_cost_total IS '总实际成本（基于供应商 actual_cost 计算，隐藏字段，仅高管可见）';
COMMENT ON COLUMN quotations.markup_amount IS '参考价上浮金额（对外报价 - 总参考价格）';
COMMENT ON COLUMN quotations.markup_rate IS '参考价上浮率（markup_amount / 对外报价 × 100%）';
