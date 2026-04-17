import React, { useState, useEffect } from 'react';
import {
  Sparkles, MessageSquare, Loader2,
  BarChart3, PieChart as PieChartIcon,
  Users, Building2, Package,
  TrendingUp, TrendingDown, DollarSign,
  X
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { askDataAssistant } from '../lib/qwen';
import { useAppStore } from '../store';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function DataCenter() {
  const { user } = useAppStore();
  const isAccountManager = user?.role === '客户经理';
  const isOperationManager = user?.role === '运营经理';
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'project' | 'customer' | 'supplier' | 'employee'>('project');
  const [projectData, setProjectData] = useState<any[]>([]);
  const [projectStats, setProjectStats] = useState({
    totalProjects: 0,
    ongoingProjects: 0,
    completedProjects: 0,
  });
  const [projectFinancials, setProjectFinancials] = useState({
    totalAmount: 0,
    receivedAmount: 0,
    unreceivedAmount: 0,
    studentCount: 0,
  });
  const [customerProjectData, setCustomerProjectData] = useState<{name: string, value: number}[]>([]);
  const [customerRevenueData, setCustomerRevenueData] = useState<{name: string, value: number}[]>([]);
  const [customerData, setCustomerData] = useState<any[]>([]);
  const [supplierTypeData, setSupplierTypeData] = useState<{name: string, value: number}[]>([]);
  const [supplierProjectData, setSupplierProjectData] = useState<{name: string, value: number}[]>([]);
  const [supplierData, setSupplierData] = useState<any[]>([]);
  const [employeeProjectData, setEmployeeProjectData] = useState<{name: string, value: number}[]>([]);
  const [salesLeaderboard, setSalesLeaderboard] = useState<{name: string, value: number}[]>([]);
  const [employeeCommissionData, setEmployeeCommissionData] = useState<{name: string, value: number}[]>([]);
  const [employeeData, setEmployeeData] = useState<any[]>([]);
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [aiMessages, setAiMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      // 项目数据
      const { data: projects, error: projectError } = await supabase.from('projects').select('*');

      if (projectError) {
        console.error('Error fetching projects:', projectError);
      }

      const statusCounts: Record<string, number> = {};
      projects?.forEach(p => {
        statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
      });
      setProjectData(Object.entries(statusCounts).map(([name, value]) => ({ name, value })));

      setProjectStats({
        totalProjects: projects?.length || 0,
        ongoingProjects: projects?.filter(p => p.status === '执行中').length || 0,
        completedProjects: projects?.filter(p => p.status === '已完成').length || 0,
      });

      // 计算财务数据
      let totalAmount = 0;
      let receivedAmount = 0;
      let studentCount = 0;

      // 客户项目统计
      const customerProjects: Record<string, number> = {};
      const customerRevenue: Record<string, number> = {};

      if (projects && projects.length > 0) {
        for (const project of projects) {
          totalAmount += Number(project.income_with_tax || 0);

          const { data: payments } = await supabase
            .from('project_financial_customers')
            .select('amount, payment_status')
            .eq('project_id', project.id);

          const projectReceived = payments
            ?.filter(p => p.payment_status === '已收款')
            .reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;
          receivedAmount += projectReceived;

          studentCount += Number(project.participants) || 0;

          // 统计客户项目数和金额
          if (project.customer_id) {
            customerProjects[project.customer_id] = (customerProjects[project.customer_id] || 0) + 1;
            customerRevenue[project.customer_id] = (customerRevenue[project.customer_id] || 0) + Number(project.income_with_tax || 0);
          }
        }
      }

      setProjectFinancials({
        totalAmount,
        receivedAmount,
        unreceivedAmount: totalAmount - receivedAmount,
        studentCount,
      });

      // 获取客户名称并格式化图表数据
      const { data: customers } = await supabase.from('customers').select('*');
      setCustomerData(customers || []);

      // 格式化客户项目数图表数据
      const projectChartData = (customers || [])
        .filter(c => customerProjects[c.id])
        .map(c => ({
          name: c.name,
          value: customerProjects[c.id]
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);
      setCustomerProjectData(projectChartData);

      // 格式化客户金额图表数据
      const revenueChartData = (customers || [])
        .filter(c => customerRevenue[c.id])
        .map(c => ({
          name: c.name,
          value: customerRevenue[c.id]
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);
      setCustomerRevenueData(revenueChartData);

      // 供应商数据
      const { data: suppliers } = await supabase.from('suppliers').select('*');
      setSupplierData(suppliers || []);

      // 统计供应商类型数量
      const supplierTypeCounts: Record<string, number> = {};
      (suppliers || []).forEach(s => {
        const type = s.type || '未分类';
        supplierTypeCounts[type] = (supplierTypeCounts[type] || 0) + 1;
      });
      setSupplierTypeData(Object.entries(supplierTypeCounts).map(([name, value]) => ({ name, value })));

      // 统计供应商项目金额（从 project_financial_suppliers 表）
      const supplierRevenue: Record<string, number> = {};
      const { data: supplierPayments } = await supabase.from('project_financial_suppliers').select('supplier_id, actual_amount');
      supplierPayments?.forEach(p => {
        if (p.supplier_id) {
          supplierRevenue[p.supplier_id] = (supplierRevenue[p.supplier_id] || 0) + Number(p.actual_amount || 0);
        }
      });

      // 格式化供应商项目金额排行榜数据
      const supplierProjectChartData = (suppliers || [])
        .filter(s => supplierRevenue[s.id])
        .map(s => ({
          name: s.name,
          value: supplierRevenue[s.id]
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);
      setSupplierProjectData(supplierProjectChartData);

      // 人员数据
      const { data: users } = await supabase.from('users').select('*');
      setAllEmployees(users || []);

      const roleCounts: Record<string, number> = {};
      users?.forEach(u => {
        roleCounts[u.role] = (roleCounts[u.role] || 0) + 1;
      });
      setEmployeeData(Object.entries(roleCounts).map(([name, value]) => ({ name, value })));

      // 统计员工参与项目数（从 approved_project_itineraries 表的 morning/afternoon 活动中的 responsible_person_id）
      const { data: itineraries } = await supabase.from('approved_project_itineraries').select('project_id, morning, afternoon');
      const employeeProjectCounts: Record<string, Set<string>> = {};

      itineraries?.forEach(it => {
        const projectId = it.project_id;
        // 从 morning 活动中提取负责人
        if (it.morning && Array.isArray(it.morning)) {
          it.morning.forEach((act: any) => {
            if (act.responsible_person_id) {
              if (!employeeProjectCounts[act.responsible_person_id]) {
                employeeProjectCounts[act.responsible_person_id] = new Set();
              }
              employeeProjectCounts[act.responsible_person_id].add(projectId);
            }
          });
        }
        // 从 afternoon 活动中提取负责人
        if (it.afternoon && Array.isArray(it.afternoon)) {
          it.afternoon.forEach((act: any) => {
            if (act.responsible_person_id) {
              if (!employeeProjectCounts[act.responsible_person_id]) {
                employeeProjectCounts[act.responsible_person_id] = new Set();
              }
              employeeProjectCounts[act.responsible_person_id].add(projectId);
            }
          });
        }
      });

      // 格式化员工参与项目数排行榜
      const employeeProjectChartData = (users || [])
        .filter(u => employeeProjectCounts[u.id])
        .map(u => ({
          name: u.name,
          value: employeeProjectCounts[u.id].size
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);
      setEmployeeProjectData(employeeProjectChartData);

      // 统计项目经理销售排行榜（按项目金额）
      const { data: allProjects } = await supabase.from('projects').select('bd_manager_id, class_teacher_id, income_with_tax, service_commission_rate, product_commission_rate, id, status');
      const salesAmounts: Record<string, number> = {};

      // 统计员工提成（服务提成给项目经理，商品提成给班主任）
      const commissionAmounts: Record<string, number> = {};

      // 只处理已通过的项目（与财务管理 - 提成处理逻辑保持一致）
      const approvedProjects = (allProjects || []).filter(p => p.status === '已通过');

      for (const project of approvedProjects) {
        const bdManagerId = project.bd_manager_id;
        const classTeacherId = project.class_teacher_id;

        // 销售金额统计到项目经理
        if (bdManagerId) {
          salesAmounts[bdManagerId] = (salesAmounts[bdManagerId] || 0) + Number(project.income_with_tax || 0);
        }

        // 服务提成 = (收入 / 1.03) × 服务提成比例（服务税率默认 3%）- 给项目经理
        if (project.service_commission_rate && project.income_with_tax && bdManagerId) {
          const serviceIncomeWithoutTax = Number(project.income_with_tax) / 1.03;
          const serviceCommission = serviceIncomeWithoutTax * (Number(project.service_commission_rate) / 100);
          commissionAmounts[bdManagerId] = (commissionAmounts[bdManagerId] || 0) + serviceCommission;
        }

        // 商品提成（从 product_sales 表）- 给班主任
        if (classTeacherId) {
          const { data: productSales } = await supabase
            .from('product_sales')
            .select('total_amount')
            .eq('project_id', project.id);

          if (productSales && productSales.length > 0) {
            const productIncomeWithTax = productSales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
            const productIncomeWithoutTax = productIncomeWithTax / 1.13; // 商品默认 13% 税率
            const productCommission = productIncomeWithoutTax * (Number(project.product_commission_rate || 0) / 100);
            commissionAmounts[classTeacherId] = (commissionAmounts[classTeacherId] || 0) + productCommission;
          }
        }
      }

      // 格式化销售排行榜
      const salesLeaderboardData = (users || [])
        .filter(u => salesAmounts[u.id])
        .map(u => ({
          name: u.name,
          value: salesAmounts[u.id]
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);
      setSalesLeaderboard(salesLeaderboardData);

      // 格式化员工提成排行榜
      const employeeCommissionLeaderboardData = (users || [])
        .filter(u => commissionAmounts[u.id])
        .map(u => ({
          name: u.name,
          value: commissionAmounts[u.id]
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);
      setEmployeeCommissionData(employeeCommissionLeaderboardData);

    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!aiInput.trim() || isAiLoading) return;

    const userMessage = aiInput.trim();
    setAiInput('');
    setAiMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsAiLoading(true);

    console.log('[AI Debug] 当前用户:', user);

    try {
      // ============ 获取基础数据 ============
      // 1. 项目数据（包含收入、成本、提成信息）
      const { data: allProjects, error: projectsError } = await supabase.from('projects').select(`
        id, code, name, customer_id, client_name, participants, execution_days,
        income_with_tax, income_without_tax, estimated_cost,
        service_commission_rate, product_commission_rate,
        service_commission_paid, product_commission_paid,
        status, bd_manager_id, class_teacher_id, created_at
      `);

      if (projectsError) {
        console.error('[AI Debug] 项目查询错误:', projectsError);
      }
      console.log('[AI Debug] 项目原始数据:', allProjects);
      console.log('[AI Debug] 项目总数:', (allProjects || []).length);

      // 2. 项目执行数据（包含实际提成金额）
      const { data: projectExecutions } = await supabase
        .from('project_executions')
        .select('project_id, service_commission, product_commission');

      // 3. 客户列表
      const { data: customers } = await supabase.from('customers').select('id, name, code, customer_type');

      // 4. 供应商列表
      const { data: suppliers } = await supabase.from('suppliers').select('id, name, type');

      // 5. 员工列表
      const { data: users } = await supabase.from('users').select('id, name, role');

      // 6. 客户回款明细
      const { data: customerPayments } = await supabase
        .from('project_financial_customers')
        .select('project_id, customer_id, amount, payment_status');

      // 7. 供应商付款明细
      const { data: supplierPayments } = await supabase
        .from('project_financial_suppliers')
        .select('project_id, supplier_id, amount, actual_amount, payment_status');

      // 8. 报销数据
      const { data: reimbursements } = await supabase
        .from('project_reimbursements')
        .select('project_id, category, amount, status');

      console.log('[AI Debug] 回款数据:', customerPayments);
      console.log('[AI Debug] 项目关联客户情况:', (allProjects || []).filter(p => p.customer_id).length);

      // 7. 供应商付款明细
      const { data: supplierPayments } = await supabase
        .from('project_financial_suppliers')
        .select('project_id, supplier_id, amount, actual_amount, payment_status');

      // 8. 报销数据
      const { data: reimbursements } = await supabase
        .from('project_reimbursements')
        .select('project_id, category, amount, status');

      // ============ 构建映射 ============
      // 构建客户映射
      const customerMap = new Map();
      (customers || []).forEach(c => customerMap.set(c.id, c.name));

      // 构建供应商映射
      const supplierMap = new Map();
      (suppliers || []).forEach(s => supplierMap.set(s.id, s.name));

      // 构建员工映射
      const userMap = new Map();
      (users || []).forEach(u => userMap.set(u.id, u.name));

      // 构建项目执行映射（按项目 ID 聚合提成）
      const executionMap = new Map();
      (projectExecutions || []).forEach(e => {
        const existing = executionMap.get(e.project_id) || { service: 0, product: 0 };
        executionMap.set(e.project_id, {
          service: existing.service + Number(e.service_commission || 0),
          product: existing.product + Number(e.product_commission || 0),
        });
      });

      // ============ 统计数据 ============
      // 按客户统计
      const customerStats: Record<string, {
        projectCount: number;
        totalRevenue: number;
        totalCost: number;
        projects: string[];
        supplierCost: Record<string, number>;
      }> = {};

      // 按供应商统计
      const supplierStats: Record<string, {
        totalCost: number;
        totalActual: number;
        projectCount: number;
        projects: Record<string, number>;
        customers: Record<string, number>;
      }> = {};

      // 按员工统计（项目经理销售金额）- 所有状态都计入
      const salesStats: Record<string, number> = {};
      // 按员工统计（提成金额）
      const commissionStats: Record<string, { service: number; product: number }> = {};

      // 处理每个项目
      (allProjects || []).forEach(p => {
        const income = Number(p.income_with_tax || 0);
        const customerId = p.customer_id;

        // 客户统计（所有项目都计入）
        if (customerId) {
          if (!customerStats[customerId]) {
            customerStats[customerId] = { projectCount: 0, totalRevenue: 0, totalCost: 0, projects: [], supplierCost: {} };
          }
          customerStats[customerId].projectCount += 1;
          customerStats[customerId].totalRevenue += income;
          customerStats[customerId].projects.push(p.name);
        }

        // 销售统计（项目经理）- 只要有关联项目经理和收入就统计，不限制状态
        if (p.bd_manager_id && income > 0) {
          salesStats[p.bd_manager_id] = (salesStats[p.bd_manager_id] || 0) + income;
        }

        // 提成统计
        const exec = executionMap.get(p.id);
        if (exec) {
          // 服务提成给项目经理
          if (p.bd_manager_id && exec.service > 0) {
            if (!commissionStats[p.bd_manager_id]) {
              commissionStats[p.bd_manager_id] = { service: 0, product: 0 };
            }
            commissionStats[p.bd_manager_id].service += exec.service;
          }
          // 商品提成给班主任
          if (p.class_teacher_id && exec.product > 0) {
            if (!commissionStats[p.class_teacher_id]) {
              commissionStats[p.class_teacher_id] = { service: 0, product: 0 };
            }
            commissionStats[p.class_teacher_id].product += exec.product;
          }
        }
      });

      // 供应商付款统计
      (supplierPayments || []).forEach(p => {
        const actualAmount = Number(p.actual_amount || 0);
        const supplierId = p.supplier_id;
        const project = (allProjects || []).find(proj => proj.id === p.project_id);
        const customerId = project?.customer_id;

        if (supplierId) {
          if (!supplierStats[supplierId]) {
            supplierStats[supplierId] = { totalCost: 0, totalActual: 0, projectCount: 0, projects: {}, customers: {} };
          }
          supplierStats[supplierId].totalCost += Number(p.amount || 0);
          supplierStats[supplierId].totalActual += actualAmount;
          supplierStats[supplierId].projectCount += 1;

          // 按项目统计
          const projectName = project?.name || '未知项目';
          supplierStats[supplierId].projects[projectName] = (supplierStats[supplierId].projects[projectName] || 0) + actualAmount;

          // 按客户统计
          if (customerId) {
            supplierStats[supplierId].customers[customerId] = (supplierStats[supplierId].customers[customerId] || 0) + actualAmount;

            // 客户 - 供应商成本关联
            if (customerStats[customerId]) {
              customerStats[customerId].supplierCost[supplierId] = (customerStats[customerId].supplierCost[supplierId] || 0) + actualAmount;
              customerStats[customerId].totalCost += actualAmount;
            }
          }
        }
      });

      // 报销统计
      const reimbursementStats: Record<string, { total: number; byCategory: Record<string, number> }> = {};
      (reimbursements || []).forEach(r => {
        const project = (allProjects || []).find(p => p.id === r.project_id);
        const customerId = project?.customer_id;
        if (customerId) {
          if (!reimbursementStats[customerId]) {
            reimbursementStats[customerId] = { total: 0, byCategory: {} };
          }
          const amount = Number(r.amount || 0);
          reimbursementStats[customerId].total += amount;
          reimbursementStats[customerId].byCategory[r.category] = (reimbursementStats[customerId].byCategory[r.category] || 0) + amount;
        }
      });

      // 项目状态统计
      const statusStats: Record<string, number> = {};
      (allProjects || []).forEach(p => {
        statusStats[p.status] = (statusStats[p.status] || 0) + 1;
      });

      // ============ 计算回款数据 ============
      // 按客户统计已收款金额
      const customerReceivedMap = new Map();
      (customerPayments || []).forEach(p => {
        if (p.customer_id && p.payment_status === '已收款') {
          const current = customerReceivedMap.get(p.customer_id) || 0;
          customerReceivedMap.set(p.customer_id, current + Number(p.amount || 0));
        }
      });

      // 按客户统计应收金额（从项目收入）
      const customerReceivableMap = new Map();
      (allProjects || []).forEach(p => {
        if (p.customer_id) {
          const current = customerReceivableMap.get(p.customer_id) || 0;
          customerReceivableMap.set(p.customer_id, current + Number(p.income_with_tax || 0));
        }
      });

      const totalReceivable = Array.from(customerReceivableMap.values()).reduce((sum, val) => sum + val, 0);
      const totalReceived = Array.from(customerReceivedMap.values()).reduce((sum, val) => sum + val, 0);
      // 未回款 = 所有项目的应收金额 - 已收款（如果项目数为 0，则未回款也为 0）
      const totalUnreceived = (allProjects || []).length > 0 ? Math.max(0, totalReceivable - totalReceived) : 0;

      // ============ 构建上下文数据 ============
      const context = {
        // 总体摘要
        summary: {
          totalProjects: (allProjects || []).length,
          totalCustomers: (customers || []).length,
          totalSuppliers: (suppliers || []).length,
          totalEmployees: (users || []).length,
          totalRevenue: totalReceivable, // 使用应收金额作为总收入
          totalReceived: totalReceived,
          totalUnreceived: totalUnreceived,
          totalCost: Object.values(supplierStats).reduce((sum, s) => sum + s.totalActual, 0),
          totalParticipants: (allProjects || []).reduce((sum, p) => sum + Number(p.participants || 0), 0),
          totalCommission: Object.values(commissionStats).reduce((sum, c) => sum + c.service + c.product, 0),
        },
        // 项目状态分布
        projectStatus: statusStats,
        // 项目列表（精简版）
        projects: (allProjects || []).map(p => ({
          id: p.id,
          code: p.code,
          name: p.name,
          customer_name: customerMap.get(p.customer_id) || p.client_name || '未知客户',
          income: Number(p.income_with_tax || 0),
          participants: p.participants,
          status: p.status,
          bd_manager: userMap.get(p.bd_manager_id),
          class_teacher: userMap.get(p.class_teacher_id),
          commission: executionMap.get(p.id) || { service: 0, product: 0 },
        })),
        // 客户列表（含统计数据）
        customers: (customers || []).map(c => ({
          id: c.id,
          name: c.name,
          code: c.code,
          type: c.customer_type,
          projectCount: customerStats[c.id]?.projectCount || 0,
          totalRevenue: customerStats[c.id]?.totalRevenue || 0,
          totalCost: customerStats[c.id]?.totalCost || 0,
          profit: (customerStats[c.id]?.totalRevenue || 0) - (customerStats[c.id]?.totalCost || 0),
          supplierBreakdown: Object.entries(customerStats[c.id]?.supplierCost || {}).map(([supplierId, cost]) => ({
            supplier_name: supplierMap.get(supplierId) || '未知供应商',
            cost,
          })),
          reimbursements: reimbursementStats[c.id]?.total || 0,
          receivableAmount: customerReceivableMap.get(c.id) || 0, // 应收金额
          receivedAmount: customerReceivedMap.get(c.id) || 0, // 已收金额
          unreceivedAmount: Math.max(0, (customerReceivableMap.get(c.id) || 0) - (customerReceivedMap.get(c.id) || 0)), // 未收金额
        })),
        // 供应商列表（含统计数据）
        suppliers: (suppliers || []).map(s => ({
          id: s.id,
          name: s.name,
          type: s.type,
          totalActual: supplierStats[s.id]?.totalActual || 0,
          projectCount: supplierStats[s.id]?.projectCount || 0,
          customerBreakdown: Object.entries(supplierStats[s.id]?.customers || {}).map(([customerId, cost]) => ({
            customer_name: customerMap.get(customerId) || '未知客户',
            cost,
          })),
        })),
        // 员工列表（含销售和提成统计）
        employees: (users || []).map(u => ({
          id: u.id,
          name: u.name,
          role: u.role,
          salesAmount: salesStats[u.id] || 0,
          commission: commissionStats[u.id] || { service: 0, product: 0 },
        })),
        // 数据字典（帮助 AI 理解字段含义）
        dataDictionary: {
          income_with_tax: '项目含税收入',
          income_without_tax: '项目不含税收入',
          estimated_cost: '预估成本',
          service_commission_rate: '服务提成比例 (%)',
          product_commission_rate: '商品提成比例 (%)',
          service_commission: '服务提成金额',
          product_commission: '商品提成金额',
          actual_amount: '供应商实际结算金额',
        },
        // 计算说明
        calculationGuide: {
          '客户利润': '客户总收入 - 客户总成本（供应商结算 + 报销）',
          '供应商在某客户的成本占比': '供应商在该客户的成本 / 该客户所有供应商成本之和 * 100%',
          '项目利润率': '(项目收入 - 项目成本) / 项目收入 * 100%',
          '销售提成': '服务提成 = 项目不含税收入 × 服务提成比例；商品提成来自商品销售',
          '未回款金额': '所有项目的应收金额总和 - 已收款金额总和（如果项目数据为空则无法计算）',
          '客户未回款': '该客户的应收金额 - 该客户已收款金额',
        },
      };

      const answer = await askDataAssistant(userMessage, context);
      setAiMessages(prev => [...prev, { role: 'assistant', content: answer }]);
    } catch (err) {
      console.error('AI Error:', err);
      setAiMessages(prev => [...prev, { role: 'assistant', content: '抱歉，处理您的问题时出错了：' + (err as any).message }]);
    } finally {
      setIsAiLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const tabs = [
    { id: 'project' as const, label: '项目数据', icon: BarChart3, color: 'indigo' },
    { id: 'customer' as const, label: '客户数据', icon: Building2, color: 'emerald' },
    { id: 'supplier' as const, label: '供应商数据', icon: Package, color: 'amber' },
    ...((isAccountManager || isOperationManager) ? [] : [{ id: 'employee' as const, label: '人员数据', icon: Users, color: 'blue' }]),
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'project':
        return (
          <div className="space-y-6">
            {/* 第一行：项目统计 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 bg-indigo-50 rounded-lg">
                    <BarChart3 className="w-5 h-5 text-indigo-600" />
                  </div>
                  <span className="text-xs font-medium text-slate-400">项目总数</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {projectStats.totalProjects}
                </div>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 bg-emerald-50 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-emerald-600" />
                  </div>
                  <span className="text-xs font-medium text-slate-400">进行中项目</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {projectStats.ongoingProjects}
                </div>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 bg-amber-50 rounded-lg">
                    <TrendingDown className="w-5 h-5 text-amber-600" />
                  </div>
                  <span className="text-xs font-medium text-slate-400">执行结束项目</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {projectStats.completedProjects}
                </div>
              </div>
            </div>

            {/* 第二行：财务与学员数据 */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="font-medium text-slate-900 mb-6">项目财务与学员数据</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 p-4 rounded-xl border border-indigo-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-indigo-600">项目总金额</span>
                    <DollarSign className="w-4 h-4 text-indigo-500" />
                  </div>
                  <div className="text-xl font-bold text-indigo-900">¥{(projectFinancials.totalAmount / 10000).toFixed(1)}w</div>
                </div>
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 p-4 rounded-xl border border-emerald-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-emerald-600">已回款</span>
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="text-xl font-bold text-emerald-900">¥{(projectFinancials.receivedAmount / 10000).toFixed(1)}w</div>
                </div>
                <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-xl border border-orange-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-orange-600">未回款</span>
                    <TrendingDown className="w-4 h-4 text-orange-500" />
                  </div>
                  <div className="text-xl font-bold text-orange-900">¥{(projectFinancials.unreceivedAmount / 10000).toFixed(1)}w</div>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-xl border border-blue-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-blue-600">学员数量</span>
                    <Users className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="text-xl font-bold text-blue-900">{projectFinancials.studentCount}人</div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="font-medium text-slate-900 mb-6">项目状态分布</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={projectData}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={120}
                      paddingAngle={5}
                      dataKey="value"
                      label
                    >
                      {projectData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" height={36}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        );

      case 'customer':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 bg-emerald-50 rounded-lg">
                    <Building2 className="w-5 h-5 text-emerald-600" />
                  </div>
                  <span className="text-xs font-medium text-slate-400">客户总数</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">{customerData.length}</div>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className="text-xs font-medium text-slate-400">新增客户</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {customerData.filter(c => {
                    const createdDate = new Date(c.created_at);
                    const now = new Date();
                    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                    return createdDate >= firstDayOfMonth;
                  }).length}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 客户项目数柱状图 */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="font-medium text-slate-900 mb-6">客户项目数 Top 10</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={customerProjectData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={100} tick={{fontSize: 12, fill: '#64748b'}} />
                      <Tooltip />
                      <Bar dataKey="value" name="项目数" fill="#10b981" radius={[0, 4, 4, 0]} barSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 客户贡献金额饼图 */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="font-medium text-slate-900 mb-6">客户贡献金额 Top 10</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={customerRevenueData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                        label
                      >
                        {customerRevenueData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend verticalAlign="bottom" height={36}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        );

      case 'supplier':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 bg-amber-50 rounded-lg">
                    <Package className="w-5 h-5 text-amber-600" />
                  </div>
                  <span className="text-xs font-medium text-slate-400">供应商总数</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">{supplierData.length}</div>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 bg-emerald-50 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-emerald-600" />
                  </div>
                  <span className="text-xs font-medium text-slate-400">新增供应商</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {supplierData.filter(s => {
                    const createdDate = new Date(s.created_at);
                    const now = new Date();
                    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                    return createdDate >= firstDayOfMonth;
                  }).length}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 供应商类型柱状图 */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="font-medium text-slate-900 mb-6">供应商类型分布</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={supplierTypeData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="value" name="数量" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 供应商项目金额排行榜 */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="font-medium text-slate-900 mb-6">供应商项目金额 Top 10</h3>
                <div className="h-80 overflow-y-auto">
                  <div className="space-y-3">
                    {supplierProjectData.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-8">暂无数据</p>
                    ) : (
                      supplierProjectData.map((item, index) => (
                        <div key={item.name} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                          <div className="flex items-center space-x-3">
                            <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                              index === 0 ? 'bg-yellow-100 text-yellow-700' :
                              index === 1 ? 'bg-gray-100 text-gray-700' :
                              index === 2 ? 'bg-orange-100 text-orange-700' :
                              'bg-slate-200 text-slate-600'
                            }`}>
                              {index + 1}
                            </div>
                            <span className="text-sm font-medium text-slate-900">{item.name}</span>
                          </div>
                          <span className="text-sm font-bold text-amber-600">¥{(item.value / 10000).toFixed(1)}w</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'employee':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Users className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className="text-xs font-medium text-slate-400">员工总数</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {employeeData.reduce((sum, item) => sum + item.value, 0)}
                </div>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 bg-emerald-50 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-emerald-600" />
                  </div>
                  <span className="text-xs font-medium text-slate-400">新增员工数</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {allEmployees.filter(u => {
                    const createdDate = new Date(u.created_at);
                    const now = new Date();
                    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                    return createdDate >= firstDayOfMonth;
                  }).length}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 销售排行榜领奖台（前三名） */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="font-medium text-slate-900 mb-6">销售排行榜</h3>
                <div className="h-80">
                  {salesLeaderboard.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">暂无数据</p>
                  ) : (
                    <div className="flex items-end justify-center space-x-4 h-full">
                      {/* 第二名 */}
                      <div className="flex flex-col items-center">
                        <div className="text-sm font-medium text-slate-700 mb-2 truncate w-24 text-center">
                          {salesLeaderboard[1]?.name || '-'}
                        </div>
                        <div className="w-20 bg-gradient-to-t from-gray-300 to-gray-200 rounded-t-lg flex items-end justify-center pb-2 transition-all"
                          style={{ height: `${salesLeaderboard[1] ? (salesLeaderboard[1].value / salesLeaderboard[0].value) * 200 : 80}px` }}>
                          <span className="text-xs font-bold text-gray-700 mb-1">¥{(salesLeaderboard[1]?.value / 10000).toFixed(1)}w</span>
                        </div>
                        <div className="mt-2 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-700">2</div>
                      </div>

                      {/* 第一名 */}
                      <div className="flex flex-col items-center">
                        <div className="text-sm font-medium text-slate-700 mb-2 truncate w-24 text-center">
                          {salesLeaderboard[0]?.name || '-'}
                        </div>
                        <div className="w-24 bg-gradient-to-t from-yellow-400 to-yellow-300 rounded-t-lg flex items-end justify-center pb-2 transition-all"
                          style={{ height: '240px' }}>
                          <span className="text-xs font-bold text-yellow-800 mb-1">¥{(salesLeaderboard[0]?.value / 10000).toFixed(1)}w</span>
                        </div>
                        <div className="mt-2 w-10 h-10 rounded-full bg-yellow-400 flex items-center justify-center text-base font-bold text-yellow-900 shadow-lg">1</div>
                      </div>

                      {/* 第三名 */}
                      <div className="flex flex-col items-center">
                        <div className="text-sm font-medium text-slate-700 mb-2 truncate w-24 text-center">
                          {salesLeaderboard[2]?.name || '-'}
                        </div>
                        <div className="w-16 bg-gradient-to-t from-orange-300 to-orange-200 rounded-t-lg flex items-end justify-center pb-2 transition-all"
                          style={{ height: `${salesLeaderboard[2] ? (salesLeaderboard[2].value / salesLeaderboard[0].value) * 200 : 120}px` }}>
                          <span className="text-xs font-bold text-orange-700 mb-1">¥{(salesLeaderboard[2]?.value / 10000).toFixed(1)}w</span>
                        </div>
                        <div className="mt-2 w-7 h-7 rounded-full bg-orange-300 flex items-center justify-center text-xs font-bold text-orange-800">3</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 员工提成排行榜 */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="font-medium text-slate-900 mb-6">员工提成排行榜 Top 10</h3>
                <div className="h-80 overflow-y-auto">
                  <div className="space-y-3">
                    {employeeCommissionData.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-8">暂无数据</p>
                    ) : (
                      employeeCommissionData.map((item, index) => (
                        <div key={item.name} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                          <div className="flex items-center space-x-3">
                            <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                              index === 0 ? 'bg-yellow-100 text-yellow-700' :
                              index === 1 ? 'bg-gray-100 text-gray-700' :
                              index === 2 ? 'bg-orange-100 text-orange-700' :
                              'bg-slate-200 text-slate-600'
                            }`}>
                              {index + 1}
                            </div>
                            <span className="text-sm font-medium text-slate-900">{item.name}</span>
                          </div>
                          <span className="text-sm font-bold text-emerald-600">¥{item.value.toFixed(2)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">数据中心</h1>
          <p className="text-sm text-slate-500 mt-1">项目、客户、供应商与人员数据全景概览。</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? `bg-${tab.color}-100 text-${tab.color}-700`
                : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? `text-${tab.color}-600` : ''}`} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="min-h-[400px]">
        {renderContent()}
      </div>

      {!isAccountManager && !isOperationManager && (
        <>
          {/* AI Assistant Floating Button */}
          <div className="fixed bottom-6 right-6 z-40">
            <button
              onClick={() => setShowAiPanel(!showAiPanel)}
              className="relative flex items-center justify-center w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200"
            >
              {showAiPanel ? (
                <X className="w-6 h-6 text-white" />
              ) : (
                <Sparkles className="w-6 h-6 text-white" />
              )}
              {aiMessages.length > 0 && !showAiPanel && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
              )}
            </button>
          </div>

          {/* AI Assistant Panel */}
          {showAiPanel && (
            <div className="fixed bottom-24 right-6 z-40 w-96 bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-5 h-5 text-indigo-400" />
                  <h3 className="font-medium text-white">AI 数据助手</h3>
                </div>
                <button
                  onClick={() => setShowAiPanel(false)}
                  className="p-1 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="h-80 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {aiMessages.length === 0 && (
                  <div className="bg-slate-800 rounded-lg p-3 text-sm text-slate-300">
                    你好！我是你的 AI 数据助手。
                    <ul className="list-disc list-inside mt-2 space-y-1 text-xs text-slate-400">
                      <li>项目数据统计与分析</li>
                      <li>客户与供应商信息查询</li>
                    </ul>
                    你可以问我任何问题。
                  </div>
                )}
                {aiMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-lg text-sm ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white ml-4'
                        : 'bg-slate-800 text-slate-300 mr-4'
                    }`}
                  >
                    {msg.content}
                  </div>
                ))}
                {isAiLoading && (
                  <div className="bg-slate-800 rounded-lg p-3 text-sm text-slate-300 mr-4 flex items-center space-x-2">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                    <span>思考中...</span>
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-slate-800">
                <div className="relative">
                  <input
                    type="text"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="输入你的问题..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 pl-3 pr-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={isAiLoading}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-indigo-400 disabled:opacity-50"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {['项目总数', '客户分布', '供应商状态'].map(tag => (
                    <button
                      key={tag}
                      onClick={() => setAiInput(tag)}
                      className="text-[10px] bg-slate-800 text-slate-400 px-2 py-1 rounded hover:bg-slate-700 hover:text-white transition-colors"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
