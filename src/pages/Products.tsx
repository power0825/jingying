import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, Edit2, Trash2, AlertTriangle, Loader2, Package, ArrowDownToLine, ArrowUpFromLine, X, Upload, Image } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Product } from '../types/product';
import { useAppStore } from '../store';

export default function Products() {
  const { user } = useAppStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [stockAdjustProduct, setStockAdjustProduct] = useState<Product | null>(null);
  const [stockAdjustType, setStockAdjustType] = useState<'in' | 'out'>('in');
  const [stockAdjustQty, setStockAdjustQty] = useState(1);
  const [stockAdjusting, setStockAdjusting] = useState(false);
  const [soldQuantities, setSoldQuantities] = useState<Record<string, number>>({});
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isFinance = user?.role === '财务';

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    category: '',
    specification: '',
    unit: '个',
    cost_price: 0,
    suggested_price: 0,
    stock_quantity: 0,
    min_stock: 10,
    description: '',
    image_url: '',
  });

  const fetchData = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProducts(data || []);

      // Fetch sold quantities for each product
      const { data: salesData } = await supabase
        .from('product_sales')
        .select('product_id, quantity');

      if (salesData) {
        const soldQtyMap: Record<string, number> = {};
        salesData.forEach(sale => {
          soldQtyMap[sale.product_id] = (soldQtyMap[sale.product_id] || 0) + sale.quantity;
        });
        setSoldQuantities(soldQtyMap);
      }
    } catch (err) {
      console.error('Error fetching products:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenForm = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        code: product.code,
        category: product.category,
        specification: product.specification,
        unit: product.unit,
        cost_price: product.cost_price,
        suggested_price: product.suggested_price,
        stock_quantity: product.stock_quantity,
        min_stock: product.min_stock,
        description: product.description || '',
        image_url: product.image_url || '',
      });
      setImagePreview(product.image_url || '');
    } else {
      setEditingProduct(null);
      setFormData({
        name: '',
        code: `P${Date.now().toString().slice(-6)}`,
        category: '',
        specification: '',
        unit: '个',
        cost_price: 0,
        suggested_price: 0,
        stock_quantity: 0,
        min_stock: 10,
        description: '',
        image_url: '',
      });
      setImagePreview('');
    }
    setImageFile(null);
    setIsFormOpen(true);
  };

  // 处理图片选择
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('请选择图片文件');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert('图片大小不能超过 5MB');
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // 上传图片到 Supabase Storage
  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile) return null;

    setUploadingImage(true);
    try {
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
      const { data, error } = await supabase.storage
        .from('product-images')
        .upload(fileName, imageFile);

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName);

      return urlData.publicUrl;
    } catch (err: any) {
      console.error('Error uploading image:', err);
      alert('图片上传失败：' + (err.message || '请重试'));
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFinance) {
      alert('只有财务人员可以添加或修改商品信息');
      return;
    }

    try {
      let imageUrl = formData.image_url;

      // 如果有新选择的图片，先上传
      if (imageFile) {
        const uploadedUrl = await uploadImage();
        if (uploadedUrl) {
          imageUrl = uploadedUrl;
        }
      }

      const productData = {
        name: formData.name,
        code: formData.code,
        category: formData.category,
        specification: formData.specification,
        unit: formData.unit,
        cost_price: formData.cost_price,
        suggested_price: formData.suggested_price,
        stock_quantity: formData.stock_quantity,
        min_stock: formData.min_stock,
        description: formData.description,
        image_url: imageUrl,
        updated_at: new Date().toISOString(),
      };

      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('products')
          .insert([productData]);
        if (error) throw error;
      }

      setIsFormOpen(false);
      fetchData();
    } catch (err: any) {
      console.error('Error saving product:', err);
      alert('保存失败，请重试');
    }
  };

  const handleDelete = async (id: string) => {
    if (!isFinance) {
      alert('只有财务人员可以删除商品');
      return;
    }
    if (!window.confirm('确定要删除该商品吗？')) return;
    try {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err) {
      console.error('Error deleting product:', err);
      alert('删除失败，请重试');
    }
  };

  const handleStockAdjust = async (id: string, adjustment: number) => {
    if (!isFinance) {
      alert('只有财务人员可以调整库存');
      return;
    }
    const product = products.find(p => p.id === id);
    if (!product) return;

    const newStock = product.stock_quantity + adjustment;
    if (newStock < 0) {
      alert('库存不能为负数');
      return;
    }

    try {
      const { error } = await supabase
        .from('products')
        .update({
          stock_quantity: newStock,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err) {
      console.error('Error adjusting stock:', err);
      alert('库存调整失败');
    }
  };

  const openStockModal = (product: Product, type: 'in' | 'out') => {
    setStockAdjustProduct(product);
    setStockAdjustType(type);
    setStockAdjustQty(1);
    setIsStockModalOpen(true);
  };

  const handleStockModalConfirm = async () => {
    if (!stockAdjustProduct) return;
    setStockAdjusting(true);

    try {
      const adjustment = stockAdjustType === 'in' ? stockAdjustQty : -stockAdjustQty;
      const newStock = stockAdjustProduct.stock_quantity + adjustment;

      if (newStock < 0) {
        alert('库存不能为负数');
        setStockAdjusting(false);
        return;
      }

      const { error } = await supabase
        .from('products')
        .update({
          stock_quantity: newStock,
          updated_at: new Date().toISOString()
        })
        .eq('id', stockAdjustProduct.id);

      if (error) throw error;

      setIsStockModalOpen(false);
      setStockAdjustProduct(null);
      fetchData();
    } catch (err: any) {
      console.error('Error adjusting stock:', err);
      alert('库存调整失败');
    } finally {
      setStockAdjusting(false);
    }
  };

  // Get unique categories
  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean)));

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         p.specification.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !categoryFilter || p.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const lowStockProducts = products.filter(p => p.stock_quantity <= p.min_stock);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">商品管理</h1>
          <p className="text-sm text-slate-500 mt-1">管理商品信息、库存和价格。</p>
        </div>
        {isFinance && (
          <button
            onClick={() => handleOpenForm()}
            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            新增商品
          </button>
        )}
      </div>

      {/* Low Stock Warning */}
      {lowStockProducts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-amber-800">库存预警</h3>
            <p className="text-sm text-amber-700 mt-1">
              以下商品库存不足：{lowStockProducts.map(p => p.name).join('、')}
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-slate-200">
        <div className="p-4 border-b border-slate-200 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="搜索商品名称、编码、规格..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64 pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">全部分类</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div className="text-sm text-slate-500">
            共 {products.length} 个商品
            {!isFinance && <span className="ml-2 text-amber-600">（成本价仅财务可见）</span>}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">商品图片</th>
                <th className="px-4 py-3">商品编码</th>
                <th className="px-4 py-3">商品名称</th>
                <th className="px-4 py-3">分类</th>
                <th className="px-4 py-3">规格型号</th>
                <th className="px-4 py-3">单位</th>
                <th className="px-4 py-3">成本价</th>
                <th className="px-4 py-3">建议售价</th>
                <th className="px-4 py-3">库存数量</th>
                <th className="px-4 py-3">已售数量</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-6 py-8 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-600" />
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-8 text-center text-slate-500">
                    暂无商品数据
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-12 h-12 object-cover rounded border border-slate-200"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-12 h-12 bg-slate-100 rounded flex items-center justify-center text-slate-400">
                          <Package className="w-6 h-6" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{product.code}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{product.name}</td>
                    <td className="px-4 py-3 text-slate-600">{product.category || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{product.specification || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{product.unit}</td>
                    <td className="px-4 py-3">
                      {isFinance ? (
                        <span className="text-slate-900">¥{product.cost_price.toLocaleString()}</span>
                      ) : (
                        <span className="text-slate-400">***</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-900">¥{product.suggested_price.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2">
                        <span className={product.stock_quantity <= product.min_stock ? 'text-red-600 font-medium' : 'text-slate-700'}>
                          {product.stock_quantity}
                        </span>
                        {product.stock_quantity <= product.min_stock && (
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{soldQuantities[product.id] || 0}</td>
                    <td className="px-4 py-3 text-right">
                      {isFinance ? (
                        <div className="flex flex-wrap gap-2 justify-end">
                          <button
                            onClick={() => handleOpenForm(product)}
                            className="text-indigo-600 hover:text-indigo-900 p-1 hover:bg-indigo-50 rounded transition-colors"
                            title="编辑"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(product.id)}
                            className="text-red-600 hover:text-red-900 p-1 hover:bg-red-50 rounded transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <div className="w-px h-4 bg-slate-300 mx-1 self-center"></div>
                          <button
                            onClick={() => openStockModal(product, 'in')}
                            className="text-emerald-600 hover:text-emerald-900 px-2 py-1 hover:bg-emerald-50 rounded transition-colors text-xs font-medium flex items-center"
                            title="入库"
                          >
                            <ArrowDownToLine className="w-3 h-3 mr-1" />
                            入库
                          </button>
                          <button
                            onClick={() => openStockModal(product, 'out')}
                            className="text-amber-600 hover:text-amber-900 px-2 py-1 hover:bg-amber-50 rounded transition-colors text-xs font-medium flex items-center"
                            title="出库"
                          >
                            <ArrowUpFromLine className="w-3 h-3 mr-1" />
                            出库
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-sm">仅限查看</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Product Form Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {editingProduct ? '编辑商品' : '新增商品'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">商品编码 *</label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={e => setFormData({...formData, code: e.target.value})}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">商品名称 *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">商品分类</label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={e => setFormData({...formData, category: e.target.value})}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    list="category-list"
                  />
                  <datalist id="category-list">
                    {categories.map(cat => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">规格型号</label>
                  <input
                    type="text"
                    value={formData.specification}
                    onChange={e => setFormData({...formData, specification: e.target.value})}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">计量单位</label>
                  <select
                    value={formData.unit}
                    onChange={e => setFormData({...formData, unit: e.target.value})}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="个">个</option>
                    <option value="件">件</option>
                    <option value="套">套</option>
                    <option value="箱">箱</option>
                    <option value="包">包</option>
                    <option value="瓶">瓶</option>
                    <option value="盒">盒</option>
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="L">L</option>
                    <option value="ml">ml</option>
                    <option value="米">米</option>
                    <option value="其他">其他</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">最低库存预警</label>
                  <input
                    type="number"
                    value={formData.min_stock}
                    onChange={e => setFormData({...formData, min_stock: parseInt(e.target.value) || 0})}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">成本价 *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.cost_price}
                    onChange={e => setFormData({...formData, cost_price: parseFloat(e.target.value) || 0})}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">建议售价 *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.suggested_price}
                    onChange={e => setFormData({...formData, suggested_price: parseFloat(e.target.value) || 0})}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">当前库存</label>
                  <div className="flex items-center space-x-4">
                    <input
                      type="number"
                      value={formData.stock_quantity}
                      onChange={e => setFormData({...formData, stock_quantity: parseInt(e.target.value) || 0})}
                      className="w-32 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-slate-500">初始入库数量</span>
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">商品描述</label>
                  <textarea
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                    rows={3}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">商品图片</label>
                  <div className="flex items-start space-x-4">
                    <div className="flex-1">
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImageSelect}
                        accept="image/*"
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingImage}
                        className="w-full border-2 border-dashed border-slate-300 rounded-lg p-6 flex flex-col items-center justify-center hover:border-indigo-500 hover:bg-indigo-50 transition-colors"
                      >
                        {uploadingImage ? (
                          <>
                            <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-2" />
                            <span className="text-sm text-slate-600">上传中...</span>
                          </>
                        ) : imagePreview ? (
                          <>
                            <Image className="w-8 h-8 text-slate-400 mb-2" />
                            <span className="text-sm text-slate-600">点击更换图片</span>
                            <span className="text-xs text-slate-500 mt-1">支持 jpg/png 格式，最大 5MB</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-8 h-8 text-slate-400 mb-2" />
                            <span className="text-sm text-slate-600">点击上传图片</span>
                            <span className="text-xs text-slate-500 mt-1">支持 jpg/png 格式，最大 5MB</span>
                          </>
                        )}
                      </button>
                      {imagePreview && !uploadingImage && (
                        <div className="mt-3 flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setImagePreview('');
                              setImageFile(null);
                              if (fileInputRef.current) fileInputRef.current.value = '';
                            }}
                            className="text-sm text-red-600 hover:text-red-800"
                          >
                            <X className="w-4 h-4 inline mr-1" />
                            移除图片
                          </button>
                        </div>
                      )}
                    </div>
                    {imagePreview && (
                      <div className="w-32 h-32 border border-slate-200 rounded-lg overflow-hidden flex-shrink-0 bg-slate-50">
                        <img
                          src={imagePreview}
                          alt="预览"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                  </div>
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

      {/* Stock Adjustment Modal */}
      {isStockModalOpen && stockAdjustProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {stockAdjustType === 'in' ? '商品入库' : '商品出库'}
              </h2>
              <button
                onClick={() => setIsStockModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 p-3 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-500">商品名称</p>
              <p className="font-medium text-slate-900">{stockAdjustProduct.name}</p>
              <p className="text-sm text-slate-500 mt-2">当前库存</p>
              <p className="font-medium text-slate-900">{stockAdjustProduct.stock_quantity} {stockAdjustProduct.unit}</p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {stockAdjustType === 'in' ? '入库数量' : '出库数量'}
              </label>
              <input
                type="number"
                min="1"
                value={stockAdjustQty}
                onChange={e => setStockAdjustQty(parseInt(e.target.value) || 1)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                autoFocus
              />
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setIsStockModalOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleStockModalConfirm}
                disabled={stockAdjusting}
                className={`px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50 ${
                  stockAdjustType === 'in'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {stockAdjusting ? '处理中...' : '确认'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
