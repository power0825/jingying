import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { X, Layout, Map } from 'lucide-react';
import { Project, ProjectStatus } from '../types/project';
import { User } from '../types/user';
import { Supplier } from '../types/supplier';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';
import { createNotification } from '../lib/notifications';
import ItineraryEditor from './project/ItineraryEditor';

const projectSchema = z.object({
  code: z.string().min(1, '请输入项目编号'),
  name: z.string().min(1, '请输入项目名称'),
  participants: z.number().min(1, '请输入项目人数'),
  difficulties: z.string().optional(),
  income_with_tax: z.number().min(0, '请输入项目含税收入'),
  tax_rate: z.number().min(0, '请输入发票税点'),
  execution_days: z.number().min(1, '请输入执行周期'),
  customer_id: z.string().min(1, '请选择客户'),
  bd_manager_id: z.string().min(1, '请选择项目经理'),
  reference_price_total: z.number().min(0, '请输入总参考价格'),
  quotation_id: z.string().optional().nullable(),
  client_name: z.string().optional(),
});

type ProjectFormData = z.infer<typeof projectSchema>;

interface ProjectFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: Project | null;
  quotationData?: any | null;
  users: User[];
}

export default function ProjectForm({ isOpen, onClose, onSuccess, initialData, quotationData, users }: ProjectFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema) as any,
    defaultValues: {
      tax_rate: 0.03, // Default 3%
    },
  });

  const { user } = useAppStore();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [activeTab, setActiveTab] = useState<'basic' | 'itinerary'>('basic');
  const [itinerary, setItinerary] = useState<any[]>([]);
  const [hotelArrangement, setHotelArrangement] = useState<any>({ hotelId: '', nights: 0, peoplePerRoom: 2, cost: 0, actualCost: 0 });
  const [firstDate, setFirstDate] = useState<string>('');
  const [itineraryTotalCost, setItineraryTotalCost] = useState<number>(0);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      try {
        const subordinates = users.filter(u => u.manager_id === user.id).map(u => u.id);
        const allowedUserIds = [user.id, ...subordinates];

        const [quotationsRes, customersRes, suppliersRes] = await Promise.all([
          supabase
            .from('quotations')
            .select('*')
            .in('created_by', allowedUserIds)
            .order('created_at', { ascending: false }),
          supabase
            .from('customers')
            .select('*')
            .order('created_at', { ascending: false }),
          supabase
            .from('suppliers')
            .select('*')
            .order('name', { ascending: true })
        ]);

        if (quotationsRes.error) throw quotationsRes.error;
        if (customersRes.error && customersRes.error.code !== '42P01') throw customersRes.error;
        if (suppliersRes.error) throw suppliersRes.error;

        setQuotations(quotationsRes.data || []);
        setCustomers(customersRes.data || []);
        setSuppliers(suppliersRes.data || []);
      } catch (err) {
        console.error('Error fetching data:', err);
      }
    };

    if (isOpen) {
      fetchData();
    }
  }, [isOpen, user, users]);

  const incomeWithTax = watch('income_with_tax') || 0;
  const taxRate = watch('tax_rate') || 0;
  const estimatedCost = watch('reference_price_total') || 0;
  const participants = watch('participants') || 0;
  const incomeWithoutTax = incomeWithTax / (1 + taxRate);
  const taxAmount = incomeWithoutTax * taxRate;
  const profit = incomeWithoutTax - estimatedCost;

  // 计算行程总成本（参考报价单的计算逻辑）
  const calculateItineraryTotalCost = (itin: any[], hotel: any) => {
    let totalCost = 0;

    // Hotel cost
    totalCost += hotel?.cost || 0;

    // Schedule costs
    itin.forEach((day: any) => {
      // Morning activities
      day.morning?.forEach((act: any) => {
        totalCost += act.cost || 0;
        if (act.venueCost) totalCost += act.venueCost;
      });
      // Afternoon activities
      day.afternoon?.forEach((act: any) => {
        totalCost += act.cost || 0;
        if (act.venueCost) totalCost += act.venueCost;
      });
      // Noon meal
      totalCost += day.noon?.cost || 0;
      // Evening meal
      totalCost += day.evening?.cost || 0;
      // Bus
      totalCost += day.busCost || 0;
    });

    return totalCost;
  };

  // 当行程总成本变化时，更新 reference_price_total
  useEffect(() => {
    if (itineraryTotalCost > 0) {
      setValue('reference_price_total', itineraryTotalCost);
    }
  }, [itineraryTotalCost, setValue]);

  useEffect(() => {
    if (hotelArrangement.hotelId) {
      const hotel = suppliers.find(s => s.id === hotelArrangement.hotelId);
      if (hotel) {
        const unitPrice = hotel.reference_quote?.unit || hotel.price || 0;
        const roomsNeeded = Math.ceil(participants / hotelArrangement.peoplePerRoom);
        const totalHotelCost = unitPrice * roomsNeeded * hotelArrangement.nights;
        setHotelArrangement(prev => ({ ...prev, cost: totalHotelCost }));
      }
    }
  }, [participants]);

  useEffect(() => {
    setSubmitError(null);
    setActiveTab('basic');
    if (isOpen) {
      if (initialData) {
        reset({
          code: initialData.code,
          name: initialData.name,
          participants: initialData.participants,
          difficulties: initialData.difficulties || '',
          income_with_tax: initialData.income_with_tax,
          tax_rate: initialData.tax_rate,
          execution_days: initialData.execution_days,
          customer_id: initialData.customer_id,
          bd_manager_id: initialData.bd_manager_id,
          reference_price_total: initialData.reference_price_total,
          quotation_id: initialData.quotation_id,
          client_name: initialData.client_name || '',
        });
        // 读取 itinerary 数据（兼容新旧结构）
        const itinData = initialData.itinerary;
        if (itinData?.schedule) {
          // 新结构：{ schedule, hotelArrangement }
          setItinerary(itinData.schedule.map((day: any, idx: number) => ({
            day: day.day ?? (idx + 1),
            date: day.date || '',
            morning: day.morning || [],
            noon: day.noon || { supplierId: '', cost: 0, actualCost: 0 },
            afternoon: day.afternoon || [],
            evening: day.evening || { supplierId: '', cost: 0, actualCost: 0 },
            busId: day.busId || '',
            busDuration: day.busDuration || 'full',
            busHours: day.busHours || 0,
            busCost: day.busCost || 0,
            busActualCost: day.busActualCost || 0,
          })));
          setHotelArrangement(itinData.hotelArrangement || { hotelId: '', nights: 0, peoplePerRoom: 2, cost: 0, actualCost: 0 });
          // 计算总成本
          const totalCost = calculateItineraryTotalCost(itinData.schedule, itinData.hotelArrangement);
          setItineraryTotalCost(totalCost);
          // 设置第一天日期
          const firstDay = itinData.schedule.find((d: any) => d.date);
          if (firstDay) setFirstDate(firstDay.date);
        } else if (Array.isArray(itinData)) {
          // 旧结构：直接是数组，转换为新结构
          setItinerary(itinData.map((day: any, idx: number) => ({
            day: idx + 1,
            date: day.date || '',
            morning: day.morning || [],
            noon: day.noon || { supplierId: '', cost: 0, actualCost: 0 },
            afternoon: day.afternoon || [],
            evening: day.evening || { supplierId: '', cost: 0, actualCost: 0 },
            busId: day.busId || '',
            busDuration: day.busDuration || 'full',
            busHours: day.busHours || 0,
            busCost: day.busCost || 0,
            busActualCost: day.busActualCost || 0,
          })));
          setHotelArrangement(initialData.hotel_arrangement || { hotelId: '', nights: 0, peoplePerRoom: 2, cost: 0, actualCost: 0 });
          setFirstDate('');
          setItineraryTotalCost(0);
        } else {
          setItinerary([]);
          setHotelArrangement({ hotelId: '', nights: 0, peoplePerRoom: 2, cost: 0, actualCost: 0 });
          setFirstDate('');
          setItineraryTotalCost(0);
        }
      } else if (quotationData) {
        // 预估成本 = quotations.reference_price_total 字段（兼容旧字段 cost）
        const estimatedCost = Number(quotationData.reference_price_total ?? quotationData.cost) || 0;
        // BD 人员默认选择当前登录用户
        const bdManagerId = user?.id || '';
        reset({
          code: `P${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
          name: quotationData.name || '',
          participants: Number(quotationData.participants) || 0,
          difficulties: '',
          income_with_tax: Number(quotationData.quoted_total_price) || 0,
          tax_rate: 0.03,
          execution_days: Number(quotationData.days) || 0,
          customer_id: quotationData.client_id || null,
          bd_manager_id: bdManagerId,
          reference_price_total: estimatedCost,
          quotation_id: quotationData.id,
          client_name: quotationData.client_name || '',
        });
        // Import itinerary from quotation details (保持与报价单相同的结构)
        if (quotationData.details?.schedule) {
          const importedItinerary = quotationData.details.schedule.map((day: any, idx: number) => ({
            day: idx + 1,
            date: '',
            morning: day.morning?.map((act: any) => ({
              ...act,
              cost: act.cost || 0,
              actualCost: act.actualCost || act.cost || 0,
            })) || [],
            afternoon: day.afternoon?.map((act: any) => ({
              ...act,
              cost: act.cost || 0,
              actualCost: act.actualCost || act.cost || 0,
            })) || [],
            noon: day.noon || { supplierId: '', cost: 0, actualCost: 0 },
            evening: day.evening || { supplierId: '', cost: 0, actualCost: 0 },
            busId: day.busId || '',
            busDuration: day.busDuration || 'full',
            busHours: day.busHours || 0,
            busCost: day.busCost || 0,
            busActualCost: day.busActualCost || 0,
          }));
          setItinerary(importedItinerary);
          setHotelArrangement(quotationData.details?.hotelArrangement || { hotelId: '', nights: 0, peoplePerRoom: 2, cost: 0, actualCost: 0 });
          setFirstDate('');
          // 计算总成本
          const totalCost = calculateItineraryTotalCost(importedItinerary, quotationData.details?.hotelArrangement || { hotelId: '', nights: 0, peoplePerRoom: 2, cost: 0, actualCost: 0 });
          setItineraryTotalCost(totalCost);
        } else {
          setItinerary([]);
          setHotelArrangement({ hotelId: '', nights: 0, peoplePerRoom: 2, cost: 0, actualCost: 0 });
          setFirstDate('');
          setItineraryTotalCost(0);
        }
      } else {
        reset({
          code: `P${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
          name: '',
          participants: 0,
          difficulties: '',
          income_with_tax: 0,
          tax_rate: 0.03,
          execution_days: 0,
          customer_id: null,
          bd_manager_id: '',
          reference_price_total: 0,
          quotation_id: null,
          client_name: '',
        });
        setItinerary([]);
        setHotelArrangement({ hotelId: '', nights: 0, peoplePerRoom: 2, cost: 0, actualCost: 0 });
        setFirstDate('');
        setItineraryTotalCost(0);
      }
    }
  }, [isOpen, initialData, quotationData, reset]);

  const onSubmit = async (data: ProjectFormData, status: ProjectStatus) => {
    setSubmitError(null);

    // 验证开始日期
    if (!firstDate || firstDate.trim() === '') {
      setSubmitError('请选择开始日期');
      setActiveTab('itinerary'); // 切换到行程标签页
      return;
    }

    try {
      // 构建与报价单一致的 itinerary 数据结构
      const itineraryData = {
        schedule: itinerary.map((day, idx) => ({
          day: day.day ?? (idx + 1),
          date: day.date || '',
          morning: day.morning || [],
          noon: day.noon || { supplierId: '', cost: 0, actualCost: 0 },
          afternoon: day.afternoon || [],
          evening: day.evening || { supplierId: '', cost: 0, actualCost: 0 },
          busId: day.busId || '',
          busDuration: day.busDuration || 'full',
          busHours: day.busHours || 0,
          busCost: day.busCost || 0,
          busActualCost: day.busActualCost || 0,
        })),
        hotelArrangement: hotelArrangement,
      };

      const projectData = {
        ...data,
        tax_amount: taxAmount,
        income_without_tax: incomeWithoutTax,
        status,
        initial_approval_status: status === '待初审' || status === '待终审' ? '待审核' : null,
        final_approval_status: status === '待终审' ? '待审核' : null,
        itinerary: itineraryData,
        hotel_arrangement: hotelArrangement,
        // 确保 quotation_id 为空字符串时转换为 null
        quotation_id: data.quotation_id === '' ? null : data.quotation_id,
        // 根据选择的客户设置客户名称
        client_name: data.customer_id ? (customers.find(c => c.id === data.customer_id)?.name || data.client_name) : data.client_name,
      };

      let projectId = initialData?.id;

      if (initialData?.id) {
        // Update existing project
        const { error } = await supabase
          .from('projects')
          .update(projectData)
          .eq('id', initialData.id);
        if (error) throw error;
      } else {
        // Create new project
        const { data: newProject, error } = await supabase
          .from('projects')
          .insert([projectData])
          .select('id')
          .single();
        if (error) throw error;
        projectId = newProject?.id;
      }

      // Save itinerary to project_itineraries_v2 table
      if (projectId && itinerary && itinerary.length > 0) {
        // First delete existing itinerary records
        await supabase.from('project_itineraries_v2').delete().eq('project_id', projectId);

        // Insert new itinerary records
        const itineraryRecords = itinerary.map((day, idx) => ({
          project_id: projectId,
          day_index: day.day ?? (idx + 1),
          date: day.date || '',
          morning: day.morning || [],
          noon: day.noon || { supplierId: '', cost: 0, actualCost: 0 },
          afternoon: day.afternoon || [],
          evening: day.evening || { supplierId: '', cost: 0, actualCost: 0 },
          busId: day.busId || '',
          busDuration: day.busDuration || 'full',
          busHours: day.busHours || 0,
          busCost: day.busCost || 0,
          busActualCost: day.busActualCost || 0,
        }));

        const { error: itinError } = await supabase.from('project_itineraries_v2').insert(itineraryRecords);
        if (itinError) {
          console.error('Error saving itinerary to project_itineraries_v2:', itinError);
          // Don't fail the entire operation, just log the error
        }
      }

      // 发送通知给审批人
      if (status === '待初审' || status === '待终审') {
        const bdUser = users.find(u => u.id === data.bd_manager_id);
        if (bdUser) {
          if (status === '待初审' && bdUser.manager_id) {
            // 通知总监初审
            await createNotification(
              bdUser.manager_id,
              '项目立项待初审',
              `${user?.name} 提交了项目 ${data.name} 的立项申请，等待您的初审。`,
              'approval_request',
              '/projects'
            );
          }
          if (status === '待终审' || (status === '待初审' && !bdUser.manager_id)) {
            // 通知 CEO 终审
            const ceoUsers = users.filter(u => u.role === 'CEO');
            for (const ceo of ceoUsers) {
              await createNotification(
                ceo.id,
                '项目立项待终审',
                `${user?.name} 提交了项目 ${data.name} 的立项申请，等待您的终审。`,
                'approval_request',
                '/projects'
              );
            }
          }
        }
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error saving project:', error);
      setSubmitError(error.message || '保存失败，请重试');
    }
  };

  const handleImportQuotation = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const qId = e.target.value || null; // 空字符串转换为 null
    setValue('quotation_id', qId);
    const q = quotations.find(x => x.id === qId);
    if (q) {
      setValue('name', q.name || '');
      setValue('participants', q.participants || 0);
      setValue('execution_days', q.days || 0);
      setValue('income_with_tax', q.quoted_total_price || 0);
      // 预估成本 = quotations.reference_price_total（兼容旧字段 cost）
      setValue('reference_price_total', Number(q.reference_price_total ?? q.cost) || 0);
      // BD 人员默认保持当前登录用户，不覆盖
      setValue('customer_id', q.client_id || null);
      setValue('client_name', q.client_name || '');

      // Import itinerary
      if (q.details?.schedule) {
        const importedItinerary = q.details.schedule.map((day: any, idx: number) => ({
          day: idx + 1,
          date: '',
          morning: day.morning?.map((act: any) => ({
            ...act,
            cost: act.cost || 0,
            actualCost: act.actualCost || act.cost || 0,
          })) || [],
          noon: day.noon || { supplierId: '', cost: 0, actualCost: 0 },
          afternoon: day.afternoon?.map((act: any) => ({
            ...act,
            cost: act.cost || 0,
            actualCost: act.actualCost || act.cost || 0,
          })) || [],
          evening: day.evening || { supplierId: '', cost: 0, actualCost: 0 },
          busId: day.busId || '',
          busDuration: day.busDuration || 'full',
          busHours: day.busHours || 0,
          busCost: day.busCost || 0,
          busActualCost: day.busActualCost || 0,
        }));
        setItinerary(importedItinerary);
        setHotelArrangement(q.details?.hotelArrangement || { hotelId: '', nights: 0, peoplePerRoom: 2, cost: 0, actualCost: 0 });
      }
    }
  };

  if (!isOpen) return null;

  const bdUsers = users.filter(u => u.role === '客户经理' || u.role === '客户总监' || u.role === '运营总监');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 sm:p-0 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col my-8 max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold text-slate-900">
            {initialData ? '编辑项目' : '项目立项'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {submitError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {submitError}
            </div>
          )}

          <div className="flex border-b border-slate-200 mb-6">
            <button
              onClick={() => setActiveTab('basic')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'basic'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <div className="flex items-center">
                <Layout className="w-4 h-4 mr-2" />
                基础信息
              </div>
            </button>
            <button
              onClick={() => setActiveTab('itinerary')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'itinerary'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <div className="flex items-center">
                <Map className="w-4 h-4 mr-2" />
                行程安排
              </div>
            </button>
          </div>

          <form className="space-y-6">
            {activeTab === 'basic' ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">项目编号 *</label>
                    <input {...register('code')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-slate-50" readOnly />
                    {errors.code && <p className="text-red-500 text-xs mt-1">{errors.code.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">项目名称 *</label>
                    <input {...register('name')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                    {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">项目人数 *</label>
                    <input type="number" {...register('participants', { valueAsNumber: true })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                    {errors.participants && <p className="text-red-500 text-xs mt-1">{errors.participants.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">客户名称 *</label>
                    <select
                      {...register('customer_id')}
                      onChange={(e) => {
                        const selectedCustomer = customers.find(c => c.id === e.target.value);
                        if (selectedCustomer) {
                          setValue('client_name', selectedCustomer.name);
                        }
                      }}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="">选择客户</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    {errors.customer_id && <p className="text-red-500 text-xs mt-1">{errors.customer_id.message}</p>}
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">执行难点</label>
                    <textarea {...register('difficulties')} rows={2} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-4">
                  <h3 className="text-sm font-medium text-slate-900 mb-4">财务与成本</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">项目含税收入 *</label>
                      <input
                        type="text"
                        {...register('income_with_tax', {
                          valueAsNumber: true,
                          setValueAs: (v) => {
                            const num = typeof v === 'string' ? Number(v.replace(/,/g, '')) : v;
                            return isNaN(num) ? 0 : num;
                          }
                        })}
                        onChange={(e) => {
                          const val = e.target.value.replace(/,/g, '');
                          setValue('income_with_tax', val === '' ? 0 : Number(val));
                        }}
                        onBlur={(e) => {
                          const val = Number(e.target.value.replace(/,/g, '')) || 0;
                          e.target.value = val.toLocaleString('en-US');
                          setValue('income_with_tax', val);
                        }}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-right"
                        placeholder="0"
                      />
                      {errors.income_with_tax && <p className="text-red-500 text-xs mt-1">{errors.income_with_tax.message}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">发票税点 *</label>
                      <input
                        type="text"
                        {...register('tax_rate', {
                          valueAsNumber: true,
                          setValueAs: (v) => {
                            const num = typeof v === 'string' ? Number(v.replace(/,/g, '')) : v;
                            return isNaN(num) ? 0 : num;
                          }
                        })}
                        onChange={(e) => {
                          const val = e.target.value.replace(/,/g, '');
                          setValue('tax_rate', val === '' ? 0 : Number(val));
                        }}
                        onBlur={(e) => {
                          const val = Number(e.target.value.replace(/,/g, '')) || 0;
                          e.target.value = val.toLocaleString('en-US');
                          setValue('tax_rate', val);
                        }}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-right"
                        placeholder="0"
                      />
                      {errors.tax_rate && <p className="text-red-500 text-xs mt-1">{errors.tax_rate.message}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">执行周期(天) *</label>
                      <input
                        type="text"
                        {...register('execution_days', {
                          valueAsNumber: true,
                          setValueAs: (v) => {
                            const num = typeof v === 'string' ? Number(v.replace(/,/g, '')) : v;
                            return isNaN(num) ? 0 : num;
                          }
                        })}
                        onChange={(e) => {
                          const val = e.target.value.replace(/,/g, '');
                          setValue('execution_days', val === '' ? 0 : Number(val));
                        }}
                        onBlur={(e) => {
                          const val = Number(e.target.value.replace(/,/g, '')) || 0;
                          e.target.value = val.toLocaleString('en-US');
                          setValue('execution_days', val);
                        }}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-right"
                        placeholder="0"
                      />
                      {errors.execution_days && <p className="text-red-500 text-xs mt-1">{errors.execution_days.message}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">关联报价单</label>
                      <select {...register('quotation_id')} onChange={handleImportQuotation} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                        <option value="">选择历史报价单</option>
                        {quotations.map(q => (
                          <option key={q.id} value={q.id}>{q.name} - {q.client_name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">总参考价格 *</label>
                      <input
                        type="text"
                        {...register('reference_price_total', {
                          valueAsNumber: true,
                          setValueAs: (v) => {
                            const num = typeof v === 'string' ? Number(v.replace(/,/g, '')) : v;
                            return isNaN(num) ? 0 : num;
                          }
                        })}
                        onChange={(e) => {
                          const val = e.target.value.replace(/,/g, '');
                          setValue('reference_price_total', val === '' ? 0 : Number(val));
                        }}
                        onBlur={(e) => {
                          const val = Number(e.target.value.replace(/,/g, '')) || 0;
                          e.target.value = val.toLocaleString('en-US');
                          setValue('reference_price_total', val);
                        }}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-right"
                        placeholder="0"
                      />
                      {errors.reference_price_total && <p className="text-red-500 text-xs mt-1">{errors.reference_price_total.message}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg">
                    <div>
                      <span className="text-sm text-slate-500">税额：</span>
                      <span className="text-sm font-medium text-slate-900">¥{taxAmount.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-sm text-slate-500">项目收入(不含税)：</span>
                      <span className="text-sm font-medium text-slate-900">¥{incomeWithoutTax.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-sm text-slate-500">参考价上浮金额：</span>
                      <span className={`text-sm font-medium ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>¥{profit.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-4">
                  <h3 className="text-sm font-medium text-slate-900 mb-4">项目负责人</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">项目经理 *</label>
                      <select {...register('bd_manager_id')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                        <option value="">选择项目经理</option>
                        {bdUsers.map(u => (
                          <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                        ))}
                      </select>
                      {errors.bd_manager_id && <p className="text-red-500 text-xs mt-1">{errors.bd_manager_id.message}</p>}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <ItineraryEditor
                value={itinerary}
                onChange={setItinerary}
                hotelArrangement={hotelArrangement}
                onHotelChange={setHotelArrangement}
                suppliers={suppliers}
                executionDays={watch('execution_days') || 0}
                participants={watch('participants') || 0}
                firstDate={firstDate}
                onFirstDateChange={setFirstDate}
                onTotalCostChange={setItineraryTotalCost}
              />
            )}

            <div className="pt-6 flex justify-end space-x-3 border-t border-slate-200 sticky bottom-0 bg-white -mx-6 px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSubmit((data) => onSubmit(data, '草稿'))}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                保存草稿
              </button>
              <button
                type="button"
                onClick={handleSubmit((data) => {
                  // 根据项目经理的角色判断审批流程
                  // 如果是客户总监/运营总监提交，直接到 CEO 终审（初审自动通过）
                  // 如果是客户经理提交，先到总监初审
                  const bdUser = bdUsers.find(u => u.id === data.bd_manager_id);
                  if (bdUser?.role === '客户总监' || bdUser?.role === '运营总监') {
                    onSubmit(data, '待终审'); 
                  } else {
                    onSubmit(data, '待初审');
                  }
                })}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {isSubmitting ? '提交中...' : '提交审核'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
