-- 给 approved_project_itineraries 表添加酒店相关字段
-- 执行时间：2026-04-02
-- 说明：将酒店安排数据也存储到行程表中，保持数据唯一来源

-- 添加酒店安排字段（JSONB 存储完整酒店信息）
ALTER TABLE approved_project_itineraries
ADD COLUMN IF NOT EXISTS hotel_arrangement jsonb DEFAULT '{"hotelId": "", "nights": 0, "peoplePerRoom": 2, "cost": 0, "actualCost": 0}'::jsonb;

-- 添加单独的字段的备选方案（如果需要单独索引）
-- ALTER TABLE approved_project_itineraries
-- ADD COLUMN IF NOT EXISTS hotel_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
-- ADD COLUMN IF NOT EXISTS hotel_nights integer DEFAULT 0,
-- ADD COLUMN IF NOT EXISTS hotel_people_per_room integer DEFAULT 2,
-- ADD COLUMN IF NOT EXISTS hotel_cost numeric DEFAULT 0,
-- ADD COLUMN IF NOT EXISTS hotel_actual_cost numeric DEFAULT 0;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_approved_itineraries_hotel ON approved_project_itineraries USING gin (hotel_arrangement);

-- 表注释
COMMENT ON COLUMN approved_project_itineraries.hotel_arrangement IS '酒店安排 (JSONB): { hotelId, nights, peoplePerRoom, cost, actualCost }';

-- 同步现有项目的酒店数据到 approved_project_itineraries
-- 注意：这需要在 projects 表有 hotel_arrangement 数据的情况下执行
-- 可以通过应用程序逻辑在同步行程时一起写入
