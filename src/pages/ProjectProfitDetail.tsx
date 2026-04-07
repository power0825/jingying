import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp, CheckCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';
import { Project } from '../types/project';

interface SupplierPayment {
  id: string;
  supplier_id?: string;
  supplier_name: string;
  amount: number;           // 预估成本（从行程计算的原始成本）
  actual_amount: number;    // 实际成本（手动修改后的值，如果没有修改则等于 amount）
  payment_status: string;
}

interface Reimbursement {
  id: string;
  category: string;
  description: string;
  amount: number;
  status: string;
  user_name?: string;
}

interface ProductSaleDetail {
  id: string;
  product_name: string;
  quantity: number;
  sale_price: number;
  cost: number;
  tax: number;
  commission: number;
  profit: number;
}

export default function ProjectProfitDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAppStore();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  // 服务板块状态
  const [serviceTaxRate, setServiceTaxRate] = useState(3);
  const [serviceCommissionRate, setServiceCommissionRate] = useState(0);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [showSupplierDetail, setShowSupplierDetail] = useState(false);
  const [showReimbursementDetail, setShowReimbursementDetail] = useState(false);
  const [savingService, setSavingService] = useState(false);
  const [otherCost, setOtherCost] = useState(0);

  // 商品板块状态
  const [productTaxRate, setProductTaxRate] = useState(13);
  const [productCommissionRate, setProductCommissionRate] = useState(0);
  const [productSales, setProductSales] = useState<ProductSaleDetail[]>([]);
  const [productCost, setProductCost] = useState(0);
  const [savingProduct, setSavingProduct] = useState(false);

  // 人员信息
  const [bdManager, setBdManager] = useState<string>(''); // 项目经理
  const [classTeacher, setClassTeacher] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('-');

  // 用于防抖自动保存
  const [debouncedServiceRate, setDebouncedServiceRate] = useState(0);
  const [debouncedProductRate, setDebouncedProductRate] = useState(0);
  const [debouncedOtherCost, setDebouncedOtherCost] = useState(0);

  useEffect(() => {
    if (projectId) {
      fetchProjectDetail();
    }
  }, [projectId]);

  // 自动保存服务提成比例（防抖 500ms）
  useEffect(() => {
    const timer = setTimeout(() => {
      if (debouncedServiceRate > 0 && projectId) {
        supabase
          .from('projects')
          .update({ service_commission_rate: debouncedServiceRate })
          .eq('id', projectId)
          .then(({ error }) => {
            if (error) console.error('Auto-save service commission failed:', error);
            else console.log('Auto-saved service commission:', debouncedServiceRate);
          });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [debouncedServiceRate, projectId]);

  // 自动保存商品提成比例（防抖 500ms）
  useEffect(() => {
    const timer = setTimeout(() => {
      if (debouncedProductRate > 0 && projectId) {
        supabase
          .from('projects')
          .update({ product_commission_rate: debouncedProductRate })
          .eq('id', projectId)
          .then(({ error }) => {
            if (error) console.error('Auto-save product commission failed:', error);
            else console.log('Auto-saved product commission:', debouncedProductRate);
          });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [debouncedProductRate, projectId]);

  // 自动保存其他成本（防抖 500ms）
  useEffect(() => {
    const timer = setTimeout(() => {
      if (projectId) {
        supabase
          .from('projects')
          .update({ other_cost: debouncedOtherCost })
          .eq('id', projectId)
          .then(({ error }) => {
            if (error) console.error('Auto-save other cost failed:', error);
            else console.log('Auto-saved other cost:', debouncedOtherCost);
          });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [debouncedOtherCost, projectId]);

  const fetchProjectDetail = async () => {
    try {
      setLoading(true);

      // 获取项目详情
      const { data: projectData, error: pError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (pError) throw pError;
      setProject(projectData);

      // 从 project 读取已保存的提成比例
      if (projectData?.service_commission_rate !== undefined && projectData?.service_commission_rate !== null) {
        const rate = Number(projectData.service_commission_rate) || 0;
        setServiceCommissionRate(rate);
        setDebouncedServiceRate(rate);
      }
      if (projectData?.product_commission_rate !== undefined && projectData?.product_commission_rate !== null) {
        const rate = Number(projectData.product_commission_rate) || 0;
        setProductCommissionRate(rate);
        setDebouncedProductRate(rate);
      }
      if (projectData?.other_cost !== undefined && projectData?.other_cost !== null) {
        const cost = Number(projectData.other_cost) || 0;
        setOtherCost(cost);
        setDebouncedOtherCost(cost);
      }

      // 获取项目经理名称
      if (projectData?.bd_manager_id) {
        const { data: bdData } = await supabase
          .from('users')
          .select('name')
          .eq('id', projectData.bd_manager_id)
          .single();
        if (bdData) setBdManager(bdData.name);
      }

      // 获取客户名称
      if (projectData?.customer_id) {
        const { data: customerData } = await supabase
          .from('customers')
          .select('name')
          .eq('id', projectData.customer_id)
          .single();
        if (customerData) setCustomerName(customerData.name);
      }

      // 获取班主任名称
      if (projectData?.class_teacher_id) {
        const { data: teacherData } = await supabase
          .from('users')
          .select('name')
          .eq('id', projectData.class_teacher_id)
          .single();
        if (teacherData) setClassTeacher(teacherData.name);
      }

      // 获取供应商实际成本数据（从 approved_project_itineraries 计算）
      const { data: itineraries } = await supabase
        .from('approved_project_itineraries')
        .select('id, day_index, morning, afternoon, noon, evening, bus_id, bus_actual_cost, bus_cost, hotel_arrangement')
        .eq('project_id', projectId);

      const itinerarySupplierCosts: Record<string, number> = {};
      const itinerarySupplierActualCosts: Record<string, number> = {};
      const supplierIdsFromItinerary = new Set<string>();

      if (itineraries) {
        itineraries.forEach(day => {
          // 大巴费用
          if (day.bus_id) {
            supplierIdsFromItinerary.add(day.bus_id);
            itinerarySupplierCosts[day.bus_id] = (itinerarySupplierCosts[day.bus_id] || 0) + (Number(day.bus_cost) || 0);
            let busActualCost = Number(day.bus_actual_cost) || Number(day.bus_cost) || 0;
            itinerarySupplierActualCosts[day.bus_id] = (itinerarySupplierActualCosts[day.bus_id] || 0) + busActualCost;
          }

          // 上午活动
          if (Array.isArray(day.morning)) {
            day.morning.forEach((act: any) => {
              if (act.supplierId) {
                supplierIdsFromItinerary.add(act.supplierId);
                itinerarySupplierCosts[act.supplierId] = (itinerarySupplierCosts[act.supplierId] || 0) + (Number(act.cost) || 0);
                let actualCost = Number(act.actualCost) || Number(act.cost) || 0;
                itinerarySupplierActualCosts[act.supplierId] = (itinerarySupplierActualCosts[act.supplierId] || 0) + actualCost;
              }
              if (act.venueId) {
                supplierIdsFromItinerary.add(act.venueId);
                itinerarySupplierCosts[act.venueId] = (itinerarySupplierCosts[act.venueId] || 0) + (Number(act.venueCost) || 0);
                let venueActualCost = Number(act.venueActualCost) || Number(act.venueCost) || 0;
                itinerarySupplierActualCosts[act.venueId] = (itinerarySupplierActualCosts[act.venueId] || 0) + venueActualCost;
              }
            });
          }

          // 下午活动
          if (Array.isArray(day.afternoon)) {
            day.afternoon.forEach((act: any) => {
              if (act.supplierId) {
                supplierIdsFromItinerary.add(act.supplierId);
                itinerarySupplierCosts[act.supplierId] = (itinerarySupplierCosts[act.supplierId] || 0) + (Number(act.cost) || 0);
                let actualCost = Number(act.actualCost) || Number(act.cost) || 0;
                itinerarySupplierActualCosts[act.supplierId] = (itinerarySupplierActualCosts[act.supplierId] || 0) + actualCost;
              }
              if (act.venueId) {
                supplierIdsFromItinerary.add(act.venueId);
                itinerarySupplierCosts[act.venueId] = (itinerarySupplierCosts[act.venueId] || 0) + (Number(act.venueCost) || 0);
                let venueActualCost = Number(act.venueActualCost) || Number(act.venueCost) || 0;
                itinerarySupplierActualCosts[act.venueId] = (itinerarySupplierActualCosts[act.venueId] || 0) + venueActualCost;
              }
            });
          }

          // 午餐
          if (day.noon && day.noon.supplierId) {
            supplierIdsFromItinerary.add(day.noon.supplierId);
            itinerarySupplierCosts[day.noon.supplierId] = (itinerarySupplierCosts[day.noon.supplierId] || 0) + (Number(day.noon.cost) || 0);
            let actualCost = Number(day.noon.actualCost) || Number(day.noon.cost) || 0;
            itinerarySupplierActualCosts[day.noon.supplierId] = (itinerarySupplierActualCosts[day.noon.supplierId] || 0) + actualCost;
          }

          // 晚餐
          if (day.evening && day.evening.supplierId) {
            supplierIdsFromItinerary.add(day.evening.supplierId);
            itinerarySupplierCosts[day.evening.supplierId] = (itinerarySupplierCosts[day.evening.supplierId] || 0) + (Number(day.evening.cost) || 0);
            let actualCost = Number(day.evening.actualCost) || Number(day.evening.cost) || 0;
            itinerarySupplierActualCosts[day.evening.supplierId] = (itinerarySupplierActualCosts[day.evening.supplierId] || 0) + actualCost;
          }
        });
      }

      // 处理酒店费用
      const firstDay = itineraries?.find(d => d.day_index === 1 || d.day_index === 0);
      if (firstDay?.hotel_arrangement) {
        const hotelId = firstDay.hotel_arrangement.hotelId || firstDay.hotel_arrangement.hotel_id;
        const hotelCost = Number(firstDay.hotel_arrangement.cost) || 0;
        const hotelActualCost = Number(firstDay.hotel_arrangement.actualCost || firstDay.hotel_arrangement.actual_cost) || hotelCost;
        if (hotelId) {
          supplierIdsFromItinerary.add(hotelId);
          itinerarySupplierCosts[hotelId] = (itinerarySupplierCosts[hotelId] || 0) + hotelCost;
          itinerarySupplierActualCosts[hotelId] = (itinerarySupplierActualCosts[hotelId] || 0) + hotelActualCost;
        }
      }

      // 获取供应商名称
      const supplierNames: Record<string, string> = {};
      if (supplierIdsFromItinerary.size > 0) {
        const { data: supplierData } = await supabase
          .from('suppliers')
          .select('id, name')
          .in('id', Array.from(supplierIdsFromItinerary));

        if (supplierData) {
          supplierData.forEach(s => {
            supplierNames[s.id] = s.name;
          });
        }
      }

      // 构建供应商付款数据（从行程计算原始成本）
      const supplierPaymentsList: SupplierPayment[] = [];
      Object.keys(itinerarySupplierCosts).forEach(supplierId => {
        supplierPaymentsList.push({
          id: crypto.randomUUID(),
          supplier_id: supplierId,
          supplier_name: supplierNames[supplierId] || '未知供应商',
          amount: itinerarySupplierCosts[supplierId],
          actual_amount: itinerarySupplierActualCosts[supplierId] || itinerarySupplierCosts[supplierId],
          payment_status: '未付款',
        });
      });

      // 从 project_financial_suppliers 读取已保存的数据
      const { data: financialSuppliers } = await supabase
        .from('project_financial_suppliers')
        .select('supplier_id, amount, actual_amount')
        .eq('project_id', projectId);

      // 如果 project_financial_suppliers 中有已保存的记录，使用已保存的金额
      if (financialSuppliers && financialSuppliers.length > 0) {
        financialSuppliers.forEach(fs => {
          if (fs.supplier_id) {
            const existingIndex = supplierPaymentsList.findIndex(p => p.supplier_id === fs.supplier_id);
            if (existingIndex !== -1) {
              // amount 使用已保存的预估成本（运营总监最初确认的值）
              supplierPaymentsList[existingIndex].amount = Number(fs.amount) || supplierPaymentsList[existingIndex].amount;
              // actual_amount 使用已保存的实际成本（运营总监手动修改的值）
              supplierPaymentsList[existingIndex].actual_amount = Number(fs.actual_amount) || supplierPaymentsList[existingIndex].actual_amount;
            }
          }
        });
      }

      setSupplierPayments(supplierPaymentsList);

      // 获取报销数据
      const { data: reimbursementData } = await supabase
        .from('project_reimbursements')
        .select(`
          id,
          category,
          description,
          amount,
          status,
          users (name)
        `)
        .eq('project_id', projectId)
        .neq('status', '草稿');

      const formattedReimbursements = (reimbursementData || []).map((r: any) => ({
        id: r.id,
        category: r.category,
        description: r.description,
        amount: r.amount,
        status: r.status,
        user_name: r.users?.name || '未知',
      }));
      setReimbursements(formattedReimbursements);

      // 获取商品销售数据
      const { data: salesData } = await supabase
        .from('product_sales')
        .select('*')
        .eq('project_id', projectId);

      // 使用从项目读取的提成比例（局部变量，避免 state 异步问题）
      const currentProductCommissionRate = projectData?.product_commission_rate || 0;
      const currentProductTaxRate = 13;

      if (salesData && salesData.length > 0) {
        const salesWithDetails: ProductSaleDetail[] = [];
        let totalCost = 0;

        for (const sale of salesData) {
          const { data: product } = await supabase
            .from('products')
            .select('name, cost_price')
            .eq('id', sale.product_id)
            .single();

          const cost = (product?.cost_price || 0) * sale.quantity;
          totalCost += cost;
          // 税金 = 不含税价 × 税点 = 含税价 / (1 + 税点) × 税点
          const taxAmount = (sale.total_amount / (1 + currentProductTaxRate / 100)) * (currentProductTaxRate / 100);
          // 提成 = 不含税价 × 提成比例
          const commissionAmount = (sale.total_amount / (1 + currentProductTaxRate / 100)) * (currentProductCommissionRate / 100);
          const profitAmount = sale.total_amount - taxAmount - cost - commissionAmount;

          salesWithDetails.push({
            id: sale.id,
            product_name: product?.name || '未知商品',
            quantity: sale.quantity,
            sale_price: sale.total_amount,
            cost,
            tax: taxAmount,
            commission: commissionAmount,
            profit: profitAmount,
          });
        }

        setProductSales(salesWithDetails);
        setProductCost(totalCost);
      }
    } catch (err) {
      console.error('Error fetching project detail:', err);
    } finally {
      setLoading(false);
    }
  };

  // 服务板块计算
  const serviceIncomeWithTax = project?.income_with_tax || 0;
  const serviceIncomeWithoutTax = serviceIncomeWithTax / (1 + serviceTaxRate / 100);
  const serviceTax = serviceIncomeWithTax - serviceIncomeWithoutTax;
  const totalSupplierCost = supplierPayments.reduce((sum, p) => sum + (Number(p.actual_amount) || 0), 0);
  const totalReimbursement = reimbursements.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const serviceCommission = serviceIncomeWithoutTax * ((project?.service_commission_rate || serviceCommissionRate) / 100);
  const serviceProfit = serviceIncomeWithTax - serviceTax - totalSupplierCost - totalReimbursement - serviceCommission - otherCost;
  const serviceProfitMargin = serviceIncomeWithTax > 0 ? (serviceProfit / serviceIncomeWithTax) * 100 : 0;

  // 商品板块计算
  const productIncomeWithTax = productSales.reduce((sum, s) => sum + s.sale_price, 0);
  const productIncomeWithoutTax = productIncomeWithTax / (1 + productTaxRate / 100);
  const productTax = productIncomeWithoutTax * (productTaxRate / 100);
  // 提成 = 不含税价 × 提成比例（使用 project 中已保存的值或 state 值）
  const productCommission = productIncomeWithoutTax * ((project?.product_commission_rate || productCommissionRate) / 100);
  const productProfit = productIncomeWithTax - productTax - productCost - productCommission;
  const productProfitMargin = productIncomeWithTax > 0 ? (productProfit / productIncomeWithTax) * 100 : 0;

  // 格式化金额（保留 2 位小数）
  const formatMoney = (amount: number) => {
    return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleSaveServiceCommission = async () => {
    setSavingService(true);
    try {
      await supabase
        .from('projects')
        .update({ service_commission_rate: serviceCommissionRate })
        .eq('id', projectId);
      alert('服务提成比例已保存');
    } catch (error) {
      console.error('Error saving commission rate:', error);
      alert('保存失败');
    } finally {
      setSavingService(false);
    }
  };

  const handleSaveProductCommission = async () => {
    setSavingProduct(true);
    try {
      await supabase
        .from('projects')
        .update({ product_commission_rate: productCommissionRate })
        .eq('id', projectId);
      alert('商品提成比例已保存');
    } catch (error) {
      console.error('Error saving commission rate:', error);
      alert('保存失败');
    } finally {
      setSavingProduct(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-8 text-center text-red-500">未找到项目信息</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <button
          onClick={() => navigate('/finance/profit-analysis', { replace: true })}
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
          <p className="text-sm text-slate-500 mt-1">项目编码：{project.code} | 客户：{customerName}</p>
        </div>
      </div>

      {/* ==================== 服务板块 ==================== */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-3">
          <h2 className="text-lg font-bold text-white">服务板块</h2>
        </div>

        {/* 顶部卡片 */}
        <div className="grid grid-cols-7 gap-4 p-6 border-b border-slate-200 bg-slate-50">
          <div>
            <div className="text-sm text-slate-500 mb-1">项目收入（含税）</div>
            <div className="text-xl font-bold text-slate-900">¥{formatMoney(serviceIncomeWithTax)}</div>
          </div>
          <div>
            <div className="text-sm text-slate-500 mb-1">税点</div>
            <div className="flex items-center">
              <input
                type="number"
                value={serviceTaxRate}
                onChange={(e) => setServiceTaxRate(Number(e.target.value))}
                className="w-20 px-2 py-1 border border-slate-300 rounded text-lg font-bold text-slate-900"
              />
              <span className="ml-1 text-slate-500">%</span>
            </div>
          </div>
          <div>
            <div className="text-sm text-slate-500 mb-1">项目金额（不含税）</div>
            <div className="text-xl font-bold text-slate-900">¥{formatMoney(serviceIncomeWithoutTax)}</div>
          </div>
          <div>
            <div className="text-sm text-slate-500 mb-1">项目经理</div>
            <div className="text-lg font-medium text-slate-900">{bdManager || '-'}</div>
          </div>
          <div>
            <div className="text-sm text-slate-500 mb-1">设定提成比例</div>
            <div className="flex items-center space-x-2">
              <input
                type="number"
                value={serviceCommissionRate}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setServiceCommissionRate(val);
                  setDebouncedServiceRate(val);
                }}
                className="w-20 px-2 py-1 border border-slate-300 rounded text-sm"
                placeholder="0"
              />
              <span className="text-slate-500">%</span>
              <button
                onClick={handleSaveServiceCommission}
                disabled={savingService}
                className="p-1 text-indigo-600 hover:bg-indigo-50 rounded text-xs"
                title="手动保存"
              >
                {savingService ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <div className="text-sm text-slate-500 mb-1">提成金额</div>
            <div className="text-xl font-bold text-slate-900">¥{formatMoney(serviceCommission)}</div>
          </div>
          <div>
            <div className="text-sm text-slate-500 mb-1">其他成本</div>
            <div className="flex items-center space-x-2">
              <input
                type="number"
                value={otherCost}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setOtherCost(val);
                  setDebouncedOtherCost(val);
                }}
                className="w-24 px-2 py-1 border border-slate-300 rounded text-sm"
                placeholder="0"
              />
            </div>
          </div>
        </div>

        {/* 列表 */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-slate-500 border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 font-medium">项目金额（含税）</th>
                <th className="px-4 py-3 font-medium">项目金额（不含税）</th>
                <th className="px-4 py-3 font-medium cursor-pointer" onClick={() => setShowSupplierDetail(!showSupplierDetail)}>
                  <div className="flex items-center">
                    供应商实际成本
                    {showSupplierDetail ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
                  </div>
                </th>
                <th className="px-4 py-3 font-medium cursor-pointer" onClick={() => setShowReimbursementDetail(!showReimbursementDetail)}>
                  <div className="flex items-center">
                    报销费用
                    {showReimbursementDetail ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
                  </div>
                </th>
                <th className="px-4 py-3 font-medium">项目提成</th>
                <th className="px-4 py-3 font-medium">其他成本</th>
                <th className="px-4 py-3 font-medium">最终利润</th>
                <th className="px-4 py-3 font-medium">利润率</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="px-4 py-4 font-medium text-slate-900">¥{formatMoney(serviceIncomeWithTax)}</td>
                <td className="px-4 py-4 font-medium text-slate-900">¥{formatMoney(serviceIncomeWithoutTax)}</td>
                <td className="px-4 py-4 font-medium text-slate-900">¥{formatMoney(totalSupplierCost)}</td>
                <td className="px-4 py-4 font-medium text-slate-900">¥{formatMoney(totalReimbursement)}</td>
                <td className="px-4 py-4 font-medium text-slate-900">¥{formatMoney(serviceCommission)}</td>
                <td className="px-4 py-4 font-medium text-slate-900">¥{formatMoney(otherCost)}</td>
                <td className={`px-4 py-4 font-bold ${serviceProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  ¥{formatMoney(serviceProfit)}
                </td>
                <td className={`px-4 py-4 ${serviceProfitMargin >= 20 ? 'text-emerald-600' : serviceProfitMargin >= 10 ? 'text-amber-600' : 'text-red-600'}`}>
                  {serviceProfitMargin.toFixed(2)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 供应商成本详情（展开） */}
        {showSupplierDetail && (
          <div className="border-t border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-medium text-slate-700 mb-3">供应商成本明细（预估 vs 实际）</h3>
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-slate-500 border-b border-slate-200">
                  <th className="px-4 py-2 font-medium">供应商</th>
                  <th className="px-4 py-2 font-medium text-right">参考金额</th>
                  <th className="px-4 py-2 font-medium text-right">实际成本</th>
                  <th className="px-4 py-2 font-medium text-right">增减</th>
                </tr>
              </thead>
              <tbody>
                {supplierPayments.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400">暂无供应商成本</td>
                  </tr>
                ) : (
                  supplierPayments.map((p) => {
                    const diff = p.actual_amount - p.amount;
                    return (
                      <tr key={p.id} className="border-b border-slate-100">
                        <td className="px-4 py-3 font-medium text-slate-900">{p.supplier_name}</td>
                        <td className="px-4 py-3 text-right text-slate-600">¥{formatMoney(p.amount)}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-900">¥{formatMoney(p.actual_amount)}</td>
                        <td className={`px-4 py-3 text-right font-medium ${diff >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {diff >= 0 ? '+' : ''}{formatMoney(diff)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 报销费用详情（展开） */}
        {showReimbursementDetail && (
          <div className="border-t border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-medium text-slate-700 mb-3">报销费用明细</h3>
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-slate-500 border-b border-slate-200">
                  <th className="px-4 py-2 font-medium">类别</th>
                  <th className="px-4 py-2 font-medium">描述</th>
                  <th className="px-4 py-2 font-medium">申请人</th>
                  <th className="px-4 py-2 font-medium text-right">金额</th>
                  <th className="px-4 py-2 font-medium">状态</th>
                </tr>
              </thead>
              <tbody>
                {reimbursements.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">暂无报销费用</td>
                  </tr>
                ) : (
                  reimbursements.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-900">{r.category}</td>
                      <td className="px-4 py-3 text-slate-600">{r.description || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{r.user_name}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">¥{formatMoney(r.amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          r.status === '已打款' ? 'bg-emerald-100 text-emerald-700' :
                          r.status === '待打款' ? 'bg-blue-100 text-blue-700' :
                          r.status === '待财务审核' ? 'bg-purple-100 text-purple-700' :
                          r.status === '待 CEO 终审' ? 'bg-indigo-100 text-indigo-700' :
                          r.status === '待总监初审' || r.status === '待审核' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ==================== 商品板块 ==================== */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-3">
          <h2 className="text-lg font-bold text-white">商品板块</h2>
        </div>

        {/* 顶部卡片 */}
        <div className="grid grid-cols-6 gap-4 p-6 border-b border-slate-200 bg-slate-50">
          <div>
            <div className="text-sm text-slate-500 mb-1">商品收入（含税）</div>
            <div className="text-xl font-bold text-slate-900">¥{formatMoney(productIncomeWithTax)}</div>
          </div>
          <div>
            <div className="text-sm text-slate-500 mb-1">税点</div>
            <div className="flex items-center">
              <input
                type="number"
                value={productTaxRate}
                onChange={(e) => setProductTaxRate(Number(e.target.value))}
                className="w-20 px-2 py-1 border border-slate-300 rounded text-lg font-bold text-slate-900"
              />
              <span className="ml-1 text-slate-500">%</span>
            </div>
          </div>
          <div>
            <div className="text-sm text-slate-500 mb-1">商品收入（不含税）</div>
            <div className="text-xl font-bold text-slate-900">¥{formatMoney(productIncomeWithoutTax)}</div>
          </div>
          <div>
            <div className="text-sm text-slate-500 mb-1">班主任</div>
            <div className="text-lg font-medium text-slate-900">{classTeacher || '-'}</div>
          </div>
          <div>
            <div className="text-sm text-slate-500 mb-1">设定提成比例</div>
            <div className="flex items-center space-x-2">
              <input
                type="number"
                value={productCommissionRate}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setProductCommissionRate(val);
                  setDebouncedProductRate(val);
                }}
                className="w-20 px-2 py-1 border border-slate-300 rounded text-sm"
                placeholder="0"
              />
              <span className="text-slate-500">%</span>
              <button
                onClick={handleSaveProductCommission}
                disabled={savingProduct}
                className="p-1 text-indigo-600 hover:bg-indigo-50 rounded text-xs"
                title="手动保存"
              >
                {savingProduct ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <div className="text-sm text-slate-500 mb-1">提成金额</div>
            <div className="text-xl font-bold text-slate-900">¥{formatMoney(productCommission)}</div>
          </div>
        </div>

        {/* 列表 */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-slate-500 border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 font-medium">商品收入（含税）</th>
                <th className="px-4 py-3 font-medium">商品收入（不含税）</th>
                <th className="px-4 py-3 font-medium">商品成本</th>
                <th className="px-4 py-3 font-medium">商品提成</th>
                <th className="px-4 py-3 font-medium">最终利润</th>
                <th className="px-4 py-3 font-medium">利润率</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="px-4 py-4 font-medium text-slate-900">¥{formatMoney(productIncomeWithTax)}</td>
                <td className="px-4 py-4 font-medium text-slate-900">¥{formatMoney(productIncomeWithoutTax)}</td>
                <td className="px-4 py-4 font-medium text-slate-900">¥{formatMoney(productCost)}</td>
                <td className="px-4 py-4 font-medium text-slate-900">¥{formatMoney(productCommission)}</td>
                <td className={`px-4 py-4 font-bold ${productProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  ¥{formatMoney(productProfit)}
                </td>
                <td className={`px-4 py-4 ${productProfitMargin >= 20 ? 'text-emerald-600' : productProfitMargin >= 10 ? 'text-amber-600' : 'text-red-600'}`}>
                  {productProfitMargin.toFixed(2)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 售卖详情表 */}
        <div className="border-t border-slate-200 bg-slate-50">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-800">售卖详情</h3>
            <p className="text-xs text-slate-500 mt-1">详细列出每项商品的销售收入、成本、税金、提成及利润</p>
          </div>
          <div className="p-6">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-slate-500 border-b border-slate-300 bg-white">
                  <th className="px-4 py-3 font-semibold">商品名称</th>
                  <th className="px-4 py-3 font-semibold text-right">数量</th>
                  <th className="px-4 py-3 font-semibold text-right">售价（含税）</th>
                  <th className="px-4 py-3 font-semibold text-right">成本</th>
                  <th className="px-4 py-3 font-semibold text-right">税金</th>
                  <th className="px-4 py-3 font-semibold text-right">提成</th>
                  <th className="px-4 py-3 font-semibold text-right">利润</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {productSales.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400 italic">暂无商品售卖记录</td>
                  </tr>
                ) : (
                  productSales.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900">{s.product_name}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{s.quantity}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">¥{formatMoney(s.sale_price)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">¥{formatMoney(s.cost)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">¥{formatMoney(s.tax)}</td>
                      <td className="px-4 py-3 text-right text-indigo-600 font-medium">¥{formatMoney(s.commission)}</td>
                      <td className={`px-4 py-3 text-right font-bold ${s.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        ¥{formatMoney(s.profit)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
