import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, FolderKanban, DollarSign, Plus, Trash2, Upload, CheckCircle, XCircle, Eye, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Supplier } from '../types/supplier';
import { useAppStore } from '../store';
import { createNotification } from '../lib/notifications';

// 全局变量类型声明
declare global {
  interface Window {
    _supplierAllPayments?: any[];
  }
}

type TabType = 'basic' | 'projects' | 'calendar' | 'settlement';

interface CalendarEvent {
  type: 'morning' | 'afternoon';
  projectName: string;
  projectCode: string;
  participants: number;
  courseName?: string;
}

interface Settlement {
  id: string;
  settlement_no: string;
  supplier_id: string;
  supplier_name: string;
  period_month: string;
  total_amount: number;
  project_count: number;
  status: '待提交' | '待 CEO 审核' | '待财务审核' | '待付款' | '已付款' | '已驳回';
  submitted_by?: string;
  submitted_at?: string;
  ceo_audited_by?: string;
  ceo_audited_at?: string;
  finance_audited_by?: string;
  finance_audited_at?: string;
  audit_notes?: string;
  paid_by?: string;
  paid_at?: string;
  finance_notes?: string;
  invoice_url?: string;
  payment_voucher_url?: string;
}

interface SettlementItem {
  id: string;
  settlement_id: string;
  project_id: string;
  project_code: string;
  project_name: string;
  cost_type: string;
  cost_detail: string;
  itinerary_date: string;
  amount: number;
}

