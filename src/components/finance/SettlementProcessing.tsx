import React, { useState, useEffect } from 'react';
import { Eye, CheckCircle, XCircle, DollarSign, Upload, FileText, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store';
import { createNotification } from '../../lib/notifications';

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

export default function SettlementProcessing() {
  const { user } = useAppStore();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | '待 CEO 审核' | '待财务审核' | '待付款'>('all');
  const [selectedSettlement, setSelectedSettlement] = useState<Settlement | null>(null);
  const [settlementItems, setSettlementItems] = useState<any[]>([]);
  const [processing, setProcessing] = useState<string | null>(null);

  const isFinance = user?.role === '财务';
  const isCEO = user?.role === 'CEO';

  useEffect(() => {
    fetchSettlements();
  }, [filter]);

  const fetchSettlements = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('supplier_settlements')
        .select('*')
        .order('created_at', { ascending: false });

      if (filter === '待 CEO 审核') {
        query = query.eq('status', '待 CEO 审核');
      } else if (filter === '待财务审核') {
        query = query.eq('status', '待财务审核');
      } else if (filter === '待付款') {
        query = query.eq('status', '待付款');
      }

      const { data, error } = await query;
      if (error) throw error;
      setSettlements(data || []);
    } catch (err) {
      console.error('Error fetching settlements:', err);
    } finally {
      setLoading(false);
    }
  };

  // CEO 业务审核 / 财务审核
  const handleAudit = async (settlementId: string, action: 'approved' | 'rejected', role: 'ceo' | 'finance') => {
    const isAuditByCEO = role === 'ceo' && isCEO;
    const isAuditByFinance = role === 'finance' && isFinance;

    if (!isAuditByCEO && !isAuditByFinance) {
      alert('无权操作');
      return;
    }

    let auditNotes: string | undefined;
    if (action === 'rejected') {
      auditNotes = prompt('请输入驳回意见：');
      if (!auditNotes) return;
    }

    try {
      setProcessing(settlementId);

      if (role === 'ceo') {
        // CEO 审核
        const { error } = await supabase
          .from('supplier_settlements')
          .update({
            status: action === 'approved' ? '待财务审核' : '已驳回',
            audit_notes: auditNotes || null,
          })
          .eq('id', settlementId);

        if (error) throw error;

        // 通知财务审核
        if (action === 'approved') {
          const { data: financeUsers } = await supabase
            .from('users')
            .select('id')
            .eq('role', '财务');

          if (financeUsers && financeUsers.length > 0) {
            const { data: settlementData } = await supabase
              .from('supplier_settlements')
              .select('supplier_name, total_amount')
              .eq('id', settlementId)
              .single();

            for (const finance of financeUsers) {
              await createNotification(
                finance.id,
                '结算单待财务审核',
                `${settlementData?.supplier_name || '供应商'} 的结算单（¥${(settlementData?.total_amount || 0) / 100}）已通过 CEO 审核，等待您的审核。`,
                'approval_request',
                '/finance/settlement-processing'
              );
            }
          }
        }

        alert(`结算单 CEO 审核已${action === 'approved' ? '通过' : '驳回'}`);
      } else {
        // 财务审核
        const { error } = await supabase
          .from('supplier_settlements')
          .update({
            status: action === 'approved' ? '待付款' : '已驳回',
            audit_notes: auditNotes || null,
          })
          .eq('id', settlementId);

        if (error) throw error;

        alert(`结算单财务审核已${action === 'approved' ? '通过' : '驳回'}`);
      }

      fetchSettlements();
    } catch (error: any) {
      console.error('Error auditing settlement:', error);
      alert('操作失败：' + error.message);
    } finally {
      setProcessing(null);
    }
  };

  // 财务确认付款
  const handleConfirmPayment = async (settlementId: string) => {
    if (!isFinance) {
      alert('只有财务可以确认付款');
      return;
    }

    const financeNotes = prompt('请输入付款备注（可选）：') || '';

    try {
      setProcessing(settlementId);

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
        // 关键：必须同时匹配 project_id 和 supplier_id，避免误更新其他供应商的记录
        const { error: updateError } = await supabase
          .from('project_financial_suppliers')
          .update({ payment_status: '已付款' })
          .in('project_id', projectIds)
          .eq('supplier_id', settlement.supplier_id)
          .in('payment_status', ['待 CEO 审核', 'CEO 已审核', '未付款']);

        if (updateError) {
          console.error('Error updating payment status:', updateError);
          // 不抛出错误，继续更新结算单状态
        }
      }

      // 4. 更新结算单状态为已付款
      const { error } = await supabase
        .from('supplier_settlements')
        .update({
          status: '已付款',
          paid_by: user?.id,
          paid_at: new Date().toISOString(),
          finance_notes: financeNotes,
        })
        .eq('id', settlementId);

      if (error) throw error;

      // 通知提交结算单的用户（运营总监/客户总监）
      const { data: settlementData } = await supabase
        .from('supplier_settlements')
        .select('submitted_by, supplier_name, total_amount')
        .eq('id', settlementId)
        .single();

      if (settlementData?.submitted_by) {
        await createNotification(
          settlementData.submitted_by,
          '结算单已付款',
          `${settlementData.supplier_name || '供应商'} 的结算单（¥${(settlementData?.total_amount || 0) / 100}）已确认付款，请注意查收。`,
          'approval_feedback',
          '/finance/settlement-processing'
        );
      }

      alert('已确认付款');
      fetchSettlements();
    } catch (error: any) {
      console.error('Error confirming payment:', error);
      alert('操作失败：' + error.message);
    } finally {
      setProcessing(null);
    }
  };

  // 上传付款凭证（参考 PaymentApproval 的逻辑）
  const handleUploadVoucher = async (settlementId: string, file: File) => {
    if (!isFinance) {
      alert('只有财务可以上传付款凭证');
      return;
    }

    try {
      setProcessing(settlementId);
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
      fetchSettlements();
    } catch (error: any) {
      console.error('Error uploading voucher:', error);
      alert('上传失败：' + error.message);
    } finally {
      setProcessing(null);
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

  const getStatusBadgeClass = (status: string) => {
    const statusColors: Record<string, string> = {
      '待提交': 'bg-slate-100 text-slate-700',
      '待 CEO 审核': 'bg-amber-100 text-amber-700',
      '待财务审核': 'bg-purple-100 text-purple-700',
      '待付款': 'bg-blue-100 text-blue-700',
      '已付款': 'bg-emerald-100 text-emerald-700',
      '已驳回': 'bg-red-100 text-red-700',
    };
    return statusColors[status] || 'bg-slate-100 text-slate-700';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-slate-900">结算单处理</h1>
          <p className="text-sm text-slate-500 mt-1">审核供应商结算单，确认付款</p>
        </div>

        {/* Filter */}
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              filter === 'all'
                ? 'bg-indigo-100 text-indigo-700 font-medium'
                : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            全部
          </button>
          <button
            onClick={() => setFilter('待 CEO 审核')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              filter === '待 CEO 审核'
                ? 'bg-amber-100 text-amber-700 font-medium'
                : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            待 CEO 审核
          </button>
          <button
            onClick={() => setFilter('待财务审核')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              filter === '待财务审核'
                ? 'bg-purple-100 text-purple-700 font-medium'
                : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            待财务审核
          </button>
          <button
            onClick={() => setFilter('待付款')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              filter === '待付款'
                ? 'bg-blue-100 text-blue-700 font-medium'
                : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            待付款
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
            <tr>
              <th className="px-6 py-3">结算单号</th>
              <th className="px-6 py-3">供应商</th>
              <th className="px-6 py-3">结算月份</th>
              <th className="px-6 py-3 text-right">金额</th>
              <th className="px-6 py-3">项目数</th>
              <th className="px-6 py-3">状态</th>
              <th className="px-6 py-3">发票</th>
              <th className="px-6 py-3">付款凭证</th>
              <th className="px-6 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading ? (
              <tr>
                <td colSpan={9} className="px-6 py-8 text-center text-slate-500">
                  <div className="w-6 h-6 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin mx-auto" />
                </td>
              </tr>
            ) : settlements.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-8 text-center text-slate-500">
                  暂无结算单
                </td>
              </tr>
            ) : (
              settlements.map((settlement) => (
                <tr key={settlement.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-mono text-sm text-slate-900">{settlement.settlement_no}</td>
                  <td className="px-6 py-4 text-sm text-slate-900">{settlement.supplier_name}</td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {new Date(settlement.period_month).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })}
                  </td>
                  <td className="px-6 py-4 text-sm text-right font-medium text-slate-900">
                    ¥{settlement.total_amount.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">{settlement.project_count}个</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(settlement.status)}`}>
                      {settlement.status}
                    </span>
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
                    {(settlement.status === '待付款' || settlement.status === '已付款') && isFinance && (
                      <label className="block mt-1 cursor-pointer text-xs text-indigo-600 hover:text-indigo-900">
                        <Upload className="w-3 h-3 inline mr-1" />
                        {settlement.payment_voucher_url ? '重新上传' : '上传凭证'}
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => {
                            if (processing) return;
                            e.target.files?.[0] && handleUploadVoucher(settlement.id, e.target.files[0]);
                          }}
                        />
                      </label>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleViewSettlement(settlement)}
                        className="text-indigo-600 hover:text-indigo-900 font-medium flex items-center gap-1"
                      >
                        <Eye className="w-4 h-4" />
                        查看
                      </button>
                      {settlement.status === '待 CEO 审核' && isCEO && (
                        <>
                          <button
                            onClick={() => handleAudit(settlement.id, 'approved', 'ceo')}
                            disabled={processing === settlement.id}
                            className="text-emerald-600 hover:text-emerald-900 font-medium flex items-center gap-1"
                          >
                            <CheckCircle className="w-4 h-4" />
                            通过
                          </button>
                          <button
                            onClick={() => handleAudit(settlement.id, 'rejected', 'ceo')}
                            disabled={processing === settlement.id}
                            className="text-red-600 hover:text-red-900 font-medium flex items-center gap-1"
                          >
                            <XCircle className="w-4 h-4" />
                            驳回
                          </button>
                        </>
                      )}
                      {settlement.status === '待财务审核' && isFinance && (
                        <>
                          <button
                            onClick={() => handleAudit(settlement.id, 'approved', 'finance')}
                            disabled={processing === settlement.id}
                            className="text-emerald-600 hover:text-emerald-900 font-medium flex items-center gap-1"
                          >
                            <CheckCircle className="w-4 h-4" />
                            通过
                          </button>
                          <button
                            onClick={() => handleAudit(settlement.id, 'rejected', 'finance')}
                            disabled={processing === settlement.id}
                            className="text-red-600 hover:text-red-900 font-medium flex items-center gap-1"
                          >
                            <XCircle className="w-4 h-4" />
                            驳回
                          </button>
                        </>
                      )}
                      {settlement.status === '待付款' && isFinance && (
                        <button
                          onClick={() => handleConfirmPayment(settlement.id)}
                          disabled={processing === settlement.id}
                          className="text-blue-600 hover:text-blue-900 font-medium flex items-center gap-1"
                        >
                          <DollarSign className="w-4 h-4" />
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

      {/* Detail Modal */}
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
              {/* Info */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
                <div>
                  <p className="text-xs text-slate-500">结算单号</p>
                  <p className="text-sm font-medium text-slate-900">{selectedSettlement.settlement_no}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">供应商</p>
                  <p className="text-sm font-medium text-slate-900">{selectedSettlement.supplier_name}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">结算月份</p>
                  <p className="text-sm font-medium text-slate-900">
                    {new Date(selectedSettlement.period_month).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">结算总额</p>
                  <p className="text-lg font-bold text-indigo-600">¥{selectedSettlement.total_amount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">项目数量</p>
                  <p className="text-sm font-medium text-slate-900">{selectedSettlement.project_count} 个</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">状态</p>
                  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(selectedSettlement.status)}`}>
                    {selectedSettlement.status}
                  </span>
                </div>
              </div>

              {/* Items */}
              <div>
                <h4 className="text-sm font-medium text-slate-900 mb-2">费用明细</h4>
                {settlementItems.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg">
                    暂无费用明细
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 text-slate-500 text-xs">
                        <tr>
                          <th className="px-3 py-2">项目</th>
                          <th className="px-3 py-2">费用类型</th>
                          <th className="px-3 py-2">日期</th>
                          <th className="px-3 py-2 text-right">金额</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-sm">
                        {settlementItems.map((item) => (
                          <tr key={item.id}>
                            <td className="px-3 py-2 text-slate-900">{item.project_name}</td>
                            <td className="px-3 py-2 text-slate-500">{item.cost_type} - {item.cost_detail}</td>
                            <td className="px-3 py-2 text-slate-500">
                              {item.itinerary_date ? new Date(item.itinerary_date).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) : '-'}
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-slate-900">¥{item.amount.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t border-slate-200">
                        <tr>
                          <td colSpan={3} className="px-3 py-2 text-sm text-slate-600 text-right">合计：</td>
                          <td className="px-3 py-2 text-right font-bold text-indigo-600">
                            ¥{settlementItems.reduce((sum, i) => sum + i.amount, 0).toLocaleString()}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
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
    </div>
  );
}
