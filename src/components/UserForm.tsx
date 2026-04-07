import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { X } from 'lucide-react';
import { User, UserRole } from '../types/user';
import { supabase } from '../lib/supabase';

const userSchema = z.object({
  name: z.string().min(1, '请输入姓名'),
  email: z.string().email('请输入有效的邮箱').optional().nullable(),
  phone: z.string().regex(/^1[3-9]\d{9}$/, '请输入有效的 11 位手机号'),
  password: z.string().min(6, '密码至少需要 6 个字符'),
  role: z.enum(['管理员', '客户经理', '客户总监', '运营经理', '运营总监', '财务', 'CEO'] as const),
  manager_id: z.string().optional().nullable(),
});

type UserFormData = z.infer<typeof userSchema>;

interface UserFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: User | null;
  users: User[];
}

export default function UserForm({ isOpen, onClose, onSuccess, initialData, users }: UserFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UserFormData>({
    resolver: zodResolver(userSchema) as any,
    defaultValues: {
      role: '客户经理',
    },
  });

  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const selectedRole = watch('role');

  useEffect(() => {
    setSubmitError(null);
    if (isOpen) {
      if (initialData) {
        reset({
          name: initialData.name,
          email: initialData.email || '',
          phone: initialData.phone || '',
          password: initialData.password || '123456',
          role: initialData.role,
          manager_id: initialData.manager_id,
        });
      } else {
        reset({
          name: '',
          email: '',
          phone: '',
          password: '123456',
          role: '客户经理',
          manager_id: null,
        });
      }
    }
  }, [isOpen, initialData, reset]);

  const onSubmit = async (data: UserFormData) => {
    setSubmitError(null);
    try {
      if (initialData?.id) {
        const { error } = await supabase
          .from('users')
          .update({
            ...data,
            email: data.email || null,
            manager_id: data.manager_id || null,
          })
          .eq('id', initialData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('users')
          .insert([{
            ...data,
            email: data.email || null,
            manager_id: data.manager_id || null,
          }]);
        if (error) throw error;
      }
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error saving user:', error);
      setSubmitError(error.message || '保存失败，请重试');
    }
  };

  const getPotentialManagers = () => {
    let allowedRoles: UserRole[] = [];
    switch (selectedRole) {
      case '客户经理':
        allowedRoles = ['客户总监', 'CEO'];
        break;
      case '客户总监':
        allowedRoles = ['CEO'];
        break;
      case '运营经理':
        allowedRoles = ['运营总监', 'CEO'];
        break;
      case '运营总监':
        allowedRoles = ['CEO'];
        break;
      case '财务':
        allowedRoles = ['CEO'];
        break;
      case '管理员':
      case 'CEO':
        allowedRoles = [];
        break;
      default:
        allowedRoles = [];
    }

    return users.filter(u =>
      allowedRoles.includes(u.role) &&
      u.id !== initialData?.id
    );
  };

  const potentialManagers = getPotentialManagers();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 sm:p-0">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">
            {initialData ? '编辑人员' : '新增人员'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {submitError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {submitError}
            </div>
          )}
          <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">姓名 *</label>
              <input {...register('name')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">手机号 *</label>
              <input type="tel" {...register('phone')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" placeholder="11 位手机号" />
              {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">邮箱（选填）</label>
              <input type="email" {...register('email')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">初始密码 *</label>
              <input type="text" {...register('password')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">角色 *</label>
              <select {...register('role')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                <option value="管理员">管理员</option>
                <option value="客户经理">客户经理</option>
                <option value="客户总监">客户总监</option>
                <option value="运营经理">运营经理</option>
                <option value="运营总监">运营总监</option>
                <option value="财务">财务</option>
                <option value="CEO">CEO</option>
              </select>
              {errors.role && <p className="text-red-500 text-xs mt-1">{errors.role.message}</p>}
            </div>

            {potentialManagers.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">直属上级</label>
                <select {...register('manager_id')} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                  <option value="">无</option>
                  {potentialManagers.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.role})</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">根据角色自动过滤可选的上级</p>
              </div>
            )}

            <div className="pt-4 flex justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {isSubmitting ? '保存中...' : '保存'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
