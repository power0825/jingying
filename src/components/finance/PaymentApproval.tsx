import React, { useState, useEffect } from 'react';
import { Upload, FileText, Loader2, CheckCircle, Search, DollarSign, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store';
import { createNotification } from '../../lib/notifications';

interface SupplierPayment {
  id: string;
  project_id: string;
  supplier_id: string | null;
  supplier_name: string;
  amount: number;
  actual_amount: number;
  payment_method: '月结' | '先票后款' | '先款后票' | string;
  invoice_url: string | null;
  payment_voucher_url: string | null;
  payment_status: '未付款' | '待 CEO 审核' | 'CEO 已审核' | '已付款';
  approval_status?: 'pending' | 'approved' | 'rejected';
  is_requested: boolean;
  project_name?: string;
  project_manager_id?: string;
  ops_director_id?: string | null;
  ops_director_name?: string;
  ceo_approver_id?: string | null;
  notes?: string;
}

export default function PaymentApproval() {
  const { user } = useAppStore();
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const isCEO = user?.role === 'CEO';
  const isFinance = user?.role === '财务';

  useEffect(() => {
    fetchPayments();
  }, []);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      setError(null);
      // Fetch supplier payments that are requested or paid
      const { data, error } = await supabase
        .from('project_financial_suppliers')
        .select(`
          *,
          projects(name, bd_manager_id),
          suppliers(name)
        `)
        .in('payment_status', ['未付款', '待 CEO 审核', 'CEO 已审核', '已付款'])
        .order('payment_status', { ascending: true });

      if (error) throw error;

      console.log('Payments data:', data);

      // Fetch ops_director names separately
      const opsDirectorIds = [...new Set(data?.map(p => p.ops_director_id).filter(Boolean))];
      let opsDirectors: any[] = [];
      if (opsDirectorIds.length > 0) {
        const { data: opsData } = await supabase
          .from('users')
          .select('id, name')
          .in('id', opsDirectorIds);
        opsDirectors = opsData || [];
      }

      const opsDirectorMap = Object.fromEntries(opsDirectors.map(d => [d.id, d.name]));

      const formatted = (data || []).map((p: any) => ({
        ...p,
        supplier_name: p.supplier_id ? (p.suppliers?.name || '未知供应商') : (p.notes || '车辆/大巴费用'),
        project_name: p.projects?.name || '未知项目',
        project_manager_id: p.projects?.bd_manager_id,
        ops_director_name: p.ops_director_id ? (opsDirectorMap[p.ops_director_id] || '未知') : '未知'
      }));

      setPayments(formatted);
    } catch (err: any) {
      console.error('Error fetching payments:', err);
      setError(err.message || '获取付款申请失败');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (id: string, file: File, type: 'invoice' | 'voucher') => {
    try {
      setProcessing(id);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
      const filePath = `financials/${type === 'invoice' ? 'invoices' : 'vouchers'}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('attachments')
        .getPublicUrl(filePath);

      const updateData = type === 'invoice' ? { invoice_url: publicUrl } : { payment_voucher_url: publicUrl };
      const { error: updateError } = await supabase
        .from('project_financial_suppliers')
        .update(updateData)
        .eq('id', id);

      if (updateError) throw updateError;
      
      setPayments(payments.map(p => p.id === id ? { ...p, ...updateData } : p));
      alert(`${type === 'invoice' ? '发票' : '付款凭证'}上传成功！`);
    } catch (err) {
      console.error('Error uploading file:', err);
      alert('文件上传失败');
    } finally {
      setProcessing(null);
    }
  };

  const confirmPayment = async (payment: SupplierPayment) => {
    if (!isFinance) {
      alert('只有财务角色可以确认付款。');
      return;
    }
    try {
      setProcessing(payment.id);
      const { error } = await supabase
        .from('project_financial_suppliers')
        .update({ payment_status: '已付款' })
        .eq('id', payment.id);

      if (error) throw error;

      // Notify the project manager
      if (payment.project_manager_id) {
        await createNotification(
          payment.project_manager_id,
          '供应商付款已完成',
          `项目（${payment.project_name}）的供应商（${payment.supplier_name}）款项已支付。`,
          'approval_feedback',
          `/projects/${payment.project_id}`
        );
      }

      setPayments(payments.map(p => p.id === payment.id ? { ...p, payment_status: '已付款' } : p));
      alert('已标记为已付款！');
    } catch (err) {
      console.error('Error marking as paid:', err);
      alert('操作失败');
    } finally {
      setProcessing(null);
    }
  };

  const approvePayment = async (payment: SupplierPayment, action: 'approved' | 'rejected') => {
    if (!isCEO) {
      alert('只有 CEO 可以审核付款申请。');
      return;
    }
    setProcessing(payment.id);
    try {
      const cleaned: any = {};
      Object.entries(payment).forEach(([key, value]) => {
        if (['supplier_name', 'created_at', 'ops_director_name'].includes(key)) return;
        if (value === '') cleaned[key] = null;
        else cleaned[key] = value;
      });
      cleaned.project_id = payment.project_id;
      cleaned.id = payment.id;
      cleaned.approval_status = action;
      cleaned.payment_status = action === 'approved' ? 'CEO 已审核' : '未付款';
      cleaned.ceo_approver_id = user?.id;
      cleaned.ceo_approval_date = action === 'approved' ? new Date().toISOString() : null;
      cleaned.ceo_approval_notes = action === 'rejected' ? '驳回' : null;
      if (!payment.supplier_id) cleaned.notes = payment.supplier_name;

      const { error } = await supabase.from('project_financial_suppliers').upsert(cleaned);
      if (error) throw error;

      setPayments(payments.map(p => p.id === payment.id ? {
        ...p,
        approval_status: action,
        payment_status: action === 'approved' ? 'CEO 已审核' : '未付款',
        ceo_approver_id: user?.id
      } : p));

      // 通知运营总监
      if (payment.ops_director_id) {
        await createNotification(
          payment.ops_director_id,
          `供应商付款申请已${action === 'approved' ? '通过' : '驳回'}`,
          `项目（${payment.project_name}）的供应商（${payment.supplier_name}）付款申请已被 CEO ${action === 'approved' ? '审核通过' : '驳回'}。`,
          'approval_feedback',
          `/projects/${payment.project_id}`
        );
      }
      alert(`已${action === 'approved' ? '审核通过' : '驳回'}！`);
    } catch (err) {
      console.error('Error approving payment:', err);
      alert('操作失败');
    } finally {
      setProcessing(null);
    }
  };

  const filteredPayments = payments.filter(p => {
    const sName = (p.supplier_name || '').toLowerCase();
    const pName = (p.project_name || '').toLowerCase();
    const sTerm = searchTerm.toLowerCase();
    const matchesSearch = sName.includes(sTerm) || pName.includes(sTerm);

    // Default: only show requested (待 CEO 审核)
    // If showHistory: show paid (已付款) and unrequested (未付款) as well
    if (!showHistory && p.payment_status !== '待 CEO 审核') return false;
    return matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center">
        <AlertCircle className="w-5 h-5 mr-2" />
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索供应商或项目..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
            />
          </div>
          <label className="flex items-center space-x-2 text-sm text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showHistory}
              onChange={(e) => setShowHistory(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>显示已付款记录</span>
          </label>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-slate-500 border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 font-medium">关联项目</th>
                <th className="px-4 py-3 font-medium">申请发起人</th>
                <th className="px-4 py-3 font-medium">供应商/酒店</th>
                <th className="px-4 py-3 font-medium">应付金额</th>
                <th className="px-4 py-3 font-medium">实际支出</th>
                <th className="px-4 py-3 font-medium">付款方式</th>
                <th className="px-4 py-3 font-medium">供应商发票</th>
                <th className="px-4 py-3 font-medium">付款凭证</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-400 italic">
                    暂无待处理的付款申请
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-600 font-medium">{p.project_name}</td>
                    <td className="px-4 py-3 text-slate-600">{p.ops_director_name}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{p.supplier_name}</td>
                    <td className="px-4 py-3 text-slate-500">¥{p.amount.toLocaleString()}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">¥{p.actual_amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-600">{p.payment_method}</td>
                    <td className="px-4 py-3">
                      {p.payment_method === '月结' ? (
                        <span className="text-slate-500">月结</span>
                      ) : (
                        <div className="flex items-center space-x-2">
                          {p.invoice_url ? (
                            <a href={p.invoice_url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline flex items-center">
                              <FileText className="w-4 h-4 mr-1" /> 查看
                            </a>
                          ) : (
                            <span className="text-slate-400">未传</span>
                          )}
                          {p.payment_status === '待 CEO 审核' && (
                            <label className="cursor-pointer p-1 text-slate-500 hover:text-indigo-600 transition-colors">
                              <Upload className="w-4 h-4" />
                              <input
                                type="file"
                                className="hidden"
                                onChange={(e) => e.target.files?.[0] && handleFileUpload(p.id, e.target.files[0], 'invoice')}
                              />
                            </label>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {p.payment_method === '月结' ? (
                        <span className="text-slate-500">月结</span>
                      ) : (
                        <div className="flex items-center space-x-2">
                          {p.payment_voucher_url ? (
                            <a href={p.payment_voucher_url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline flex items-center">
                              <FileText className="w-4 h-4 mr-1" /> 查看
                            </a>
                          ) : (
                            <span className="text-slate-400">未传</span>
                          )}
                          {p.payment_status === '待 CEO 审核' && (
                            <label className="cursor-pointer p-1 text-slate-500 hover:text-indigo-600 transition-colors">
                              <Upload className="w-4 h-4" />
                              <input
                                type="file"
                                className="hidden"
                                onChange={(e) => e.target.files?.[0] && handleFileUpload(p.id, e.target.files[0], 'voucher')}
                              />
                            </label>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.payment_method === '月结' ? 'bg-slate-100 text-slate-600' :
                        p.payment_status === '已付款' ? 'bg-green-100 text-green-700' :
                        p.payment_status === '待 CEO 审核' ? 'bg-blue-100 text-blue-700' :
                        p.payment_status === 'CEO 已审核' ? 'bg-indigo-100 text-indigo-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {p.payment_method === '月结' ? '月结' : p.payment_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.payment_status === '待 CEO 审核' && isCEO && (
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => approvePayment(p, 'approved')}
                            disabled={processing === p.id}
                            className="flex items-center px-3 py-1 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-700 transition-colors"
                          >
                            <CheckCircle className="w-3 h-3 mr-1" />
                            审核通过
                          </button>
                          <button
                            onClick={() => approvePayment(p, 'rejected')}
                            disabled={processing === p.id}
                            className="flex items-center px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition-colors"
                          >
                            <AlertCircle className="w-3 h-3 mr-1" />
                            驳回
                          </button>
                        </div>
                      )}
                      {p.payment_status === 'CEO 已审核' && isFinance && (
                        <button
                          onClick={() => confirmPayment(p)}
                          disabled={processing === p.id}
                          className="flex items-center px-3 py-1 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-700 transition-colors"
                        >
                          <DollarSign className="w-3 h-3 mr-1" />
                          确认付款
                        </button>
                      )}
                      {p.payment_status === '已付款' && (
                        <span className="text-slate-400 text-xs">已完成</span>
                      )}
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
