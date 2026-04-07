import React, { useState, useEffect } from 'react';
import { Upload, FileText, Loader2, Plus, Trash2, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store';
import { createNotification, notifyFinanceUsers } from '../../lib/notifications';
import { format } from 'date-fns';

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
  submission_date: string | null;
  submitter_role?: string | null;
}

export default function GeneralReimbursements() {
  const { user } = useAppStore();
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      fetchReimbursements();
    }
  }, [user]);

  const fetchReimbursements = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('project_reimbursements')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReimbursements(data || []);
    } catch (err) {
      console.error('Error fetching reimbursements:', err);
    } finally {
      setLoading(false);
    }
  };

  const addReimbursement = () => {
    const newRb: Reimbursement = {
      id: crypto.randomUUID(),
      project_id: null,
      user_id: user?.id || '',
      category: '差旅费',
      description: '',
      amount: 0,
      invoice_url: null,
      invoice_number: null,
      status: '草稿',
      created_at: new Date().toISOString(),
      submission_date: null
    };
    // Insert at beginning of array
    setReimbursements([newRb, ...reimbursements]);
  };

  const updateReimbursement = (id: string, field: keyof Reimbursement, value: any) => {
    setReimbursements(reimbursements.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const saveSingleReimbursement = async (reimbursement: Reimbursement) => {
    try {
      setSaving(true);
      const { created_at, submission_date, ...rest } = reimbursement;

      // Ensure user_id is always included
      const dataToSave = { ...rest, user_id: user?.id };

      // Don't save '草稿' status - let DB use default value
      if (dataToSave.status === '草稿') {
        const { status, ...withoutStatus } = dataToSave;
        console.log('Saving reimbursement (without status):', withoutStatus);
        const { error } = await supabase
          .from('project_reimbursements')
          .upsert(withoutStatus);
        if (error) throw error;
      } else {
        console.log('Saving reimbursement:', dataToSave);
        const { error } = await supabase
          .from('project_reimbursements')
          .upsert(dataToSave);
        if (error) throw error;
      }

      alert('保存成功！');
      // Refresh to get the latest status from DB
      await fetchReimbursements();
    } catch (err) {
      console.error('Error saving single:', err);
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const removeReimbursement = async (id: string) => {
    if (!window.confirm('确定要删除这条报销记录吗？')) return;
    
    // If it's a real ID (UUID), delete from DB
    if (id.length > 20) {
      try {
        const { error } = await supabase.from('project_reimbursements').delete().eq('id', id);
        if (error) throw error;
      } catch (err) {
        console.error('Error deleting:', err);
        alert('删除失败');
        return;
      }
    }
    setReimbursements(reimbursements.filter(r => r.id !== id));
  };

  const handleFileUpload = async (id: string, file: File) => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `reimbursements/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('attachments')
        .getPublicUrl(filePath);

      updateReimbursement(id, 'invoice_url', publicUrl);
    } catch (err) {
      console.error('Error uploading file:', err);
      alert('文件上传失败');
    }
  };

  const saveAll = async () => {
    try {
      setSaving(true);

      const toSave = reimbursements.map(r => {
        const { created_at, submission_date, ...rest } = r;
        // Ensure user_id is always included
        const dataWithUser = { ...rest, user_id: user?.id };
        // Don't save '草稿' status - let DB use default value
        if (dataWithUser.status === '草稿') {
          const { status, ...withoutStatus } = dataWithUser;
          return withoutStatus;
        }
        return dataWithUser;
      });

      console.log('Saving all reimbursements:', toSave);

      const { error } = await supabase
        .from('project_reimbursements')
        .upsert(toSave);

      if (error) throw error;

      alert('保存成功！');
      // Refresh to get the latest status from DB
      await fetchReimbursements();
    } catch (err) {
      console.error('Error saving:', err);
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const submitForApproval = async (id: string) => {
    if (id.length < 20) {
      alert('请先保存更改后再提交审核');
      return;
    }

    console.log('Submitting reimbursement for approval, ID:', id);

    try {
      // First, ensure the record is saved by fetching it
      const { data: existingRecord, error: fetchError } = await supabase
        .from('project_reimbursements')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) {
        console.error('Fetch error:', fetchError);
        throw fetchError;
      }

      if (!existingRecord) {
        throw new Error('未找到对应的报销记录，请先保存后再提交');
      }

      console.log('Existing record status:', existingRecord.status);
      console.log('Current user role:', user?.role);

      // 根据提交人角色确定初始审批状态
      // 经理提交 → 待总监初审
      // 总监提交 → 待 CEO 终审（初审自动通过）
      // CEO 提交 → 待财务审核
      // 财务提交 → 待 CEO 终审
      let nextStatus = '待总监初审';
      if (user?.role === '客户总监' || user?.role === '运营总监') {
        nextStatus = '待 CEO 终审';
      } else if (user?.role === 'CEO') {
        nextStatus = '待财务审核';
      } else if (user?.role === '财务') {
        nextStatus = '待 CEO 终审';
      }

      // Then update the status and submission_date
      const { data, error } = await supabase
        .from('project_reimbursements')
        .update({
          status: nextStatus,
          submission_date: new Date().toISOString(),
          submitter_role: user?.role || null
        })
        .eq('id', id)
        .select();

      if (error) {
        console.error('Update error:', error);
        throw error;
      }

      console.log('Submit result:', data);

      // Check if any rows were actually updated
      if (!data || data.length === 0) {
        throw new Error('更新状态失败，请重试');
      }

      // Notify Finance Users
      await notifyFinanceUsers(
        '收到新的报销审批申请',
        `${user?.name} 提交了一笔报销申请，请及时处理。`,
        'approval_request',
        '/finance'
      );

      // Send notification to directors (客户总监/运营总监)
      const { data: directorsData } = await supabase
        .from('users')
        .select('id')
        .in('role', ['客户总监', '运营总监']);

      if (directorsData && directorsData.length > 0) {
        for (const director of directorsData) {
          await createNotification(
            director.id,
            '收到新的报销审批申请',
            `${user?.name} 提交了一笔报销申请，等待您的初审。`,
            'approval_request',
            '/finance/reimbursement-approval'
          );
        }
      }

      // Also send to manager if exists
      if (user?.manager_id) {
        await createNotification(
          user.manager_id,
          '收到新的报销审批申请',
          `${user.name} 提交了一笔报销申请，请及时处理。`,
          'approval_request',
          '/finance'
        );
      }

      // Refresh the list to get latest data from DB
      await fetchReimbursements();

      alert('已提交审核');
    } catch (err) {
      console.error('Error submitting:', err);
      alert(`提交失败：${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

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
        <h3 className="text-lg font-semibold text-slate-800">我的报销申请</h3>
        <div className="flex space-x-2">
          <button
            onClick={addReimbursement}
            className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            <span>新增报销</span>
          </button>
          <button
            onClick={saveAll}
            disabled={saving}
            className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            <span>保存所有更改</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-slate-500 border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 font-medium">报销类别</th>
                <th className="px-4 py-3 font-medium">报销描述</th>
                <th className="px-4 py-3 font-medium">金额</th>
                <th className="px-4 py-3 font-medium">提交日期</th>
                <th className="px-4 py-3 font-medium">发票/凭证</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reimbursements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400 italic">
                    暂无报销记录，点击上方“新增报销”开始
                  </td>
                </tr>
              ) : (
                reimbursements.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <select
                        value={r.category}
                        disabled={r.status !== '草稿'}
                        onChange={(e) => updateReimbursement(r.id, 'category', e.target.value)}
                        className="px-2 py-1 border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none disabled:bg-slate-50"
                      >
                        <option value="差旅费">差旅费</option>
                        <option value="办公费">办公费</option>
                        <option value="招待费">招待费</option>
                        <option value="交通费">交通费</option>
                        <option value="其他">其他</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={r.description || ''}
                        disabled={r.status !== '草稿'}
                        onChange={(e) => updateReimbursement(r.id, 'description', e.target.value)}
                        placeholder="描述报销用途"
                        className="w-full px-2 py-1 border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none disabled:bg-slate-50"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative w-28">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">¥</span>
                        <input
                          type="number"
                          value={r.amount || ''}
                          disabled={r.status !== '草稿'}
                          onChange={(e) => updateReimbursement(r.id, 'amount', parseFloat(e.target.value) || 0)}
                          className="w-full pl-5 pr-2 py-1 border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none disabled:bg-slate-50"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      <div className="flex flex-col">
                        <span>提交日期</span>
                        <span className="text-[10px] text-slate-400">{r.submission_date ? format(new Date(r.submission_date), 'yyyy-MM-dd') : '-'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2">
                        {r.invoice_url ? (
                          <a href={r.invoice_url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                            <FileText className="w-4 h-4" />
                          </a>
                        ) : (
                          <span className="text-slate-400">未传</span>
                        )}
                        {r.status === '草稿' && (
                          <label className="cursor-pointer p-1 text-slate-500 hover:text-indigo-600 transition-colors">
                            <Upload className="w-4 h-4" />
                            <input
                              type="file"
                              className="hidden"
                              onChange={(e) => e.target.files?.[0] && handleFileUpload(r.id, e.target.files[0])}
                            />
                          </label>
                        )}
                      </div>
                      {r.invoice_number && (
                        <div className="text-xs text-slate-500 mt-1 font-mono">
                          发票号：{r.invoice_number}
                        </div>
                      )}
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
                        {r.status === '草稿' && (
                          <>
                            <button
                              onClick={() => saveSingleReimbursement(r)}
                              disabled={saving}
                              className="px-2 py-1 bg-white text-indigo-600 rounded border border-indigo-200 hover:bg-indigo-50 transition-colors text-xs font-medium flex items-center"
                            >
                              {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                              保存
                            </button>
                            <button
                              onClick={() => submitForApproval(r.id)}
                              className="px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors text-xs font-medium"
                            >
                              提交审核
                            </button>
                            <button onClick={() => removeReimbursement(r.id)} className="text-slate-400 hover:text-red-600 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {r.status !== '草稿' && (
                          <span className="text-xs text-slate-400 italic">已锁定</span>
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
      
      <div className="flex items-start space-x-2 p-4 bg-amber-50 rounded-lg border border-amber-100">
        <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5" />
        <div className="text-sm text-amber-700">
          <p className="font-medium">报销说明：</p>
          <ul className="list-disc list-inside mt-1 space-y-1">
            <li>新报销默认为“草稿”状态，可随时修改。</li>
            <li>点击“保存所有更改”后，方可点击“提交审核”。</li>
            <li>提交审核后，条目将锁定，无法再进行修改。</li>
            <li>请务必上传清晰的发票或消费凭证照片。</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
