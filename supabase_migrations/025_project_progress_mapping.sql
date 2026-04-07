-- 项目进度看板 - 字段映射说明
-- 更新时间：2026-04-06

/*
=============================================================================
字段映射分析
=============================================================================

1. 项目编码 (code) → projects.code
2. 项目名称 (name) → projects.name
3. 开始日期 (start_date) → approved_project_itineraries.MIN(date)
4. 结束日期 (end_date) → approved_project_itineraries.MAX(date)
5. 状态 (status) → projects.status + 日期计算
6. 项目金额 (income_with_tax) → projects.income_with_tax
7. 回款状态 (payment_status) → project_executions 或 project_financial_customers 计算
8. 含强脑展厅 (has_brain_exhibition) → project_executions.has_brain_exhibition
9. 人数 (participant_count) → projects.participants 或 project_executions.participant_count
10. 客户经理 (customer_manager_name) → projects.customer_manager_id → users.name
11. 班主任 (class_teacher_name) → projects.class_teacher_id → users.name
12. 项目组人员 (team_members_name) → projects.team_member_ids → users.name[]
13. 是否开票 (is_invoiced) → project_financial_customers.invoice_url
14. 产品销售额 (product_sales) → SUM(product_sales.total_amount)
15. 服务提成 (service_commission) → projects.income_without_tax * service_commission_rate
16. 商品提成 (product_commission) → project_executions.product_commission
17. 备注 (remarks) → project_executions.remarks

=============================================================================
*/

-- 创建索引加速查询
CREATE INDEX IF NOT EXISTS idx_approved_project_itineraries_project_date
ON approved_project_itineraries(project_id, date);

CREATE INDEX IF NOT EXISTS idx_project_financial_customers_project
ON project_financial_customers(project_id, payment_date);

CREATE INDEX IF NOT EXISTS idx_product_sales_project
ON product_sales(project_id);
