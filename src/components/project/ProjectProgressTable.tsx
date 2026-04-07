import React, { useState, useEffect, useRef } from 'react';
import {
  Search, Filter, ChevronDown, ChevronUp, Eye, X, Download,
  Loader2, AlertCircle, CheckCircle, Clock, XCircle, MinusCircle,
  Edit2, Save, TrendingUp, Users, DollarSign, FileText,
  Calendar, Plus, Trash2, Bus, User, MapPin, Building, Package,
  Hotel, Utensils, Plane, Clock as ClockIcon
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store';
import { format, addDays, subDays, parseISO, isSameDay, eachDayOfInterval } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface Project {
  id: string;
  code: string;
  name: string;
  start_date?: string;
  end_date?: string;
  status: '未开始' | '执行中' | '已完成' | '延迟' | '取消';
  income_with_tax?: number;
  bd_manager_id?: string; // 项目经理 ID
  class_teacher_id?: string;
  team_member_ids?: string[];
  created_at: string;
  updated_at: string;
  // 扩展字段（存储在 project_executions 表）
  execution?: ProjectExecution;
  // 关联数据
  project_manager?: { name: string }; // 项目经理
  class_teacher?: { name: string };
  team_members?: { name: string }[];
}

interface ItineraryDay {
  id: string;
  day_index: number;
  date: string;
  morning: any[];
  afternoon: any[];
  noon?: any;
  evening?: any;
  bus_id?: string;
  bus_duration?: string;
  bus_hours?: number;
  bus_cost?: number;
  bus_actual_cost?: number;
}

interface ManualGanttItem {
  id: string;
  item_name: string;
  start_time: string;
  end_time: string;
  color: string;
  responsible_person_id?: string | null;
}

interface ProjectExecution {
  id: string;
  project_id: string;
  has_brain_exhibition?: boolean; // 含强脑展厅
  participant_count?: number; // 人数
  is_invoiced?: boolean; // 是否开票
  product_sales?: number; // 产品销售额
  service_commission?: number; // 服务提成
  product_commission?: number; // 商品提成
  remarks?: string; // 备注
  payment_status?: '已回款' | '部分回款' | '未回款';
  updated_at: string;
}

type SortDirection = 'asc' | 'desc' | null;

interface SortConfig {
  key: keyof Project | keyof ProjectExecution;
  direction: SortDirection;
}

const TABLE_COLUMNS = [
  { key: 'code', label: '项目编码', width: 100, fixed: true },
  { key: 'name', label: '项目名称', width: 200, fixed: true },
  { key: 'project_manager_name', label: '项目经理', width: 100, fixed: false },
  { key: 'class_teacher_name', label: '班主任', width: 100, fixed: false },
  { key: 'start_date', label: '开始日期', width: 100, fixed: false },
  { key: 'end_date', label: '结束日期', width: 100, fixed: false },
  { key: 'status', label: '状态', width: 90, fixed: false },
  { key: 'income_with_tax', label: '项目金额', width: 110, fixed: false },
  { key: 'payment_status', label: '回款状态', width: 90, fixed: false },
  { key: 'has_brain_exhibition', label: '含强脑展厅', width: 100, fixed: false },
  { key: 'participant_count', label: '人数', width: 70, fixed: false },
  { key: 'team_members_name', label: '项目组人员', width: 150, fixed: false },
  { key: 'is_invoiced', label: '是否开票', width: 90, fixed: false },
  { key: 'product_sales', label: '产品销售额', width: 110, fixed: false },
  { key: 'service_commission', label: '服务提成', width: 100, fixed: false },
  { key: 'product_commission', label: '商品提成', width: 100, fixed: false },
  { key: 'remarks', label: '备注', width: 200, fixed: false },
];

const STATUS_COLORS = {
  '未开始': 'bg-slate-100 text-slate-700',
  '执行中': 'bg-blue-100 text-blue-700',
  '已完成': 'bg-emerald-100 text-emerald-700',
  '延迟': 'bg-red-100 text-red-700',
  '取消': 'bg-slate-200 text-slate-500',
};

const PAYMENT_STATUS_COLORS = {
  '已回款': 'bg-emerald-100 text-emerald-700',
  '部分回款': 'bg-amber-100 text-amber-700',
  '未回款': 'bg-slate-100 text-slate-600',
};

export default function ProjectProgressTable() {
  const { user } = useAppStore();
  const isAccountManager = user?.role === '客户经理';
  const isOperationManager = user?.role === '运营经理';

  const [projects, setProjects] = useState<(Project & {
    customer_manager_name?: string;
    class_teacher_name?: string;
    team_members_name?: string;
    has_brain_exhibition?: boolean;
    participant_count?: number;
    is_invoiced?: boolean;
    product_sales?: number;
    service_commission?: number;
    product_commission?: number;
    remarks?: string;
    payment_status?: '已回款' | '部分回款' | '未回款';
  })[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('');
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [editingCell, setEditingCell] = useState<{ id: string; key: string } | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    isAccountManager || isOperationManager
      ? TABLE_COLUMNS.filter(c => c.key !== 'service_commission' && c.key !== 'product_commission').map(c => c.key)
      : TABLE_COLUMNS.map(c => c.key)
  );
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [itineraryData, setItineraryData] = useState<Record<string, { itineraries: ItineraryDay[]; manualItems: ManualGanttItem[]; suppliers: any[] }>>({});
  const [loadingItinerary, setLoadingItinerary] = useState<Set<string>>(new Set());
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 获取项目数据
  const fetchData = async () => {
    try {
      setLoading(true);
      console.log('=== ProjectProgressTable: 开始获取数据 ===');

      // 获取所有未完成的项目（先不关联查询，避免字段不存在导致错误）
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('*')
        .neq('status', '已完成')
        .order('created_at', { ascending: false });

      console.log('Projects 查询结果:', { count: projectsData?.length, projectsError });

      if (projectsError) {
        console.error('查询项目失败:', projectsError);
        throw projectsError;
      }

      if (!projectsData || projectsData.length === 0) {
        console.log('暂无未完成的项目');
        setProjects([]);
        setLoading(false);
        return;
      }

      // 获取关联数据（单独查询）
      const projectIds = projectsData.map(p => p.id);

      // 1. 查询项目经理、班主任和项目组成员
      const userIds = new Set<string>();
      projectsData.forEach(p => {
        if (p.bd_manager_id) userIds.add(p.bd_manager_id);
        if (p.class_teacher_id) userIds.add(p.class_teacher_id);
        if (p.team_member_ids) p.team_member_ids.forEach((id: string) => userIds.add(id));
      });

      let usersData: any[] = [];
      if (userIds.size > 0) {
        const { data } = await supabase.from('users').select('id, name').in('id', Array.from(userIds));
        usersData = data || [];
        setAllUsers(data || []);
      }

      // 2. 查询行程日期
      let itinerariesData: any[] = [];
      if (projectIds.length > 0) {
        const { data: itinData, error: itinError } = await supabase
          .from('approved_project_itineraries')
          .select('project_id, date')
          .in('project_id', projectIds);

        console.log('行程查询结果:', { count: itinData?.length, itinError });
        itinerariesData = itinData || [];
      }

      // 按项目分组计算开始和结束日期
      const dateRanges: Record<string, { start_date?: string; end_date?: string }> = {};
      itinerariesData.forEach(itin => {
        if (!dateRanges[itin.project_id]) {
          dateRanges[itin.project_id] = {};
        }
        if (!dateRanges[itin.project_id].start_date || itin.date < dateRanges[itin.project_id].start_date) {
          dateRanges[itin.project_id].start_date = itin.date;
        }
        if (!dateRanges[itin.project_id].end_date || itin.date > dateRanges[itin.project_id].end_date) {
          dateRanges[itin.project_id].end_date = itin.date;
        }
      });

      // 获取执行数据
      let executionsData: any[] = [];
      if (projectIds.length > 0) {
        const { data: execData } = await supabase
          .from('project_executions')
          .select('*')
          .in('project_id', projectIds);
        executionsData = execData || [];
      }

      // 获取已收款金额
      let financialCustomersData: any[] = [];
      if (projectIds.length > 0) {
        const { data: finData } = await supabase
          .from('project_financial_customers')
          .select('project_id, amount, invoice_url')
          .in('project_id', projectIds);
        financialCustomersData = finData || [];
      }

      // 获取商品销售额
      let productSalesData: any[] = [];
      if (projectIds.length > 0) {
        const { data: salesData } = await supabase
          .from('product_sales')
          .select('project_id, total_amount')
          .in('project_id', projectIds);
        productSalesData = salesData || [];
      }

      // 合并数据
      const mergedData = (projectsData || []).map(project => {
        const execution = executionsData.find(e => e.project_id === project.id);
        const dateRange = dateRanges[project.id] || {};

        // 计算已收款总额
        const projectFinancials = financialCustomersData.filter(f => f.project_id === project.id);
        const totalReceived = projectFinancials.reduce((sum, f) => sum + Number(f.amount || 0), 0);
        const hasInvoice = projectFinancials.some(f => f.invoice_url);

        // 计算商品销售总额
        const projectSales = productSalesData.filter(s => s.project_id === project.id);
        const totalProductSales = projectSales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);

        // 计算回款状态
        const projectAmount = Number(project.income_with_tax || 0);
        let paymentStatus: '已回款' | '部分回款' | '未回款' = '未回款';
        if (totalReceived >= projectAmount && projectAmount > 0) {
          paymentStatus = '已回款';
        } else if (totalReceived > 0) {
          paymentStatus = '部分回款';
        }

        // 计算服务提成
        const serviceCommissionRate = Number(project.service_commission_rate || 0);
        const incomeWithoutTax = Number(project.income_without_tax || 0);
        const serviceCommission = Number((incomeWithoutTax * (serviceCommissionRate / 100)).toFixed(2));

        // 计算商品提成（从 product_sales 表）
        let productCommission = 0;
        if (projectSales.length > 0) {
          const productIncomeWithTax = projectSales.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);
          const productIncomeWithoutTax = productIncomeWithTax / (1 + 0.13); // 商品默认 13% 税率
          productCommission = Number((productIncomeWithoutTax * (Number(project.product_commission_rate || 0) / 100)).toFixed(2));
        }

        // 获取关联用户名称
        const projectManager = usersData.find(u => u.id === project.bd_manager_id);
        const classTeacher = usersData.find(u => u.id === project.class_teacher_id);
        const teamMembers = usersData.filter(u => project.team_member_ids?.includes(u.id));

        return {
          ...project,
          start_date: dateRange.start_date,
          end_date: dateRange.end_date,
          project_manager_name: projectManager?.name || '-',
          class_teacher_name: classTeacher?.name || '-',
          team_members_name: teamMembers.map(m => m.name).join('、') || '-',
          has_brain_exhibition: execution?.has_brain_exhibition || false,
          participant_count: execution?.participant_count || project.participants || 0,
          is_invoiced: hasInvoice,
          product_sales: execution?.product_sales || totalProductSales,
          service_commission: execution?.service_commission || serviceCommission,
          product_commission: productCommission,
          remarks: execution?.remarks || '',
          payment_status: execution?.payment_status || paymentStatus,
        };
      });

      console.log('合并后的数据:', { count: mergedData.length });
      setProjects(mergedData);
    } catch (err) {
      console.error('Error fetching projects:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // 切换页码时收起展开的项目
  useEffect(() => {
    setExpandedProjectId(null);
  }, [currentPage, pageSize]);

  // 获取项目执行详情
  const fetchExecutionData = async (projectId: string) => {
    if (itineraryData[projectId]) return; // 已加载过

    setLoadingItinerary(prev => new Set(prev).add(projectId));
    try {
      const project = projects.find(p => p.id === projectId);
      const [itineraryRes, manualRes, suppliersRes] = await Promise.all([
        supabase.from('approved_project_itineraries').select('*').eq('project_id', projectId).order('day_index', { ascending: true }),
        supabase.from('project_gantt_manual_items').select('*').eq('project_id', projectId).order('start_time', { ascending: true }),
        supabase.from('suppliers').select('id, name, type'),
      ]);

      const itineraries: ItineraryDay[] = (itineraryRes.data || []).map((item: any) => ({
        id: item.id,
        day_index: item.day_index,
        date: item.date || '',
        morning: item.morning || [],
        afternoon: item.afternoon || [],
        noon: item.noon || { supplierId: '', cost: 0, actualCost: 0 },
        evening: item.evening || { supplierId: '', cost: 0, actualCost: 0 },
        bus_id: item.bus_id,
        bus_duration: item.bus_duration,
        bus_hours: item.bus_hours,
        bus_cost: item.bus_cost,
        bus_actual_cost: item.bus_actual_cost,
      }));

      const manualItems: ManualGanttItem[] = manualRes.data || [];
      const suppliers: any[] = suppliersRes.data || [];

      setItineraryData(prev => ({
        ...prev,
        [projectId]: { itineraries, manualItems, suppliers },
      }));
    } catch (err) {
      console.error('Error fetching execution data:', err);
    } finally {
      setLoadingItinerary(prev => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    }
  };

  const toggleExpand = async (project: any) => {
    if (expandedProjectId === project.id) {
      setExpandedProjectId(null);
    } else {
      setExpandedProjectId(project.id);
      await fetchExecutionData(project.id);
    }
  };

  // 筛选和排序
  const filteredAndSortedData = () => {
    let result = [...projects];

    // 搜索筛选
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(p =>
        p.code.toLowerCase().includes(term) ||
        p.name.toLowerCase().includes(term) ||
        p.customer_manager_name?.toLowerCase().includes(term) ||
        p.class_teacher_name?.toLowerCase().includes(term)
      );
    }

    // 状态筛选
    if (statusFilter) {
      result = result.filter(p => {
        // 根据日期计算状态
        const now = new Date();
        const startDate = p.start_date ? new Date(p.start_date) : null;
        const endDate = p.end_date ? new Date(p.end_date) : null;

        let computedStatus = p.status;
        if (startDate && endDate) {
          if (now < startDate) computedStatus = '未开始';
          else if (now > endDate) computedStatus = '已结束';
          else computedStatus = '执行中';
        }

        if (statusFilter === '未开始') return computedStatus === '未开始';
        if (statusFilter === '执行中') return computedStatus === '执行中';
        if (statusFilter === '已结束') return computedStatus === '已结束' || p.status === '已完成';
        if (statusFilter === '延迟') return computedStatus === '延迟';
        if (statusFilter === '取消') return p.status === '取消';
        return true;
      });
    }

    // 回款状态筛选
    if (paymentStatusFilter) {
      result = result.filter(p => p.payment_status === paymentStatusFilter);
    }

    // 排序
    if (sortConfig) {
      result.sort((a, b) => {
        const aValue = a[sortConfig.key as keyof typeof a];
        const bValue = b[sortConfig.key as keyof typeof b];

        if (aValue === undefined || aValue === null) return 1;
        if (bValue === undefined || bValue === null) return -1;

        let compareResult = 0;
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          compareResult = aValue.localeCompare(bValue, 'zh-CN');
        } else if (typeof aValue === 'number' && typeof bValue === 'number') {
          compareResult = aValue - bValue;
        }

        return sortConfig.direction === 'asc' ? compareResult : -compareResult;
      });
    }

    return result;
  };

  // 分页数据
  const getTotalPages = () => {
    const filtered = filteredAndSortedData();
    return Math.ceil(filtered.length / pageSize);
  };

  const getPaginatedData = () => {
    const filtered = filteredAndSortedData();
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return filtered.slice(start, end);
  };

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, getTotalPages())));
  };

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (prev?.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        if (prev.direction === 'desc') return null;
      }
      return { key, direction: 'asc' };
    });
  };

  // 更新备注
  const updateRemarks = async (projectId: string, remarks: string) => {
    try {
      const { error } = await supabase
        .from('project_executions')
        .upsert({
          project_id: projectId,
          remarks,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'project_id' });

      if (error) throw error;
      fetchData();
    } catch (err) {
      console.error('Error updating remarks:', err);
      alert('保存失败');
    }
  };

  // 处理单元格编辑
  const handleCellEdit = (project: any, key: string) => {
    setEditingCell({ id: project.id, key });
    setEditingValue(project[key]?.toString() || '');
  };

  const saveCellEdit = async () => {
    if (!editingCell) return;

    if (editingCell.key === 'remarks') {
      await updateRemarks(editingCell.id, editingValue);
    }

    setEditingCell(null);
    fetchData();
  };

  const visibleColumnsData = TABLE_COLUMNS.filter(col => visibleColumns.includes(col.key));
  const fixedColumns = visibleColumnsData.filter(col => col.fixed);
  const scrollableColumns = visibleColumnsData.filter(col => !col.fixed);
  const filteredData = getPaginatedData();
  const totalPages = getTotalPages();

  // 导出 Excel
  const handleExport = () => {
    const headers = visibleColumnsData.map(c => c.label).join('\t');
    const rows = filteredData.map(p =>
      visibleColumnsData.map(c => {
        const value = p[c.key as keyof typeof p];
        if (typeof value === 'boolean') return value ? '是' : '否';
        if (typeof value === 'number') return value.toLocaleString();
        return value || '-';
      }).join('\t')
    ).join('\n');

    const content = headers + '\n' + rows;
    const blob = new Blob([content], { type: 'text/tab-separated-values' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `项目进度表_${new Date().toLocaleDateString('zh-CN')}.tsv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
        <div>
          <h3 className="font-medium text-slate-900">项目进度看板</h3>
          <p className="text-sm text-slate-500 mt-1">
            显示 {filteredData.length} 个项目（共 {filteredAndSortedData().length} 条，总计 {projects.length} 个）
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsColumnModalOpen(true)}
            className="flex items-center px-3 py-1.5 text-sm border border-slate-300 rounded-md hover:bg-slate-50"
          >
            <Filter className="w-4 h-4 mr-1.5" />
            自定义列
          </button>
          <button
            onClick={handleExport}
            className="flex items-center px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            <Download className="w-4 h-4 mr-1.5" />
            导出
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索项目编码、名称、负责人..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64 pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="">全部状态</option>
          <option value="未开始">未开始</option>
          <option value="执行中">执行中</option>
          <option value="已结束">已结束</option>
          <option value="延迟">延迟</option>
          <option value="取消">取消</option>
        </select>

        <select
          value={paymentStatusFilter}
          onChange={(e) => setPaymentStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="">全部回款状态</option>
          <option value="已回款">已回款</option>
          <option value="部分回款">部分回款</option>
          <option value="未回款">未回款</option>
        </select>

        {(searchTerm || statusFilter || paymentStatusFilter) && (
          <button
            onClick={() => {
              setSearchTerm('');
              setStatusFilter('');
              setPaymentStatusFilter('');
            }}
            className="flex items-center px-2 py-1.5 text-sm text-slate-500 hover:text-slate-700"
          >
            <X className="w-4 h-4 mr-1" />
            清除筛选
          </button>
        )}
      </div>

      {/* Table */}
      <div ref={scrollContainerRef} className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200 sticky top-0 z-10">
            <tr>
              {/* 展开按钮列头 */}
              <th className="px-4 py-3 text-left whitespace-nowrap border-r border-slate-200 bg-slate-50 sticky left-0 z-10" style={{ width: 40, minWidth: 40 }}></th>
              {fixedColumns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="px-4 py-3 text-left whitespace-nowrap cursor-pointer hover:bg-slate-100 border-r border-slate-200 bg-slate-50 sticky left-0 z-10"
                  style={{
                    width: col.width,
                    minWidth: col.width,
                  }}
                >
                  <div className="flex items-center space-x-1">
                    <span>{col.label}</span>
                    {sortConfig?.key === col.key && (
                      sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                    )}
                  </div>
                </th>
              ))}
              {scrollableColumns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="px-4 py-3 text-left whitespace-nowrap cursor-pointer hover:bg-slate-100 border-r border-slate-100"
                  style={{ width: col.width, minWidth: col.width }}
                >
                  <div className="flex items-center space-x-1">
                    <span>{col.label}</span>
                    {sortConfig?.key === col.key && (
                      sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredData.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumnsData.length + 1}
                  className="px-6 py-12 text-center text-slate-400"
                >
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  暂无项目数据
                </td>
              </tr>
            ) : (
              filteredData.map((project) => (
                <React.Fragment key={project.id}>
                  <tr className="hover:bg-slate-50">
                    {/* 展开按钮列 - 固定在项目名称后 */}
                    <td className="px-4 py-3 whitespace-nowrap border-r border-slate-200 bg-white sticky left-0 z-10" style={{ width: 40, minWidth: 40 }}>
                      <button
                        onClick={() => toggleExpand(project)}
                        className="p-1 hover:bg-slate-200 rounded transition-colors"
                      >
                        <ChevronDown
                          className={`w-4 h-4 text-slate-500 transition-transform ${
                            expandedProjectId === project.id ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                    </td>
                    {fixedColumns.map((col) => (
                      <td
                        key={col.key}
                        className="px-4 py-3 whitespace-nowrap border-r border-slate-200 bg-white sticky left-0 z-10"
                        style={{
                          width: col.width,
                          minWidth: col.width,
                        }}
                      >
                        {renderCellContent(project, col.key, col)}
                      </td>
                    ))}
                    {scrollableColumns.map((col) => (
                      <td
                        key={col.key}
                        className="px-4 py-3 whitespace-nowrap border-r border-slate-100"
                        style={{ width: col.width, minWidth: col.width }}
                      >
                        {renderCellContent(project, col.key, col)}
                      </td>
                    ))}
                  </tr>
                  {/* 展开行 - 执行看板 */}
                  {expandedProjectId === project.id && (
                    <tr>
                      <td colSpan={100} className="bg-slate-50 p-0">
                        <div className="p-6">
                          {loadingItinerary.has(project.id) ? (
                            <div className="flex items-center justify-center py-12">
                              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                            </div>
                          ) : (
                            <ExecutionKanban
                              project={project}
                              itineraryData={itineraryData[project.id]}
                              users={allUsers}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 分页控件 */}
      <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span>每页显示</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="px-3 py-1.5 border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value={10}>10 条</option>
            <option value={20}>20 条</option>
            <option value={50}>50 条</option>
          </select>
          <span>
            共 {filteredAndSortedData().length} 条，第 {currentPage}/{totalPages} 页
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => goToPage(1)}
            disabled={currentPage === 1}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            首页
          </button>
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            上一页
          </button>
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            下一页
          </button>
          <button
            onClick={() => goToPage(totalPages)}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            末页
          </button>
        </div>
      </div>

      {/* Column Selector Modal */}
      {isColumnModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-medium text-slate-900">自定义显示列</h3>
              <button onClick={() => setIsColumnModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {TABLE_COLUMNS.map((col) => {
                const isCommissionColumn = col.key === 'service_commission' || col.key === 'product_commission';
                const isDisabled = (isAccountManager || isOperationManager) && isCommissionColumn;
                const isChecked = visibleColumns.includes(col.key);

                return (
                  <label
                    key={col.key}
                    className={`flex items-center space-x-3 p-2 rounded ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50 cursor-pointer'}`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isDisabled}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setVisibleColumns([...visibleColumns, col.key]);
                        } else {
                          setVisibleColumns(visibleColumns.filter(k => k !== col.key));
                        }
                      }}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                    />
                    <span className={`text-sm ${isDisabled ? 'text-slate-400' : 'text-slate-700'}`}>{col.label}</span>
                    {col.fixed && <span className="text-xs text-slate-400">(固定)</span>}
                  </label>
                );
              })}
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={() => setIsColumnModalOpen(false)}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // 渲染单元格内容
  function renderCellContent(project: any, key: string, col: any) {
    const value = project[key];

    // 编辑模式
    if (editingCell?.id === project.id && editingCell?.key === key) {
      return (
        <div className="flex items-center space-x-1">
          <input
            type={typeof value === 'number' ? 'number' : 'text'}
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            onBlur={saveCellEdit}
            onKeyDown={(e) => e.key === 'Enter' && saveCellEdit()}
            className="w-full px-2 py-1 border border-indigo-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500"
            autoFocus
          />
          <button onClick={saveCellEdit} className="text-emerald-600 hover:text-emerald-800">
            <Save className="w-4 h-4" />
          </button>
        </div>
      );
    }

    // 根据字段类型渲染
    switch (key) {
      case 'code':
        return <span className="font-mono text-slate-600">{value || '-'}</span>;

      case 'name':
        return <span className="font-medium text-slate-900 truncate max-w-[180px] block" title={value}>{value || '-'}</span>;

      case 'status':
        // 根据日期计算实际状态
        let computedStatus = value;
        const now = new Date();
        const startDate = project.start_date ? new Date(project.start_date) : null;
        const endDate = project.end_date ? new Date(project.end_date) : null;

        if (startDate && endDate) {
          if (now < startDate) computedStatus = '未开始';
          else if (now > endDate && value !== '已完成') computedStatus = '已结束';
          else if (now >= startDate && now <= endDate) computedStatus = '执行中';
        }

        return (
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[computedStatus as keyof typeof STATUS_COLORS] || 'bg-slate-100 text-slate-600'}`}>
            {computedStatus || '-'}
          </span>
        );

      case 'payment_status':
        return (
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${PAYMENT_STATUS_COLORS[value as keyof typeof PAYMENT_STATUS_COLORS] || 'bg-slate-100 text-slate-600'}`}>
            {value || '-'}
          </span>
        );

      case 'income_with_tax':
      case 'product_sales':
      case 'service_commission':
      case 'product_commission':
        return <span className="text-slate-900">¥{Number(value || 0).toLocaleString()}</span>;

      case 'has_brain_exhibition':
      case 'is_invoiced':
        return value ? (
          <span className="text-emerald-600"><CheckCircle className="w-4 h-4" /></span>
        ) : (
          <span className="text-slate-300"><MinusCircle className="w-4 h-4" /></span>
        );

      case 'remarks':
        return (
          <div
            className="flex items-center space-x-1 cursor-pointer hover:bg-indigo-50 p-1 rounded"
            onClick={() => handleCellEdit(project, key)}
          >
            <span className="text-slate-600 truncate max-w-[180px]">{value || <span className="text-slate-400 italic">点击编辑</span>}</span>
            <Edit2 className="w-3 h-3 text-slate-400" />
          </div>
        );

      case 'start_date':
      case 'end_date':
        return value ? new Date(value).toLocaleDateString('zh-CN') : '-';

      default:
        return <span className="text-slate-600">{value || '-'}</span>;
    }
  }
}

// 执行看板子组件
function ExecutionKanban({
  project,
  itineraryData,
  users,
}: {
  project: any;
  itineraryData?: { itineraries: ItineraryDay[]; manualItems: ManualGanttItem[]; suppliers: any[] };
  users: any[];
}) {
  const today = new Date();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const getSupplierName = (id: string) => {
    return itineraryData?.suppliers?.find(s => s.id === id)?.name || id;
  };

  const getUserName = (id: string) => {
    return users?.find(u => u.id === id)?.name || '未指派';
  };

  const teamMemberIds = project.team_member_ids || [];
  const classTeacherId = project.class_teacher_id || '';

  const COLORS = [
    { id: 'amber', name: '琥珀', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900', labelBg: 'bg-amber-100', labelText: 'text-amber-600', preview: 'bg-amber-500' },
    { id: 'rose', name: '玫瑰', bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-900', labelBg: 'bg-rose-100', labelText: 'text-rose-600', preview: 'bg-rose-500' },
    { id: 'blue', name: '蓝色', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900', labelBg: 'bg-blue-100', labelText: 'text-blue-600', preview: 'bg-blue-500' },
    { id: 'purple', name: '紫色', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-900', labelBg: 'bg-purple-100', labelText: 'text-purple-600', preview: 'bg-purple-500' },
    { id: 'emerald', name: '翡翠', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-900', labelBg: 'bg-emerald-100', labelText: 'text-emerald-600', preview: 'bg-emerald-500' },
  ];

  if (!itineraryData || itineraryData.itineraries.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400 italic">
        <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>暂无行程数据</p>
        <p className="text-xs mt-1">请先在项目详细行程中同步行程</p>
      </div>
    );
  }

  const itineraries = itineraryData.itineraries;
  const manualItems = itineraryData.manualItems || [];
  const suppliers = itineraryData.suppliers || [];

  // 计算看板日期范围
  const startDate = parseISO(itineraries[0].date);
  const endDate = parseISO(itineraries[itineraries.length - 1].date);
  const chartStart = subDays(startDate, 2);
  const chartEnd = addDays(endDate, 2);
  const kanbanDates = eachDayOfInterval({ start: chartStart, end: chartEnd });

  return (
    <div className="space-y-4">
      {/* 顶部标题和图例 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <Calendar className="w-5 h-5 text-indigo-600" />
          <h3 className="text-base font-bold text-slate-900">执行看板 (按日历)</h3>
        </div>
        <div className="flex items-center space-x-4 text-xs text-slate-500">
          <div className="flex items-center space-x-1"><div className="w-2 h-2 bg-indigo-500 rounded-full"></div><span>参访</span></div>
          <div className="flex items-center space-x-1"><div className="w-2 h-2 bg-emerald-500 rounded-full"></div><span>授课</span></div>
          <div className="flex items-center space-x-1"><div className="w-2 h-2 bg-amber-500 rounded-full"></div><span>手动事项</span></div>
        </div>
      </div>

      {/* 看板内容 */}
      <div
        ref={scrollContainerRef}
        className="flex space-x-4 overflow-x-auto pb-6 custom-scrollbar min-h-[400px]"
        style={{ scrollbarWidth: 'thin' }}
      >
        {kanbanDates.map((date) => {
          const dateStr = format(date, 'yyyy-MM-dd');
          const isToday = isSameDay(date, today);
          const dayItinerary = itineraries.find(d => d.date === dateStr);
          const dayManualItems = manualItems.filter(item => isSameDay(parseISO(item.start_time), date));

          return (
            <div
              key={dateStr}
              className={`flex-shrink-0 w-72 rounded-xl border transition-all ${
                isToday ? 'border-indigo-500 bg-indigo-50/30' : 'border-slate-200 bg-slate-50/50'
              }`}
            >
              <div className={`px-4 py-3 border-b rounded-t-xl flex justify-between items-center ${
                isToday ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white text-slate-900 border-slate-100'
              }`}>
                <div>
                  <div className="text-xs font-medium opacity-80">{format(date, 'EEEE', { locale: zhCN })}</div>
                  <div className="text-sm font-bold">{format(date, 'MM 月 dd 日')}</div>
                </div>
                {isToday && <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full">今天</span>}
              </div>

              <div className="p-3 space-y-3 min-h-[300px]">
                {dayItinerary?.morning?.map((act: any, i: number) => (
                  <div key={`m-${i}`} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm group">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase">上午</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded text-white ${act.type === 'visit' ? 'bg-indigo-500' : 'bg-emerald-500'}`}>
                        {act.type === 'visit' ? '参访' : '授课'}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-slate-800 mb-1">
                      {act.type === 'visit' ? getSupplierName(act.supplierId) : (act.courseName || '未命名课程')}
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center mb-1">
                      <MapPin className="w-3 h-3 mr-1" />
                      {act.type === 'visit' ? '参访地点' : getSupplierName(act.venueId)}
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center">
                      <User className="w-3 h-3 mr-1" />
                      负责人：
                      <span className="ml-1 text-[11px]">
                        {act.responsible_person_id ? getUserName(act.responsible_person_id) : '未指派'}
                      </span>
                    </div>
                    {act.type === 'teach' && act.supplierId && (
                      <div className="text-[11px] text-slate-500 flex items-center mt-1">
                        <User className="w-3 h-3 mr-1" />
                        讲师：{getSupplierName(act.supplierId)}
                      </div>
                    )}
                  </div>
                ))}

                {dayItinerary?.afternoon?.map((act: any, i: number) => (
                  <div key={`a-${i}`} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm group">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase">下午</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded text-white ${act.type === 'visit' ? 'bg-indigo-500' : 'bg-emerald-500'}`}>
                        {act.type === 'visit' ? '参访' : '授课'}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-slate-800 mb-1">
                      {act.type === 'visit' ? getSupplierName(act.supplierId) : (act.courseName || '未命名课程')}
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center mb-1">
                      <MapPin className="w-3 h-3 mr-1" />
                      {act.type === 'visit' ? '参访地点' : getSupplierName(act.venueId)}
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center">
                      <User className="w-3 h-3 mr-1" />
                      负责人：
                      <span className="ml-1 text-[11px]">
                        {act.responsible_person_id ? getUserName(act.responsible_person_id) : '未指派'}
                      </span>
                    </div>
                    {act.type === 'teach' && act.supplierId && (
                      <div className="text-[11px] text-slate-500 flex items-center mt-1">
                        <User className="w-3 h-3 mr-1" />
                        讲师：{getSupplierName(act.supplierId)}
                      </div>
                    )}
                  </div>
                ))}

                {dayManualItems.map((item) => {
                  const colorCfg = COLORS.find(c => c.id === item.color) || COLORS[0];
                  return (
                    <div key={item.id} className={`${colorCfg.bg} p-3 rounded-lg border ${colorCfg.border} shadow-sm group`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-[10px] font-bold ${colorCfg.labelText} ${colorCfg.labelBg} px-2 py-0.5 rounded uppercase`}>事项</span>
                      </div>
                      <div className={`text-sm font-bold ${colorCfg.text} mb-1`}>{item.item_name}</div>
                      <div className={`text-[11px] ${colorCfg.text} opacity-70 flex items-center mb-1`}>
                        <ClockIcon className="w-3 h-3 mr-1" />
                        {format(parseISO(item.start_time), 'HH:mm')} - {format(parseISO(item.end_time), 'HH:mm')}
                      </div>
                      <div className={`text-[11px] ${colorCfg.text} opacity-70 flex items-center`}>
                        <User className="w-3 h-3 mr-1" />
                        负责人：
                        <span className="ml-1 text-[11px]">
                          {item.responsible_person_id ? getUserName(item.responsible_person_id) : '未指派'}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {(!dayItinerary?.morning?.length && !dayItinerary?.afternoon?.length && !dayManualItems.length) && (
                  <div className="text-center py-4 text-xs text-slate-400 italic">无安排</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