export default function SupplierDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAppStore();
  const isAccountManager = user?.role === '客户经理';
  const isOperationManager = user?.role === '运营经理';
  const isCustomerDirector = user?.role === '客户总监';
  const isOperationDirector = user?.role === '运营总监';
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('basic');

  // 结算统计指标
  const [settlementStats, setSettlementStats] = useState({
    totalAmount: 0,      // 总金额（已审核 + 已付款）
    settledAmount: 0,    // 已结算金额（已付款）
    pendingAmount: 0     // 待结算金额
  });

  // 结算相关状态
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [selectedSettlement, setSelectedSettlement] = useState<Settlement | null>(null);
  const [settlementItems, setSettlementItems] = useState<SettlementItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));

  // 待结算项目明细
  const [pendingItems, setPendingItems] = useState<any[]>([]);
  const [selectedPendingItems, setSelectedPendingItems] = useState<Set<string>>(new Set());
  const [loadingPending, setLoadingPending] = useState(false);

  // 明细弹窗状态
  const [detailModalType, setDetailModalType] = useState<'total' | 'settled' | 'pending' | null>(null);
  const [detailItems, setDetailItems] = useState<any[]>([]);

  // 参访日历状态
  const [calendarData, setCalendarData] = useState<{ [key: string]: CalendarEvent[] }>({});

  // 备注自动保存定时器
  const [noteTimers, setNoteTimers] = useState<Record<string, NodeJS.Timeout>>({});

  // 更新待结算项目的备注（自动保存）
  const updatePendingItemNote = async (itemId: string, note: string) => {
    // 更新本地状态
    setPendingItems(items => items.map(item =>
      item.id === itemId ? { ...item, notes: note } : item
    ));

    // 清除之前的定时器
    if (noteTimers[itemId]) {
      clearTimeout(noteTimers[itemId]);
    }

    // 设置新的定时器，1 秒后自动保存
    const timer = setTimeout(async () => {
      try {
        // TODO: 保存到数据库（可以添加一个 settlement_notes 表，或者扩展 project_financial_suppliers）
        console.log(`自动保存备注：${itemId} -> ${note}`);
      } catch (error) {
        console.error('保存备注失败:', error);
      }
    }, 1000);

    setNoteTimers(timers => ({ ...timers, [itemId]: timer }));
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  useEffect(() => {
    if ((supplier?.type === '参访点' || supplier?.type === '老师') && activeTab === 'calendar') {
      fetchCalendarData();
    }
  }, [supplier?.type, activeTab, selectedMonth]);

  const fetchData = async () => {
    if (!id) return;
    try {
      console.log('Fetching supplier details for ID:', id);

      // 获取供应商详情
      const { data: supplierData, error: supplierError } = await supabase
        .from('suppliers')
        .select('*')
        .eq('id', id)
        .single();

      if (supplierError) throw supplierError;
      setSupplier(supplierData);
      console.log('Supplier data:', supplierData);

      // 从 approved_project_itineraries 查询关联的项目（唯一数据源）
      let approvedProjectIds: string[] = [];
      const { data: itineraries, error: itineraryError } = await supabase
        .from('approved_project_itineraries')
        .select('project_id, morning, afternoon, noon, evening, bus_id, hotel_arrangement');

      console.log('=== 从 approved_project_itineraries 查询项目 ===');
      console.log('当前供应商 ID:', id);
      console.log('供应商类型:', supplierData?.type);

      if (!itineraryError && itineraries && itineraries.length > 0) {
        console.log('获取到的行程记录数:', itineraries.length);

        // 提取所有包含该供应商 ID 的项目
        itineraries.forEach((item: any) => {
          let hasSupplier = false;
          const matchedFields: string[] = [];

          // 检查酒店
          if (item.hotel_arrangement?.hotelId === id) {
            hasSupplier = true;
            matchedFields.push(`hotel_arrangement.hotelId=${item.hotel_arrangement.hotelId}`);
          }

          // 检查大巴
          if (item.bus_id === id) {
            hasSupplier = true;
            matchedFields.push(`bus_id=${item.bus_id}`);
          }

          // 检查午餐
          if (item.noon?.supplierId === id) {
            hasSupplier = true;
            matchedFields.push(`noon.supplierId=${item.noon.supplierId}`);
          }

          // 检查晚餐
          if (item.evening?.supplierId === id) {
            hasSupplier = true;
            matchedFields.push(`evening.supplierId=${item.evening.supplierId}`);
          }

          // 检查上午活动
          if (Array.isArray(item.morning)) {
            item.morning.forEach((act: any) => {
              if (act.supplierId === id) {
                hasSupplier = true;
                matchedFields.push(`morning.supplierId=${act.supplierId}`);
              }
              if (act.venueId === id) {
                hasSupplier = true;
                matchedFields.push(`morning.venueId=${act.venueId}`);
              }
            });
          }

          // 检查下午活动
          if (Array.isArray(item.afternoon)) {
            item.afternoon.forEach((act: any) => {
              if (act.supplierId === id) {
                hasSupplier = true;
                matchedFields.push(`afternoon.supplierId=${act.supplierId}`);
              }
              if (act.venueId === id) {
                hasSupplier = true;
                matchedFields.push(`afternoon.venueId=${act.venueId}`);
              }
            });
          }

          if (hasSupplier) {
            console.log(`项目 ${item.project_id} 匹配字段:`, matchedFields);
            if (!approvedProjectIds.includes(item.project_id)) {
              approvedProjectIds.push(item.project_id);
            }
          }
        });

        console.log('Projects from approved_project_itineraries:', approvedProjectIds);

        // 查询这些项目的详细信息（包含 itinerary 用于获取开始日期）
        if (approvedProjectIds.length > 0) {
          const { data: projectsData, error: projectsError } = await supabase
            .from('projects')
            .select('id, code, name, client_name, participants, execution_days, itinerary')
            .in('id', approvedProjectIds);

          if (projectsError) {
            console.error('Error fetching projects:', projectsError);
          } else {
            setProjects(projectsData || []);
          }
        }
      }

      // 获取结算单列表
      await fetchSettlements(id);

      // 获取待结算项目明细
      await fetchPendingSettlementItems(id);

      // 计算统计指标
      await calculateSettlementStats(id);
    } catch (error) {
      console.error('Error fetching supplier details:', error);
    } finally {
      setLoading(false);
    }
  };

  // 获取日历数据（用于参访点或老师类型供应商）
  const fetchCalendarData = async () => {
    if (!id || (supplier?.type !== '参访点' && supplier?.type !== '老师')) return;

    try {
      const [year, month] = selectedMonth.split('-').map(Number);
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);

      // 获取该月份所有 approved_project_itineraries
      const { data: itineraries, error } = await supabase
        .from('approved_project_itineraries')
        .select('project_id, day_index, date, morning, afternoon')
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', endDate.toISOString().split('T')[0]);

      if (error) throw error;

      // 按日期组织数据
      const calendar: { [key: string]: CalendarEvent[] } = {};

      if (itineraries && itineraries.length > 0) {
        // 获取所有项目 ID
        const projectIds = [...new Set(itineraries.map(i => i.project_id))];

        // 获取项目信息
        const { data: projectsData } = await supabase
          .from('projects')
          .select('id, code, name, participants')
          .in('id', projectIds);

        const projectMap = Object.fromEntries(projectsData?.map(p => [p.id, p]) || []);

        // 处理每一天的行程
        itineraries.forEach((item: any) => {
          const dateKey = item.date?.split('T')[0];
          if (!dateKey) return;

          const events: CalendarEvent[] = [];

          // 检查上午活动
          if (Array.isArray(item.morning)) {
            item.morning.forEach((act: any) => {
              let isMatchedSupplier = false;

              if (supplier?.type === '参访点') {
                // 参访点：检查是否是该供应商（作为场地或活动供应商）
                isMatchedSupplier = act.supplierId === id || act.venueId === id;
              } else if (supplier?.type === '老师') {
                // 老师：检查是否是该老师供应商
                isMatchedSupplier = act.supplierId === id && act.type === 'teach';
              }

              if (isMatchedSupplier) {
                const project = projectMap[item.project_id];
                events.push({
                  type: 'morning',
                  projectName: project?.name || '未知项目',
                  projectCode: project?.code || '',
                  participants: project?.participants || 0,
                  courseName: act.courseName || '',
                });
              }
            });
          }

          // 检查下午活动
          if (Array.isArray(item.afternoon)) {
            item.afternoon.forEach((act: any) => {
              let isMatchedSupplier = false;

              if (supplier?.type === '参访点') {
                isMatchedSupplier = act.supplierId === id || act.venueId === id;
              } else if (supplier?.type === '老师') {
                isMatchedSupplier = act.supplierId === id && act.type === 'teach';
              }

              if (isMatchedSupplier) {
                const project = projectMap[item.project_id];
                events.push({
                  type: 'afternoon',
                  projectName: project?.name || '未知项目',
                  projectCode: project?.code || '',
                  participants: project?.participants || 0,
                  courseName: act.courseName || '',
                });
              }
            });
          }

          // 如果有事件，添加到日历
          if (events.length > 0) {
            if (!calendar[dateKey]) {
              calendar[dateKey] = [];
            }
            calendar[dateKey].push(...events);
          }
        });
      }

      setCalendarData(calendar);
    } catch (error) {
      console.error('Error fetching calendar data:', error);
    }
  };

  // 获取已结算的项目 ID 列表
  const getSettledProjectIds = async (): Promise<Set<string>> => {
    const { data } = await supabase
      .from('supplier_settlement_items')
      .select('project_id')
      .in('settlement_id', settlements.map(s => s.id));

    return new Set(data?.map(item => item.project_id) || []);
  };

  // 获取待结算项目明细（从 project_financial_suppliers 表）
  const fetchPendingSettlementItems = async (supplierId: string) => {
    setLoadingPending(true);
    try {
      // 从 project_financial_suppliers 读取该供应商在所有项目中的付款记录
      // 只获取未付款/待审核的记录
      const { data: allPayments, error } = await supabase
        .from('project_financial_suppliers')
        .select('id, actual_amount, amount, project_id, supplier_id, payment_status')
        .eq('supplier_id', supplierId)
        .in('payment_status', ['未付款', '待 CEO 审核', 'CEO 已审核', '待财务审核', '待付款']);

      if (error) {
        console.error('查询待结算项目失败:', error);
        setPendingItems([]);
        setLoadingPending(false);
        return;
      }

      console.log('待结算项目明细:', {
        supplierId,
        totalRecords: allPayments?.length || 0,
        data: allPayments
      });

      if (!allPayments || allPayments.length === 0) {
        setPendingItems([]);
        setLoadingPending(false);
        return;
      }

      // 获取当前供应商的所有结算单 ID
      const { data: settlementsData } = await supabase
        .from('supplier_settlements')
        .select('id')
        .eq('supplier_id', supplierId);

      const settlementIds = settlementsData?.map(s => s.id) || [];

      // 获取这些结算单的明细（已生成结算单的项目）
      let settledProjectIds: string[] = [];
      if (settlementIds.length > 0) {
        const { data: settlementItemsData } = await supabase
          .from('supplier_settlement_items')
          .select('project_id')
          .in('settlement_id', settlementIds);

        settledProjectIds = settlementItemsData?.map(item => item.project_id) || [];
      }

      // 获取项目详细信息
      const projectIds = allPayments.map(p => p.project_id);
      const { data: projects } = await supabase
        .from('projects')
        .select('id, code, name, itinerary')
        .in('id', projectIds);

      const items: any[] = [];
      allPayments.forEach(payment => {
        const project = projects?.find(p => p.id === payment.project_id);
        const projectStartDate = project?.itinerary?.schedule?.[0]?.date;

        items.push({
          id: payment.id,
          project_id: payment.project_id,
          project_code: project?.code || '',
          project_name: project?.name || '',
          project_time: projectStartDate || '',
          cost_type: getCostTypeBySupplierType(supplier?.type),
          cost_detail: getCostDetailBySupplierType(supplier?.type),
          itinerary_date: projectStartDate || '',
          amount: Number(payment.actual_amount) || Number(payment.amount) || 0,
          payment_status: payment.payment_status,
          notes: '',
          isSettled: settledProjectIds.includes(payment.project_id), // 已生成结算单
        });
      });

      setPendingItems(items);
    } catch (error) {
      console.error('Error fetching pending items:', error);
    } finally {
      setLoadingPending(false);
    }
  };

  // 根据供应商类型获取费用类型
  const getCostTypeBySupplierType = (supplierType?: string): string => {
    const typeMap: Record<string, string> = {
      '酒店': '酒店',
      '餐饮': '餐饮',
      '大巴': '大巴',
      '老师': '授课',
      '参访点': '参访',
      '场地': '场地',
    };
    return typeMap[supplierType || ''] || '其他';
  };

  // 根据供应商类型获取费用明细
  const getCostDetailBySupplierType = (supplierType?: string): string => {
    const detailMap: Record<string, string> = {
      '酒店': '住宿',
      '餐饮': '餐饮',
      '大巴': '交通',
      '老师': '课程费用',
      '参访点': '参观费用',
      '场地': '场地费用',
    };
    return detailMap[supplierType || ''] || '费用';
  };

  const fetchSettlements = async (supplierId: string) => {
    const { data, error } = await supabase
      .from('supplier_settlements')
      .select('*')
      .eq('supplier_id', supplierId)
      .order('period_month', { ascending: false });

    if (error) {
      console.error('Error fetching settlements:', error);
    } else {
      setSettlements(data || []);
    }
  };

  // 计算结算统计指标
  const calculateSettlementStats = async (supplierId: string) => {
    try {
      // 1. 从 project_financial_suppliers 读取该供应商在所有项目中的付款记录
      const { data: allPayments, error } = await supabase
        .from('project_financial_suppliers')
        .select('actual_amount, payment_status, project_id, amount, supplier_id')
        .eq('supplier_id', supplierId);

      if (error) {
        console.error('查询结算数据失败:', error);
        setSettlementStats({ totalAmount: 0, settledAmount: 0, pendingAmount: 0 });
        return;
      }

      console.log('供应商付款记录:', {
        supplierId,
        totalRecords: allPayments?.length || 0,
        data: allPayments
      });

      if (!allPayments || allPayments.length === 0) {
        setSettlementStats({ totalAmount: 0, settledAmount: 0, pendingAmount: 0 });
        return;
      }

      // 总金额 = 所有记录的实际成本总和
      const totalAmount = allPayments.reduce((sum, p) => sum + (Number(p.actual_amount) || Number(p.amount) || 0), 0);

      // 2. 从 supplier_settlements 查询已审核/已付款的结算单
      const { data: settlements } = await supabase
        .from('supplier_settlements')
        .select('id, total_amount, status')
        .eq('supplier_id', supplierId)
        .in('status', ['已审核', '已付款']);

      // 已结算金额 = 所有已审核/已付款结算单的总金额
      const settledAmount = settlements?.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0) || 0;

      // 待结算金额 = 总金额 - 已结算
      const pendingAmount = totalAmount - settledAmount;

      console.log('结算统计结果:', { totalAmount, settledAmount, pendingAmount });
      setSettlementStats({ totalAmount, settledAmount, pendingAmount });

      // 保存所有付款记录用于明细展示
      window._supplierAllPayments = allPayments;
    } catch (error) {
      console.error('Error calculating settlement stats:', error);
      setSettlementStats({ totalAmount: 0, settledAmount: 0, pendingAmount: 0 });
    }
  };

  // 加载明细数据
  const loadDetailItems = async (type: 'total' | 'settled' | 'pending') => {
    try {
      const allPayments: any[] = (window as any)._supplierAllPayments || [];

      // 获取项目信息
      const projectIds = allPayments.map(p => p.project_id);
      const { data: projects } = await supabase
        .from('projects')
        .select('id, code, name')
        .in('id', projectIds);

      let filteredPayments = allPayments;
      if (type === 'settled') {
        filteredPayments = allPayments.filter(p => p.payment_status === '已付款');
      } else if (type === 'pending') {
        filteredPayments = allPayments.filter(p => p.payment_status === '未付款');
      }

      const items = filteredPayments.map(p => ({
        ...p,
        project_code: projects?.find(proj => proj.id === p.project_id)?.code || '',
        project_name: projects?.find(proj => proj.id === p.project_id)?.name || ''
      }));

      setDetailItems(items);
      setDetailModalType(type);
    } catch (error) {
      console.error('Error loading detail items:', error);
    }
  };

  // 生成结算单
  const handleGenerateSettlement = async () => {
    if (selectedPendingItems.size === 0) {
      alert('请至少选择一项待结算费用');
      return;
    }

    setGenerating(true);
    try {
      // 获取选中的项目
      const itemsToSettle = pendingItems.filter(item => selectedPendingItems.has(item.id));

      if (itemsToSettle.length === 0) {
        alert('请至少选择一项待结算费用');
        setGenerating(false);
        return;
      }

      // 检查该月份是否已存在结算单
      const { data: existingSettlement } = await supabase
        .from('supplier_settlements')
        .select('id')
        .eq('supplier_id', id)
        .eq('period_month', selectedMonth + '-01')
        .single();

      if (existingSettlement) {
        alert(`该月份 (${selectedMonth}) 已存在结算单，请直接在该结算单中添加项目，或修改结算月份。`);
        setGenerating(false);
        return;
      }

      // 按月份分组（这里简化处理，所有选中项目归为当前选择月份）
      const totalAmount = itemsToSettle.reduce((sum, item) => sum + item.amount, 0);
      const uniqueProjectIds = new Set(itemsToSettle.map(i => i.project_id));

      // 生成结算单号 - 使用全局序列
      const { data: seqData } = await supabase.rpc('get_next_settlement_no');
      const settlementNo = `JS${selectedMonth.replace('-', '')}-${String(seqData || 1).padStart(3, '0')}`;

      // 插入结算单
      const { data: newSettlement, error: settlementError } = await supabase
        .from('supplier_settlements')
        .insert([{
          settlement_no: settlementNo,
          supplier_id: id,
          supplier_name: supplier.name,
          period_month: selectedMonth + '-01',
          total_amount: totalAmount,
          project_count: uniqueProjectIds.size,
          status: '待提交',
        }])
        .select()
        .single();

      if (settlementError) throw settlementError;

      // 插入结算单明细
      const itemsWithSettlementId = itemsToSettle.map(item => ({
        settlement_id: newSettlement.id,
        project_id: item.project_id,
        project_code: item.project_code,
        project_name: item.project_name,
        cost_type: item.cost_type,
        cost_detail: item.cost_detail,
        itinerary_date: item.itinerary_date,
        amount: item.amount,
      }));

      const { error: itemsError } = await supabase
        .from('supplier_settlement_items')
        .insert(itemsWithSettlementId);

      if (itemsError) throw itemsError;

      alert('结算单生成成功！');
      setShowSettlementModal(false);
      setSelectedPendingItems(new Set());
      fetchSettlements(id);
      fetchPendingSettlementItems(id); // 刷新待结算列表
    } catch (error: any) {
      console.error('Error generating settlement:', error);
      alert('生成结算单失败：' + error.message);
    } finally {
      setGenerating(false);
    }
  };

  // 提交结算单
  const handleSubmitSettlement = async (settlementId: string) => {
    const { error } = await supabase
      .from('supplier_settlements')
      .update({
        status: '待 CEO 审核',
        submitted_by: user?.id,
      })
      .eq('id', settlementId);

    if (error) {
      alert('提交失败：' + error.message);
    } else {
      // 通知 CEO
      const { data: ceoUsers } = await supabase
        .from('users')
        .select('id')
        .eq('role', 'CEO');

      if (ceoUsers && ceoUsers.length > 0) {
        const { data: settlementData } = await supabase
          .from('supplier_settlements')
          .select('supplier_name, total_amount')
          .eq('id', settlementId)
          .single();

        for (const ceo of ceoUsers) {
          await createNotification(
            ceo.id,
            '结算单待 CEO 审核',
            `${user?.name} 提交了 ${settlementData?.supplier_name || '供应商'} 的结算单（¥${(settlementData?.total_amount || 0) / 100}），等待您的审核。`,
            'approval_request',
            '/finance/settlement-processing'
          );
        }
      }

      alert('结算单已提交审核');
      fetchSettlements(id);
    }
  };

  // 查看结算单明细
  const handleViewSettlement = async (settlement: Settlement) => {
    setSelectedSettlement(settlement);
    const { data } = await supabase
      .from('supplier_settlement_items')
      .select('*')
      .eq('settlement_id', settlement.id)
      .order('itinerary_date', { ascending: true });

    setSettlementItems(data || []);
  };

  // 删除结算单
  const handleDeleteSettlement = async (settlement: Settlement) => {
    if (!confirm(`确定要删除结算单 ${settlement.settlement_no} 吗？删除后无法恢复。`)) {
      return;
    }

    try {
      // 先删除关联的明细
      const { error: itemsError } = await supabase
        .from('supplier_settlement_items')
        .delete()
        .eq('settlement_id', settlement.id);

      if (itemsError) throw itemsError;

      // 再删除结算单
      const { error } = await supabase
        .from('supplier_settlements')
        .delete()
        .eq('id', settlement.id);

      if (error) throw error;

      alert('结算单已删除');
      fetchSettlements(id);
      fetchPendingSettlementItems(id); // 刷新待结算列表
    } catch (error: any) {
      console.error('Error deleting settlement:', error);
      alert('删除失败：' + error.message);
    }
  };

  // CEO 审核结算单（业务审核）
  const handleAuditSettlement = async (settlementId: string, action: 'approved' | 'rejected', notes?: string) => {
    if (user?.role !== 'CEO') {
      alert('只有 CEO 可以审核结算单');
      return;
    }

    try {
      const { error } = await supabase
        .from('supplier_settlements')
        .update({
          status: action === 'approved' ? '待财务审核' : '已驳回',
          ceo_audited_by: user?.id,
          ceo_audited_at: new Date().toISOString(),
          audit_notes: notes || null,
        })
        .eq('id', settlementId);

      if (error) throw error;

      alert(`结算单已${action === 'approved' ? '审核通过' : '驳回'}`);
      fetchSettlements(id);
    } catch (error: any) {
      console.error('Error auditing settlement:', error);
      alert('操作失败：' + error.message);
    }
  };

  // 财务确认付款（最终审核）
  const handleFinanceConfirm = async (settlementId: string) => {
    if (user?.role !== '财务') {
      alert('只有财务可以确认付款');
      return;
    }

    try {
      // 1. 获取结算单信息（包括 supplier_id）
      const { data: settlement, error: settlementError } = await supabase
        .from('supplier_settlements')
        .select('supplier_id')
        .eq('id', settlementId)
        .single();

      if (settlementError) throw settlementError;

      // 2. 获取结算单明细中的所有项目 ID
      const { data: settlementItems, error: itemsError } = await supabase
        .from('supplier_settlement_items')
        .select('project_id')
        .eq('settlement_id', settlementId);

      if (itemsError) throw itemsError;

      if (settlementItems && settlementItems.length > 0 && settlement) {
        const projectIds = settlementItems.map(item => item.project_id);

        // 3. 更新 project_financial_suppliers 表中对应项目且对应供应商的付款状态
        const { error: updateError } = await supabase
          .from('project_financial_suppliers')
          .update({ payment_status: '已付款' })
          .in('project_id', projectIds)
          .eq('supplier_id', settlement.supplier_id)
          .in('payment_status', ['待 CEO 审核', 'CEO 已审核', '未付款']);

        if (updateError) {
          console.error('Error updating payment status:', updateError);
        }
      }

      // 4. 更新结算单状态为已付款
      const { error } = await supabase
        .from('supplier_settlements')
        .update({
          status: '已付款',
          paid_by: user?.id,
          paid_at: new Date().toISOString(),
          finance_audited_by: user?.id,
          finance_audited_at: new Date().toISOString(),
        })
        .eq('id', settlementId);

      if (error) throw error;

      alert('已确认付款');
      fetchSettlements(id);
      fetchPendingSettlementItems(id);
    } catch (error: any) {
      console.error('Error confirming payment:', error);
      alert('操作失败：' + error.message);
    }
  };

  // 上传付款凭证（参考 PaymentApproval 的逻辑）
  const handleUploadVoucher = async (settlementId: string, file: File) => {
    if (user?.role !== '财务') {
      alert('只有财务可以上传付款凭证');
      return;
    }

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
      const filePath = `financials/vouchers/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('attachments')
        .getPublicUrl(filePath);

      const { error } = await supabase
        .from('supplier_settlements')
        .update({ payment_voucher_url: publicUrl })
        .eq('id', settlementId);

      if (error) throw error;

      alert('付款凭证上传成功！');
      fetchSettlements(id);
    } catch (error: any) {
      console.error('Error uploading voucher:', error);
      alert('上传失败：' + error.message);
    }
  };

  // 上传发票（运营总监在供应商管理页面上传）
  const handleUploadInvoice = async (settlementId: string, file: File) => {
    if (user?.role !== '运营总监') {
      alert('只有运营总监可以上传发票');
      return;
    }

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
      const filePath = `financials/invoices/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('attachments')
        .getPublicUrl(filePath);

      const { error } = await supabase
        .from('supplier_settlements')
        .update({ invoice_url: publicUrl })
        .eq('id', settlementId);

      if (error) throw error;

      alert('发票上传成功！');
      fetchSettlements(id);
    } catch (error: any) {
      console.error('Error uploading invoice:', error);
      alert('上传失败：' + error.message);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">加载中...</div>;
  }

  if (!supplier) {
    return <div className="p-8 text-center text-red-500">未找到供应商信息</div>;
  }

  const tabs = [
    { id: 'basic', label: '供应商信息', icon: FileText },
    { id: 'projects', label: '项目信息', icon: FolderKanban },
    ...(supplier?.type === '参访点' ? [{ id: 'calendar', label: '参访日历', icon: Calendar }] : []),
    ...(supplier?.type === '老师' ? [{ id: 'calendar', label: '授课日历', icon: Calendar }] : []),
    ...(!isAccountManager && !isOperationManager ? [{ id: 'settlement', label: '付款 & 结算', icon: DollarSign }] : []),
  ] as const;

  const renderQuote = (quote: any) => {
    if (!quote) return '-';
    if (['酒店', '餐饮', '参访点', '其他'].includes(supplier.type)) {
      if (quote.unit) return `¥${quote.unit.toFixed(2)}`;
    } else if (['场地', '老师', '大巴'].includes(supplier.type)) {
      const parts = [];
      if (quote.hour) parts.push(`时:¥${quote.hour}`);
      if (quote.half_day) parts.push(`半:¥${quote.half_day}`);
      if (quote.day) parts.push(`天:¥${quote.day}`);
      return parts.length > 0 ? parts.join(' | ') : '-';
    }
    return '-';
  };

  const renderExtendedData = () => {
    const data = supplier.extended_data || {};
    const items: { label: string; value: string }[] = [];

    if (supplier.type === '酒店') {
      if (data.star_rating) items.push({ label: '星级', value: data.star_rating });
      if (data.room_count) items.push({ label: '房间数量', value: `${data.room_count} 间` });
    } else if (supplier.type === '餐饮') {
      if (data.cuisine) items.push({ label: '菜系', value: data.cuisine });
      if (data.is_halal) items.push({ label: '清真', value: '是' });
    } else if (supplier.type === '场地') {
      if (data.area) items.push({ label: '面积', value: `${data.area}㎡` });
      if (data.capacity) items.push({ label: '容纳人数', value: `${data.capacity}人` });
      if (data.equipment) items.push({ label: '设备', value: data.equipment });
    } else if (supplier.type === '老师') {
      if (data.course_name) items.push({ label: '课程名称', value: data.course_name });
      if (data.language) items.push({ label: '授课语言', value: data.language });
    } else if (supplier.type === '参访点') {
      if (data.industry) items.push({ label: '所属行业', value: data.industry });
      if (data.guide_language) items.push({ label: '讲解语言', value: data.guide_language });
      if (data.max_capacity) items.push({ label: '最高容纳', value: `${data.max_capacity}人` });
    } else if (supplier.type === '大巴') {
      if (data.passenger_count) items.push({ label: '乘客人数', value: `${data.passenger_count}人` });
    }

    return items;
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const statusColors: Record<string, string> = {
      '待提交': 'bg-slate-100 text-slate-700',
      '待 CEO 审核': 'bg-amber-100 text-amber-700',
      '待财务审核': 'bg-purple-100 text-purple-700',
      '待付款': 'bg-blue-100 text-blue-700',
      '已付款': 'bg-emerald-100 text-emerald-700',
      '已驳回': 'bg-red-100 text-red-700',
    };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[status] || 'bg-slate-100 text-slate-700'}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <button
          onClick={() => navigate('/suppliers')}
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{supplier.name}</h1>
          <p className="text-sm text-slate-500 mt-1">供应商编码：{supplier.code} | 类型：{supplier.type}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-200">
          <nav className="flex -mb-px overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`
                    flex items-center px-6 py-4 text-sm font-medium border-b-2 whitespace-nowrap transition-colors
                    ${isActive
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }
                  `}
                >
                  <Icon className={`w-4 h-4 mr-2 ${isActive ? 'text-indigo-500' : 'text-slate-400'}`} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'basic' && (
            <div className="space-y-8">
              {/* 基本信息 */}
              <div>
                <h3 className="text-lg font-medium text-slate-900 mb-4">基本信息</h3>
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                  <div>
                    <dt className="text-sm font-medium text-slate-500">供应商名称</dt>
                    <dd className="mt-1 text-sm text-slate-900">{supplier.name}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-slate-500">供应商编码</dt>
                    <dd className="mt-1 text-sm text-slate-900">{supplier.code}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-slate-500">联系人</dt>
                    <dd className="mt-1 text-sm text-slate-900">{supplier.contact_person || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-slate-500">联系电话</dt>
                    <dd className="mt-1 text-sm text-slate-900">{supplier.contact_phone || '-'}</dd>
                  </div>
                  <div className="md:col-span-2">
                    <dt className="text-sm font-medium text-slate-500">地址</dt>
                    <dd className="mt-1 text-sm text-slate-900">{supplier.address || '-'}</dd>
                  </div>
                </dl>
              </div>

              {/* 扩展信息 */}
              {renderExtendedData().length > 0 && (
                <div>
                  <h3 className="text-lg font-medium text-slate-900 mb-4">扩展信息</h3>
                  <dl className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
                    {renderExtendedData().map((item) => (
                      <div key={item.label}>
                        <dt className="text-sm font-medium text-slate-500">{item.label}</dt>
                        <dd className="mt-1 text-sm text-slate-900">{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              {/* 报价信息 */}
              <div>
                <h3 className="text-lg font-medium text-slate-900 mb-4">报价信息</h3>
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                  <div>
                    <dt className="text-sm font-medium text-slate-500">参考报价</dt>
                    <dd className="mt-1 text-sm text-slate-900">{renderQuote(supplier.reference_quote)}</dd>
                  </div>
                  {!isAccountManager && !isOperationManager && (
                    <div>
                      <dt className="text-sm font-medium text-slate-500">实际成本</dt>
                      <dd className="mt-1 text-sm text-indigo-600 font-medium">{renderQuote(supplier.actual_cost)}</dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* 结算信息 */}
              <div>
                <h3 className="text-lg font-medium text-slate-900 mb-4">结算信息</h3>
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                  <div>
                    <dt className="text-sm font-medium text-slate-500">结算方式</dt>
                    <dd className="mt-1 text-sm text-slate-900">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                        {supplier.settlement_method || '月结'}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-slate-500">结算日期</dt>
                    <dd className="mt-1 text-sm text-slate-900">
                      {supplier.settlement_day ? `每月${supplier.settlement_day}号` : '-'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-slate-500">开户名称</dt>
                    <dd className="mt-1 text-sm text-slate-900">{supplier.account_name || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-slate-500">税号</dt>
                    <dd className="mt-1 text-sm text-slate-900">{supplier.tax_id || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-slate-500">开户行</dt>
                    <dd className="mt-1 text-sm text-slate-900">{supplier.bank_name || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-slate-500">银行账号</dt>
                    <dd className="mt-1 text-sm text-slate-900">{supplier.bank_account || '-'}</dd>
                  </div>
                </dl>
              </div>

              {/* 备注 */}
              {supplier.remarks && (
                <div>
                  <h3 className="text-lg font-medium text-slate-900 mb-4">备注</h3>
                  <dd className="text-sm text-slate-900 whitespace-pre-wrap">{supplier.remarks}</dd>
                </div>
              )}
            </div>
          )}

          {activeTab === 'projects' && (
            <div>
              {projects.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <FolderKanban className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                  <p>暂无相关项目</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-sm">
                      <th className="px-6 py-3 font-medium">项目名称</th>
                      <th className="px-6 py-3 font-medium">项目编号</th>
                      <th className="px-6 py-3 font-medium">客户名称</th>
                      <th className="px-6 py-3 font-medium">项目人数</th>
                      <th className="px-6 py-3 font-medium">项目执行时间</th>
                      <th className="px-6 py-3 font-medium text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {projects.map((project) => {
                      // 从 itinerary.schedule 中获取第一天日期
                      let startDate = null;
                      if (project.itinerary?.schedule && Array.isArray(project.itinerary.schedule) && project.itinerary.schedule.length > 0) {
                        const firstDay = project.itinerary.schedule[0];
                        if (firstDay.date) {
                          startDate = firstDay.date;
                        }
                      }

                      // 计算结束日期
                      let endDate = null;
                      if (startDate && project.execution_days) {
                        const start = new Date(startDate);
                        endDate = new Date(start.getTime() + (project.execution_days - 1) * 24 * 60 * 60 * 1000);
                      }

                      return (
                        <tr key={project.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 text-sm font-medium text-slate-900">{project.name}</td>
                          <td className="px-6 py-4 text-sm text-slate-500 font-mono">{project.code}</td>
                          <td className="px-6 py-4 text-sm text-slate-500">{project.client_name || '-'}</td>
                          <td className="px-6 py-4 text-sm text-slate-500">{project.participants} 人</td>
                          <td className="px-6 py-4 text-sm text-slate-500">
                            {startDate ? (
                              <>
                                {new Date(startDate).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                                {' - '}
                                {endDate ? endDate.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '+'}
                              </>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-right">
                            <button
                              onClick={() => navigate(`/projects/${project.id}`)}
                              className="text-indigo-600 hover:text-indigo-900 font-medium"
                            >
                              查看详情
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'calendar' && (supplier?.type === '参访点' || supplier?.type === '老师') && (
            <div>
              {/* 月份选择器 */}
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-medium text-slate-900">{supplier?.type === '参访点' ? '参访日历' : '授课日历'}</h3>
                <div className="flex items-center space-x-4">
                  <label className="text-sm text-slate-500">月份：</label>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              {/* 日历视图 - 按周展示 */}
              {Object.keys(calendarData).length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Calendar className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                  <p>该月份暂无{supplier?.type === '参访点' ? '参访' : '授课'}安排</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* 生成该月所有周的日历 */}
                  {(() => {
                    const [year, month] = selectedMonth.split('-').map(Number);
                    const firstDay = new Date(year, month - 1, 1);
                    const lastDay = new Date(year, month, 0);
                    const weeks: any[][] = [];
                    let currentWeek: any[] = [];

                    // 填充第一天之前的空白
                    for (let i = 0; i < firstDay.getDay(); i++) {
                      currentWeek.push(null);
                    }

                    // 按日期填充
                    for (let day = 1; day <= lastDay.getDate(); day++) {
                      const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const dayEvents = calendarData[dateKey] || [];
                      currentWeek.push({ date: dateKey, events: dayEvents });

                      if (currentWeek.length === 7) {
                        weeks.push(currentWeek);
                        currentWeek = [];
                      }
                    }

                    // 填充最后一周的空白
                    while (currentWeek.length > 0 && currentWeek.length < 7) {
                      currentWeek.push(null);
                    }
                    if (currentWeek.length > 0) {
                      weeks.push(currentWeek);
                    }

                    return weeks.map((week, weekIdx) => (
                      <div key={weekIdx} className="border border-slate-200 rounded-lg overflow-hidden">
                        {/* 星期标题 */}
                        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
                          {['日', '一', '二', '三', '四', '五', '六'].map((dayName, idx) => (
                            <div key={idx} className="py-2 text-center text-sm font-medium text-slate-600">
                              {dayName}
                            </div>
                          ))}
                        </div>

                        {/* 日期格子 */}
                        <div className="grid grid-cols-7">
                          {week.map((day, dayIdx) => {
                            if (!day) {
                              return <div key={dayIdx} className="min-h-[120px] bg-slate-50 border-r border-b border-slate-100 last:border-r-0" />;
                            }

                            const dateObj = new Date(day.date + 'T00:00:00');
                            const morningEvents = day.events.filter((e: CalendarEvent) => e.type === 'morning');
                            const afternoonEvents = day.events.filter((e: CalendarEvent) => e.type === 'afternoon');

                            return (
                              <div
                                key={dayIdx}
                                className="min-h-[140px] p-2 border-r border-b border-slate-100 last:border-r-0 bg-white"
                              >
                                <div className="text-sm font-medium mb-1 text-slate-900">
                                  {dateObj.getDate()}
                                </div>

                                <div className="space-y-1">
                                  {morningEvents.map((event: CalendarEvent, idx: number) => (
                                    <div
                                      key={`morning-${idx}`}
                                      className="text-xs bg-amber-50 text-amber-700 px-1.5 py-1 rounded border border-amber-200"
                                    >
                                      <div className="font-medium text-amber-900">上午</div>
                                      <div className="truncate" title={event.projectName}>{event.projectCode}</div>
                                      <div className="truncate" title={event.projectName}>{event.projectName}</div>
                                      {event.courseName && supplier?.type === '老师' && (
                                        <div className="truncate text-amber-600">{event.courseName}</div>
                                      )}
                                      <div className="text-amber-600">{event.participants}人</div>
                                    </div>
                                  ))}
                                  {afternoonEvents.map((event: CalendarEvent, idx: number) => (
                                    <div
                                      key={`afternoon-${idx}`}
                                      className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-1 rounded border border-indigo-200"
                                    >
                                      <div className="font-medium text-indigo-900">下午</div>
                                      <div className="truncate" title={event.projectName}>{event.projectCode}</div>
                                      <div className="truncate" title={event.projectName}>{event.projectName}</div>
                                      {event.courseName && supplier?.type === '老师' && (
                                        <div className="truncate text-indigo-600">{event.courseName}</div>
                                      )}
                                      <div className="text-indigo-600">{event.participants}人</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}

              {/* 图例 */}
              <div className="flex items-center justify-center space-x-6 text-sm text-slate-600">
                <div className="flex items-center space-x-2">
                  <span className="w-4 h-4 bg-amber-50 border border-amber-200 rounded"></span>
                  <span>上午{supplier?.type === '参访点' ? '参访' : '授课'}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-4 h-4 bg-indigo-50 border border-indigo-200 rounded"></span>
                  <span>下午{supplier?.type === '参访点' ? '参访' : '授课'}</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settlement' && (
            <div className="space-y-6">
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

              {/* 统计指标色块 */}
              <div className="grid grid-cols-3 gap-4">
                <div
                  className="bg-indigo-50 rounded-lg p-4 border border-indigo-100 cursor-pointer hover:bg-indigo-100 hover:border-indigo-200 transition-colors"
                  onClick={() => loadDetailItems('total')}
                >
                  <div className="text-sm text-indigo-600 font-medium mb-1">总金额</div>
                  <div className="text-2xl font-bold text-indigo-900">¥{settlementStats.totalAmount.toLocaleString()}</div>
                  <div className="text-xs text-indigo-500 mt-1">所有项目费用总和</div>
                  <div className="text-xs text-indigo-400 mt-1 flex items-center">
                    <Eye className="w-3 h-3 mr-1" /> 点击查看详情
                  </div>
                </div>
                <div
                  className="bg-emerald-50 rounded-lg p-4 border border-emerald-100 cursor-pointer hover:bg-emerald-100 hover:border-emerald-200 transition-colors"
                  onClick={() => loadDetailItems('settled')}
                >
                  <div className="text-sm text-emerald-600 font-medium mb-1">已结算</div>
                  <div className="text-2xl font-bold text-emerald-900">¥{settlementStats.settledAmount.toLocaleString()}</div>
                  <div className="text-xs text-emerald-500 mt-1">已付款金额</div>
                  <div className="text-xs text-emerald-400 mt-1 flex items-center">
                    <Eye className="w-3 h-3 mr-1" /> 点击查看详情
                  </div>
                </div>
                <div
                  className="bg-amber-50 rounded-lg p-4 border border-amber-100 cursor-pointer hover:bg-amber-100 hover:border-amber-200 transition-colors"
                  onClick={() => loadDetailItems('pending')}
                >
                  <div className="text-sm text-amber-600 font-medium mb-1">待结算</div>
                  <div className="text-2xl font-bold text-amber-900">¥{settlementStats.pendingAmount.toLocaleString()}</div>
                  <div className="text-xs text-amber-500 mt-1">未付款金额</div>
                  <div className="text-xs text-amber-400 mt-1 flex items-center">
                    <Eye className="w-3 h-3 mr-1" /> 点击查看详情
                  </div>
                </div>
              </div>

              {/* Header */}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-slate-900">付款 & 结算</h3>
                {!isOperationManager && pendingItems.length > 0 && (
                  <button
                    onClick={() => setShowSettlementModal(true)}
                    disabled={selectedPendingItems.size === 0}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                    生成结算单 {selectedPendingItems.size > 0 && `(${selectedPendingItems.size}项)`}
                  </button>
                )}
              </div>

              {/* Pending Items to Settle */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 px-6 py-3">
                  <h4 className="text-sm font-medium text-slate-900">待结算费用明细</h4>
                  <p className="text-xs text-slate-500 mt-1">勾选需要结算的费用项目，然后点击"生成结算单"</p>
                </div>
                {loadingPending ? (
                  <div className="p-12 text-center text-slate-500">
                    <div className="w-6 h-6 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin mx-auto mb-2" />
                    <p>加载中...</p>
                  </div>
                ) : pendingItems.length === 0 ? (
                  <div className="p-12 text-center text-slate-500">
                    <DollarSign className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                    <p>暂无待结算费用</p>
                    <p className="text-xs text-slate-400 mt-1">所有项目费用已结算</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs">
                        <th className="px-6 py-3 font-medium w-10">
                          <input
                            type="checkbox"
                            checked={pendingItems.filter(i => !i.isSettled).every(i => selectedPendingItems.has(i.id)) && pendingItems.filter(i => !i.isSettled).length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                // 只选择未生成结算单的项目
                                setSelectedPendingItems(new Set(pendingItems.filter(i => !i.isSettled).map(i => i.id)));
                              } else {
                                setSelectedPendingItems(new Set());
                              }
                            }}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        </th>
                        <th className="px-6 py-3 font-medium">项目编码</th>
                        <th className="px-6 py-3 font-medium">项目名称</th>
                        <th className="px-6 py-3 font-medium">项目时间</th>
                        <th className="px-6 py-3 font-medium text-right">结算金额</th>
                        <th className="px-6 py-3 font-medium">备注</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {pendingItems.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <input
                              type="checkbox"
                              checked={selectedPendingItems.has(item.id) || item.isSettled}
                              onChange={(e) => {
                                if (item.isSettled) return; // 已生成结算单，不允许修改
                                const newSelected = new Set(selectedPendingItems);
                                if (e.target.checked) {
                                  newSelected.add(item.id);
                                } else {
                                  newSelected.delete(item.id);
                                }
                                setSelectedPendingItems(newSelected);
                              }}
                              disabled={item.isSettled}
                              className={`rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 ${item.isSettled ? 'cursor-not-allowed opacity-50' : ''}`}
                            />
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-900 font-mono">{item.project_code}</td>
                          <td className="px-6 py-4 text-sm text-slate-900">{item.project_name}</td>
                          <td className="px-6 py-4 text-sm text-slate-500">
                            {item.project_time ? new Date(item.project_time).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit' }) : '-'}
                          </td>
                          <td className="px-6 py-4 text-sm text-right font-medium text-slate-900">
                            ¥{item.amount.toLocaleString()}
                          </td>
                          <td className="px-6 py-4">
                            <input
                              type="text"
                              value={item.notes || ''}
                              onChange={(e) => updatePendingItemNote(item.id, e.target.value)}
                              placeholder="输入备注..."
                              className="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t border-slate-200">
                      <tr>
                        <td colSpan={4} className="px-6 py-3 text-sm text-slate-600 text-right">
                          已选择 {selectedPendingItems.size} 项，合计：
                        </td>
                        <td className="px-6 py-3 text-sm font-bold text-indigo-600 text-right">
                          ¥{pendingItems.filter(i => selectedPendingItems.has(i.id)).reduce((sum, i) => sum + i.amount, 0).toLocaleString()}
                        </td>
                        <td className="px-6 py-3"></td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>

              {/* Settlement History */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 px-6 py-3">
                  <h4 className="text-sm font-medium text-slate-900">结算单历史</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-500 text-xs">
                      <tr>
                        <th className="px-6 py-3 font-medium">结算单号</th>
                        <th className="px-6 py-3 font-medium">结算月份</th>
                        <th className="px-6 py-3 font-medium text-right">金额</th>
                        <th className="px-6 py-3 font-medium">项目数</th>
                        <th className="px-6 py-3 font-medium">状态</th>
                        <th className="px-6 py-3 font-medium">发票</th>
                        <th className="px-6 py-3 font-medium">付款凭证</th>
                        <th className="px-6 py-3 font-medium text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {settlements.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-6 py-8 text-center text-slate-500">暂无结算单</td>
                        </tr>
                      ) : (
                        settlements.map((settlement) => (
                          <tr key={settlement.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4 text-sm font-medium text-slate-900">{settlement.settlement_no}</td>
                            <td className="px-6 py-4 text-sm text-slate-500">{new Date(settlement.period_month).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })}</td>
                            <td className="px-6 py-4 text-sm text-right font-medium text-slate-900">¥{settlement.total_amount.toLocaleString()}</td>
                            <td className="px-6 py-4 text-sm text-slate-500">{settlement.project_count}</td>
                            <td className="px-6 py-4 text-sm">
                              <StatusBadge status={settlement.status} />
                            </td>
                            <td className="px-6 py-4">
                              {settlement.invoice_url ? (
                                <a
                                  href={settlement.invoice_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-indigo-600 hover:text-indigo-900 font-medium flex items-center gap-1"
                                >
                                  <FileText className="w-4 h-4" />
                                  查看
                                </a>
                              ) : (
                                <span className="text-slate-400 text-xs">未上传</span>
                              )}
                              {(settlement.status === '待提交' || settlement.status === '待 CEO 审核' || settlement.status === '已驳回' || settlement.status === '已付款') && (user?.role === '运营总监') && (
                                <label className="block mt-1 cursor-pointer text-xs text-indigo-600 hover:text-indigo-900">
                                  <Upload className="w-3 h-3 inline mr-1" />
                                  {settlement.invoice_url ? '重新上传' : '上传'}
                                  <input
                                    type="file"
                                    className="hidden"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    onChange={(e) => e.target.files?.[0] && handleUploadInvoice(settlement.id, e.target.files[0])}
                                  />
                                </label>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {settlement.payment_voucher_url ? (
                                <a
                                  href={settlement.payment_voucher_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-indigo-600 hover:text-indigo-900 font-medium flex items-center gap-1"
                                >
                                  <FileText className="w-4 h-4" />
                                  查看
                                </a>
                              ) : (
                                <span className="text-slate-400 text-xs">未上传</span>
                              )}
                              {settlement.status === '待财务审核' && (user?.role === '财务') && (
                                <label className="block mt-1 cursor-pointer text-xs text-indigo-600 hover:text-indigo-900">
                                  <Upload className="w-3 h-3 inline mr-1" />
                                  上传凭证
                                  <input
                                    type="file"
                                    className="hidden"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    onChange={(e) => e.target.files?.[0] && handleUploadVoucher(settlement.id, e.target.files[0])}
                                  />
                                </label>
                              )}
                              {settlement.status === '已付款' && (user?.role === '财务') && (
                                <label className="block mt-1 cursor-pointer text-xs text-indigo-600 hover:text-indigo-900">
                                  <Upload className="w-3 h-3 inline mr-1" />
                                  重新上传
                                  <input
                                    type="file"
                                    className="hidden"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    onChange={(e) => e.target.files?.[0] && handleUploadVoucher(settlement.id, e.target.files[0])}
                                  />
                                </label>
                              )}
                            </td>
                            <td className="px-6 py-4 text-sm text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleViewSettlement(settlement)}
                                  className="text-indigo-600 hover:text-indigo-900 font-medium"
                                >
                                  查看
                                </button>
                                {settlement.status === '待提交' && (
                                  <button
                                    onClick={() => handleSubmitSettlement(settlement.id)}
                                    className="text-emerald-600 hover:text-emerald-900 font-medium"
                                  >
                                    提交
                                  </button>
                                )}
                                {(settlement.status === '待提交' || settlement.status === '已驳回' || (settlement.status === '待 CEO 审核' && user?.role === '运营总监')) && (
                                  <button
                                    onClick={() => handleDeleteSettlement(settlement)}
                                    className="text-red-600 hover:text-red-900 font-medium"
                                  >
                                    删除
                                  </button>
                                )}
                                {settlement.status === '待 CEO 审核' && (user?.role === 'CEO') && (
                                  <>
                                    <button
                                      onClick={() => handleAuditSettlement(settlement.id, 'approved')}
                                      className="text-emerald-600 hover:text-emerald-900 font-medium"
                                    >
                                      审核通过
                                    </button>
                                    <button
                                      onClick={() => {
                                        const notes = prompt('请输入驳回意见：');
                                        if (notes) handleAuditSettlement(settlement.id, 'rejected', notes);
                                      }}
                                      className="text-red-600 hover:text-red-900 font-medium"
                                    >
                                      驳回
                                    </button>
                                  </>
                                )}
                                {settlement.status === '待财务审核' && (user?.role === '财务') && (
                                  <button
                                    onClick={() => handleFinanceConfirm(settlement.id)}
                                    className="text-blue-600 hover:text-blue-900 font-medium"
                                  >
                                    确认付款
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Generate Settlement Modal */}
      {showSettlementModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-slate-900">生成结算单</h3>
              <button
                onClick={() => setShowSettlementModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">结算月份</label>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                  <p className="text-sm font-medium text-slate-900">已选费用 ({selectedPendingItems.size}项)</p>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs">
                      <tr>
                        <th className="px-3 py-2">项目</th>
                        <th className="px-3 py-2">类型</th>
                        <th className="px-3 py-2 text-right">金额</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {pendingItems.filter(i => selectedPendingItems.has(i.id)).map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2 text-slate-900">{item.project_name}</td>
                          <td className="px-3 py-2 text-slate-500">{item.cost_type}</td>
                          <td className="px-3 py-2 text-right font-medium text-slate-900">¥{item.amount.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t border-slate-200">
                      <tr>
                        <td colSpan={2} className="px-3 py-2 text-sm text-slate-600 text-right">合计：</td>
                        <td className="px-3 py-2 text-right font-bold text-indigo-600">
                          ¥{pendingItems.filter(i => selectedPendingItems.has(i.id)).reduce((sum, i) => sum + i.amount, 0).toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowSettlementModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  onClick={handleGenerateSettlement}
                  disabled={generating}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generating ? '生成中...' : '确认生成'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settlement Detail Modal */}
      {selectedSettlement && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-slate-900">结算单详情</h3>
              <button
                onClick={() => { setSelectedSettlement(null); setSettlementItems([]); }}
                className="text-slate-400 hover:text-slate-600"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Settlement Info */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
                <div>
                  <p className="text-xs text-slate-500">结算单号</p>
                  <p className="text-sm font-medium text-slate-900">{selectedSettlement.settlement_no}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">结算月份</p>
                  <p className="text-sm font-medium text-slate-900">{new Date(selectedSettlement.period_month).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">结算总额</p>
                  <p className="text-lg font-bold text-indigo-600">¥{selectedSettlement.total_amount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">项目数量</p>
                  <p className="text-sm font-medium text-slate-900">{selectedSettlement.project_count} 个</p>
                </div>
              </div>

              {/* Status */}
              <div>
                <p className="text-xs text-slate-500 mb-1">状态</p>
                <StatusBadge status={selectedSettlement.status} />
              </div>

              {/* Items List */}
              <div>
                <h4 className="text-sm font-medium text-slate-900 mb-2">结算明细</h4>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-500 text-xs">
                      <tr>
                        <th className="px-3 py-2">项目</th>
                        <th className="px-3 py-2">费用类型</th>
                        <th className="px-3 py-2 text-right">金额</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-sm">
                      {settlementItems.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2 text-slate-900">{item.project_name}</td>
                          <td className="px-3 py-2 text-slate-500">{item.cost_type} - {item.cost_detail}</td>
                          <td className="px-3 py-2 text-right font-medium text-slate-900">¥{item.amount.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Notes */}
              {selectedSettlement.audit_notes && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-xs text-amber-800">
                    <span className="font-medium">审核意见：</span>
                    {selectedSettlement.audit_notes}
                  </p>
                </div>
              )}
              {selectedSettlement.finance_notes && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <p className="text-xs text-emerald-800">
                    <span className="font-medium">财务备注：</span>
                    {selectedSettlement.finance_notes}
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button
                  onClick={() => { setSelectedSettlement(null); setSettlementItems([]); }}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal (Total/Settled/Pending) */}
      {detailModalType && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-slate-900">
                {detailModalType === 'total' && '总金额明细'}
                {detailModalType === 'settled' && '已结算明细'}
                {detailModalType === 'pending' && '待结算明细'}
              </h3>
              <button
                onClick={() => { setDetailModalType(null); setDetailItems([]); }}
                className="text-slate-400 hover:text-slate-600"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Summary */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500">总金额</p>
                    <p className="text-lg font-bold text-indigo-600">¥{settlementStats.totalAmount.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">已结算</p>
                    <p className="text-sm font-medium text-emerald-600">¥{settlementStats.settledAmount.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">待结算</p>
                    <p className="text-sm font-medium text-amber-600">¥{settlementStats.pendingAmount.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* Detail Items */}
              <div>
                <h4 className="text-sm font-medium text-slate-900 mb-2">费用明细列表</h4>
                {detailItems.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg">
                    暂无明细数据
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-500 text-xs">
                        <tr>
                          <th className="px-3 py-2">项目编码</th>
                          <th className="px-3 py-2">项目名称</th>
                          <th className="px-3 py-2">付款状态</th>
                          <th className="px-3 py-2 text-right">金额</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {detailItems.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-mono text-slate-900">{item.project_code}</td>
                            <td className="px-3 py-2 text-slate-900">{item.project_name}</td>
                            <td className="px-3 py-2">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                item.payment_status === '已付款' ? 'bg-emerald-100 text-emerald-700' :
                                item.payment_status === '待 CEO 审核' ? 'bg-amber-100 text-amber-700' :
                                item.payment_status === 'CEO 已审核' ? 'bg-blue-100 text-blue-700' :
                                'bg-slate-100 text-slate-600'
                              }`}>
                                {item.payment_status}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-slate-900">¥{(item.actual_amount || item.amount || 0).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t border-slate-200">
                        <tr>
                          <td colSpan={3} className="px-3 py-2 text-sm text-slate-600 text-right">合计：</td>
                          <td className="px-3 py-2 text-right font-bold text-indigo-600">
                            ¥{detailItems.reduce((sum, i) => sum + (i.actual_amount || i.amount || 0), 0).toLocaleString()}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button
                  onClick={() => { setDetailModalType(null); setDetailItems([]); }}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
