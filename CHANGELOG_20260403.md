# 供应商结算系统更新日志

**日期**: 2026-04-03

---

## 一、数据库迁移

### 1. 新增供应商结算方式字段 (`012_add_supplier_settlement_fields.sql`)

```sql
ALTER TABLE suppliers
ADD COLUMN IF NOT EXISTS settlement_method text DEFAULT '月结',
ADD COLUMN IF NOT EXISTS settlement_day integer;
```

- `settlement_method`: 结算方式（月结/先款后票/先票后款）
- `settlement_day`: 结算日期（每月几号，月结方式下有效）

### 2. 新增供应商付款结算方式字段 (`013_add_settlement_method_to_financials.sql`)

```sql
ALTER TABLE project_financial_suppliers
ADD COLUMN IF NOT EXISTS settlement_method text DEFAULT '月结';
```

---

## 二、类型定义更新

### `src/types/supplier.ts`

在 `Supplier` 接口中新增字段：

```typescript
// 结算方式
settlement_method?: '月结' | '先款后票' | '先票后款';
settlement_day?: number;  // 结算日期（每月几号，月结方式下有效）
```

---

## 三、核心功能改动

### 1. 供应商详情页 (`src/pages/SupplierDetails.tsx`)

#### 新增功能

**A. 结算信息展示区**

在"付款&结算"页面顶部添加了结算信息展示：

```tsx
{/* 结算方式 & 结算日期 */}
<div className="bg-white border border-slate-200 rounded-lg p-4">
  <h4 className="text-sm font-medium text-slate-700 mb-3">结算信息</h4>
  <div className="flex items-center gap-6">
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-500">结算方式：</span>
      <span className="text-sm font-medium text-slate-900 bg-slate-100 px-3 py-1 rounded-full">
        {supplier?.settlement_method || '月结'}
      </span>
    </div>
    {(supplier?.settlement_method === '月结' || !supplier?.settlement_method) && supplier?.settlement_day && (
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-500">结算日期：</span>
        <span className="text-sm font-medium text-slate-900">
          每月 {supplier.settlement_day} 号
        </span>
      </div>
    )}
  </div>
</div>
```

**B. 统计指标色块**

参考客户管理 - 项目情况的 UI 设计，添加三个可点击的统计色块：

```tsx
{/* 统计指标色块 */}
<div className="grid grid-cols-3 gap-4">
  <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-100 cursor-pointer hover:bg-indigo-100"
       onClick={() => loadDetailItems('total')}>
    <div className="text-sm text-indigo-600 font-medium mb-1">总金额</div>
    <div className="text-2xl font-bold text-indigo-900">¥{settlementStats.totalAmount.toLocaleString()}</div>
    <div className="text-xs text-indigo-500 mt-1">所有项目费用总和</div>
    <div className="text-xs text-indigo-400 mt-1 flex items-center">
      <Eye className="w-3 h-3 mr-1" /> 点击查看详情
    </div>
  </div>
  {/* 已结算、待结算类似结构 */}
</div>
```

**C. 明细弹窗**

新增 `detailModalType` 状态，支持查看：
- 总金额明细
- 已结算明细
- 待结算明细

弹窗展示字段：项目编码、项目名称、付款状态、金额

#### 新增状态

```typescript
// 结算统计指标
const [settlementStats, setSettlementStats] = useState({
  totalAmount: 0,      // 总金额（所有记录）
  settledAmount: 0,    // 已结算金额（已付款）
  pendingAmount: 0     // 待结算金额（未付款）
});

// 明细弹窗状态
const [detailModalType, setDetailModalType] = useState<'total' | 'settled' | 'pending' | null>(null);
const [detailItems, setDetailItems] = useState<any[]>([]);
```

#### 新增函数

```typescript
// 计算结算统计指标
const calculateSettlementStats = async (supplierId: string) => {
  // 从 project_financial_suppliers 读取所有记录
  // 按 payment_status 分类统计金额
};

// 加载明细数据
const loadDetailItems = async (type: 'total' | 'settled' | 'pending') => {
  // 根据类型过滤记录，加载项目信息，打开弹窗
};
```

