import React, { useState, useEffect } from 'react';
import { Upload, FileText, Loader2, CheckCircle, Search, DollarSign } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store';
import { createNotification } from '../../lib/notifications';

interface CustomerPayment {
  id: string;
  project_id: string;
  customer_id: string | null;
  amount: number;
  invoice_url: string | null;
  payment_voucher_url: string | null;
  payment_status: '未收款' | '已收款';
  project_name?: string;
  customer_name?: string;
  project_manager_id?: string;
}

export default function InvoiceManagement() {
  const { user } = useAppStore();
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const isFinance = user?.role === '财务';
  const isCEO = user?.role === 'CEO';
  const canManage = isFinance || isCEO;

  useEffect(() => {
    fetchPayments();
  }, []);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      // Fetch customer payments
      const { data, error } = await supabase
        .from('project_financial_customers')
        .select(`
          *,
          projects(name, bd_manager_id),
          customers(name)
        `)
        .in('payment_status', ['未收款', '已收款'])
        .order('payment_status', { ascending: true });

      if (error) throw error;
      
      const formatted = (data || []).map((p: any) => ({
        ...p,
        project_name: p.projects?.name || '未知项目',
        customer_name: p.customers?.name || '未知客户',
        project_manager_id: p.projects?.bd_manager_id
      }));

      setPayments(formatted);
    } catch (err) {
      console.error('Error fetching payments:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (id: string, file: File) => {
    try {
      setProcessing(id);
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

      const { error: updateError } = await supabase
        .from('project_financial_customers')
        .update({ invoice_url: publicUrl })
        .eq('id', id);

      if (updateError) throw updateError;
      
      setPayments(payments.map(p => p.id === id ? { ...p, invoice_url: publicUrl } : p));
      alert('发票上传成功！');
    } catch (err) {
      console.error('Error uploading file:', err);
      alert('文件上传失败');
    } finally {
      setProcessing(null);
    }
  };

  const markAsReceived = async (id: string) => {
    try {
      setProcessing(id);
      const payment = payments.find(p => p.id === id);
      if (!payment) return;

      const { error } = await supabase
        .from('project_financial_customers')
        .update({ payment_status: '已收款' })
        .eq('id', id);

      if (error) throw error;
      
      // Notify the project manager
      if (payment.project_manager_id) {
        await createNotification(
          payment.project_manager_id,
          '客户款项已收齐',
          `项目（${payment.project_name}）的客户（${payment.customer_name}）款项已确认收到。`,
          'approval_feedback',
          `/projects/${payment.project_id}`
        );
      }

      setPayments(payments.map(p => p.id === id ? { ...p, payment_status: '已收款' } : p));
      alert('已标记为已收款！');
    } catch (err) {
      console.error('Error marking as received:', err);
      alert('操作失败');
    } finally {
      setProcessing(null);
    }
  };

  const filteredPayments = payments.filter(p => {
    const cName = (p.customer_name || '').toLowerCase();
    const pName = (p.project_name || '').toLowerCase();
    const sTerm = searchTerm.toLowerCase();
    const matchesSearch = cName.includes(sTerm) || pName.includes(sTerm);
    
    // Default: only show pending (未收款)
    // If showHistory: show received (已收款)
    if (!showHistory && p.payment_status === '已收款') return false;
    return matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
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
              placeholder="搜索客户或项目..."
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
            <span>显示已收款记录</span>
          </label>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-slate-500 border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 font-medium">关联项目</th>
                <th className="px-4 py-3 font-medium">客户</th>
                <th className="px-4 py-3 font-medium">应收金额</th>
                <th className="px-4 py-3 font-medium">发票上传</th>
                <th className="px-4 py-3 font-medium">客户付款凭证</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400 italic">
                    暂无收款记录
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-600 font-medium">{p.project_name}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{p.customer_name}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">¥{p.amount.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2">
                        {p.invoice_url ? (
                          <a href={p.invoice_url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline flex items-center">
                            <FileText className="w-4 h-4 mr-1" /> 查看
                          </a>
                        ) : (
                          <span className="text-slate-400">未传</span>
                        )}
                        {canManage && (
                          <label className="cursor-pointer p-1 text-slate-500 hover:text-indigo-600 transition-colors">
                            <Upload className="w-4 h-4" />
                            <input
                              type="file"
                              className="hidden"
                              onChange={(e) => e.target.files?.[0] && handleFileUpload(p.id, e.target.files[0])}
                            />
                          </label>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {p.payment_voucher_url ? (
                        <a href={p.payment_voucher_url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline flex items-center">
                          <FileText className="w-4 h-4 mr-1" /> 查看
                        </a>
                      ) : (
                        <span className="text-slate-400">未传</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.payment_status === '已收款' ? 'bg-green-100 text-green-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {p.payment_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.payment_status === '未收款' && canManage && (
                        <button
                          onClick={() => markAsReceived(p.id)}
                          disabled={processing === p.id}
                          className="flex items-center px-3 py-1 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-700 transition-colors"
                        >
                          <DollarSign className="w-3 h-3 mr-1" />
                          确认收款
                        </button>
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
