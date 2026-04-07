-- 更新 projects 表的字段名（如果 006 未执行则执行重命名）
-- 执行时间：2026-04-02
-- 说明：将 estimated_cost 重命名为 reference_price_total，与 quotations 表保持一致

-- 重命名字段（如果字段存在）
DO $$
BEGIN
    -- 检查 estimated_cost 字段是否存在，存在则重命名
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'projects' AND column_name = 'estimated_cost'
    ) THEN
        ALTER TABLE projects RENAME COLUMN estimated_cost TO reference_price_total;
    END IF;
END $$;

-- 更新字段注释
COMMENT ON COLUMN projects.reference_price_total IS '总参考价格（与 quotations 表保持一致）';
