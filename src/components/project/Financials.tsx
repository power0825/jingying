import React, { useState, useEffect } from 'react';
import { Upload, FileText, Loader2, CheckCircle, Plus, Trash2, AlertCircle, DollarSign } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Project } from '../../types/project';
import { useAppStore } from '../../store';
import { notifyFinanceUsers, createNotification } from '../../lib/notifications';
import { format } from 'date-fns';

interface FinancialsProps {
  project: Project;
}

interface ProjectCustomerPayment {
  id: string;
  project_id: string;
  customer_id: string | null;
  amount: number;
  invoice_url: string | null;
  payment_voucher_url: string | null;
  payment_status: '未收款' | '已收款';
  payment_date?: string;
}

interface ProjectSupplierPayment {
  id: string;
  project_id: string;
  supplier_id: string | null;
  supplier_name: string;
  amount: number; // 预算金额 (from itinerary)
  actual_amount: number; // 实际成本
  settlement_method: string; // 结算方式：月结/先款后票/先票后款
  invoice_url: string | null;
  payment_voucher_url: string | null; // From finance
  payment_status: '未付款' | '已付款';
}

interface ProjectReimbursement {
  id: string;
  project_id: string | null;
  user_id: string;
  category: string;
  description: string;
  amount: number;
  invoice_url: string | null;
  status: '草稿' | '待总监初审' | '待 CEO 终审' | '待财务审核' | '待打款' | '已打款';
  submission_date?: string;
}

