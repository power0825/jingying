import React, { useState, useEffect } from 'react';
import GeneralReimbursements from '../components/finance/GeneralReimbursements';
import ReimbursementApproval from '../components/finance/ReimbursementApproval';
import PaymentApproval from '../components/finance/PaymentApproval';
import InvoiceManagement from '../components/finance/InvoiceManagement';
import ProfitAnalysis from '../components/finance/ProfitAnalysis';
import SettlementProcessing from '../components/finance/SettlementProcessing';
import CommissionProcessing from '../components/finance/CommissionProcessing';
import CashFlowAnalysis from '../components/finance/CashFlowAnalysis';
import { useAppStore } from '../store';
import { supabase } from '../lib/supabase';
import { useNavigate, useParams } from 'react-router-dom';

type TabType = 'my-reimbursements' | 'reimbursement-approval' | 'payment-approval' | 'invoice-management' | 'profit-analysis' | 'settlement-processing' | 'commission-processing';

export default function Finance() {
  const { user } = useAppStore();
  const navigate = useNavigate();
  const { tab } = useParams<{ tab: TabType }>();
  const [activeTab, setActiveTab] = useState<TabType>(tab || 'my-reimbursements');
  const [counts, setCounts] = useState({
    reimbursements: 0,
    payments: 0,
    invoices: 0,
    settlements: 0
  });

  const isFinance = user?.role === '财务';
  const isCEO = user?.role === 'CEO';
  const isDirector = user?.role === '客户总监' || user?.role === '运营总监';
  // CEO、财务或总监可以访问财务管理
  const canViewFinance = isFinance || isCEO || isDirector;

  useEffect(() => {
    if (canViewFinance) {
      fetchCounts();

      // Set up realtime subscription to update counts
      const reimbursementSub = supabase
        .channel('reimbursement-counts')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'project_reimbursements' }, () => fetchCounts())
        .subscribe();

      const paymentSub = supabase
        .channel('payment-counts')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'project_financial_suppliers' }, () => fetchCounts())
        .subscribe();

      const invoiceSub = supabase
        .channel('invoice-counts')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'project_financial_customers' }, () => fetchCounts())
        .subscribe();

      const settlementSub = supabase
        .channel('settlement-counts')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'supplier_settlements' }, () => fetchCounts())
        .subscribe();

      return () => {
        reimbursementSub.unsubscribe();
        paymentSub.unsubscribe();
        invoiceSub.unsubscribe();
        settlementSub.unsubscribe();
      };
    }
  }, [canViewFinance]);

  const fetchCounts = async () => {
    try {
      let rbQuery = supabase.from('project_reimbursements').select('id', { count: 'exact', head: true }).in('status', ['待总监初审', '待 CEO 终审', '待财务审核', '待审核']);

      // 总监只能看到自己团队的待审批报销计数
      if (isDirector) {
        const { data: subordinatesData } = await supabase
          .from('users')
          .select('id')
          .eq('manager_id', user?.id);

        const subordinateIds = subordinatesData?.map(u => u.id) || [];
        const teamIds = [...subordinateIds, user?.id].filter(Boolean);

        rbQuery = rbQuery.in('user_id', teamIds);
      }

      const [rbRes, payRes, invRes, settlementRes] = await Promise.all([
        rbQuery,
        supabase.from('project_financial_suppliers').select('id', { count: 'exact', head: true }).eq('payment_status', '已申请'),
        supabase.from('project_financial_customers').select('id', { count: 'exact', head: true }).eq('payment_status', '未收款'),
        supabase.from('supplier_settlements').select('id', { count: 'exact', head: true }).in('status', ['待 CEO 审核', '待财务审核'])
      ]);

      setCounts({
        reimbursements: rbRes.count || 0,
        payments: payRes.count || 0,
        invoices: invRes.count || 0,
        settlements: settlementRes.count || 0
      });
    } catch (err) {
      console.error('Error fetching counts:', err);
    }
  };

  const tabs = [
    { id: 'my-reimbursements', label: '我的报销', show: true },
    { id: 'reimbursement-approval', label: '报销处理', show: canViewFinance, count: counts.reimbursements },
    { id: 'payment-approval', label: '付款处理', show: canViewFinance && !isDirector, count: counts.payments },
    { id: 'invoice-management', label: '收款处理', show: canViewFinance && !isDirector, count: counts.invoices },
    { id: 'settlement-processing', label: '结算单处理', show: canViewFinance && !isDirector, count: counts.settlements },
    { id: 'commission-processing', label: '提成处理', show: canViewFinance && !isDirector },
    { id: 'cash-flow-analysis', label: '收付款分析', show: canViewFinance && !isDirector },
    { id: 'profit-analysis', label: '利润分析', show: canViewFinance && !isDirector },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">财务管理</h1>
          <p className="text-sm text-slate-500 mt-1">收付款记录、费用报销与财务报表。</p>
        </div>
      </div>

      <div className="flex border-b border-slate-200 overflow-x-auto">
        {tabs.filter(t => t.show).map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id as TabType);
              navigate(`/finance/${tab.id}`);
            }}
            className={`px-6 py-3 text-sm font-medium transition-colors relative whitespace-nowrap flex items-center ${
              activeTab === tab.id ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded-full min-w-[18px] text-center">
                {tab.count > 99 ? '99+' : tab.count}
              </span>
            )}
            {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {activeTab === 'my-reimbursements' && <GeneralReimbursements />}
        {activeTab === 'reimbursement-approval' && <ReimbursementApproval />}
        {activeTab === 'payment-approval' && <PaymentApproval />}
        {activeTab === 'invoice-management' && <InvoiceManagement />}
        {activeTab === 'settlement-processing' && <SettlementProcessing />}
        {activeTab === 'commission-processing' && <CommissionProcessing />}
        {activeTab === 'cash-flow-analysis' && <CashFlowAnalysis />}
        {activeTab === 'profit-analysis' && <ProfitAnalysis />}
      </div>
    </div>
  );
}
