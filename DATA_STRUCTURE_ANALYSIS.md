# 数据结构与 Supabase 表对应关系分析

## 一、核心数据库表结构

### 1. suppliers 表（供应商表）
```sql
id UUID                    -- 主键，如：10000000-0000-0000-0000-000000000002
code TEXT                  -- 供应商编码，如：H002
name TEXT                  -- 供应商名称，如：华尔道夫酒店
type TEXT                  -- 类型：酒店/餐饮/场地/老师/参访点/大巴/其他
contact_person TEXT        -- 联系人
contact_phone TEXT         -- 联系电话
address TEXT               -- 地址
price DECIMAL              -- 供应价格（兼容旧字段）
reference_quote JSONB      -- 参考报价：{ unit: 1500 } 或 { hour: 100, day: 800 }
actual_cost JSONB          -- 实际成本：{ unit: 1400 } 或 { hour: 90, day: 700 }
account_name TEXT          -- 开户名称
tax_id TEXT                -- 税号
bank_name TEXT             -- 开户行
bank_account TEXT          -- 银行账号
remarks TEXT               -- 备注
extended_data JSONB        -- 扩展信息（星级、房间数等）
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

### 2. projects 表（项目表）
```sql
id UUID                    -- 主键，如：d8a97a30-21d9-46a3-9b5a-a71cccddcab8
code TEXT                  -- 项目编号，如：P202604107
name TEXT                  -- 项目名称
customer_id UUID           -- 关联 customers 表
participants INTEGER       -- 项目人数
execution_days INTEGER     -- 执行周期（天）
difficulties TEXT          -- 执行难点
income_with_tax DECIMAL    -- 含税收入
income_without_tax DECIMAL -- 不含税收入
tax_rate DECIMAL           -- 发票税点
estimated_cost DECIMAL     -- 预估成本
tax_amount DECIMAL         -- 税额
bd_manager_id UUID         -- 商务负责人（关联 users 表）
quotation_id UUID          -- 报价单 ID
status TEXT                -- 状态：草稿/待初审/待终审/已通过/已驳回
initial_approval_status TEXT  -- 初审状态
initial_approver_id UUID   -- 初审人
final_approval_status TEXT    -- 终审状态
final_approver_id UUID     -- 终审人
class_teacher_id UUID      -- 班主任
team_member_ids UUID[]     -- 团队成员
itinerary JSONB            -- 行程安排（立项时暂存）
hotel_arrangement JSONB    -- 酒店安排：{ hotelId, nights, peoplePerRoom, cost, actualCost }
client_name TEXT           -- 客户名称
created_at TIMESTAMPTZ
```

### 3. approved_project_itineraries 表（审批通过的行程表）
```sql
id UUID                    -- 主键
project_id UUID            -- 关联 projects 表
day_index INTEGER          -- 第几天
date TEXT                  -- 日期
morning JSONB              -- 上午活动：[{ supplierId, cost, actualCost, venueId, venueCost... }]
afternoon JSONB            -- 下午活动：[{ supplierId, cost, actualCost... }]
noon JSONB                 -- 午餐：{ supplierId, cost, actualCost }
evening JSONB              -- 晚餐：{ supplierId, cost, actualCost }
busId TEXT                 -- 大巴供应商 ID
busDuration TEXT           -- 大巴时长：hour/half/full/none
busHours INTEGER           -- 大巴小时数
busCost DECIMAL            -- 大巴预算成本
busActualCost DECIMAL      -- 大巴实际成本
morning_actual JSONB       -- 上午实际成本（备用）
afternoon_actual JSONB     -- 下午实际成本（备用）
noon_actual_cost DECIMAL   -- 午餐实际成本（备用）
evening_actual_cost DECIMAL-- 晚餐实际成本（备用）
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

### 4. project_itineraries_v2 表（项目行程表 V2）
```sql
-- 结构与 approved_project_itineraries 类似
-- 用于存储立项阶段的行程数据
```

### 5. project_financial_suppliers 表（项目供应商财务表）
```sql
id UUID                    -- 主键
project_id UUID            -- 关联 projects 表（存储 UUID）
supplier_id UUID           -- 关联 suppliers 表（存储 UUID）
amount DECIMAL             -- 预算金额
actual_amount DECIMAL      -- 实际成本
payment_date DATE          -- 付款日期
payment_method TEXT        -- 付款方式
invoice_url TEXT           -- 发票 URL
payment_voucher_url TEXT   -- 付款凭证 URL
payment_status TEXT        -- 付款状态：未付款/待 CEO 审核/CEO 已审核/已付款
approval_status TEXT       -- 审批状态：pending/approved/rejected
ops_director_id UUID       -- 发起申请的运营总监
ceo_approver_id UUID       -- CEO 审核人
ceo_approval_date TIMESTAMPTZ
ceo_approval_notes TEXT    -- CEO 审核意见
notes TEXT                 -- 备注（当 supplier_id 为空时存储供应商名称）
created_at TIMESTAMPTZ
```

