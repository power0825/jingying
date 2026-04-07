import React, { useState, useEffect } from 'react';
import { Loader2, Search, DollarSign } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store';

interface CommissionItem {
  project_id: string;
  project_code: string;
  project_name: string;
  customer_name: string;
  bd_manager: string;
  class_teacher: string;
  service_commission: number;
  product_commission: number;
  start_date: string | null;
  end_date: string | null;
  payment_status: '未回款' | '部分回款' | '已回款';
  total_receivable: number;
  total_received: number;
  service_paid: boolean;
  product_paid: boolean;
}

export default function CommissionProcessing() {
  const { user } = useAppStore();
  const [commissions, setCommissions] = useState<CommissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<'all' | '未回款' | '部分回款' | '已回款'>('all');
  const [processing, setProcessing] = useState<string | null>(null);

  const isFinance = user?.role === '财务';
  const isCEO = user?.role === 'CEO';
  const canView = isFinance || isCEO;

  useEffect(() => {
    fetchCommissions();
  }, []);

  const fetchCommissions = async () => {
    try {
      setLoading(true);

      // 1. 获取所有已通过的项目
      const { data: projects, error: pError } = await supabase
        .from('projects')
        .select(`
          id,
          code,
          name,
          customer_id,
          bd_manager_id,
          class_teacher_id,
          service_commission_rate,
          product_commission_rate,
          service_commission_paid,
          product_commission_paid,
          income_with_tax,
          status
        `)
        .eq('status', '已通过')
        .order('created_at', { ascending: false });

      if (pError) throw pError;

      if (!projects || projects.length === 0) {
        setCommissions([]);
        setLoading(false);
        return;
      }

      const projectIds = projects.map(p => p.id);

      // 2. 批量获取所有行程数据
      const { data: itineraries } = await supabase
        .from('approved_project_itineraries')
        .select('project_id, date')
        .in('project_id', projectIds)
        .order('project_id', { ascending: true })
        .order('day_index', { ascending: true });

      // 3. 批量获取所有客户名称
      const customerIds = [...new Set(projects.map(p => p.customer_id).filter(Boolean)) as string[]];
      let customers: { id: string; name: string }[] = [];
      if (customerIds.length > 0) {
        const { data: cData } = await supabase
          .from('customers')
          .select('id, name')
          .in('id', customerIds);
        customers = cData || [];
      }

      // 4. 批量获取所有用户名称（项目经理 + 班主任）
      const userIds = [
        ...projects.map(p => p.bd_manager_id).filter(Boolean),
        ...projects.map(p => p.class_teacher_id).filter(Boolean),
      ] as string[];
      let users: { id: string; name: string }[] = [];
      if (userIds.length > 0) {
        const { data: uData } = await supabase
          .from('users')
          .select('id, name')
          .in('id', userIds);
        users = uData || [];
      }

      // 5. 批量获取所有商品销售数据
      const { data: salesData } = await supabase
        .from('product_sales')
        .select('project_id, total_amount')
        .in('project_id', projectIds);

      // 6. 批量获取所有收款数据
      const { data: financialsData } = await supabase
        .from('project_financial_customers')
        .select('project_id, amount, payment_status')
        .in('project_id', projectIds);

      // 创建查找映射
      const customerMap = Object.fromEntries(customers.map(c => [c.id, c.name]));
      const userMap = Object.fromEntries(users.map(u => [u.id, u.name]));

      // 按项目分组行程
      const itineraryMap = new Map<string, { dates: string[] }>();
      itineraries?.forEach(it => {
        if (!itineraryMap.has(it.project_id)) {
          itineraryMap.set(it.project_id, { dates: [] });
        }
        itineraryMap.get(it.project_id)!.dates.push(it.date);
      });

      // 按项目分组销售
      const salesMap = new Map<string, number>();
      salesData?.forEach(s => {
        salesMap.set(s.project_id, (salesMap.get(s.project_id) || 0) + (Number(s.total_amount) || 0));
      });

      // 按项目分组收款
      const financialsMap = new Map<string, { received: number; total: number }>();
      financialsData?.forEach(f => {
        if (!financialsMap.has(f.project_id)) {
          financialsMap.set(f.project_id, { received: 0, total: 0 });
        }
        const data = financialsMap.get(f.project_id)!;
        data.total += Number(f.amount) || 0;
        if (f.payment_status === '已收款') {
          data.received += Number(f.amount) || 0;
        }
      });

      // 组装数据
      const commissionItems: CommissionItem[] = projects.map(project => {
        // 执行周期
        const projectItineraries = itineraryMap.get(project.id);
        const startDate = projectItineraries?.dates?.[0] || null;
        const endDate = projectItineraries?.dates?.[projectItineraries.dates.length - 1] || null;

        // 客户名称
        const customerName = project.customer_id ? customerMap[project.customer_id] || '-' : '-';

        // 项目经理名称
        const bdManager = project.bd_manager_id ? userMap[project.bd_manager_id] || '-' : '-';

        // 班主任名称
        const classTeacher = project.class_teacher_id ? userMap[project.class_teacher_id] || '-' : '-';

        // 服务提成
        let serviceCommission = 0;
        if (project.service_commission_rate && project.income_with_tax) {
          const serviceIncomeWithoutTax = Number(project.income_with_tax) / (1 + 0.03);
          serviceCommission = serviceIncomeWithoutTax * (Number(project.service_commission_rate) / 100);
        }

        // 商品提成
        let productCommission = 0;
        const productSalesTotal = salesMap.get(project.id) || 0;
        if (productSalesTotal > 0) {
          const productIncomeWithoutTax = productSalesTotal / (1 + 0.13);
          productCommission = productIncomeWithoutTax * (Number(project.product_commission_rate || 0) / 100);
        }

        // 回款状态
        const contractAmount = project.income_with_tax ? Number(project.income_with_tax) : 0;
        const financials = financialsMap.get(project.id);
        const totalReceived = financials?.received || 0;

        let paymentStatus: '未回款' | '部分回款' | '已回款' = '未回款';
        if (contractAmount > 0) {
          if (totalReceived >= contractAmount) {
            paymentStatus = '已回款';
          } else if (totalReceived > 0 && totalReceived < contractAmount) {
            paymentStatus = '部分回款';
          }
        }

        return {
          project_id: project.id,
          project_code: project.code,
          project_name: project.name,
          customer_name: customerName,
          bd_manager: bdManager,
          class_teacher: classTeacher,
          service_commission: serviceCommission,
          product_commission: productCommission,
          start_date: startDate,
          end_date: endDate,
          payment_status: paymentStatus,
          total_receivable: contractAmount,
          total_received: totalReceived,
          service_paid: project.service_commission_paid || false,
          product_paid: project.product_commission_paid || false,
        };
      });

      // 按开始日期倒序排列
      const sorted = commissionItems.sort((a, b) => {
        const dateA = a.start_date ? new Date(a.start_date).getTime() : 0;
        const dateB = b.start_date ? new Date(b.start_date).getTime() : 0;
        return dateB - dateA;
      });

      setCommissions(sorted);
    } catch (err) {
      console.error('Error fetching commissions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePayService = async (projectId: string) => {
    try {
      setProcessing(projectId + '_service');

      // 更新项目表中的服务提成支付状态
      const { error } = await supabase
        .from('projects')
        .update({ service_commission_paid: true })
        .eq('id', projectId);

      if (error) throw error;

      // 刷新列表
      await fetchCommissions();
      alert('服务提成已支付');
    } catch (err) {
      console.error('Error paying service commission:', err);
      alert('支付失败');
    } finally {
      setProcessing(null);
    }
  };

  const handlePayProduct = async (projectId: string) => {
    try {
      setProcessing(projectId + '_product');

      // 更新项目表中的商品提成支付状态
      const { error } = await supabase
        .from('projects')
        .update({ product_commission_paid: true })
        .eq('id', projectId);

      if (error) throw error;

      // 刷新列表
      await fetchCommissions();
      alert('商品提成已支付');
    } catch (err) {
      console.error('Error paying product commission:', err);
      alert('支付失败');
    } finally {
      setProcessing(null);
    }
  };

  const filteredCommissions = commissions.filter(item => {
    const matchesSearch =
      item.project_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.project_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.bd_manager.toLowerCase().includes(searchTerm.toLowerCase());

    let matchesFilter = true;
    if (filterPaymentStatus !== 'all') {
      matchesFilter = item.payment_status === filterPaymentStatus;
    }

    return matchesSearch && matchesFilter;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-sm text-slate-500 mb-1">项目总数</div>
          <div className="text-2xl font-bold text-slate-900">{commissions.length}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-sm text-slate-500 mb-1">服务提成总额</div>
          <div className="text-2xl font-bold text-indigo-600">
            ¥{commissions.reduce((sum, c) => sum + c.service_commission, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-sm text-slate-500 mb-1">商品提成总额</div>
          <div className="text-2xl font-bold text-emerald-600">
            ¥{commissions.reduce((sum, c) => sum + c.product_commission, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex justify-between items-center">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索项目名称、编号、客户或项目经理..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
          />
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-slate-600">回款状态：</span>
          <select
            value={filterPaymentStatus}
            onChange={(e) => setFilterPaymentStatus(e.target.value as 'all' | '未回款' | '部分回款' | '已回款')}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
          >
            <option value="all">全部</option>
            <option value="未回款">未回款</option>
            <option value="部分回款">部分回款</option>
            <option value="已回款">已回款</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-slate-500 border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 font-medium">项目编码</th>
                <th className="px-4 py-3 font-medium">项目名称</th>
                <th className="px-4 py-3 font-medium">客户名称</th>
                <th className="px-4 py-3 font-medium">执行周期</th>
                <th className="px-4 py-3 font-medium">项目经理</th>
                <th className="px-4 py-3 font-medium">班主任</th>
                <th className="px-4 py-3 font-medium">服务提成金额</th>
                <th className="px-4 py-3 font-medium">商品提成金额</th>
                <th className="px-4 py-3 font-medium">回款状态</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCommissions.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-400 italic">
                    暂无提成数据
                  </td>
                </tr>
              ) : (
                filteredCommissions.map((item) => (
                  <tr key={item.project_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{item.project_code}</td>
                    <td className="px-4 py-3 font-medium text-slate-900 truncate max-w-[200px]" title={item.project_name}>
                      {item.project_name}
                    </td>
                    <td className="px-4 py-3 text-slate-600 truncate max-w-[150px]" title={item.customer_name}>
                      {item.customer_name}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {item.start_date || item.end_date ? (
                        <>
                          {new Date(item.start_date!).toLocaleDateString()} - {new Date(item.end_date!).toLocaleDateString()}
                        </>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.bd_manager}</td>
                    <td className="px-4 py-3 text-slate-600">{item.class_teacher}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      ¥{item.service_commission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      ¥{item.product_commission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        item.payment_status === '已回款'
                          ? 'bg-green-100 text-green-700'
                          : item.payment_status === '部分回款'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {item.payment_status === '已回款' ? '已回款完毕' : item.payment_status === '部分回款' ? '部分回款' : '未回款'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => handlePayService(item.project_id)}
                          disabled={!isFinance || processing === item.project_id + '_service' || item.payment_status !== '已回款' || item.service_paid}
                          className={`flex items-center px-2 py-1 rounded text-xs transition-colors ${
                            !isFinance || item.payment_status !== '已回款' || item.service_paid
                              ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                              : 'bg-indigo-600 text-white hover:bg-indigo-700'
                          } ${processing === item.project_id + '_service' ? 'opacity-50 cursor-not-allowed' : ''}`}
                          title={item.service_paid ? '服务提成已支付' : item.payment_status !== '已回款' ? '回款完毕后方可支付' : !isFinance ? '只有财务可以支付提成' : ''}
                        >
                          <DollarSign className="w-3 h-3 mr-1" />
                          {item.service_paid ? '服务已支付' : '支付服务'}
                        </button>
                        <button
                          onClick={() => handlePayProduct(item.project_id)}
                          disabled={!isFinance || processing === item.project_id + '_product' || item.payment_status !== '已回款' || item.product_paid}
                          className={`flex items-center px-2 py-1 rounded text-xs transition-colors ${
                            !isFinance || item.payment_status !== '已回款' || item.product_paid
                              ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                              : 'bg-emerald-600 text-white hover:bg-emerald-700'
                          } ${processing === item.project_id + '_product' ? 'opacity-50 cursor-not-allowed' : ''}`}
                          title={item.product_paid ? '商品提成已支付' : item.payment_status !== '已回款' ? '回款完毕后方可支付' : !isFinance ? '只有财务可以支付提成' : ''}
                        >
                          <DollarSign className="w-3 h-3 mr-1" />
                          {item.product_paid ? '商品已支付' : '支付商品'}
                        </button>
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
  );
}
