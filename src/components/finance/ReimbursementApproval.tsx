import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Loader2, FileText, DollarSign, Search, AlertTriangle, Wand2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store';
import { createNotification } from '../../lib/notifications';
import { recognizeInvoiceNumber } from '../../lib/invoice-recognition';

interface Reimbursement {
  id: string;
  project_id: string | null;
  user_id: string;
  category: string;
  description: string;
  amount: number;
  invoice_url: string | null;
  invoice_number?: string | null;
  status: '草稿' | '待总监初审' | '待 CEO 终审' | '待财务审核' | '待打款' | '已打款';
  created_at: string;
  submission_date?: string | null;
  submitter_role?: string | null;
  user_name?: string;
  user_role?: string;
  project_name?: string;
  is_duplicate?: boolean;
}

export default function ReimbursementApproval() {
  const { user } = useAppStore();
  const [requests, setRequests] = useState<Reimbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | '待审核' | '待打款' | '已打款'>('all');

  const isFinance = user?.role === '财务';
  const isCEO = user?.role === 'CEO';
  const isDirector = user?.role === '客户总监' || user?.role === '运营总监';
  const canAudit = isFinance || isCEO;

  useEffect(() => {
    fetchRequests();

    // Set up realtime subscription to refresh data
    const subscription = supabase
      .channel('reimbursement-approval')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_reimbursements' }, () => {
        fetchRequests();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      // Fetch reimbursements that are not in '草稿' status
      // 兼容旧状态值：待审核 -> 待总监初审
      let query = supabase
        .from('project_reimbursements')
        .select(`
          *,
          users(name, role, manager_id),
          projects(name)
        `)
        .in('status', ['待总监初审', '待 CEO 终审', '待财务审核', '待打款', '已打款', '待审核']);

      // 总监级别只能看到自己团队的报销记录
      if (isDirector) {
        // 获取团队成员（包括自己）
        const { data: subordinatesData } = await supabase
          .from('users')
          .select('id')
          .eq('manager_id', user?.id);

        const subordinateIds = subordinatesData?.map(u => u.id) || [];
        // 总监可以看到自己和下属的记录
        const teamIds = [...subordinateIds, user?.id].filter(Boolean);

        query = query.in('user_id', teamIds);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      console.log('Fetched reimbursements:', data);

      // 检查发票号重复
      const invoiceNumbers = (data || []).map(r => r.invoice_number).filter(Boolean);
      const duplicateInvoices = new Set(
        invoiceNumbers.filter((inv, index) => invoiceNumbers.indexOf(inv) !== index)
      );

      const formatted = (data || []).map((r: any) => ({
        ...r,
        user_name: r.users?.name || '未知用户',
        user_role: r.users?.role || '未知角色',
        project_name: r.projects?.name || '通用报销',
        is_duplicate: duplicateInvoices.has(r.invoice_number),
      }));

      setRequests(formatted);
    } catch (err) {
      console.error('Error fetching requests:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, newStatus: Reimbursement['status']) => {
    try {
      setProcessing(id);
      const request = requests.find(r => r.id === id);
      if (!request) {
        console.error('Request not found:', id);
        return;
      }

      console.log('Updating reimbursement:', id, 'to status:', newStatus);

      const { data, error } = await supabase
        .from('project_reimbursements')
        .update({ status: newStatus })
        .eq('id', id)
        .select();

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      console.log('Update result:', data);

      // Notify the applicant or CEO
      if (newStatus === '待打款') {
        await createNotification(
          request.user_id,
          '报销申请已通过审核',
          `您的报销申请（${request.category}: ${request.description}）已通过财务审核，进入待打款状态。`,
          'approval_feedback',
          '/finance'
        );
      } else if (newStatus === '已打款') {
        await createNotification(
          request.user_id,
          '报销款项已支付',
          `您的报销申请（${request.category}: ${request.description}）已完成打款，请注意查收。`,
          'approval_feedback',
          '/finance'
        );
      } else if (newStatus === '草稿') {
        await createNotification(
          request.user_id,
          '报销申请被驳回',
          `您的报销申请（${request.category}: ${request.description}）已被驳回，请修改后重新提交。`,
          'approval_feedback',
          '/finance'
        );
      } else if (newStatus === '待 CEO 终审') {
        // 总监初审通过，通知 CEO 进行终审
        const { data: ceoData } = await supabase
          .from('users')
          .select('id')
          .eq('role', 'CEO');

        if (ceoData && ceoData.length > 0) {
          for (const ceo of ceoData) {
            await createNotification(
              ceo.id,
              '报销申请待终审',
              `${request.user_name} 的报销申请（${request.category}: ${request.description}）已通过初审，等待您的终审。`,
              'approval_request',
              '/finance/reimbursement-approval'
            );
          }
        }
        // 同时通知申请人初审已通过
        await createNotification(
          request.user_id,
          '报销申请已通过初审',
          `您的报销申请（${request.category}: ${request.description}）已通过初审，等待 CEO 终审。`,
          'approval_feedback',
          '/finance'
        );
      } else if (newStatus === '待财务审核') {
        // CEO 终审通过，通知财务用户进行审核
        const { data: financeUsers } = await supabase
          .from('users')
          .select('id')
          .eq('role', '财务');

        if (financeUsers && financeUsers.length > 0) {
          for (const finance of financeUsers) {
            await createNotification(
              finance.id,
              '报销申请待财务审核',
              `${request.user_name} 的报销申请（${request.category}: ${request.description}）已通过 CEO 终审，等待您的审核。`,
              'approval_request',
              '/finance/reimbursement-approval'
            );
          }
        }
        // 同时通知申请人
        await createNotification(
          request.user_id,
          '报销申请已通过 CEO 终审',
          `您的报销申请（${request.category}: ${request.description}）已通过 CEO 终审，等待财务审核。`,
          'approval_feedback',
          '/finance'
        );
      }

      setRequests(requests.map(r => r.id === id ? { ...r, status: newStatus } : r));
      alert(`状态已更新为: ${newStatus}`);
    } catch (err) {
      console.error('Error updating status:', err);
      alert('操作失败');
    } finally {
      setProcessing(null);
    }
  };

  const recognizeInvoiceNumberClick = async (id: string, invoiceUrl: string) => {
    try {
      setProcessing(id);

      // 调用 Qwen-VL 模型识别发票号
      const recognizedNumber = await recognizeInvoiceNumber(invoiceUrl);

      if (!recognizedNumber) {
        throw new Error('识别结果为空');
      }

      // Save to database
      const { error } = await supabase
        .from('project_reimbursements')
        .update({ invoice_number: recognizedNumber })
        .eq('id', id);

      if (error) throw error;

      await fetchRequests();
      alert(`发票号识别成功：${recognizedNumber}`);
    } catch (err) {
      console.error('Error recognizing invoice:', err);
      const errorMessage = err instanceof Error ? err.message : '未知错误';
      if (errorMessage.includes('PDF')) {
        alert('发票识别失败：PDF 文件处理失败，请尝试重新上传或联系管理员。');
      } else if (errorMessage.includes('未能识别')) {
        alert('发票识别失败：未能从发票中提取到有效的发票号码，请手动输入。');
      } else {
        alert(`发票号识别失败：${errorMessage}`);
      }
    } finally {
      setProcessing(null);
    }
  };

  const filteredRequests = requests.filter(r => {
    const uName = (r.user_name || '').toLowerCase();
    const pName = (r.project_name || '').toLowerCase();
    const desc = (r.description || '').toLowerCase();
    const sTerm = searchTerm.toLowerCase();
    const matchesSearch = uName.includes(sTerm) || pName.includes(sTerm) || desc.includes(sTerm);
    
    // 状态筛选
    if (statusFilter === 'all') {
      // 全部状态都显示
    } else if (statusFilter === '待审核') {
      const matchesStatus = r.status === '待总监初审' || r.status === '待审核' || r.status === '待 CEO 终审' || r.status === '待财务审核';
      if (!matchesStatus) return false;
    } else if (statusFilter === '待打款') {
      if (r.status !== '待打款') return false;
    } else if (statusFilter === '已打款') {
      if (r.status !== '已打款') return false;
    }
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
              placeholder="搜索申请人、项目或描述..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === 'all'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              全部
            </button>
            <button
              onClick={() => setStatusFilter('待审核')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === '待审核'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              待审核
            </button>
            <button
              onClick={() => setStatusFilter('待打款')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === '待打款'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              待打款
            </button>
            <button
              onClick={() => setStatusFilter('已打款')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === '已打款'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              已打款
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-slate-500 border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 font-medium">申请日期</th>
                <th className="px-4 py-3 font-medium">申请人</th>
                <th className="px-4 py-3 font-medium">关联项目</th>
                <th className="px-4 py-3 font-medium">类别/描述</th>
                <th className="px-4 py-3 font-medium">金额</th>
                <th className="px-4 py-3 font-medium">凭证</th>
                <th className="px-4 py-3 font-medium">发票号</th>
                <th className="px-4 py-3 font-medium">当前状态</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-400 italic">
                    暂无报销记录
                  </td>
                </tr>
              ) : (
                filteredRequests.map((r) => (
                  <tr key={r.id} className={`hover:bg-slate-50 transition-colors ${r.is_duplicate ? 'bg-red-50' : ''}`}>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{r.user_name}</td>
                    <td className="px-4 py-3 text-slate-600">{r.project_name}</td>
                    <td className="px-4 py-3">
                      <div className="text-slate-900">{r.category}</div>
                      <div className="text-xs text-slate-500 truncate max-w-[150px]">{r.description}</div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">¥{r.amount.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      {r.invoice_url ? (
                        <a href={r.invoice_url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline flex items-center">
                          <FileText className="w-4 h-4 mr-1" /> 查看
                        </a>
                      ) : (
                        <span className="text-slate-400">无</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2">
                        {r.is_duplicate && (
                          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        )}
                        <span className={`font-mono text-sm ${r.is_duplicate ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>
                          {r.invoice_number || '-'}
                        </span>
                        {!r.invoice_number && r.invoice_url && (
                          <button
                            onClick={() => recognizeInvoiceNumberClick(r.id, r.invoice_url!)}
                            disabled={processing === r.id}
                            className="p-1 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                            title="AI 识别发票号"
                          >
                            {processing === r.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Wand2 className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        r.status === '已打款' ? 'bg-green-100 text-green-700' :
                        r.status === '待打款' ? 'bg-blue-100 text-blue-700' :
                        r.status === '待财务审核' ? 'bg-purple-100 text-purple-700' :
                        r.status === '待 CEO 终审' ? 'bg-indigo-100 text-indigo-700' :
                        r.status === '待总监初审' || r.status === '待审核' ? 'bg-orange-100 text-orange-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        {(r.status === '待总监初审' || r.status === '待审核') && isDirector && (
                          <>
                            <button
                              onClick={() => updateStatus(r.id, '待 CEO 终审')}
                              disabled={processing === r.id}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                              title="初审通过"
                            >
                              <CheckCircle className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => updateStatus(r.id, '草稿')}
                              disabled={processing === r.id}
                              className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="驳回"
                            >
                              <XCircle className="w-5 h-5" />
                            </button>
                          </>
                        )}
                        {r.status === '待 CEO 终审' && isCEO && (
                          <>
                            <button
                              onClick={() => updateStatus(r.id, '待财务审核')}
                              disabled={processing === r.id}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                              title="终审通过"
                            >
                              <CheckCircle className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => updateStatus(r.id, '草稿')}
                              disabled={processing === r.id}
                              className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="驳回"
                            >
                              <XCircle className="w-5 h-5" />
                            </button>
                          </>
                        )}
                        {r.status === '待财务审核' && isFinance && (
                          <>
                            <button
                              onClick={() => updateStatus(r.id, '待打款')}
                              disabled={processing === r.id}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                              title="审核通过"
                            >
                              <CheckCircle className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => updateStatus(r.id, '草稿')}
                              disabled={processing === r.id}
                              className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="驳回"
                            >
                              <XCircle className="w-5 h-5" />
                            </button>
                          </>
                        )}
                        {r.status === '待打款' && isFinance && (
                          <button
                            onClick={() => updateStatus(r.id, '已打款')}
                            disabled={processing === r.id}
                            className="flex items-center px-3 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700 transition-colors"
                          >
                            <DollarSign className="w-3 h-3 mr-1" />
                            确认打款
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
  );
}