### 6. project_financial_customers 表（项目客户财务表）
```sql
id UUID
project_id UUID
customer_id UUID
amount DECIMAL
payment_date DATE
invoice_url TEXT
payment_voucher_url TEXT
payment_status TEXT        -- 未收款/已收款
notes TEXT
created_at TIMESTAMPTZ
```

### 7. project_reimbursements 表（项目报销表）
```sql
id UUID
project_id UUID
category TEXT
description TEXT
amount DECIMAL
invoice_url TEXT
status TEXT                -- 草稿/待审核/待打款/已打款/驳回
submission_date TIMESTAMPTZ
created_at TIMESTAMPTZ
```

---

## 二、前端 TypeScript 类型定义

### 1. Supplier 类型 (src/types/supplier.ts)
```typescript
interface Supplier {
  id: string;
  name: string;
  code: string;
  type: '酒店' | '餐饮' | '场地' | '老师' | '参访点' | '大巴' | '其他';
  contact_person?: string;
  contact_phone?: string;
  address?: string;
  internal_contact_id?: string;
  price?: number;
  reference_quote: {
    unit?: number;
    hour?: number;
    half_day?: number;
    day?: number;
    billing_form?: string;
  };
  actual_cost: {
    unit?: number;
    hour?: number;
    half_day?: number;
    day?: number;
    billing_form?: string;
  };
  account_name?: string;
  tax_id?: string;
  bank_name?: string;
  bank_account?: string;
  remarks?: string;
  extended_data: {
    star_rating?: string;
    room_count?: number;
    cuisine?: string;
    is_halal?: boolean;
    area?: number;
    capacity?: number;
    equipment?: string;
    course_name?: string;
    language?: string;
    industry?: string;
    has_guide?: boolean;
    guide_language?: string;
    max_capacity?: number;
    passenger_count?: number;
    [key: string]: any;
  };
  created_at: string;
  updated_at: string;
}
```

### 2. Project 类型 (src/types/project.ts)
```typescript
interface Project {
  id: string;
  code: string;
  name: string;
  created_at: string;
  participants: number;
  difficulties: string;
  income_with_tax: number;
  income_without_tax: number;
  tax_amount: number;
  tax_rate: number;
  execution_days: number;
  customer_id?: string | null;
  bd_manager_id: string;
  quotation_id?: string | null;
  reference_price_total: number;
  status: '草稿' | '待初审' | '待终审' | '已通过' | '已驳回';
  initial_approval_status?: string | null;
  initial_approver_id?: string | null;
  final_approval_status?: string | null;
  final_approver_id?: string | null;
  class_teacher_id?: string | null;
  team_leader_id?: string | null;
  team_member_ids?: string[] | null;
  itinerary?: any[] | null;
  hotel_arrangement?: any | null;
  client_name?: string;
}
```

### 3. ItineraryEditor 中的类型
```typescript
interface Activity {
  id: string;
  type: 'visit' | 'teach';
  supplierId: string;        // 供应商 ID（参访点/老师）
  courseName?: string;
  language?: string;
  hours?: number;
  billingType?: 'hour' | 'half_day' | 'day';
  venueId?: string;          // 场地供应商 ID
  venueBillingType?: 'hour' | 'half_day' | 'day';
  venueHours?: number;
  venueCost?: number;
  venueActualCost?: number;
  cost: number;
  actualCost?: number;
}

interface Meal {
  supplierId: string;        // 餐饮供应商 ID
  cost: number;
  actualCost?: number;
}

interface DailySchedule {
  day: number;
  date?: string;
  morning: Activity[];
  noon: Meal;
  afternoon: Activity[];
  evening: Meal;
  busId: string;             // 大巴供应商 ID
  busDuration?: 'hour' | 'half' | 'full' | 'none';
  busHours?: number;
  busCost: number;
  busActualCost?: number;
}

interface HotelArrangement {
  hotelId: string;           // 酒店供应商 ID
  nights: number;
  peoplePerRoom: number;
  cost: number;
  actualCost?: number;
}
```

### 4. Financials 中的类型 (src/components/project/Financials.tsx)
```typescript
interface ProjectSupplierPayment {
  id: string;
  project_id: string;
  supplier_id: string | null;  // 关键：关联 suppliers.id
  supplier_name: string;
  amount: number;              // 预算金额
  actual_amount: number;       // 实际成本
  payment_method: string;
  invoice_url: string | null;
  payment_voucher_url: string | null;
  payment_status: '未付款' | '待 CEO 审核' | 'CEO 已审核' | '已付款';
  approval_status?: 'pending' | 'approved' | 'rejected';
  is_requested: boolean;
  ops_director_id?: string | null;
  ceo_approver_id?: string | null;
  ceo_approval_notes?: string;
}
```

---

## 三、数据流转逻辑

### 1. 项目创建流程
```
用户填写项目信息
    ↓
选择/导入报价单 (quotation_id)
    ↓
设置行程 (itinerary) 和 酒店安排 (hotel_arrangement)
    ↓
保存到 projects 表
    ↓
同时保存到 project_itineraries_v2 表
```