#### 数据源

所有统计数据从 `project_financial_suppliers` 表读取，按 `supplier_id` 过滤。

---

### 2. 供应商表单 (`src/components/SupplierForm.tsx`)

#### 表单字段更新

```typescript
const supplierSchema = z.object({
  // ... 其他字段
  settlement_method: z.enum(['月结', '先款后票', '先票后款'] as const).optional().default('月结'),
  settlement_day: z.coerce.number().optional(),
});
```

#### UI 重新设计

采用色块分区设计，清晰展示三大板块：

1. **基础信息** - 灰色背景 + indigo 强调色
2. **报价及结算信息** - 蓝色渐变背景
3. **其他信息** - 灰色背景 + slate 强调色

在"报价及结算信息"板块中新增：
- 结算方式（必填，下拉选择：月结/先款后票/先票后款）
- 结算日期（选填，1-31，仅当结算方式为"月结"时启用）

---

### 3. 项目财务管理 (`src/components/project/Financials.tsx`)

#### 字段名变更

将 "付款方式" 统一更名为 "结算方式"（`payment_method` → `settlement_method`）

#### 默认值逻辑

新增供应商付款条目时，自动继承该供应商配置的 `settlement_method`：

```typescript
let supplierSettlementMethods: Record<string, string> = {};
const { data: sData } = await supabase
  .from('suppliers')
  .select('id, name, settlement_method')
  .in('id', allSupplierIds);

sData?.forEach(s => {
  supplierSettlementMethods[s.id] = s.settlement_method || '月结';
});

// 创建条目时使用
settlement_method: supplierSettlementMethods[sid] || '月结'
```

#### 交互优化

当结算方式为"月结"时，隐藏"申请付款"按钮：

```tsx
{p.settlement_method !== '月结' && (
  <button onClick={() => requestPayment(s)}>申请付款</button>
)}
```

---

### 4. 供应商详情页待结算列表 (`src/pages/SupplierDetails.tsx`)

#### 数据源变更

从 `project_financial_suppliers` 表读取待结算费用，而非解析 `approved_project_itineraries` 的 JSONB 字段。

#### 展示字段

| 列名 | 来源 |
|------|------|
| 项目编码 | `projects.code` |
| 项目名称 | `projects.name` |
| 项目时间 | `projects.itinerary.schedule[0].date` |
| 结算金额 | `project_financial_suppliers.actual_amount` |
| 备注 | 手工录入，自动保存（1 秒防抖） |

---

## 四、业务逻辑

### 结算工作流

```
待提交 → 待审核 → 已审核 → 已付款
```

### 结算方式含义

| 结算方式 | 说明 | 是否需要申请付款 |
|----------|------|------------------|
| 月结 | 按月结算，无需上传发票和付款凭证 | 否 |
| 先款后票 | 先付款后开发票 | 是 |
| 先票后款 | 先开发票后付款 | 是 |

### 统计指标计算

```typescript
// 总金额 = 所有 project_financial_suppliers 记录的 actual_amount 总和
totalAmount = sum(allPayments)

// 已结算 = payment_status = '已付款' 的记录
settledAmount = sum(payments where status === '已付款')

// 待结算 = payment_status = '未付款' 的记录
pendingAmount = sum(payments where status === '未付款')
```

---

## 五、待办事项

- [ ] 确保 SQL 迁移已在 Supabase Dashboard 执行
- [ ] 验证供应商结算方式默认值加载正确
- [ ] 测试待结算明细弹窗数据准确性

---

## 六、相关文件清单

