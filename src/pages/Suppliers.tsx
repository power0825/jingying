import React, { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, Search, Loader2, Upload, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { Supplier, SupplierType } from '../types/supplier';
import SupplierForm from '../components/SupplierForm';
import { useAppStore } from '../store';

const supplierTypes: SupplierType[] = ['酒店', '餐饮', '场地', '老师', '参访点', '大巴', '其他'];

export default function Suppliers() {
  const navigate = useNavigate();
  const { user } = useAppStore();
  const isAccountManager = user?.role === '客户经理';
  const isOperationManager = user?.role === '运营经理';
  const isCustomerDirector = user?.role === '客户总监';
  const isOperationDirector = user?.role === '运营总监';
  const isFinance = user?.role === '财务';
  const [activeTab, setActiveTab] = useState<SupplierType>(supplierTypes[0]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Modal state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierToDelete, setSupplierToDelete] = useState<string | null>(null);

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('suppliers')
        .select('*')
        .eq('type', activeTab)
        .order('created_at', { ascending: false });

      if (searchQuery) {
        query = query.ilike('name', `%${searchQuery}%`);
      }

      const { data, error } = await query;
      
      if (error) {
        // If table doesn't exist yet, just set empty array and don't crash
        if (error.code === '42P01') {
          console.warn('Table "suppliers" does not exist yet. Please run the SQL migration.');
          setSuppliers([]);
        } else {
          throw error;
        }
      } else {
        setSuppliers(data || []);
      }
    } catch (error) {
      console.error('Error fetching suppliers:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, [activeTab, searchQuery]);

  const handleAdd = () => {
    setEditingSupplier(null);
    setIsFormOpen(true);
  };

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setIsFormOpen(true);
  };

  const handleDelete = (id: string) => {
    setSupplierToDelete(id);
  };

  const confirmDelete = async () => {
    if (!supplierToDelete) return;
    
    try {
      const { error } = await supabase
        .from('suppliers')
        .delete()
        .eq('id', supplierToDelete);
        
      if (error) throw error;
      fetchSuppliers();
    } catch (error) {
      console.error('Error deleting supplier:', error);
      // Fallback if custom alert is needed, but console is fine for now
    } finally {
      setSupplierToDelete(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportMessage(null);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const formattedData = jsonData.map((row: any) => {
        const type = row['供应商类型']?.toString() || '酒店';
        const refQuote: any = {};
        const actCost: any = {};
        
        // Basic mapping for simple unit prices from Excel
        const price = Number(row['供应价格']) || 0;
        if (['酒店', '餐饮', '参访点', '其他'].includes(type)) {
          refQuote.unit = price;
          actCost.unit = price;
        } else if (['场地', '老师', '大巴'].includes(type)) {
          refQuote.day = price;
          actCost.day = price;
        }

        return {
          name: row['供应商名称']?.toString() || '',
          code: row['供应商编码']?.toString() || undefined,
          type,
          price: price, // Keep for compatibility
          contact_person: row['联系人']?.toString() || '',
          contact_phone: row['联系电话']?.toString() || '',
          account_name: row['开户名称']?.toString() || '',
          tax_id: row['税号']?.toString() || '',
          bank_name: row['开户行']?.toString() || '',
          bank_account: row['银行账号']?.toString() || '',
          address: row['地址']?.toString() || '',
          remarks: row['备注']?.toString() || '',
          reference_quote: refQuote,
          actual_cost: actCost,
          extended_data: {},
        };
      }).filter(item => item.name);

      if (formattedData.length === 0) {
        setImportMessage({ type: 'error', text: '未找到有效数据，请检查 Excel 格式是否正确（需包含“供应商名称”列）。' });
        return;
      }

      const { error } = await supabase.from('suppliers').insert(formattedData);
      
      if (error) throw error;
      
      setImportMessage({ type: 'success', text: `成功导入 ${formattedData.length} 条数据！` });
      fetchSuppliers();
    } catch (error: any) {
      console.error('Error importing excel:', error);
      setImportMessage({ type: 'error', text: '导入失败: ' + error.message });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      // Clear success message after 3 seconds
      setTimeout(() => {
        setImportMessage(prev => prev?.type === 'success' ? null : prev);
      }, 3000);
    }
  };

  const renderQuote = (quote: any, type: string) => {
    if (!quote) return '-';
    if (['酒店', '餐饮', '参访点', '其他'].includes(type)) {
      if (quote.unit) return `¥${quote.unit.toFixed(2)}`;
    } else if (['场地', '老师', '大巴'].includes(type)) {
      const parts = [];
      if (quote.hour) parts.push(`时:¥${quote.hour}`);
      if (quote.half_day) parts.push(`半:¥${quote.half_day}`);
      if (quote.day) parts.push(`天:¥${quote.day}`);
      return parts.length > 0 ? parts.join(' | ') : '-';
    }
    return '-';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">供应商管理</h1>
          <p className="text-sm text-slate-500 mt-1">维护各类供应商名录与合作记录。</p>
        </div>
        <div className="flex items-center space-x-3">
          <input
            type="file"
            accept=".xlsx, .xls"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting || isAccountManager || isOperationManager || (isCustomerDirector && !isOperationDirector)}
            className={`bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isImporting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            导入 Excel
          </button>
          <button
            onClick={handleAdd}
            disabled={isAccountManager || isOperationManager || (isCustomerDirector && !isOperationDirector)}
            className={`bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <Plus className="w-4 h-4 mr-2" />
            新增供应商
          </button>
        </div>
      </div>

      {importMessage && (
        <div className={cn(
          "p-4 rounded-lg text-sm border",
          importMessage.type === 'success' ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"
        )}>
          {importMessage.text}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center px-4 sm:px-0">
          <div className="flex overflow-x-auto w-full sm:w-auto hide-scrollbar">
            {supplierTypes.map((type) => (
              <button
                key={type}
                onClick={() => setActiveTab(type)}
                className={cn(
                  "px-6 py-4 text-sm font-medium whitespace-nowrap transition-colors border-b-2",
                  activeTab === type 
                    ? "border-indigo-600 text-indigo-600" 
                    : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                )}
              >
                {type}
              </button>
            ))}
          </div>
          <div className="p-3 w-full sm:w-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="搜索供应商名称..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-64 pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            </div>
          ) : suppliers.length === 0 ? (
            <div className="flex flex-col justify-center items-center h-64 text-slate-500">
              <p>暂无【{activeTab}】类别的供应商数据</p>
              <p className="text-sm mt-2">点击右上角“新增供应商”添加</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-sm">
                  <th className="px-6 py-3 font-medium">供应商名称</th>
                  <th className="px-6 py-3 font-medium">编码</th>
                  <th className="px-6 py-3 font-medium">参考报价</th>
                  {!isAccountManager && !isOperationManager && <th className="px-6 py-3 font-medium">实际成本</th>}
                  <th className="px-6 py-3 font-medium">联系人</th>
                  <th className="px-6 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {suppliers.map((supplier) => (
                  <tr key={supplier.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">
                      <div>{supplier.name}</div>
                      <div className="text-xs text-slate-400 font-normal">{supplier.contact_phone}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 font-mono">{supplier.code}</td>
                    <td className="px-6 py-4 text-sm text-slate-900">{renderQuote(supplier.reference_quote, supplier.type)}</td>
                    {!isAccountManager && !isOperationManager && (
                      <td className="px-6 py-4 text-sm text-indigo-600 font-medium">{renderQuote(supplier.actual_cost, supplier.type)}</td>
                    )}
                    <td className="px-6 py-4 text-sm text-slate-500">{supplier.contact_person || '-'}</td>
                    <td className="px-6 py-4 text-sm text-right space-x-3">
                      <button
                        onClick={() => navigate(`/suppliers/${supplier.id}`)}
                        className="text-slate-600 hover:text-slate-900"
                        title="查看详情"
                      >
                        <Eye className="w-4 h-4 inline" />
                      </button>
                      {!isAccountManager && !isOperationManager && (
                        <>
                          <button
                            onClick={() => handleEdit(supplier)}
                            className="text-indigo-600 hover:text-indigo-900"
                            title="编辑"
                          >
                            <Edit2 className="w-4 h-4 inline" />
                          </button>
                          <button
                            onClick={() => handleDelete(supplier.id)}
                            className="text-red-600 hover:text-red-900"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4 inline" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <SupplierForm 
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSuccess={fetchSuppliers}
        initialData={editingSupplier}
        defaultType={activeTab}
      />

      {/* Delete Confirmation Modal */}
      {supplierToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 sm:p-0">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">确认删除</h3>
              <p className="text-sm text-slate-500">
                确定要删除该供应商吗？此操作不可恢复。
              </p>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end space-x-3">
              <button
                onClick={() => setSupplierToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
