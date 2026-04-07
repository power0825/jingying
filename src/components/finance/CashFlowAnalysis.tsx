import React, { useState, useEffect } from 'react';
import { Loader2, Search, TrendingUp, TrendingDown, FileText, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';

interface ProjectCashFlow {
  project_id: string;
  project_code: string;
  project_name: string;
  customer_name: string;
  bd_manager: string;
  contract_amount: number;
  received_amount: number;
  receivable_amount: number; // 待收 = 合同 - 已收
  paid_amount: number;
  payable_amount: number; // 待付 = 应付 - 已付
  invoice_issued_amount: number; // 已开票
  invoice_to_issue_amount: number; // 待开票
  invoice_received_amount: number; // 已收票
  invoice_to_receive_amount: number; // 待收票
  start_date: string | null;
  end_date: string | null;
}

interface SummaryData {
  total_contract: number;
  total_received: number;
  total_receivable: number;
  total_paid: number;
  total_payable: number;
  total_invoice_issued: number;
  total_invoice_to_issue: number;
  total_invoice_received: number;
  total_invoice_to_receive: number;
}

export default function CashFlowAnalysis() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectCashFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'abnormal' | 'completed'>('all');
  const [summary, setSummary] = useState<SummaryData>({
    total_contract: 0,
    total_received: 0,
    total_receivable: 0,
    total_paid: 0,
    total_payable: 0,
    total_invoice_issued: 0,
    total_invoice_to_issue: 0,
    total_invoice_received: 0,
    total_invoice_to_receive: 0,
  });

  useEffect(() => {
    fetchCashFlowData();
  }, []);

  const fetchCashFlowData = async () => {
    try {
      setLoading(true);

      // 1. 获取所有已通过的项目
      const { data: projectsData, error: pError } = await supabase
        .from('projects')
        .select(`
          id,
          code,
          name,
          customer_id,
          bd_manager_id,
          income_with_tax,
          status
        `)
        .eq('status', '已通过')
        .order('created_at', { ascending: false });

      if (pError) throw pError;

      if (!projectsData || projectsData.length === 0) {
        setProjects([]);
        setSummary({
          total_contract: 0,
          total_received: 0,
          total_receivable: 0,
          total_paid: 0,
          total_payable: 0,
          total_invoice_issued: 0,
          total_invoice_to_issue: 0,
          total_invoice_received: 0,
          total_invoice_to_receive: 0,
        });
        setLoading(false);
        return;
      }

      const projectIds = projectsData.map(p => p.id);

      // 2. 批量获取所有客户名称
      const customerIds = [...new Set(projectsData.map(p => p.customer_id).filter(Boolean)) as string[]];
      let customers: { id: string; name: string }[] = [];
      if (customerIds.length > 0) {
        const { data: cData } = await supabase
          .from('customers')
          .select('id, name')
          .in('id', customerIds);
        customers = cData || [];
      }

      // 3. 批量获取所有用户名称
      const userIds = [...new Set(projectsData.map(p => p.bd_manager_id).filter(Boolean)) as string[]];
      let users: { id: string; name: string }[] = [];
      if (userIds.length > 0) {
        const { data: uData } = await supabase
          .from('users')
          .select('id, name')
          .in('id', userIds);
        users = uData || [];
      }

      // 4. 批量获取所有行程数据
      const { data: itineraries } = await supabase
        .from('approved_project_itineraries')
        .select('project_id, date')
        .in('project_id', projectIds)
        .order('project_id', { ascending: true })
        .order('day_index', { ascending: true });

      // 5. 批量获取所有收款数据
      const { data: receivablesData } = await supabase
        .from('project_financial_customers')
        .select('project_id, amount, payment_status, invoice_url, payment_voucher_url')
        .in('project_id', projectIds);

      // 6. 批量获取所有付款数据（供应商）
      const { data: payablesData } = await supabase
        .from('project_financial_suppliers')
        .select('project_id, amount, actual_amount, payment_status, invoice_url, payment_voucher_url')
        .in('project_id', projectIds);

      // 7. 批量获取所有报销数据
      const { data: reimbursementsData } = await supabase
        .from('project_reimbursements')
        .select('project_id, amount, status')
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

      // 按项目分组收款
      const receivablesMap = new Map<string, { received: number; invoiceIssued: number }>();
      receivablesData?.forEach(r => {
        if (!receivablesMap.has(r.project_id)) {
          receivablesMap.set(r.project_id, { received: 0, invoiceIssued: 0 });
        }
        const data = receivablesMap.get(r.project_id)!;
        if (r.payment_status === '已收款') {
          data.received += Number(r.amount) || 0;
          if (r.invoice_url) {
            data.invoiceIssued += Number(r.amount) || 0;
          }
        }
      });

      // 按项目分组付款
      const payablesMap = new Map<string, { paid: number; payable: number; invoiceReceived: number }>();
      payablesData?.forEach(p => {
        if (!payablesMap.has(p.project_id)) {
          payablesMap.set(p.project_id, { paid: 0, payable: 0, invoiceReceived: 0 });
        }
        const data = payablesMap.get(p.project_id)!;
        const amount = Number(p.actual_amount) || Number(p.amount) || 0;
        if (p.payment_status === '已付款') {
          data.paid += amount;
          if (p.invoice_url) {
            data.invoiceReceived += amount;
          }
        } else {
          data.payable += amount;
        }
      });

      // 按项目分组报销
      const reimbursementsMap = new Map<string, { paid: number; pending: number }>();
      reimbursementsData?.forEach(r => {
        if (!reimbursementsMap.has(r.project_id)) {
          reimbursementsMap.set(r.project_id, { paid: 0, pending: 0 });
        }
        const data = reimbursementsMap.get(r.project_id)!;
        const amount = Number(r.amount) || 0;
        if (r.status === '已打款') {
          data.paid += amount;
        } else if (r.status === '待打款') {
          data.pending += amount;
        }
      });

      // 组装数据
      let summaryData: SummaryData = {
        total_contract: 0,
        total_received: 0,
        total_receivable: 0,
        total_paid: 0,
        total_payable: 0,
        total_invoice_issued: 0,
        total_invoice_to_issue: 0,
        total_invoice_received: 0,
        total_invoice_to_receive: 0,
      };

      const cashFlowItems: ProjectCashFlow[] = projectsData.map(project => {
        const contractAmount = Number(project.income_with_tax) || 0;

        // 收款
        const receivables = receivablesMap.get(project.id);
        const receivedAmount = receivables?.received || 0;
        const receivableAmount = contractAmount - receivedAmount;
        const invoiceIssuedAmount = receivables?.invoiceIssued || 0;
        const invoiceToIssueAmount = Math.max(0, receivedAmount - invoiceIssuedAmount);

        // 付款
        const payables = payablesMap.get(project.id);
        const paidAmount = payables?.paid || 0;
        const payableAmount = payables?.payable || 0;
        const invoiceReceivedAmount = payables?.invoiceReceived || 0;
        const invoiceToReceiveAmount = Math.max(0, paidAmount - invoiceReceivedAmount);

        // 报销
        const reimbursements = reimbursementsMap.get(project.id);
        const reimbursedAmount = reimbursements?.paid || 0;
        const pendingReimbursedAmount = reimbursements?.pending || 0;

        // 总待付 = 供应商待付 + 待打款报销
        const totalPayable = payableAmount + pendingReimbursedAmount;

        // 执行周期
        const projectItineraries = itineraryMap.get(project.id);
        const startDate = projectItineraries?.dates?.[0] || null;
        const endDate = projectItineraries?.dates?.[projectItineraries.dates.length - 1] || null;

        // 客户名称
        const customerName = project.customer_id ? customerMap[project.customer_id] || '-' : '-';

        // 项目经理名称
        const bdManager = project.bd_manager_id ? userMap[project.bd_manager_id] || '-' : '-';

        const item: ProjectCashFlow = {
          project_id: project.id,
          project_code: project.code,
          project_name: project.name,
          customer_name: customerName,
          bd_manager: bdManager,
          contract_amount: contractAmount,
          received_amount: receivedAmount,
          receivable_amount: receivableAmount,
          paid_amount: paidAmount,
          payable_amount: totalPayable,
          invoice_issued_amount: invoiceIssuedAmount,
          invoice_to_issue_amount: invoiceToIssueAmount,
          invoice_received_amount: invoiceReceivedAmount,
          invoice_to_receive_amount: invoiceToReceiveAmount,
          start_date: startDate,
          end_date: endDate,
        };

        // 汇总数据
        summaryData.total_contract += contractAmount;
        summaryData.total_received += receivedAmount;
        summaryData.total_receivable += receivableAmount;
        summaryData.total_paid += paidAmount;
        summaryData.total_payable += totalPayable;
        summaryData.total_invoice_issued += invoiceIssuedAmount;
        summaryData.total_invoice_to_issue += invoiceToIssueAmount;
        summaryData.total_invoice_received += invoiceReceivedAmount;
        summaryData.total_invoice_to_receive += invoiceToReceiveAmount;

        return item;
      });

      setProjects(cashFlowItems);
      setSummary(summaryData);
    } catch (err) {
      console.error('Error fetching cash flow data:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredProjects = projects.filter(item => {
    const matchesSearch =
      item.project_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.project_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.bd_manager.toLowerCase().includes(searchTerm.toLowerCase());

    let matchesFilter = true;
    if (filterStatus === 'abnormal') {
      // 显示异常项目（有待收或待付）
      matchesFilter = item.receivable_amount > 0 || item.payable_amount > 0;
    } else if (filterStatus === 'completed') {
      // 显示已完成项目（无待收待付）
      matchesFilter = item.receivable_amount === 0 && item.payable_amount === 0;
    }

    return matchesSearch && matchesFilter;
  });

  const formatMoney = (amount: number) => {
    return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 汇总卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 p-4 rounded-xl border border-emerald-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-emerald-700">合同总额</div>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-900">¥{formatMoney(summary.total_contract)}</div>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-xl border border-blue-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-blue-700">已收款</div>
            <TrendingUp className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-blue-900">¥{formatMoney(summary.total_received)}</div>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-xl border border-orange-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-orange-700">待收款</div>
            <AlertCircle className="w-4 h-4 text-orange-600" />
          </div>
          <div className="text-2xl font-bold text-orange-900">¥{formatMoney(summary.total_receivable)}</div>
        </div>
        <div className="bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-xl border border-red-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-red-700">待付款</div>
            <TrendingDown className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl font-bold text-red-900">¥{formatMoney(summary.total_payable)}</div>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-xl border border-purple-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-purple-700">净现金流</div>
            <TrendingUp className="w-4 h-4 text-purple-600" />
          </div>
          <div className={`text-2xl font-bold ${summary.total_received - summary.total_paid >= 0 ? 'text-purple-900' : 'text-red-900'}`}>
            ¥{formatMoney(summary.total_received - summary.total_paid)}
          </div>
        </div>
      </div>

      {/* 发票汇总 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-sm text-slate-500 mb-1">已开票（应收）</div>
          <div className="text-xl font-bold text-slate-900">¥{formatMoney(summary.total_invoice_issued)}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-sm text-slate-500 mb-1">待开票（已收未开）</div>
          <div className="text-xl font-bold text-amber-600">¥{formatMoney(summary.total_invoice_to_issue)}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-sm text-slate-500 mb-1">已收票（应付）</div>
          <div className="text-xl font-bold text-slate-900">¥{formatMoney(summary.total_invoice_received)}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-sm text-slate-500 mb-1">待收票（已付未收）</div>
          <div className="text-xl font-bold text-amber-600">¥{formatMoney(summary.total_invoice_to_receive)}</div>
        </div>
      </div>

      {/* 筛选器 */}
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
          <span className="text-sm text-slate-600">项目状态：</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'all' | 'abnormal' | 'completed')}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
          >
            <option value="all">全部项目</option>
            <option value="abnormal">有待收/待付</option>
            <option value="completed">已完成</option>
          </select>
        </div>
      </div>

      {/* 项目明细表 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-slate-500 border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 font-medium">项目编码</th>
                <th className="px-4 py-3 font-medium">项目名称</th>
                <th className="px-4 py-3 font-medium">客户</th>
                <th className="px-4 py-3 font-medium">项目经理</th>
                <th className="px-4 py-3 font-medium text-right">合同金额</th>
                <th className="px-4 py-3 font-medium text-right">已收款</th>
                <th className="px-4 py-3 font-medium text-right">待收款</th>
                <th className="px-4 py-3 font-medium text-right">已付款</th>
                <th className="px-4 py-3 font-medium text-right">待付款</th>
                <th className="px-4 py-3 font-medium text-right">净现金流</th>
                <th className="px-4 py-3 font-medium text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-slate-400 italic">
                    暂无数据
                  </td>
                </tr>
              ) : (
                filteredProjects.map((item) => (
                  <tr key={item.project_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{item.project_code}</td>
                    <td className="px-4 py-3 font-medium text-slate-900 truncate max-w-[150px]" title={item.project_name}>
                      {item.project_name}
                    </td>
                    <td className="px-4 py-3 text-slate-600 truncate max-w-[120px]" title={item.customer_name}>
                      {item.customer_name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.bd_manager}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">¥{formatMoney(item.contract_amount)}</td>
                    <td className="px-4 py-3 text-right text-emerald-600">¥{formatMoney(item.received_amount)}</td>
                    <td className="px-4 py-3 text-right text-orange-600">¥{formatMoney(item.receivable_amount)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">¥{formatMoney(item.paid_amount)}</td>
                    <td className="px-4 py-3 text-right text-red-600">¥{formatMoney(item.payable_amount)}</td>
                    <td className={`px-4 py-3 text-right font-medium ${
                      item.received_amount - item.paid_amount >= 0 ? 'text-emerald-600' : 'text-red-600'
                    }`}>
                      ¥{formatMoney(item.received_amount - item.paid_amount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => navigate(`/finance/profit-analysis/${item.project_id}`)}
                        className="text-indigo-600 hover:text-indigo-900 text-xs font-medium"
                      >
                        详情
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 图例说明 */}
      <div className="flex items-start space-x-2 p-4 bg-slate-50 rounded-lg border border-slate-200">
        <FileText className="w-5 h-5 text-slate-500 mt-0.5" />
        <div className="text-sm text-slate-600">
          <p className="font-medium mb-1">说明：</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>待开票 = 已收款但未开票金额，需要财务安排开具发票</li>
            <li>待收票 = 已付款但未收到供应商发票，需要财务催收</li>
            <li>净现金流 = 已收款 - 已付款，正数表示现金流入，负数表示现金流出</li>
            <li>待付款包含供应商待付款和待打款报销</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
