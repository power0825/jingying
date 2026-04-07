import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { X } from 'lucide-react';
import { Supplier, SupplierType } from '../types/supplier';
import { supabase } from '../lib/supabase';

const quoteInfoSchema = z.object({
  unit: z.coerce.number().optional(),
  hour: z.coerce.number().optional(),
  half_day: z.coerce.number().optional(),
  day: z.coerce.number().optional(),
  billing_form: z.string().optional(),
});

const supplierSchema = z.object({
  name: z.string().min(1, '请输入供应商名称'),
  code: z.string().optional(),
  type: z.enum(['酒店', '餐饮', '场地', '老师', '参访点', '大巴', '其他'] as const),
  price: z.coerce.number().optional(),
  contact_person: z.string().optional(),
  contact_phone: z.string().optional(),
  internal_contact_id: z.string().optional(),
  reference_quote: quoteInfoSchema.optional(),
  actual_cost: quoteInfoSchema.optional(),
  account_name: z.string().optional(),
  tax_id: z.string().optional(),
  bank_name: z.string().optional(),
  bank_account: z.string().optional(),
  address: z.string().optional(),
  remarks: z.string().optional(),
  extended_data: z.record(z.string(), z.any()).optional(),
  settlement_method: z.enum(['月结', '先款后票', '先票后款'] as const).optional().default('月结'),
  settlement_day: z.coerce.number().optional(),
});

type SupplierFormData = z.infer<typeof supplierSchema>;

interface SupplierFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: Supplier | null;
  defaultType?: SupplierType;
}

