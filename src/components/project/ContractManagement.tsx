import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, FileText, Upload, CheckCircle, XCircle, Download } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Project } from '../../types/project';
import { User } from '../../types/user';
import { useAppStore } from '../../store';

interface ContractManagementProps {
  project: Project;
  users: User[];
  onUpdate?: () => void;
}

interface Contract {
  id: string;
  project_id: string;
  contract_no: string;
  sign_date: string;
  start_date: string;
  end_date: string;
  amount: number;
  payment_method: string;
  attachment_url: string | null;
  status: string;
  initial_review_status: string | null;
  initial_reviewer_id: string | null;
  final_review_status: string | null;
  final_reviewer_id: string | null;
}

export default function ContractManagement({ project, users, onUpdate }: ContractManagementProps) {
  const { user: currentUser } = useAppStore();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);

  const [formData, setFormData] = useState({
    contract_no: '',
    sign_date: '',
    start_date: '',
    end_date: '',
    amount: '',
    payment_method: '一次性付款',
    attachment_url: '',
  });

  const fetchContracts = async () => {
    try {
      const { data, error } = await supabase
        .from('contracts')
        .select('*')
        .eq('project_id', project.id)
        .order('created_at', { ascending: false });

      if (error) {
        // If table doesn't exist, just use empty array
        if (error.code === '42P01') {
          setContracts([]);
        } else {
          throw error;
        }
      } else {
        setContracts(data || []);
      }
    } catch (err) {
      console.error('Error fetching contracts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContracts();
  }, [project.id]);

  const handleOpenForm = (contract?: Contract) => {
    if (contract) {
      setEditingContract(contract);
      setFormData({
        contract_no: contract.contract_no,
        sign_date: contract.sign_date || '',
        start_date: contract.start_date || '',
        end_date: contract.end_date || '',
        amount: contract.amount?.toString() || '',
        payment_method: contract.payment_method || '一次性付款',
        attachment_url: contract.attachment_url || '',
      });
    } else {
      setEditingContract(null);
      setFormData({
        contract_no: '',
        sign_date: '',
        start_date: '',
        end_date: '',
        amount: '',
        payment_method: '一次性付款',
        attachment_url: '',
      });
    }
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        project_id: project.id,
        contract_no: formData.contract_no,
        sign_date: formData.sign_date || null,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        amount: formData.amount ? parseFloat(formData.amount) : null,
        payment_method: formData.payment_method,
        attachment_url: formData.attachment_url || null,
      };

      if (editingContract) {
        const { error } = await supabase
          .from('contracts')
          .update(payload)
          .eq('id', editingContract.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('contracts')
          .insert([{ ...payload, status: '待审核' }]);
        if (error) throw error;
      }

      setIsFormOpen(false);
      fetchContracts();
    } catch (err) {
      console.error('Error saving contract:', err);
      alert('保存失败，请确保已在数据库创建 contracts 表');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除这份合同吗？')) return;
    try {
      const { error } = await supabase.from('contracts').delete().eq('id', id);
      if (error) throw error;
      fetchContracts();
    } catch (err) {
      console.error('Error deleting contract:', err);
    }
  };

  const canUserInitialApprove = () => {
    if (!currentUser) return false;
    
    
    const bdRole = users.find(u => u.id === project.bd_manager_id)?.role;
    if (bdRole === 'BD经理') {
      return currentUser.role === 'BD总监' || currentUser.role === 'CEO';
    }
    return currentUser.role === 'CEO';
  };

  const canUserFinalApprove = () => {
    if (!currentUser) return false;
    if (currentUser.role === 'CEO') return true;
    return false;
  };

  const handleApprove = async (contract: Contract, isFinal: boolean, isPass: boolean) => {
    if (!currentUser) return;
    try {
      const statusText = isPass ? '通过' : '驳回';
      const payload: any = {};
      
      if (isFinal) {
        payload.final_review_status = statusText;
        payload.final_reviewer_id = currentUser.id;
        payload.status = isPass ? '已通过' : '已驳回';
      } else {
        payload.initial_review_status = statusText;
        payload.initial_reviewer_id = currentUser.id;
        if (!isPass) payload.status = '已驳回';
      }

      const { error } = await supabase
        .from('contracts')
        .update(payload)
        .eq('id', contract.id);
        
      if (error) throw error;

      // 如果是终审通过，且合同金额与项目含税收入不同，则更新项目基本信息
      if (isFinal && isPass && contract.amount && contract.amount !== project.income_with_tax) {
        const income_with_tax = contract.amount;
        const tax_rate = project.tax_rate || 0;
        const income_without_tax = income_with_tax / (1 + tax_rate);
        
        const { error: projectError } = await supabase
          .from('projects')
          .update({
            income_with_tax,
            income_without_tax
          })
          .eq('id', project.id);
          
        if (projectError) {
          console.error('Error updating project amount:', projectError);
        } else if (onUpdate) {
          onUpdate();
        }
      }

      fetchContracts();
    } catch (err) {
      console.error('Error approving contract:', err);
    }
  };

  const getUserName = (id?: string | null) => {
    if (!id) return '-';
    return users.find(u => u.id === id)?.name || '未知';
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-slate-900">合同列表</h3>
        <button
          onClick={() => handleOpenForm()}
          className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
        >
          <Plus className="w-4 h-4 mr-2" />
          新增合同
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
            <tr>
              <th className="px-4 py-3">合同编号</th>
              <th className="px-4 py-3">签约日期</th>
              <th className="px-4 py-3">开始日期</th>
              <th className="px-4 py-3">结束日期</th>
              <th className="px-4 py-3">合同金额</th>
              <th className="px-4 py-3">付款方式</th>
              <th className="px-4 py-3">附件</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">初审</th>
              <th className="px-4 py-3">终审</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-slate-500">加载中...</td>
              </tr>
            ) : contracts.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-slate-500">暂无合同记录</td>
              </tr>
            ) : (
              contracts.map((contract) => {
                const canInitialApprove = contract.status === '待审核' && !contract.initial_review_status && canUserInitialApprove();
                const canFinalApprove = contract.status === '待审核' && contract.initial_review_status === '通过' && !contract.final_review_status && canUserFinalApprove();

                return (
                  <tr key={contract.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{contract.contract_no}</td>
                    <td className="px-4 py-3">{contract.sign_date || '-'}</td>
                    <td className="px-4 py-3">{contract.start_date || '-'}</td>
                    <td className="px-4 py-3">{contract.end_date || '-'}</td>
                    <td className="px-4 py-3">¥{contract.amount?.toLocaleString() || '0'}</td>
                    <td className="px-4 py-3">{contract.payment_method}</td>
                    <td className="px-4 py-3">
                      {contract.attachment_url ? (
                        <a href={contract.attachment_url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline flex items-center">
                          <FileText className="w-4 h-4 mr-1" /> 查看
                        </a>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        contract.status === '已通过' ? 'bg-green-100 text-green-700' :
                        contract.status === '已驳回' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {contract.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {contract.initial_review_status ? (
                        <span className={contract.initial_review_status === '通过' ? 'text-green-600' : 'text-red-600'}>
                          {contract.initial_review_status} ({getUserName(contract.initial_reviewer_id)})
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {contract.final_review_status ? (
                        <span className={contract.final_review_status === '通过' ? 'text-green-600' : 'text-red-600'}>
                          {contract.final_review_status} ({getUserName(contract.final_reviewer_id)})
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {canInitialApprove && (
                        <>
                          <button onClick={() => handleApprove(contract, false, true)} className="text-green-600 hover:text-green-800" title="初审通过">
                            <CheckCircle className="w-4 h-4 inline" />
                          </button>
                          <button onClick={() => handleApprove(contract, false, false)} className="text-red-600 hover:text-red-800" title="驳回">
                            <XCircle className="w-4 h-4 inline" />
                          </button>
                        </>
                      )}
                      {canFinalApprove && (
                        <>
                          <button onClick={() => handleApprove(contract, true, true)} className="text-green-600 hover:text-green-800" title="终审通过">
                            <CheckCircle className="w-4 h-4 inline" />
                          </button>
                          <button onClick={() => handleApprove(contract, true, false)} className="text-red-600 hover:text-red-800" title="驳回">
                            <XCircle className="w-4 h-4 inline" />
                          </button>
                        </>
                      )}
                      <button onClick={() => handleOpenForm(contract)} className="text-indigo-600 hover:text-indigo-800 ml-2">
                        <Edit2 className="w-4 h-4 inline" />
                      </button>
                      <button onClick={() => handleDelete(contract.id)} className="text-red-600 hover:text-red-800 ml-2">
                        <Trash2 className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">
                {editingContract ? '编辑合同' : '新增合同'}
              </h3>
              <button onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-slate-500">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">合同编号 *</label>
                  <input
                    required
                    type="text"
                    value={formData.contract_no}
                    onChange={e => setFormData({...formData, contract_no: e.target.value})}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">签约日期</label>
                  <input
                    type="date"
                    value={formData.sign_date}
                    onChange={e => setFormData({...formData, sign_date: e.target.value})}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">开始日期</label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={e => setFormData({...formData, start_date: e.target.value})}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">结束日期</label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={e => setFormData({...formData, end_date: e.target.value})}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">合同金额</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={e => setFormData({...formData, amount: e.target.value})}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">付款方式</label>
                  <select
                    value={formData.payment_method}
                    onChange={e => setFormData({...formData, payment_method: e.target.value})}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="一次性付款">一次性付款</option>
                    <option value="分期付款">分期付款</option>
                    <option value="按进度付款">按进度付款</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">合同附件</label>
                  <div className="flex items-center space-x-4">
                    {formData.attachment_url ? (
                      <div className="flex items-center space-x-2">
                        <a href={formData.attachment_url} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center">
                          <FileText className="w-4 h-4 mr-1" /> 已上传附件
                        </a>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, attachment_url: '' })}
                          className="text-red-500 hover:text-red-700 text-sm"
                        >
                          移除
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer inline-flex items-center px-4 py-2 border border-slate-300 shadow-sm text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50">
                        <Upload className="w-4 h-4 mr-2" /> 上传附件
                        <input 
                          type="file" 
                          className="hidden" 
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              const fileExt = file.name.split('.').pop();
                              const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
                              const filePath = `contracts/${project.id}/${fileName}`;
                              
                              const { error: uploadError } = await supabase.storage
                                .from('attachments')
                                .upload(filePath, file);
                                
                              if (uploadError) {
                                throw uploadError;
                              }
                              
                              const { data: { publicUrl } } = supabase.storage
                                .from('attachments')
                                .getPublicUrl(filePath);
                                
                              setFormData({ ...formData, attachment_url: publicUrl });
                              alert('文件上传成功！');
                            } catch (err) {
                              console.error('Error uploading file:', err);
                              alert('文件上传失败，请重试');
                            }
                          }} 
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