export default function Financials({ project }: FinancialsProps) {
  const { user } = useAppStore();
  const [customerPayments, setCustomerPayments] = useState<ProjectCustomerPayment[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<ProjectSupplierPayment[]>([]);
  const [reimbursements, setReimbursements] = useState<ProjectReimbursement[]>([]);
  const [totalReceivable, setTotalReceivable] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 权限判断：只有 CEO、运营总监、财务、CEO 可以查看供应商付款管理
  const canViewSupplierPayment = user?.role === 'CEO' || user?.role === '运营总监' || user?.role === '财务';
  // 只有运营总监可以编辑实际成本
  const canEditCost = user?.role === '运营总监';

  useEffect(() => {
    fetchData();
  }, [project.id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Approved Contracts for Total Receivable
      const { data: contracts } = await supabase
        .from('contracts')
        .select('amount')
        .eq('project_id', project.id)
        .eq('status', '已通过');

      const contractTotal = contracts?.reduce((sum, c) => sum + (Number(c.amount) || 0), 0) || 0;
      setTotalReceivable(contractTotal || project.income_with_tax || 0);

      // 2. Fetch Customer Payments
      const { data: cpData } = await supabase
        .from('project_financial_customers')
        .select('*')
        .eq('project_id', project.id);

      setCustomerPayments(cpData || []);

      // 3. 从 approved_project_itineraries 读取行程数据
      let itineraries: any[] = [];
      let hotelArrangement: any = null;
      const { data: approvedItineraries, error: approvedError } = await supabase
        .from('approved_project_itineraries')
        .select('*')
        .eq('project_id', project.id);

      if (approvedError) {
        console.error('Error fetching approved itineraries:', approvedError);
      }

      if (approvedItineraries && approvedItineraries.length > 0) {
        // 检查是否有重复的记录（同一天有多条记录）
        const duplicateDayCheck = new Map<number, number>();
        approvedItineraries.forEach(item => {
          const dayIndex = item.day_index;
          duplicateDayCheck.set(dayIndex, (duplicateDayCheck.get(dayIndex) || 0) + 1);
        });
        const dayDuplicates = Array.from(duplicateDayCheck.entries()).filter(([_, count]) => count > 1);
        if (dayDuplicates.length > 0) {
          console.warn('⚠️ 发现重复的行程记录（同一天有多条）:', dayDuplicates);
        }

        // 转换为统一格式
        itineraries = approvedItineraries.map((item: any) => ({
          id: item.id,
          day_index: item.day_index,
          date: item.date || '',
          morning: item.morning || [],
          afternoon: item.afternoon || [],
          noon: item.noon || { supplierId: '', cost: 0, actualCost: 0 },
          evening: item.evening || { supplierId: '', cost: 0, actualCost: 0 },
          busId: item.bus_id || item.busId || '',
          busCost: item.bus_cost || item.busCost || 0,
          busActualCost: item.bus_actual_cost || item.busActualCost || 0,
        }));

        // 从第一天读取酒店安排
        const firstDay = approvedItineraries.find(d => d.day_index === 1 || d.day_index === 0);
        if (firstDay?.hotel_arrangement) {
          hotelArrangement = firstDay.hotel_arrangement;
        }
      } else {
        console.log('approved_project_itineraries 无数据，请先在详细行程页面点击"同步行程"');
        itineraries = [];
      }

      // 4. 计算供应商成本
      const itinerarySupplierCosts: Record<string, number> = {};
      const itinerarySupplierActualCosts: Record<string, number> = {};

      // 收集所有供应商 ID 用于查询 actual_cost
      const supplierIdsFromItinerary = new Set<string>();

      console.log('=== 开始计算行程供应商成本 ===');

      if (itineraries) {
        itineraries.forEach(day => {
          // 收集大巴供应商 ID（如果有）
          if (day.busId) {
            supplierIdsFromItinerary.add(day.busId);
            itinerarySupplierCosts[day.busId] = (itinerarySupplierCosts[day.busId] || 0) + (Number(day.busCost) || 0);
            let busActualCost = Number(day.busActualCost) || Number(day.busCost) || 0;
            itinerarySupplierActualCosts[day.busId] = (itinerarySupplierActualCosts[day.busId] || 0) + busActualCost;
          }

          // Check morning activities - 优先使用 morning_actual 中的 actualCost
          if (Array.isArray(day.morning)) {
            day.morning.forEach((act: any) => {
              // 如果同时有 supplierId 和 venueId 且相同，只计算一次（避免重复）
              const hasSameSupplierAndVenue = act.supplierId && act.venueId && act.supplierId === act.venueId;

              if (act.supplierId) {
                supplierIdsFromItinerary.add(act.supplierId);
                itinerarySupplierCosts[act.supplierId] = (itinerarySupplierCosts[act.supplierId] || 0) + (Number(act.cost) || 0);
                // 直接使用活动对象中的 actualCost 字段（从 approved_project_itineraries 读取）
                let actualCost = Number(act.actualCost) || Number(act.cost) || 0;
                itinerarySupplierActualCosts[act.supplierId] = (itinerarySupplierActualCosts[act.supplierId] || 0) + actualCost;
              }
              if (act.venueId && !hasSameSupplierAndVenue) {
                supplierIdsFromItinerary.add(act.venueId);
                itinerarySupplierCosts[act.venueId] = (itinerarySupplierCosts[act.venueId] || 0) + (Number(act.venueCost) || 0);
                let venueActualCost = Number(act.venueActualCost) || Number(act.venueCost) || 0;
                itinerarySupplierActualCosts[act.venueId] = (itinerarySupplierActualCosts[act.venueId] || 0) + venueActualCost;
              }
            });
          }
          // Check afternoon activities
          if (Array.isArray(day.afternoon)) {
            day.afternoon.forEach((act: any) => {
              // 如果同时有 supplierId 和 venueId 且相同，只计算一次（避免重复）
              const hasSameSupplierAndVenue = act.supplierId && act.venueId && act.supplierId === act.venueId;

              if (act.supplierId) {
                supplierIdsFromItinerary.add(act.supplierId);
                itinerarySupplierCosts[act.supplierId] = (itinerarySupplierCosts[act.supplierId] || 0) + (Number(act.cost) || 0);
                let actualCost = Number(act.actualCost) || Number(act.cost) || 0;
                itinerarySupplierActualCosts[act.supplierId] = (itinerarySupplierActualCosts[act.supplierId] || 0) + actualCost;
              }
              if (act.venueId && !hasSameSupplierAndVenue) {
                supplierIdsFromItinerary.add(act.venueId);
                itinerarySupplierCosts[act.venueId] = (itinerarySupplierCosts[act.venueId] || 0) + (Number(act.venueCost) || 0);
                let venueActualCost = Number(act.venueActualCost) || Number(act.venueCost) || 0;
                itinerarySupplierActualCosts[act.venueId] = (itinerarySupplierActualCosts[act.venueId] || 0) + venueActualCost;
              }
            });
          }
          // Check noon meal
          if (day.noon && day.noon.supplierId) {
            supplierIdsFromItinerary.add(day.noon.supplierId);
            itinerarySupplierCosts[day.noon.supplierId] = (itinerarySupplierCosts[day.noon.supplierId] || 0) + (Number(day.noon.cost) || 0);
            let actualCost = Number(day.noon.actualCost) || Number(day.noon.cost) || 0;
            itinerarySupplierActualCosts[day.noon.supplierId] = (itinerarySupplierActualCosts[day.noon.supplierId] || 0) + actualCost;
          }
          // Check evening meal
          if (day.evening && day.evening.supplierId) {
            supplierIdsFromItinerary.add(day.evening.supplierId);
            itinerarySupplierCosts[day.evening.supplierId] = (itinerarySupplierCosts[day.evening.supplierId] || 0) + (Number(day.evening.cost) || 0);
            let actualCost = Number(day.evening.actualCost) || Number(day.evening.cost) || 0;
            itinerarySupplierActualCosts[day.evening.supplierId] = (itinerarySupplierActualCosts[day.evening.supplierId] || 0) + actualCost;
          }
        });
      }

      console.log('=== 行程供应商成本计算完成 ===');
      console.log('itinerarySupplierCosts:', itinerarySupplierCosts);
      console.log('itinerarySupplierActualCosts:', itinerarySupplierActualCosts);

      // 餐饮按行程中保存的费用计算（预算和实际成本相同）

      // 3.5 酒店安排从 approved_project_itineraries 读取（保持单一数据源）
      let hotelCost = 0;
      let hotelActualCost = 0;
      let hotelId: string | null = null;
      if (hotelArrangement && hotelArrangement.hotelId) {
        hotelId = hotelArrangement.hotelId;
        hotelCost = Number(hotelArrangement.cost) || 0;
        // 优先使用保存的 actualCost，如果没有则使用 cost 作为默认值
        hotelActualCost = Number(hotelArrangement.actualCost) || Number(hotelArrangement.cost) || 0;
      }

      // 4. Fetch Saved Supplier Payments
      const { data: savedSpDataRaw } = await supabase
        .from('project_financial_suppliers')
        .select('*')
        .eq('project_id', project.id);

      const savedSpData = savedSpDataRaw || [];

      // 检查是否有重复的 supplier_id 并去重
      const savedSpMap = new Map<string, any>();
      savedSpData?.forEach(s => {
        const sid = s.supplier_id || '';
        if (!savedSpMap.has(sid)) {
          savedSpMap.set(sid, s);
        } else {
          // 如果已经有该供应商的记录，保留第一条，记录警告
          console.warn(`⚠️ 发现重复的供应商记录 (supplier_id=${sid})，保留第一条`);
        }
      });
      const savedSp = Array.from(savedSpMap.values());

      // Get all unique supplier IDs from both sources
      const allSupplierIds = Array.from(new Set([
        ...Object.keys(itinerarySupplierCosts),
        ...savedSp.map(s => s.supplier_id).filter(id => id !== null) as string[],
        ...(hotelId ? [hotelId] : [])
      ]));

      let supplierNames: Record<string, string> = {};
      let supplierSettlementMethods: Record<string, string> = {};
      // 查询供应商名称和结算方式
      if (allSupplierIds.length > 0) {
        const { data: sData, error: supplierError } = await supabase
          .from('suppliers')
          .select('id, name, settlement_method')
          .in('id', allSupplierIds);

        if (supplierError) {
          console.error('查询供应商失败:', supplierError);
        } else {
          sData?.forEach(s => {
            supplierNames[s.id] = s.name;
            supplierSettlementMethods[s.id] = s.settlement_method || '月结';
          });
        }
      }

      // Merge logic:
      // 0. Merge hotel costs into itinerarySupplierCosts BEFORE processing saved records
      // 如果酒店同时作为活动场地出现，itinerarySupplierCosts 中已有部分费用，需要合并酒店住宿费用
      // 注意：如果酒店场地费用和住宿费用是同一个供应商，只取较大值，避免重复计算
      if (hotelId && hotelCost > 0) {
        if (itinerarySupplierCosts[hotelId]) {
          // 酒店已经在 itinerarySupplierCosts 中（作为活动场地）
          // 取场地费用和住宿费用中的较大值，避免重复计算
          itinerarySupplierCosts[hotelId] = Math.max(itinerarySupplierCosts[hotelId], hotelCost);
          itinerarySupplierActualCosts[hotelId] = Math.max(
            itinerarySupplierActualCosts[hotelId] || 0,
            hotelActualCost
          );
        } else {
          // 酒店不在 itinerarySupplierCosts 中，单独添加
          itinerarySupplierCosts[hotelId] = hotelCost;
          itinerarySupplierActualCosts[hotelId] = hotelActualCost;
        }
      }

      // 1. Start with saved records - 如果已有保存记录，优先使用保存的值
      const finalSp: ProjectSupplierPayment[] = savedSp.map(s => ({
        id: s.id,
        project_id: s.project_id,
        supplier_id: s.supplier_id,
        supplier_name: supplierNames[s.supplier_id || ''] || '未知供应商',
        // 预算金额从行程计算，如果没有则使用保存的值
        amount: itinerarySupplierCosts[s.supplier_id || ''] || s.amount || 0,
        // 实际成本优先使用保存的值（用户手动修改的），如果没有保存则从行程计算
        actual_amount: s.actual_amount || itinerarySupplierActualCosts[s.supplier_id || ''] || itinerarySupplierCosts[s.supplier_id || ''] || 0,
        settlement_method: s.settlement_method || supplierSettlementMethods[s.supplier_id || ''] || '月结',
        invoice_url: s.invoice_url || null,
        payment_voucher_url: s.payment_voucher_url || null,
        payment_status: s.payment_status || '未付款',
      }));

      // 2. Add suppliers from itinerary that aren't in saved records
      Object.keys(itinerarySupplierCosts).forEach(sid => {
        if (!finalSp.find(f => f.supplier_id === sid)) {
          console.log('添加供应商付款记录:', {
            supplier_id: sid,
            supplier_name: supplierNames[sid] || '未知供应商',
            amount: itinerarySupplierCosts[sid],
            actual_amount: itinerarySupplierActualCosts[sid] || itinerarySupplierCosts[sid]
          });
          finalSp.push({
            id: crypto.randomUUID(),
            project_id: project.id,
            supplier_id: sid,
            supplier_name: supplierNames[sid] || '未知供应商',
            amount: itinerarySupplierCosts[sid],
            actual_amount: itinerarySupplierActualCosts[sid] || itinerarySupplierCosts[sid],
            settlement_method: supplierSettlementMethods[sid] || '月结',
            invoice_url: null,
            payment_voucher_url: null,
            payment_status: '未付款',
          });
        }
      });

      console.log('最终供应商付款列表:', finalSp.map(s => ({
        supplier_id: s.supplier_id,
        supplier_name: s.supplier_name,
        amount: s.amount,
        actual_amount: s.actual_amount
      })));

      // 4. 去重：确保同一个 supplier_id 只出现一次（合并金额）
      const uniqueSp: ProjectSupplierPayment[] = [];
      const supplierMap = new Map<string, number>(); // supplier_id -> index in uniqueSp

      finalSp.forEach(payment => {
        const sid = payment.supplier_id || '';
        const existingIndex = supplierMap.get(sid);

        if (existingIndex !== undefined) {
          // 如果 finalSp 中有重复的 supplier_id，合并金额
          uniqueSp[existingIndex].amount += payment.amount;
          uniqueSp[existingIndex].actual_amount += payment.actual_amount;
        } else {
          supplierMap.set(sid, uniqueSp.length);
          uniqueSp.push(payment);
        }
      });

      setSupplierPayments(uniqueSp);

      // 不再在 fetchData 时自动保存，避免重复保存
      // await autoSaveSupplierPayments(uniqueSp);

      // 5. Fetch Reimbursements
      const { data: rbData } = await supabase
        .from('project_reimbursements')
        .select('*')
        .eq('project_id', project.id);
      
      setReimbursements(rbData || []);

    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const addCustomerPayment = () => {
    const newPayment: ProjectCustomerPayment = {
      id: crypto.randomUUID(),
      project_id: project.id,
      customer_id: project.customer_id || null,
      amount: 0,
      invoice_url: null,
      payment_voucher_url: null,
      payment_status: '未收款'
    };
    setCustomerPayments([...customerPayments, newPayment]);
  };

  const removeCustomerPayment = (id: string) => {
    setCustomerPayments(customerPayments.filter(p => p.id !== id));
  };

  const updateCustomerPayment = (id: string, field: keyof ProjectCustomerPayment, value: any) => {
    setCustomerPayments(customerPayments.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const updateSupplierPayment = (id: string, field: keyof ProjectSupplierPayment, value: any) => {
    setSupplierPayments(supplierPayments.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const addReimbursement = () => {
    const newRb: ProjectReimbursement = {
      id: crypto.randomUUID(),
      project_id: project.id,
      user_id: user?.id || '',
      category: '差旅费',
      description: '',
      amount: 0,
      invoice_url: null,
      status: '草稿'
    };
    setReimbursements([...reimbursements, newRb]);
  };

  const submitReimbursement = async (id: string) => {
    try {
      // First check if the record exists in DB
      const { data: existingRecord } = await supabase
        .from('project_reimbursements')
        .select('*')
        .eq('id', id)
        .single();

      if (!existingRecord) {
        alert('请先保存报销记录后再提交审核');
        return;
      }

      const submissionDate = new Date().toISOString();

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

      // Update status in database
      const { error } = await supabase
        .from('project_reimbursements')
        .update({
          status: nextStatus,
          submission_date: submissionDate,
          submitter_role: user?.role || null
        })
        .eq('id', id);

      if (error) throw error;

      // Update local state
      updateReimbursement(id, 'status', nextStatus);
      updateReimbursement(id, 'submission_date', submissionDate);

      // Notify Finance Users
      await notifyFinanceUsers(
        '收到新的报销审批申请',
        `${user?.name} 提交了一笔报销申请（项目：${project.name}），请及时处理。`,
        'approval_request',
        '/finance'
      );

      alert('报销申请已提交审核！');
    } catch (err) {
      console.error('Error submitting reimbursement:', err);
      alert('提交失败，请重试');
    }
  };

  const removeReimbursement = (id: string) => {
    setReimbursements(reimbursements.filter(r => r.id !== id));
  };

  const updateReimbursement = (id: string, field: keyof ProjectReimbursement, value: any) => {
    setReimbursements(reimbursements.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  // 自动保存供应商付款数据到 project_financial_suppliers
  const autoSaveSupplierPayments = async (payments: ProjectSupplierPayment[]) => {
    try {
      // Helper to clean objects for Supabase
      const cleanData = (data: any[]) => {
        return data.map(item => {
          const cleaned: any = {};
          Object.entries(item).forEach(([key, value]) => {
            // Skip UI-only fields and metadata
            if (['supplier_name', 'created_at'].includes(key)) return;
            // Convert empty strings to null for optional fields
            if (value === '') {
              cleaned[key] = null;
            } else {
              cleaned[key] = value;
            }
          });
          // Ensure project_id is set
          cleaned.project_id = project.id;
          cleaned.id = item.id;
          return cleaned;
        });
      };

      // 1. 删除旧的记录
      const { error: delError } = await supabase
        .from('project_financial_suppliers')
        .delete()
        .eq('project_id', project.id);

      if (delError) throw delError;

      // 2. 插入新记录
      if (payments.length > 0) {
        const toSave = cleanData(payments);
        const { error: insError } = await supabase
          .from('project_financial_suppliers')
          .insert(toSave);

        if (insError) throw insError;
      }

      console.log('供应商付款数据已自动保存');
    } catch (err: any) {
      console.error('自动保存失败:', err);
    }
  };

  const saveSingleCustomerPayment = async (payment: ProjectCustomerPayment) => {
    setSaving(true);
    try {
      const cleaned: any = {};
      Object.entries(payment).forEach(([key, value]) => {
        if (['created_at'].includes(key)) return;
        if (value === '') {
          cleaned[key] = null;
        } else {
          cleaned[key] = value;
        }
      });
      cleaned.project_id = project.id;
      cleaned.id = payment.id;

      const { error } = await supabase
        .from('project_financial_customers')
        .upsert(cleaned);

      if (error) throw error;
      alert('收款条目保存成功！');
    } catch (err: any) {
      console.error('Error saving single customer payment:', err);
      alert(`保存失败: ${err.message || '未知错误'}`);
    } finally {
      setSaving(false);
    }
  };

  const saveSingleReimbursement = async (reimbursement: ProjectReimbursement) => {
    setSaving(true);
    try {
      const cleaned: any = {};
      Object.entries(reimbursement).forEach(([key, value]) => {
        if (['created_at'].includes(key)) return;
        // 保留 submission_date，只有当有有效值时才保存
        if (key === 'submission_date') {
          if (value !== undefined && value !== null && value !== '') {
            cleaned[key] = value;
          }
          return;
        }
        if (value === '') {
          cleaned[key] = null;
        } else {
          cleaned[key] = value;
        }
      });
      cleaned.project_id = project.id;
      cleaned.id = reimbursement.id;

      // Don't save '草稿' status - let DB use default value
      if (cleaned.status === '草稿') {
        delete cleaned.status;
        delete cleaned.submission_date;
      }

      const { error } = await supabase
        .from('project_reimbursements')
        .upsert(cleaned);

      if (error) throw error;
      alert('报销条目保存成功！');
      await fetchData();
    } catch (err: any) {
      console.error('Error saving single reimbursement:', err);
      alert(`保存失败: ${err.message || '未知错误'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (
    type: 'customer' | 'supplier' | 'reimbursement',
    id: string,
    field: string,
    file: File
  ) => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
      const filePath = `financials/${project.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('attachments')
        .getPublicUrl(filePath);

      if (type === 'customer') {
        updateCustomerPayment(id, field as keyof ProjectCustomerPayment, publicUrl);
      } else if (type === 'supplier') {
        updateSupplierPayment(id, field as keyof ProjectSupplierPayment, publicUrl);
      } else {
        updateReimbursement(id, field as keyof ProjectReimbursement, publicUrl);
      }
      
      alert('文件上传成功！');
    } catch (err) {
      console.error('Error uploading file:', err);
      alert('文件上传失败，请重试');
    }
  };

  const isUUID = (str: string) => {
    const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return regex.test(str);
  };

  const saveFinancials = async () => {
    setSaving(true);
    try {
      // Helper to clean objects for Supabase
      const cleanData = (data: any[]) => {
        return data.map(item => {
          const cleaned: any = {};
          Object.entries(item).forEach(([key, value]) => {
            // Skip UI-only fields and metadata
            if (['supplier_name', 'created_at'].includes(key)) return;
            // 保留 submission_date，只有当有有效值时才保存
            if (key === 'submission_date') {
              if (value !== undefined && value !== null && value !== '') {
                cleaned[key] = value;
              }
              return;
            }
            // Convert empty strings to null for optional fields
            if (value === '') {
              cleaned[key] = null;
            } else {
              cleaned[key] = value;
            }
          });
          // Ensure project_id is set
          cleaned.project_id = project.id;
          // Handle ID - always keep the ID as we now generate valid UUIDs on frontend
          cleaned.id = item.id;
          return cleaned;
        });
      };

      // 1. Save Customer Payments
      const { error: delCpError } = await supabase.from('project_financial_customers').delete().eq('project_id', project.id);
      if (delCpError) throw delCpError;

      if (customerPayments.length > 0) {
        const toSave = cleanData(customerPayments);
        const { error: insCpError } = await supabase.from('project_financial_customers').insert(toSave);
        if (insCpError) throw insCpError;
      }

      // 2. Save Supplier Payments
      const { error: delSpError } = await supabase.from('project_financial_suppliers').delete().eq('project_id', project.id);
      if (delSpError) throw delSpError;

      if (supplierPayments.length > 0) {
        const toSave = cleanData(supplierPayments);
        const { error: insSpError } = await supabase.from('project_financial_suppliers').insert(toSave);
        if (insSpError) throw insSpError;
      }

      // 3. Save Reimbursements
      const { error: delRbError } = await supabase.from('project_reimbursements').delete().eq('project_id', project.id);
      if (delRbError) throw delRbError;

      if (reimbursements.length > 0) {
        const toSave = cleanData(reimbursements);
        const { error: insRbError } = await supabase.from('project_reimbursements').insert(toSave);
        if (insRbError) throw insRbError;
      }

      alert('财务信息保存成功！');
      await fetchData(); // Ensure we reload the latest data with real UUIDs
    } catch (err: any) {
      console.error('Error saving financials:', err);
      alert(`保存失败: ${err.message || '未知错误'}`);
    } finally {
      setSaving(false);
    }
  };

  const saveSingleSupplierPayment = async (payment: ProjectSupplierPayment) => {
    setSaving(true);
    try {
      const cleaned: any = {};
      Object.entries(payment).forEach(([key, value]) => {
        if (['supplier_name', 'created_at'].includes(key)) return;
        if (value === '') {
          cleaned[key] = null;
        } else {
          cleaned[key] = value;
        }
      });
      cleaned.project_id = project.id;
      cleaned.id = payment.id;
      
      // Save supplier name to notes as fallback for transport items
      if (!payment.supplier_id) {
        cleaned.notes = payment.supplier_name;
      }

      const { error } = await supabase
        .from('project_financial_suppliers')
        .upsert(cleaned);

      if (error) throw error;
      alert('保存成功！');

      // 刷新数据
      await fetchData();
    } catch (err: any) {
      console.error('Error saving single supplier payment:', err);
      alert(`保存失败: ${err.message || '未知错误'}`);
    } finally {
      setSaving(false);
    }
  };


  const totalReceived = customerPayments
    .filter(p => p.payment_status === '已收款')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  
  const remainingReceivable = totalReceivable - totalReceived;

  const totalSupplierPayable = supplierPayments.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const totalSupplierActual = supplierPayments.reduce((sum, s) => sum + (Number(s.actual_amount) || 0), 0);
  const totalSupplierPaid = supplierPayments
    .filter(s => s.payment_status === '已付款')
    .reduce((sum, s) => sum + (Number(s.actual_amount) || 0), 0);

  if (loading) {
    return <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-600" /></div>;
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex justify-between items-center bg-white p-4 rounded-lg border border-slate-200 shadow-sm sticky top-0 z-10">
        <div>
          <h3 className="text-lg font-medium text-slate-900">项目财务管理</h3>
          <p className="text-sm text-slate-500">管理项目的收款、付款及报销</p>
        </div>
        <button
          onClick={saveFinancials}
          disabled={saving}
          className="flex items-center px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 shadow-sm transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
          保存所有更改
        </button>
      </div>

      {/* 1. Customer Payments Section */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <h4 className="font-medium text-slate-900">客户收款管理</h4>
            <div className="flex items-center space-x-4 text-sm">
              <span className="text-slate-500">总应收: <span className="text-slate-900 font-semibold">¥{totalReceivable.toLocaleString()}</span></span>
              <span className="text-slate-500">已收: <span className="text-green-600 font-semibold">¥{totalReceived.toLocaleString()}</span></span>
              <span className="text-slate-500">待收: <span className="text-orange-600 font-semibold">¥{remainingReceivable.toLocaleString()}</span></span>
            </div>
          </div>
          <button
            onClick={addCustomerPayment}
            className="flex items-center px-3 py-1.5 text-sm bg-white border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition-colors"
          >
            <Plus className="w-4 h-4 mr-1" /> 添加收款条目
          </button>
        </div>
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-slate-500 border-b border-slate-200">
                  <th className="px-4 py-3 font-medium">收款金额</th>
                  <th className="px-4 py-3 font-medium">发票</th>
                  <th className="px-4 py-3 font-medium">客户付款凭证</th>
                  <th className="px-4 py-3 font-medium">收款状态</th>
                  <th className="px-4 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customerPayments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400 italic">暂无收款记录，点击右上角添加</td>
                  </tr>
                ) : (
                  customerPayments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="relative w-32">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">¥</span>
                          <input
                            type="number"
                            value={p.amount || ''}
                            onChange={(e) => updateCustomerPayment(p.id, 'amount', parseFloat(e.target.value) || 0)}
                            className="w-full pl-7 pr-3 py-1.5 border border-slate-300 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {p.invoice_url ? (
                          <a href={p.invoice_url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline flex items-center">
                            <FileText className="w-4 h-4 mr-1" /> 查看发票
                          </a>
                        ) : (
                          <span className="text-slate-400 flex items-center"><AlertCircle className="w-4 h-4 mr-1" /> 待财务上传</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-2">
                          {p.payment_voucher_url ? (
                            <a href={p.payment_voucher_url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline flex items-center">
                              <FileText className="w-4 h-4 mr-1" /> 查看凭证
                            </a>
                          ) : (
                            <span className="text-slate-400">未上传</span>
                          )}
                          <label className="cursor-pointer p-1 text-slate-500 hover:text-indigo-600 transition-colors">
                            <Upload className="w-4 h-4" />
                            <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileUpload('customer', p.id, 'payment_voucher_url', e.target.files[0])} />
                          </label>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={p.payment_status}
                          onChange={(e) => updateCustomerPayment(p.id, 'payment_status', e.target.value)}
                          className={`px-2 py-1 rounded-md border border-slate-300 focus:ring-1 focus:ring-indigo-500 outline-none ${
                            p.payment_status === '已收款' ? 'text-green-600 font-medium' : 'text-orange-600'
                          }`}
                        >
                          <option value="未收款">未收款</option>
                          <option value="已收款">已收款</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => saveSingleCustomerPayment(p)}
                            disabled={saving}
                            className="p-1 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                            title="保存此行"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button onClick={() => removeCustomerPayment(p.id)} className="p-1 text-slate-400 hover:text-red-600 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
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

      {/* 2. Supplier Payments Section */}
      {canViewSupplierPayment && (
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
          <div>
            <h4 className="font-medium text-slate-900">供应商付款管理</h4>
            <div className="flex items-center space-x-4 text-xs text-slate-500 mt-1">
              <span>总预算: <span className="text-slate-900 font-semibold">¥{totalSupplierPayable.toLocaleString()}</span></span>
              <span>实际成本: <span className="text-slate-900 font-semibold">¥{totalSupplierActual.toLocaleString()}</span></span>
              <span>已付: <span className="text-green-600 font-semibold">¥{totalSupplierPaid.toLocaleString()}</span></span>
              <span>待付: <span className="text-orange-600 font-semibold">¥{(totalSupplierActual - totalSupplierPaid).toLocaleString()}</span></span>
            </div>
          </div>
          <p className="text-xs text-slate-500">基于行程自动生成的供应商列表</p>
        </div>
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-slate-500 border-b border-slate-200">
                  <th className="px-4 py-3 font-medium">供应商</th>
                  <th className="px-4 py-3 font-medium">预算金额</th>
                  <th className="px-4 py-3 font-medium">实际成本</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {supplierPayments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400 italic">行程中未配置供应商信息</td>
                  </tr>
                ) : (
                  supplierPayments.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900">{s.supplier_name}</td>
                      <td className="px-4 py-3 text-slate-600">¥{s.amount.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <div className="relative w-28">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">¥</span>
                          <input
                            type="number"
                            value={s.actual_amount || ''}
                            onChange={(e) => updateSupplierPayment(s.id, 'actual_amount', parseFloat(e.target.value) || 0)}
                            disabled={!canEditCost}
                            className="w-full pl-5 pr-2 py-1 border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          s.payment_status === '已付款' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {s.payment_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {s.payment_status === '未付款' && canEditCost && (
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => saveSingleSupplierPayment(s)}
                              disabled={saving}
                              className="px-2 py-1 bg-white text-indigo-600 rounded border border-indigo-200 hover:bg-indigo-50 transition-colors text-xs font-medium flex items-center"
                            >
                              {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                              保存
                            </button>
                          </div>
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
      )}

      {/* 3. Reimbursements Section */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
          <div>
            <h4 className="font-medium text-slate-900">报销管理</h4>
            <p className="text-xs text-slate-500 mt-1">注：只提交跟此项目相关，且非供应商的报销凭证</p>
          </div>
          <button
            onClick={addReimbursement}
            className="flex items-center px-3 py-1.5 text-sm bg-white border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition-colors"
          >
            <Plus className="w-4 h-4 mr-1" /> 添加报销
          </button>
        </div>
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-slate-500 border-b border-slate-200">
                  <th className="px-4 py-3 font-medium">报销类别</th>
                  <th className="px-4 py-3 font-medium">报销描述</th>
                  <th className="px-4 py-3 font-medium">金额</th>
                  <th className="px-4 py-3 font-medium">提交日期</th>
                  <th className="px-4 py-3 font-medium">发票上传</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reimbursements.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400 italic">暂无报销记录</td>
                  </tr>
                ) : (
                  reimbursements.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <select
                          value={r.category}
                          onChange={(e) => updateReimbursement(r.id, 'category', e.target.value)}
                          className="px-2 py-1 border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                        >
                          <option value="差旅费">差旅费</option>
                          <option value="办公费">办公费</option>
                          <option value="招待费">招待费</option>
                          <option value="其他">其他</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={r.description || ''}
                          onChange={(e) => updateReimbursement(r.id, 'description', e.target.value)}
                          placeholder="描述报销用途"
                          className="w-full px-2 py-1 border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="relative w-28">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">¥</span>
                          <input
                            type="number"
                            value={r.amount || ''}
                            onChange={(e) => updateReimbursement(r.id, 'amount', parseFloat(e.target.value) || 0)}
                            className="w-full pl-5 pr-2 py-1 border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {r.submission_date ? format(new Date(r.submission_date), 'yyyy-MM-dd') : '-'}
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
                          <label className="cursor-pointer p-1 text-slate-500 hover:text-indigo-600 transition-colors">
                            <Upload className="w-4 h-4" />
                            <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileUpload('reimbursement', r.id, 'invoice_url', e.target.files[0])} />
                          </label>
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
                                onClick={() => submitReimbursement(r.id)}
                                className="px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors text-xs font-medium"
                              >
                                提交审核
                              </button>
                            </>
                          )}
                          <button onClick={() => removeReimbursement(r.id)} className="text-slate-400 hover:text-red-600 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
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
    </div>
  );
}
