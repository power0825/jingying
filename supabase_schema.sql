  -- Enable UUID extension
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

  -- Users Table
  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    manager_id UUID REFERENCES users(id) ON DELETE SET NULL,
    dashboard_config JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Customers Table
  CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    address TEXT,
    company_size INTEGER,
    contact_person TEXT,
    contact_phone TEXT,
    customer_type TEXT,
    customer_owner UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Suppliers Table
  CREATE SEQUENCE IF NOT EXISTS supplier_code_seq START 1;

  CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL DEFAULT LPAD(nextval('supplier_code_seq')::text, 5, '0'),
    type TEXT NOT NULL, -- 酒店/餐饮/场地/老师/参访点/大巴/其他
    contact_person TEXT,
    contact_phone TEXT,
    address TEXT,
    internal_contact_id UUID REFERENCES users(id) ON DELETE SET NULL,
    price DECIMAL(15,2) DEFAULT 0, -- 保持兼容性，暂时保留
    
    -- 报价及结算信息
    reference_quote JSONB DEFAULT '{}'::jsonb, -- 存储不同类型的报价，如 { "unit": 100 } 或 { "hour": 100, "half_day": 400, "day": 800 }
    actual_cost JSONB DEFAULT '{}'::jsonb,     -- 存储不同类型的成本
    account_name TEXT,
    tax_id TEXT,
    bank_name TEXT,
    bank_account TEXT,
    
    -- 其他信息 (存储在 extended_data 中)
    -- 酒店：星级，房间数量
    -- 餐饮：菜系，是否可以清真
    -- 场地：面积，容纳人数，设备情况
    -- 老师：课程名称，授课语言
    -- 参访点：所属行业，是否有讲解，讲解语言，是否有授课，最高容纳人数，设备情况
    -- 大巴：乘客人数
    remarks TEXT,
    extended_data JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Projects Table
  CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    participants INTEGER NOT NULL DEFAULT 0,
    execution_days INTEGER NOT NULL DEFAULT 0,
    difficulties TEXT,
    income_with_tax DECIMAL(15,2) NOT NULL DEFAULT 0,
    estimated_cost DECIMAL(15,2) DEFAULT 0,
    tax_amount DECIMAL(15,2) DEFAULT 0,
    tax_rate DECIMAL(5,4) NOT NULL DEFAULT 0,
    income_without_tax DECIMAL(15,2) NOT NULL DEFAULT 0,
    bd_manager_id UUID REFERENCES users(id) ON DELETE SET NULL,
    quotation_id UUID REFERENCES quotations(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT '草稿',
    initial_approval_status TEXT,
    initial_approver_id UUID REFERENCES users(id) ON DELETE SET NULL,
    final_approval_status TEXT,
    final_approver_id UUID REFERENCES users(id) ON DELETE SET NULL,
    class_teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
    team_member_ids UUID[] DEFAULT '{}',
    itinerary JSONB DEFAULT '[]'::jsonb,
    hotel_arrangement JSONB DEFAULT '{"hotelId": "", "nights": 0, "peoplePerRoom": 2, "cost": 0}'::jsonb,
    client_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Project Itineraries V2 Table
  CREATE TABLE IF NOT EXISTS project_itineraries_v2 (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    day_index INTEGER NOT NULL,
    date DATE,
    morning JSONB DEFAULT '[]'::jsonb,
    afternoon JSONB DEFAULT '[]'::jsonb,
    noon JSONB DEFAULT '{"supplierId": "", "cost": 0}'::jsonb,
    evening JSONB DEFAULT '{"supplierId": "", "cost": 0}'::jsonb,
    "busDuration" TEXT DEFAULT 'full',
    "busCost" DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Project Financial Customers Table
  CREATE TABLE IF NOT EXISTS project_financial_customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    amount DECIMAL(15,2) NOT NULL,
    payment_date DATE,
    invoice_url TEXT,
    payment_voucher_url TEXT,
    payment_status TEXT DEFAULT '未收款' CHECK (payment_status IN ('未收款', '已收款')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Project Financial Suppliers Table
  CREATE TABLE IF NOT EXISTS project_financial_suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    amount DECIMAL(15,2) NOT NULL,
    actual_amount DECIMAL(15,2),
    payment_date DATE,
    payment_method TEXT,
    invoice_url TEXT,
    payment_voucher_url TEXT,
    payment_status TEXT DEFAULT '未付款' CHECK (payment_status IN ('未付款', '已申请', '已付款')),
    is_requested BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Project Reimbursements Table
  CREATE TABLE IF NOT EXISTS project_reimbursements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    description TEXT,
    amount DECIMAL(15,2) NOT NULL DEFAULT 0,
    invoice_url TEXT,
    status TEXT NOT NULL DEFAULT '待审核' CHECK (status IN ('草稿', '待审核', '待打款', '已打款', '驳回')),
    submission_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Contracts Table
  CREATE TABLE IF NOT EXISTS contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    contract_no TEXT NOT NULL,
    sign_date DATE,
    start_date DATE,
    end_date DATE,
    amount DECIMAL(15,2),
    payment_method TEXT,
    attachment_url TEXT,
    status TEXT NOT NULL DEFAULT '待审核' CHECK (status IN ('待审核', '已通过', '已驳回')),
    initial_review_status TEXT CHECK (initial_review_status IN ('通过', '驳回')),
    initial_reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    final_review_status TEXT CHECK (final_review_status IN ('通过', '驳回')),
    final_reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Quotations Table
  CREATE TABLE IF NOT EXISTS quotations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    client_name TEXT NOT NULL,
    client_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    quotation_number TEXT,
    participants INTEGER DEFAULT 0,
    days INTEGER DEFAULT 0,
    max_budget DECIMAL(15,2) DEFAULT 0,
    quoted_price_per_person DECIMAL(15,2) DEFAULT 0,
    quoted_total_price DECIMAL(15,2) DEFAULT 0,
    cost DECIMAL(15,2),
    profit DECIMAL(15,2),
    profit_margin DECIMAL(5,4),
    content TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Notifications Table
  CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL,
    link TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Project Checklists Table
  CREATE TABLE IF NOT EXISTS project_checklists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    item TEXT NOT NULL,
    status BOOLEAN DEFAULT FALSE,
    notes TEXT,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Project Gantt Manual Items Table
  CREATE TABLE IF NOT EXISTS project_gantt_manual_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    color TEXT DEFAULT 'amber',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Storage bucket for attachments
  INSERT INTO storage.buckets (id, name, public) 
  VALUES ('attachments', 'attachments', true)
  ON CONFLICT (id) DO NOTHING;

  -- Storage policies for attachments bucket
  CREATE POLICY "Public Access" 
  ON storage.objects FOR SELECT 
  USING (bucket_id = 'attachments');

  CREATE POLICY "Anyone can upload files" 
  ON storage.objects FOR INSERT 
  WITH CHECK (bucket_id = 'attachments');

  CREATE POLICY "Anyone can update files" 
  ON storage.objects FOR UPDATE 
  WITH CHECK (bucket_id = 'attachments');

  CREATE POLICY "Anyone can delete files" 
  ON storage.objects FOR DELETE 
  USING (bucket_id = 'attachments');

  -- Disable RLS for all tables (since we use custom auth)
  ALTER TABLE users DISABLE ROW LEVEL SECURITY;
  ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
  ALTER TABLE suppliers DISABLE ROW LEVEL SECURITY;
  ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
  ALTER TABLE project_itineraries_v2 DISABLE ROW LEVEL SECURITY;
  ALTER TABLE project_financial_customers DISABLE ROW LEVEL SECURITY;
  ALTER TABLE project_financial_suppliers DISABLE ROW LEVEL SECURITY;
  ALTER TABLE project_reimbursements DISABLE ROW LEVEL SECURITY;
  ALTER TABLE contracts DISABLE ROW LEVEL SECURITY;
  ALTER TABLE quotations DISABLE ROW LEVEL SECURITY;
  ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
  ALTER TABLE project_checklists DISABLE ROW LEVEL SECURITY;
  ALTER TABLE project_gantt_manual_items DISABLE ROW LEVEL SECURITY;