export default function SupplierForm({ isOpen, onClose, onSuccess, initialData, defaultType = '酒店' }: SupplierFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SupplierFormData>({
    resolver: zodResolver(supplierSchema) as any,
    defaultValues: {
      name: '',
      code: '',
      type: defaultType,
      price: 0,
      contact_person: '',
      contact_phone: '',
      internal_contact_id: '',
      address: '',
      remarks: '',
      account_name: '',
      tax_id: '',
      bank_name: '',
      bank_account: '',
      extended_data: {},
      reference_quote: {},
      actual_cost: {},
      settlement_method: '月结',
      settlement_day: undefined,
    },
  });

  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [users, setUsers] = React.useState<any[]>([]);

  const selectedType = watch('type');

  useEffect(() => {
    const fetchUsers = async () => {
      const { data } = await supabase.from('users').select('id, name').order('name');
      if (data) setUsers(data);
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    setSubmitError(null);
    if (isOpen) {
      if (initialData) {
        reset({
          ...initialData,
          extended_data: initialData.extended_data || {},
          reference_quote: initialData.reference_quote || {},
          actual_cost: initialData.actual_cost || {},
          settlement_method: initialData.settlement_method || '月结',
          settlement_day: initialData.settlement_day,
        });
      } else {
        reset({
          name: '',
          code: '',
          type: defaultType,
          price: 0,
          contact_person: '',
          contact_phone: '',
          internal_contact_id: '',
          address: '',
          remarks: '',
          account_name: '',
          tax_id: '',
          bank_name: '',
          bank_account: '',
          extended_data: {},
          reference_quote: {},
          actual_cost: {},
          settlement_method: '月结',
          settlement_day: undefined,
        });
      }
    }
  }, [isOpen, initialData, defaultType, reset]);

  const onSubmit = async (formData: SupplierFormData) => {
    setSubmitError(null);
    try {
      // Remove code if it's empty for new suppliers to let DB generate it
      const data = { ...formData };
      if (!initialData && !data.code) {
        delete data.code;
      }

      if (initialData?.id) {
        const { error } = await supabase
          .from('suppliers')
          .update(data)
          .eq('id', initialData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('suppliers')
          .insert([data]);
        if (error) throw error;
      }
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error saving supplier:', error);
      setSubmitError(error.message || '保存失败，请重试');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 sm:p-0">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">
            {initialData ? '编辑供应商' : '新增供应商'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {submitError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {submitError}
            </div>
          )}
          <form id="supplier-form" onSubmit={handleSubmit(onSubmit as any)} className="space-y-6">
            {/* 基础信息 */}
            <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
              <div className="flex items-center mb-4">
                <div className="w-1 h-5 bg-indigo-500 rounded mr-3"></div>
                <h3 className="text-base font-semibold text-slate-800">基础信息</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">供应商名称 *</label>
                  <input {...register('name')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                  {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">供应商编码</label>
                  <input
                    {...register('code')}
                    placeholder={initialData ? "" : "自动生成"}
                    disabled={!initialData}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50"
                  />
                  {errors.code && <p className="text-red-500 text-xs mt-1">{errors.code.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">供应商类型 *</label>
                  <select {...register('type')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                    <option value="酒店">酒店</option>
                    <option value="餐饮">餐饮</option>
                    <option value="场地">场地</option>
                    <option value="老师">老师</option>
                    <option value="参访点">参访点</option>
                    <option value="大巴">大巴</option>
                    <option value="其他">其他</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">联系人</label>
                  <input {...register('contact_person')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">联系电话</label>
                  <input {...register('contact_phone')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">我司对接人</label>
                  <select {...register('internal_contact_id')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                    <option value="">请选择</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div className="lg:col-span-3">
                  <label className="block text-sm font-medium text-slate-700 mb-1">地址</label>
                  <input {...register('address')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                </div>
              </div>
            </div>

            {/* 报价及结算信息 */}
            <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl p-5 border border-indigo-100">
              <div className="flex items-center mb-4">
                <div className="w-1 h-5 bg-indigo-600 rounded mr-3"></div>
                <h3 className="text-base font-semibold text-slate-800">报价及结算信息</h3>
              </div>

              <div className="space-y-5">
                {/* 结算方式 */}
                <div className="bg-white rounded-lg p-4 border border-indigo-100">
                  <h4 className="text-sm font-semibold text-indigo-700 mb-3">结算条款</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">结算方式 *</label>
                      <select {...register('settlement_method')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                        <option value="月结">月结</option>
                        <option value="先款后票">先款后票</option>
                        <option value="先票后款">先票后款</option>
                      </select>
                      {errors.settlement_method && <p className="text-red-500 text-xs mt-1">{errors.settlement_method.message}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">结算日期 <span className="text-slate-400 font-normal">（每月几号）</span></label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        {...register('settlement_day', {
                          setValueAs: (value) => value === '' ? undefined : value,
                        })}
                        placeholder="例如：15"
                        disabled={watch('settlement_method') !== '月结'}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50"
                      />
                      {errors.settlement_day && <p className="text-red-500 text-xs mt-1">{errors.settlement_day.message}</p>}
                    </div>
                  </div>
                </div>

                {/* 参考报价 */}
                <div className="bg-white rounded-lg p-4 border border-slate-200">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">参考报价 (用于初步核算)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(selectedType === '酒店' || selectedType === '餐饮' || selectedType === '参访点' || selectedType === '其他') && (
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">
                          {selectedType === '酒店' ? '单价 (元/间*夜)' :
                           selectedType === '餐饮' ? '单价 (元/人*餐)' :
                           selectedType === '参访点' ? '单价 (元/人)' : '单价 (元)'}
                        </label>
                        <input type="number" step="0.01" {...register('reference_quote.unit')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white" />
                      </div>
                    )}
                    {(selectedType === '场地' || selectedType === '老师' || selectedType === '大巴') && (
                      <>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">单价 (元/小时)</label>
                          <input type="number" step="0.01" {...register('reference_quote.hour')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">单价 (元/半天)</label>
                          <input type="number" step="0.01" {...register('reference_quote.half_day')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">单价 (元/天)</label>
                          <input type="number" step="0.01" {...register('reference_quote.day')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white" />
                        </div>
                      </>
                    )}
                    {selectedType === '其他' && (
                      <div className="md:col-span-2">
                        <label className="block text-xs text-slate-500 mb-1">计费形式备注</label>
                        <input {...register('reference_quote.billing_form')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white" placeholder="例如：按次计费、按重量计费等" />
                      </div>
                    )}
                  </div>
                </div>

                {/* 实际成本 */}
                <div className="bg-white rounded-lg p-4 border border-emerald-200">
                  <h4 className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-3">实际成本 (用于财务核算)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(selectedType === '酒店' || selectedType === '餐饮' || selectedType === '参访点' || selectedType === '其他') && (
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">
                          {selectedType === '酒店' ? '成本 (元/间*夜)' :
                           selectedType === '餐饮' ? '成本 (元/人*餐)' :
                           selectedType === '参访点' ? '成本 (元/人)' : '成本 (元)'}
                        </label>
                        <input type="number" step="0.01" {...register('actual_cost.unit')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white" />
                      </div>
                    )}
                    {(selectedType === '场地' || selectedType === '老师' || selectedType === '大巴') && (
                      <>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">成本 (元/小时)</label>
                          <input type="number" step="0.01" {...register('actual_cost.hour')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">成本 (元/半天)</label>
                          <input type="number" step="0.01" {...register('actual_cost.half_day')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">成本 (元/天)</label>
                          <input type="number" step="0.01" {...register('actual_cost.day')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white" />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">开户名称</label>
                    <input {...register('account_name')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">税号</label>
                    <input {...register('tax_id')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">开户行</label>
                    <input {...register('bank_name')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">银行账号</label>
                    <input {...register('bank_account')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                  </div>
                </div>
              </div>
            </div>

            {/* 其他信息 */}
            <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
              <div className="flex items-center mb-4">
                <div className="w-1 h-5 bg-slate-500 rounded mr-3"></div>
                <h3 className="text-base font-semibold text-slate-800">其他信息 ({selectedType})</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedType === '酒店' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">星级</label>
                      <select {...register('extended_data.star_rating')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                        <option value="">请选择</option>
                        <option value="五星级">五星级</option>
                        <option value="四星级">四星级</option>
                        <option value="三星级">三星级</option>
                        <option value="快捷酒店">快捷酒店</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">房间数量</label>
                      <input type="number" {...register('extended_data.room_count')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                    </div>
                  </>
                )}
                {selectedType === '餐饮' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">菜系</label>
                      <input {...register('extended_data.cuisine')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                    </div>
                    <div className="flex items-center mt-6">
                      <input type="checkbox" {...register('extended_data.is_halal')} id="is_halal" className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded" />
                      <label htmlFor="is_halal" className="ml-2 block text-sm text-slate-700">可以提供清真餐</label>
                    </div>
                  </>
                )}
                {selectedType === '场地' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">面积 (平米)</label>
                      <input type="number" {...register('extended_data.area')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">容纳人数</label>
                      <input type="number" {...register('extended_data.capacity')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">设备情况</label>
                      <textarea {...register('extended_data.equipment')} rows={2} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                    </div>
                  </>
                )}
                {selectedType === '老师' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">课程名称</label>
                      <input {...register('extended_data.course_name')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">授课语言</label>
                      <input {...register('extended_data.language')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                    </div>
                  </>
                )}
                {selectedType === '参访点' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">所属行业</label>
                      <input {...register('extended_data.industry')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">讲解语言</label>
                      <input {...register('extended_data.guide_language')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">最高容纳人数</label>
                      <input type="number" {...register('extended_data.max_capacity')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                    </div>
                    <div className="flex flex-col space-y-2 mt-6">
                      <div className="flex items-center">
                        <input type="checkbox" {...register('extended_data.has_guide')} id="has_guide" className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded" />
                        <label htmlFor="has_guide" className="ml-2 block text-sm text-slate-700">是否有讲解</label>
                      </div>
                      <div className="flex items-center">
                        <input type="checkbox" {...register('extended_data.has_teaching')} id="has_teaching" className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded" />
                        <label htmlFor="has_teaching" className="ml-2 block text-sm text-slate-700">是否有授课</label>
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">设备情况</label>
                      <textarea {...register('extended_data.equipment')} rows={2} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                    </div>
                  </>
                )}
                {selectedType === '大巴' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">乘客人数</label>
                    <input type="number" {...register('extended_data.passenger_count')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                  </div>
                )}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">备注</label>
                  <textarea {...register('remarks')} rows={2} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                </div>
              </div>
            </div>
          </form>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="submit"
            form="supplier-form"
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSubmitting ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