| 文件 | 修改内容 |
|------|----------|
| `supabase_migrations/012_add_supplier_settlement_fields.sql` | 新增 |
| `supabase_migrations/013_add_settlement_method_to_financials.sql` | 新增 |
| `supabase_migrations/014_add_payment_voucher_to_settlements.sql` | 新增付款凭证和发票 URL 字段 |
| `src/types/supplier.ts` | 添加 settlement_method、settlement_day 字段 |
| `src/pages/SupplierDetails.tsx` | 结算信息展示、统计色块、明细弹窗、删除按钮、CEO 审核、发票上传（运营总监）、付款凭证上传（财务） |
| `src/components/SupplierForm.tsx` | 表单新增结算字段，UI 重新设计 |
| `src/components/project/Financials.tsx` | 字段改名，默认值逻辑，月结隐藏申请按钮 |
| `src/pages/Finance.tsx` | 新增"结算单处理"Tab |
| `src/components/finance/SettlementProcessing.tsx` | 新增组件（结算单处理，含发票查看、付款凭证上传） |

---

## 七、结算单审核流程（2026-04-03 更新）

### 审核流程

```
运营总监发起 → CEO 业务审核 → 财务最终审核 → 已付款
```

### 状态流转

| 状态 | 操作角色 | 可执行操作 | 下一状态 |
|------|----------|-----------|----------|
| 待提交 | 运营人员 | 提交、删除、上传发票 | 待审核 |
| 待审核 | CEO | 审核通过、驳回 | 已审核/已驳回 |
| 已审核 | 财务 | 确认付款、驳回、上传付款凭证 | 已付款/已驳回 |
| 已付款 | 财务/运营总监 | 查看、重新上传付款凭证/发票 | - |
| 已驳回 | 运营人员 | 重新提交、删除、上传发票 | 待审核/删除 |

### 权限控制

| 功能 | 供应商详情页 | 财务管理 - 结算单处理 |
|------|-------------|---------------------|
| 发起结算单 | 运营人员 | - |
| CEO 审核 | ✅ 临时 | ✅ 正式 |
| 财务确认付款 | ✅ | ✅ |
| 财务驳回 | ✅ | ✅ |
| 上传发票 | 运营总监（所有状态） | -（仅查看） |
| 上传付款凭证 | 财务 | 财务 |

**注意**: CEO 审核功能目前在两个地方都可以使用：
1. 供应商详情页 - 临时方案
2. 财务管理 - 结算单处理 Tab - 正式位置

后续 CEO 审核中心建成后，会统一迁移到审核中心。

### 新增文件

**`src/components/finance/SettlementProcessing.tsx`**
- 结算单处理组件，供财务和 CEO 使用
- 支持筛选：全部/待审核/已审核
- CEO 可以审核通过/驳回
- 财务可以确认付款、驳回
- 财务可以上传/重新上传付款凭证（已审核/已付款状态）
- 支持查看结算单明细（含费用明细列表）
- 支持查看发票（运营总监在供应商详情页上传）

### 发票和付款凭证上传逻辑

参考 `PaymentApproval.tsx` 的实现：
- 存储桶：`attachments`
- 发票路径：`financials/invoices/{随机文件名}`（运营总监上传）
- 付款凭证路径：`financials/vouchers/{随机文件名}`（财务上传）
- 支持格式：pdf, jpg, jpeg, png
- 上传后保存 publicUrl 到数据库

### 需执行的 SQL 迁移

```sql
-- 014_add_payment_voucher_to_settlements.sql
ALTER TABLE supplier_settlements
ADD COLUMN IF NOT EXISTS payment_voucher_url text,
ADD COLUMN IF NOT EXISTS invoice_url text;

COMMENT ON COLUMN supplier_settlements.payment_voucher_url IS '付款凭证 URL';
COMMENT ON COLUMN supplier_settlements.invoice_url IS '发票 URL';
```

**`src/components/finance/SettlementProcessing.tsx`**
- 结算单处理组件，供财务和 CEO 使用
- 支持筛选：全部/待审核/已审核
- CEO 可以审核通过/驳回
- 财务可以确认付款
- 支持查看结算单明细（含费用明细列表）