### 2. 行程数据结构
```
行程 (ItineraryEditor)
├── schedule: DailySchedule[]
│   ├── morning: Activity[]      → 包含 supplierId (参访点/老师)
│   ├── afternoon: Activity[]    → 包含 supplierId (参访点/老师)
│   ├── noon: Meal               → 包含 supplierId (餐饮)
│   ├── evening: Meal            → 包含 supplierId (餐饮)
│   └── busId: string            → 大巴供应商 ID
└── hotelArrangement: HotelArrangement
    └── hotelId: string          → 酒店供应商 ID
```

### 3. 财务数据计算 (Financials.tsx)
```
读取 approved_project_itineraries 或 project.itinerary
    ↓
收集所有供应商 ID:
├── 上午活动 supplierId
├── 下午活动 supplierId
├── 午餐 supplierId
├── 晚餐 supplierId
├── 大巴 busId
└── 酒店 hotelId
    ↓
计算每个供应商的成本:
├── itinerarySupplierCosts[supplierId] = 预算成本总和
└── itinerarySupplierActualCosts[supplierId] = 实际成本总和
    ↓
读取已保存的 project_financial_suppliers 记录
    ↓
合并数据生成 SupplierPayments 数组
    ↓
保存到 project_financial_suppliers 表
```

### 4. 供应商关联查询（供应商详情页）
```
当前供应商 ID: supplierId
    ↓
查询 project_financial_suppliers 表:
  SELECT project_id FROM project_financial_suppliers 
  WHERE supplier_id = :supplierId
    ↓
获取 project_id 列表
    ↓
查询 projects 表:
  SELECT * FROM projects 
  WHERE id IN (projectIds)
    ↓
显示项目列表
```

---

## 四、问题根源分析

### 华尔道夫酒店未出现在项目列表的原因

**数据流检查：**

1. ✅ 华尔道夫酒店存在于 suppliers 表
   - ID: `10000000-0000-0000-0000-000000000002`
   - Code: `H002`
   - Name: `华尔道夫酒店`

2. ✅ P202604107 项目存在
   - ID: `d8a97a30-21d9-46a3-9b5a-a71cccddcab8`
   - Code: `P202604107`

3. ❌ project_financial_suppliers 表中没有华尔道夫酒店的记录
   - 只有 1 条记录，supplier_id 为 `a004059a-2b57-4aa1-a663-72fd82139624`（其他供应商）

4. ? 酒店是否在项目行程中正确配置
   - 需要检查 `projects.hotel_arrangement.hotelId` 是否为 `10000000-0000-0000-0000-000000000002`

5. ? Financials.tsx 是否读取到了酒店信息
   - 日志显示 `supplierIdsFromItinerary: Array(6)` 和 `Supplier Payments: Array(7)`
   - 说明内存中有 7 个供应商（包括华尔道夫酒店）
   - 但保存后数据库中只有 1 条记录

### 可能的原因

1. **保存时只保存了 1 条记录**
   - 用户可能在财务页面只手动保存了 1 个供应商
   - 或者 `saveFinancials()` 函数没有被调用

2. **hotelId 不匹配**
   - 项目行程中保存的 `hotelId` 可能与 suppliers 表中的 ID 不一致
   - 例如：保存的是 `H002` 而不是 UUID

3. **字段名不一致**
   - ItineraryEditor 中使用 `hotelId`
   - Financials.tsx 读取的是 `hotelArrangement.hotelId`
   - 需要确认数据流中字段名是否一致

---

## 五、字段名对照表

| 位置 | 字段名 | 说明 |
|------|--------|------|
| ItineraryEditor | `hotelId` | 酒店供应商 ID |
| ItineraryEditor | `supplierId` | 活动/餐饮供应商 ID |
| ItineraryEditor | `busId` | 大巴供应商 ID |
| ProjectForm | `hotel_arrangement` | projects 表中的字段 |
| ProjectForm | `hotelArrangement` | 前端状态变量 |
| Financials.tsx | `hotelArrangement.hotelId` | 从 projects.hotel_arrangement 读取 |
| Financials.tsx | `day.busId` | 从行程读取大巴供应商 |
| Financials.tsx | `act.supplierId` | 从活动读取供应商 |
| Financials.tsx | `day.noon.supplierId` | 从午餐读取餐饮供应商 |
| project_financial_suppliers | `supplier_id` | 数据库字段（UUID） |

---

## 六、建议修复方案

### 方案 1：确保完整保存
在项目财务页面，确保点击"保存"按钮会保存所有供应商记录到 `project_financial_suppliers` 表。

### 方案 2：检查 hotelId 格式
确认 `hotel_arrangement.hotelId` 存储的是 UUID 格式（如 `10000000-0000-0000-0000-000000000002`）而不是编码（如 `H002`）。

### 方案 3：添加数据迁移
对于已存在的项目，如果 `hotel_arrangement.hotelId` 是编码格式，需要查询 suppliers 表转换为 UUID。
