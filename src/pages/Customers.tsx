import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, Edit2, Trash2, Upload, Download, Loader2, Eye, FolderKanban, DollarSign, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Customer } from '../types/customer';
import { useAppStore } from '../store';
import * as XLSX from 'xlsx';

export default function Customers() {
  const { user } = useAppStore();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const [customerProjects, setCustomerProjects] = useState<any[]>([]);
  const [customerStats, setCustomerStats] = useState({ projectCount: 0, contractAmount: 0, receivedAmount: 0 });
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<'basic' | 'projects'>('basic');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    address: '',
    company_size: '',
    contact_person: '',
    contact_phone: '',
    customer_type: '活跃客户',
    customer_owner: '',
    customer_source: '',
  });

  const fetchData = async () => {
    try {
      const isAccountManager = user?.role === '客户经理';
      const isOperationManager = user?.role === '运营经理';

      let customersQuery = supabase
        .from('customers')
        .select('*');

      // 客户经理和运营经理只能查看归属为自己的客户
      if ((isAccountManager || isOperationManager) && user?.id) {
        customersQuery = customersQuery.eq('customer_owner', user.id);
      }

      const [customersRes, usersRes] = await Promise.all([
        customersQuery.order('created_at', { ascending: false }),
        supabase
          .from('users')
          .select('id, name, role')
          .in('role', ['客户经理', '客户总监', 'CEO', '运营总监'])
      ]);

      if (customersRes.error) {
        if (customersRes.error.code === '42P01') {
          // Table doesn't exist
          setCustomers([]);
        } else {
          throw customersRes.error;
        }
      } else {
        setCustomers(customersRes.data || []);
      }

      if (usersRes.error) {
        console.error('Error fetching users:', usersRes.error);
      } else {
        setUsers(usersRes.data || []);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenForm = (customer?: Customer) => {
    if (customer) {
      setEditingCustomer(customer);
      setFormData({
        name: customer.name,
        code: customer.code || '',
        address: customer.address || '',
        company_size: customer.company_size?.toString() || '',
        contact_person: customer.contact_person || '',
        contact_phone: customer.contact_phone || '',
        customer_type: customer.customer_type || '活跃客户',
        customer_owner: customer.customer_owner || '',
        customer_source: customer.customer_source || '',
      });
    } else {
      setEditingCustomer(null);
      setFormData({
        name: '',
        code: '',
        address: '',
        company_size: '',
        contact_person: '',
        contact_phone: '',
        customer_type: '活跃客户',
        customer_owner: (user?.role === '客户经理' || user?.role === '运营经理') ? user.id : '',
        customer_source: '',
      });
    }
    setIsFormOpen(true);
  };

  const handleViewDetail = async (customer: Customer) => {
    setViewingCustomer(customer);
    setIsDetailOpen(true);
    setDetailLoading(true);
    setDetailTab('basic');

    try {
      // Fetch projects for this customer
      const { data: projects } = await supabase
        .from('projects')
        .select('*')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false });

      setCustomerProjects(projects || []);

      // Calculate stats
      const projectCount = projects?.length || 0;

      // Fetch contracts for this customer's projects
      const projectIds = projects?.map(p => p.id) || [];
      let contractAmount = 0;
      let receivedAmount = 0;

      if (projectIds.length > 0) {
        const { data: contracts } = await supabase
          .from('contracts')
          .select('amount, status')
          .in('project_id', projectIds);

        // Sum approved contracts
        contractAmount = contracts
          ?.filter(c => c.status === '已通过')
          .reduce((sum, c) => sum + (Number(c.amount) || 0), 0) || 0;

        // Fetch received payments
        const { data: payments } = await supabase
          .from('project_financial_customers')
          .select('amount, payment_status')
          .in('project_id', projectIds);

        receivedAmount = payments
          ?.filter(p => p.payment_status === '已收款')
          .reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0;
      }

      setCustomerStats({
        projectCount,
        contractAmount,
        receivedAmount
      });
    } catch (err) {
      console.error('Error fetching customer details:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const customerData = {
        name: formData.name,
        code: formData.code,
        address: formData.address,
        company_size: formData.company_size ? parseInt(formData.company_size) : null,
        contact_person: formData.contact_person,
        contact_phone: formData.contact_phone,
        customer_type: formData.customer_type,
        customer_owner: formData.customer_owner || null,
        customer_source: formData.customer_source || null,
      };

      if (editingCustomer) {
        const { error } = await supabase
          .from('customers')
          .update(customerData)
          .eq('id', editingCustomer.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('customers')
          .insert([customerData]);
        if (error) throw error;
      }

      setIsFormOpen(false);
      fetchData();
    } catch (err: any) {
      console.error('Error saving customer:', err);
      if (err.code === '42P01') {
        alert('保存失败：数据库表 customers 不存在，请先创建该表。');
      } else {
        alert('保存失败，请重试');
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除该客户吗？')) return;
    try {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err) {
      console.error('Error deleting customer:', err);
      alert('删除失败，请重试');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      // Assuming first row is header
      const rows = jsonData.slice(1) as any[][];
      const customersToInsert = rows.map(row => ({
        name: row[0] || '',
        code: row[1] || '',
        address: row[2] || '',
        company_size: row[3] ? parseInt(row[3]) : null,
        contact_person: row[4] || '',
        contact_phone: row[5] || '',
        customer_type: row[6] || '活跃客户',
        customer_owner: row[7] || null,
        customer_source: row[8] || null,
      })).filter(c => c.name); // Filter out empty rows

      if (customersToInsert.length > 0) {
        const { error } = await supabase.from('customers').insert(customersToInsert);
        if (error) throw error;
        alert(`成功导入 ${customersToInsert.length} 条客户数据！`);
        fetchData();
      }
    } catch (err: any) {
      console.error('Error importing customers:', err);
      if (err.code === '42P01') {
        alert('导入失败：数据库表 customers 不存在，请先创建该表。');
      } else {
        alert('导入失败，请检查文件格式是否正确。');
      }
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.code && c.code.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (c.contact_person && c.contact_person.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">客户管理</h1>
        <div className="flex space-x-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImport}
            accept=".xlsx, .xls, .csv"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="flex items-center px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 disabled:opacity-50"
          >
            {isImporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            导入 Excel
          </button>
          <button
            onClick={() => handleOpenForm()}
            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            新增客户
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200">
        <div className="p-4 border-b border-slate-200">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="搜索客户名称、代码或联系人..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">客户名称</th>
                <th className="px-6 py-3">客户代码</th>
                <th className="px-6 py-3">通信地址</th>
                <th className="px-6 py-3">企业规模</th>
                <th className="px-6 py-3">联系人</th>
                <th className="px-6 py-3">联系电话</th>
                <th className="px-6 py-3">客户类型</th>
                <th className="px-6 py-3">客户归属</th>
                <th className="px-6 py-3">客户来源</th>
                <th className="px-6 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-6 py-8 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-600" />
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-8 text-center text-slate-500">
                    暂无客户数据
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-medium text-slate-900">{customer.name}</td>
                    <td className="px-6 py-4 text-slate-600">{customer.code || '-'}</td>
                    <td className="px-6 py-4 text-slate-600">{customer.address || '-'}</td>
                    <td className="px-6 py-4 text-slate-600">{customer.company_size || '-'}</td>
                    <td className="px-6 py-4 text-slate-600">{customer.contact_person || '-'}</td>
                    <td className="px-6 py-4 text-slate-600">{customer.contact_phone || '-'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        customer.customer_type === '活跃客户' ? 'bg-green-100 text-green-800' :
                        customer.customer_type === '沉睡客户' ? 'bg-slate-100 text-slate-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {customer.customer_type || '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {users.find(u => u.id === customer.customer_owner)?.name || customer.customer_owner || '-'}
                    </td>
                    <td className="px-6 py-4 text-slate-600">{customer.customer_source || '-'}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleViewDetail(customer)}
                        className="text-indigo-600 hover:text-indigo-900 mr-3"
                        title="查看详情"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleOpenForm(customer)}
                        className="text-indigo-600 hover:text-indigo-900 mr-3"
                        title="编辑"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(customer.id)}
                        className="text-red-600 hover:text-red-900"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-2xl p-6">
            <h2 className="text-xl font-bold mb-4">
              {editingCustomer ? '编辑客户' : '新增客户'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">客户名称 *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">客户代码</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={e => setFormData({...formData, code: e.target.value})}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">通信地址</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={e => setFormData({...formData, address: e.target.value})}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">企业规模（人数）</label>
                  <input
                    type="number"
                    value={formData.company_size}
                    onChange={e => setFormData({...formData, company_size: e.target.value})}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">联系人</label>
                  <input
                    type="text"
                    value={formData.contact_person}
                    onChange={e => setFormData({...formData, contact_person: e.target.value})}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">联系电话</label>
                  <input
                    type="text"
                    value={formData.contact_phone}
                    onChange={e => setFormData({...formData, contact_phone: e.target.value})}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">客户类型</label>
                  <select
                    value={formData.customer_type}
                    onChange={e => setFormData({...formData, customer_type: e.target.value})}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="活跃客户">活跃客户</option>
                    <option value="沉睡客户">沉睡客户</option>
                    <option value="潜在客户">潜在客户</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">客户归属</label>
                  <select
                    value={formData.customer_owner}
                    onChange={e => setFormData({...formData, customer_owner: e.target.value})}
                    disabled={user?.role === '客户经理' || user?.role === '运营经理'}
                    className={`w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 ${user?.role === '客户经理' || user?.role === '运营经理' ? 'bg-slate-100 cursor-not-allowed' : ''}`}
                  >
                    <option value="">选择客户归属</option>
                    {users.map(user => (
                      <option key={user.id} value={user.id}>{user.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">客户来源</label>
                  <select
                    value={formData.customer_source}
                    onChange={e => setFormData({...formData, customer_source: e.target.value})}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">请选择客户来源</option>
                    <option value="网络搜索">网络搜索</option>
                    <option value="自有客户">自有客户</option>
                    <option value="客户主动联络">客户主动联络</option>
                    <option value="客户转介绍">客户转介绍</option>
                    <option value="合作伙伴介绍">合作伙伴介绍</option>
                    <option value="展会活动">展会活动</option>
                    <option value="其他">其他</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Detail Modal */}
      {isDetailOpen && viewingCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{viewingCustomer.name}</h2>
                <p className="text-sm text-slate-500 mt-1">客户代码：{viewingCustomer.code || '-'}</p>
              </div>
              <button
                onClick={() => setIsDetailOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="border-b border-slate-200 bg-white">
              <nav className="flex">
                <button
                  onClick={() => setDetailTab('basic')}
                  className={`flex items-center px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                    detailTab === 'basic'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <FolderKanban className="w-4 h-4 mr-2" />
                  基础信息
                </button>
                <button
                  onClick={() => setDetailTab('projects')}
                  className={`flex items-center px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                    detailTab === 'projects'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <DollarSign className="w-4 h-4 mr-2" />
                  项目情况
                  {customerStats.projectCount > 0 && (
                    <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-indigo-100 text-indigo-700 rounded-full">
                      {customerStats.projectCount} 个项目
                    </span>
                  )}
                </button>
              </nav>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {detailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                </div>
              ) : detailTab === 'basic' ? (
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-medium text-slate-500 mb-1">客户名称</h3>
                    <p className="text-base text-slate-900">{viewingCustomer.name}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-slate-500 mb-1">客户代码</h3>
                    <p className="text-base text-slate-900">{viewingCustomer.code || '-'}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-slate-500 mb-1">通信地址</h3>
                    <p className="text-base text-slate-900">{viewingCustomer.address || '-'}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-slate-500 mb-1">企业规模（人数）</h3>
                    <p className="text-base text-slate-900">{viewingCustomer.company_size || '-'}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-slate-500 mb-1">联系人</h3>
                    <p className="text-base text-slate-900">{viewingCustomer.contact_person || '-'}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-slate-500 mb-1">联系电话</h3>
                    <p className="text-base text-slate-900">{viewingCustomer.contact_phone || '-'}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-slate-500 mb-1">客户类型</h3>
                    <p className="text-base">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        viewingCustomer.customer_type === '活跃客户' ? 'bg-green-100 text-green-800' :
                        viewingCustomer.customer_type === '沉睡客户' ? 'bg-slate-100 text-slate-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {viewingCustomer.customer_type || '-'}
                      </span>
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-slate-500 mb-1">客户归属</h3>
                    <p className="text-base text-slate-900">
                      {users.find(u => u.id === viewingCustomer.customer_owner)?.name || viewingCustomer.customer_owner || '-'}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-slate-500 mb-1">客户来源</h3>
                    <p className="text-base text-slate-900">{viewingCustomer.customer_source || '-'}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-slate-500 mb-1">创建时间</h3>
                    <p className="text-base text-slate-900">
                      {viewingCustomer.created_at ? new Date(viewingCustomer.created_at).toLocaleDateString('zh-CN') : '-'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Stats Cards */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-100">
                      <div className="text-sm text-indigo-600 font-medium mb-1">项目数</div>
                      <div className="text-2xl font-bold text-indigo-900">{customerStats.projectCount}</div>
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-100">
                      <div className="text-sm text-emerald-600 font-medium mb-1">合同金额汇总</div>
                      <div className="text-2xl font-bold text-emerald-900">¥{customerStats.contractAmount.toLocaleString()}</div>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
                      <div className="text-sm text-amber-600 font-medium mb-1">回款金额汇总</div>
                      <div className="text-2xl font-bold text-amber-900">¥{customerStats.receivedAmount.toLocaleString()}</div>
                    </div>
                  </div>

                  {/* Project List */}
                  <div>
                    <h3 className="text-lg font-medium text-slate-900 mb-4">项目列表</h3>
                    {customerProjects.length === 0 ? (
                      <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg">
                        暂无项目数据
                      </div>
                    ) : (
                      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                            <tr>
                              <th className="px-4 py-3">项目编号</th>
                              <th className="px-4 py-3">项目名称</th>
                              <th className="px-4 py-3">状态</th>
                              <th className="px-4 py-3">含税收入</th>
                              <th className="px-4 py-3">创建时间</th>
                              <th className="px-4 py-3 text-right">操作</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {customerProjects.map((project) => (
                              <tr key={project.id} className="hover:bg-slate-50">
                                <td className="px-4 py-3 font-medium text-slate-900">{project.code}</td>
                                <td className="px-4 py-3 text-slate-700">{project.name}</td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    project.status === '已通过' ? 'bg-green-100 text-green-800' :
                                    project.status === '待初审' || project.status === '待终审' ? 'bg-yellow-100 text-yellow-800' :
                                    project.status === '已驳回' ? 'bg-red-100 text-red-800' :
                                    'bg-slate-100 text-slate-800'
                                  }`}>
                                    {project.status}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-slate-700">¥{project.income_with_tax?.toLocaleString()}</td>
                                <td className="px-4 py-3 text-slate-500">
                                  {project.created_at ? new Date(project.created_at).toLocaleDateString('zh-CN') : '-'}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <a
                                    href={`/projects/${project.id}`}
                                    className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
                                  >
                                    查看详情
                                  </a>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

