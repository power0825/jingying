import React, { useState, useEffect } from 'react';
import { Plus, Trash2, CheckCircle, Loader2, AlertCircle, Package, Search, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Project } from '../../types/project';
import { useAppStore } from '../../store';
import { notifyFinanceUsers } from '../../lib/notifications';

interface ProductSale {
  id: string;
  product_id: string;
  project_id: string;
  quantity: number;
  sale_price: number;
  total_amount: number;
  payment_method: '银行转账' | '支付宝' | '微信' | '现金' | '月结' | '其他';
  payment_status: '未收款' | '部分收款' | '已收款';
  received_amount?: number;
  sale_date: string;
  sale_user_id: string;
  remarks?: string;
  created_at: string;
  product?: {
    name: string;
    code: string;
    specification: string;
    unit: string;
  };
}

interface Product {
  id: string;
  name: string;
  code: string;
  specification: string;
  unit: string;
  suggested_price: number;
  stock_quantity: number;
  image_url?: string;
}

interface ProductSalesProps {
  project: Project;
}

export default function ProductSales({ project }: ProductSalesProps) {
  const { user } = useAppStore();
  const [sales, setSales] = useState<ProductSale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<ProductSale | null>(null);
  const [isProductSelectorOpen, setIsProductSelectorOpen] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [formData, setFormData] = useState({
    product_id: '',
    quantity: 1,
    sale_price: 0,
    payment_method: '银行转账' as const,
    payment_status: '未收款' as const,
    received_amount: 0,
    sale_date: new Date().toISOString().split('T')[0],
    remarks: '',
  });

  const fetchData = async () => {
    try {
      // Fetch products
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('*')
        .order('name');

      if (productsError) {
        console.error('Error fetching products:', productsError);
      } else {
        setProducts(productsData || []);
      }
      const { data: salesData, error: salesError } = await supabase
        .from('product_sales')
        .select('*')
        .eq('project_id', project.id)
        .order('sale_date', { ascending: false });

      if (salesError) {
        console.error('Error fetching sales:', salesError);
      } else {
        if (salesData && salesData.length > 0) {
          // Fetch product details for each sale
          const salesWithProducts = await Promise.all(
            salesData.map(async (sale: any) => {
              const { data: product } = await supabase
                .from('products')
                .select('name, code, specification, unit')
                .eq('id', sale.product_id)
                .single();
              return { ...sale, product };
            })
          );
          setSales(salesWithProducts);
        } else {
          setSales([]);
        }
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (project.id) {
      fetchData();
    }
  }, [project.id]);

  const handleOpenForm = (sale?: ProductSale) => {
    if (sale) {
      setEditingSale(sale);
      const product = products.find(p => p.id === sale.product_id);
      setSelectedProduct(product || null);
      setFormData({
        product_id: sale.product_id,
        quantity: sale.quantity,
        sale_price: sale.sale_price,
        payment_method: sale.payment_method,
        payment_status: sale.payment_status,
        received_amount: sale.received_amount || 0,
        sale_date: sale.sale_date.split('T')[0],
        remarks: sale.remarks || '',
      });
    } else {
      setEditingSale(null);
      setSelectedProduct(null);
      setFormData({
        product_id: '',
        quantity: 1,
        sale_price: 0,
        payment_method: '银行转账',
        payment_status: '未收款',
        received_amount: 0,
        sale_date: new Date().toISOString().split('T')[0],
        remarks: '',
      });
    }
    setIsFormOpen(true);
  };

  // 打开商品选择器
  const openProductSelector = () => {
    setIsProductSelectorOpen(true);
    setProductSearchTerm('');
  };

  // 选择商品
  const selectProduct = (product: Product) => {
    setSelectedProduct(product);
    setFormData({
      ...formData,
      product_id: product.id,
      sale_price: product.suggested_price,
    });
    setIsProductSelectorOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert('请先登录');
      return;
    }

    if (!formData.product_id) {
      alert('请选择商品');
      return;
    }

    const selectedProduct = products.find(p => p.id === formData.product_id);
    if (!selectedProduct) {
      alert('请选择商品');
      return;
    }

    // Check stock
    if (!editingSale && selectedProduct.stock_quantity < formData.quantity) {
      if (!window.confirm(`库存不足！当前库存：${selectedProduct.stock_quantity}，销售数量：${formData.quantity}。是否继续？`)) {
        return;
      }
    }

    setSaving(true);
    try {
      const totalAmount = formData.quantity * formData.sale_price;
      const saleData = {
        product_id: formData.product_id,
        project_id: project.id,
        quantity: formData.quantity,
        sale_price: formData.sale_price,
        total_amount: totalAmount,
        payment_method: formData.payment_method,
        payment_status: formData.payment_status,
        received_amount: formData.payment_status === '已收款' ? totalAmount : formData.received_amount,
        sale_date: formData.sale_date,
        sale_user_id: user.id,
        remarks: formData.remarks,
      };

      let stockChange = 0;

      if (editingSale) {
        // Update existing sale
        const { error: updateError } = await supabase
          .from('product_sales')
          .update(saleData)
          .eq('id', editingSale.id);
        if (updateError) throw updateError;

        // Calculate stock change (new qty - old qty)
        const oldSale = sales.find(s => s.id === editingSale.id);
        if (oldSale && oldSale.product_id === formData.product_id) {
          stockChange = oldSale.quantity - formData.quantity; // Restore old, deduct new
        } else if (oldSale) {
          // Product changed, restore old product stock
          await supabase.rpc('adjust_product_stock', {
            p_product_id: oldSale.product_id,
            p_quantity: oldSale.quantity
          }).catch(() => {}); // Ignore if function doesn't exist
          stockChange = -formData.quantity;
        }
      } else {
        // New sale - deduct stock
        const { error: insertError } = await supabase
          .from('product_sales')
          .insert([saleData]);
        if (insertError) throw insertError;
        stockChange = -formData.quantity;
      }

      // Update stock directly
      if (stockChange !== 0) {
        const { error: stockError } = await supabase.rpc('adjust_product_stock', {
          p_product_id: formData.product_id,
          p_quantity: stockChange
        });

        // If RPC function doesn't exist, update directly
        if (stockError && stockError.code === '42883') {
          // Function doesn't exist, update directly
          const { data: productData } = await supabase
            .from('products')
            .select('stock_quantity')
            .eq('id', formData.product_id)
            .single();

          if (productData) {
            const newStock = productData.stock_quantity + stockChange;
            await supabase
              .from('products')
              .update({
                stock_quantity: newStock,
                updated_at: new Date().toISOString()
              })
              .eq('id', formData.product_id);
          }
        }
      }

      // Notify finance if payment status is received
      if (saleData.payment_status === '已收款' || (saleData.received_amount && saleData.received_amount > 0)) {
        await notifyFinanceUsers(
          '商品销售收款通知',
          `项目"${project.name}" 销售了 ${formData.quantity} ${selectedProduct.unit}"${selectedProduct.name}"，收款金额：¥${saleData.received_amount?.toLocaleString()}`,
          'sales_payment',
          '/products'
        );
      }

      setIsFormOpen(false);
      fetchData();
      alert('保存成功！');
    } catch (err: any) {
      console.error('Error saving sale:', err);
      alert(`保存失败：${err.message || '请重试'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除这条销售记录吗？库存将会恢复。')) return;

    try {
      const sale = sales.find(s => s.id === id);
      if (sale) {
        // Restore stock directly
        const { data: productData } = await supabase
          .from('products')
          .select('stock_quantity')
          .eq('id', sale.product_id)
          .single();

        if (productData) {
          await supabase
            .from('products')
            .update({
              stock_quantity: productData.stock_quantity + sale.quantity,
              updated_at: new Date().toISOString()
            })
            .eq('id', sale.product_id);
        }
      }

      const { error } = await supabase.from('product_sales').delete().eq('id', id);
      if (error) throw error;
      fetchData();
      alert('删除成功！');
    } catch (err: any) {
      console.error('Error deleting sale:', err);
      alert(`删除失败：${err.message}`);
    }
  };

  const totalSales = sales.reduce((sum, s) => sum + s.total_amount, 0);
  const totalReceived = sales.reduce((sum, s) => sum + (s.received_amount || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-100">
          <div className="text-sm text-indigo-600 font-medium mb-1">销售总额</div>
          <div className="text-2xl font-bold text-indigo-900">¥{totalSales.toLocaleString()}</div>
        </div>
        <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-100">
          <div className="text-sm text-emerald-600 font-medium mb-1">已收款金额</div>
          <div className="text-2xl font-bold text-emerald-900">¥{totalReceived.toLocaleString()}</div>
        </div>
        <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
          <div className="text-sm text-amber-600 font-medium mb-1">未收款金额</div>
          <div className="text-2xl font-bold text-amber-900">¥{(totalSales - totalReceived).toLocaleString()}</div>
        </div>
      </div>

      {/* Sales List */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
          <h3 className="font-medium text-slate-900">销售记录</h3>
          <button
            onClick={() => handleOpenForm()}
            className="flex items-center px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4 mr-1" />
            录入销售
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">商品</th>
                <th className="px-4 py-3">规格</th>
                <th className="px-4 py-3">数量</th>
                <th className="px-4 py-3">单价</th>
                <th className="px-4 py-3">总金额</th>
                <th className="px-4 py-3">收款方式</th>
                <th className="px-4 py-3">收款状态</th>
                <th className="px-4 py-3">销售日期</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sales.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400 italic">
                    暂无销售记录
                  </td>
                </tr>
              ) : (
                sales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{sale.product?.name || '未知商品'}</td>
                    <td className="px-4 py-3 text-slate-600">{sale.product?.specification || '-'}</td>
                    <td className="px-4 py-3 text-slate-700">{sale.quantity} {sale.product?.unit || ''}</td>
                    <td className="px-4 py-3 text-slate-700">¥{sale.sale_price.toLocaleString()}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">¥{sale.total_amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-600">{sale.payment_method}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        sale.payment_status === '已收款' ? 'bg-green-100 text-green-800' :
                        sale.payment_status === '部分收款' ? 'bg-blue-100 text-blue-800' :
                        'bg-slate-100 text-slate-800'
                      }`}>
                        {sale.payment_status}
                        {sale.payment_status === '部分收款' && sale.received_amount && (
                          <span className="ml-1 text-xs">(¥{sale.received_amount.toLocaleString()})</span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(sale.sale_date).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleOpenForm(sale)}
                        className="text-indigo-600 hover:text-indigo-900 mr-3 text-sm"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleDelete(sale.id)}
                        className="text-red-600 hover:text-red-900 text-sm"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Product Selector Modal - 更高层级 */}
      {isProductSelectorOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg w-full max-w-4xl p-6 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">选择商品</h2>
              <button
                onClick={() => setIsProductSelectorOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Search */}
            <div className="mb-4 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="搜索商品名称、编码、规格..."
                value={productSearchTerm}
                onChange={(e) => setProductSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                autoFocus
              />
            </div>

            {/* Product Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 overflow-y-auto flex-1 p-1">
              {products
                .filter(p => {
                  const term = productSearchTerm.toLowerCase();
                  return p.name.toLowerCase().includes(term) ||
                         p.code.toLowerCase().includes(term) ||
                         (p.specification && p.specification.toLowerCase().includes(term));
                })
                .map((product) => (
                  <button
                    key={product.id}
                    onClick={() => selectProduct(product)}
                    className={`border rounded-lg p-3 text-left hover:shadow-md transition-all ${
                      selectedProduct?.id === product.id
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    <div className="aspect-square bg-slate-100 rounded-lg mb-2 overflow-hidden flex items-center justify-center">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <Package className="w-8 h-8 text-slate-400" />
                      )}
                    </div>
                    <div className="font-medium text-slate-900 text-sm truncate" title={product.name}>
                      {product.name}
                    </div>
                    <div className="text-xs text-slate-500 truncate" title={product.code}>
                      {product.code}
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className={`text-xs font-medium ${product.stock_quantity > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        库存：{product.stock_quantity}
                      </span>
                      <span className="text-xs font-medium text-indigo-600">
                        ¥{product.suggested_price.toLocaleString()}
                      </span>
                    </div>
                  </button>
                ))}
            </div>

            <div className="mt-4 text-sm text-slate-500 text-center">
              共 {products.length} 个商品
              {productSearchTerm && `（筛选后：${products.filter(p => p.name.toLowerCase().includes(productSearchTerm.toLowerCase()) || p.code.toLowerCase().includes(productSearchTerm.toLowerCase())).length} 个）`}
            </div>
          </div>
        </div>
      )}

      {/* Sale Form Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-2xl p-6">
            <h2 className="text-xl font-bold mb-4">
              {editingSale ? '编辑销售记录' : '录入商品销售'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">选择商品 *</label>
                  {selectedProduct ? (
                    <div className="border border-slate-200 rounded-lg p-3 flex items-center space-x-4 bg-slate-50">
                      <div className="w-20 h-20 flex-shrink-0 bg-white rounded border border-slate-200 overflow-hidden">
                        {selectedProduct.image_url ? (
                          <img
                            src={selectedProduct.image_url}
                            alt={selectedProduct.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400">
                            <Package className="w-8 h-8" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-slate-900">{selectedProduct.name}</div>
                        <div className="text-sm text-slate-500">编码：{selectedProduct.code}</div>
                        <div className="text-sm text-slate-500">规格：{selectedProduct.specification || '-'}</div>
                        <div className="flex items-center space-x-4 mt-1">
                          <span className="text-sm text-emerald-600 font-medium">库存：{selectedProduct.stock_quantity} {selectedProduct.unit}</span>
                          <span className="text-sm text-indigo-600 font-medium">建议价：¥{selectedProduct.suggested_price.toLocaleString()}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={openProductSelector}
                        className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                      >
                        更换
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={openProductSelector}
                      className="w-full border-2 border-dashed border-slate-300 rounded-lg p-4 flex items-center justify-center hover:border-indigo-500 hover:bg-indigo-50 transition-colors"
                    >
                      <Plus className="w-5 h-5 text-slate-400 mr-2" />
                      <span className="text-slate-500">点击选择商品</span>
                    </button>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">销售数量 *</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.quantity}
                    onChange={e => setFormData({...formData, quantity: parseInt(e.target.value) || 1})}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">销售单价 *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.sale_price}
                    onChange={e => setFormData({...formData, sale_price: parseFloat(e.target.value) || 0})}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">收款方式</label>
                  <select
                    value={formData.payment_method}
                    onChange={e => setFormData({...formData, payment_method: e.target.value as any})}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="银行转账">银行转账</option>
                    <option value="支付宝">支付宝</option>
                    <option value="微信">微信</option>
                    <option value="现金">现金</option>
                    <option value="月结">月结</option>
                    <option value="其他">其他</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">收款状态</label>
                  <select
                    value={formData.payment_status}
                    onChange={e => setFormData({...formData, payment_status: e.target.value as any})}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="未收款">未收款</option>
                    <option value="部分收款">部分收款</option>
                    <option value="已收款">已收款</option>
                  </select>
                </div>
                {formData.payment_status !== '未收款' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">已收款金额</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.received_amount}
                      onChange={e => setFormData({...formData, received_amount: parseFloat(e.target.value) || 0})}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">销售日期</label>
                  <input
                    type="date"
                    value={formData.sale_date}
                    onChange={e => setFormData({...formData, sale_date: e.target.value})}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">备注</label>
                  <textarea
                    value={formData.remarks}
                    onChange={e => setFormData({...formData, remarks: e.target.value})}
                    rows={2}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    placeholder="可选填写备注信息"
                  />
                </div>
              </div>

              {/* Total Preview */}
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="text-right text-lg font-bold text-slate-900">
                  合计：¥{(formData.quantity * formData.sale_price).toLocaleString()}
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
                  disabled={saving}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
