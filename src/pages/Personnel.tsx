import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, Users, Shield, User as UserIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { User } from '../types/user';
import UserForm from '../components/UserForm';
import { useAppStore } from '../store';

export default function Personnel() {
  const { user } = useAppStore();
  const isAdmin = user?.role === '管理员';
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        // If table doesn't exist, we'll just show empty state for now
        // In a real app, the table would be created via migrations
        console.error('Error fetching users:', error);
        setUsers([]);
      } else {
        setUsers(data || []);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除该人员吗？')) return;

    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('删除失败，请重试');
    }
  };

  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (u.phone && u.phone.includes(searchQuery)) ||
    u.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getManagerName = (managerId?: string | null) => {
    if (!managerId) return '-';
    const manager = users.find(u => u.id === managerId);
    return manager ? manager.name : '-';
  };

  const getRoleIcon = (role: string) => {
    if (role === '管理员') return <Shield className="w-4 h-4 text-indigo-500" />;
    if (role === 'CEO') return <Users className="w-4 h-4 text-emerald-500" />;
    return <UserIcon className="w-4 h-4 text-slate-500" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">人员管理</h1>
          <p className="text-sm text-slate-500 mt-1">管理组织架构、员工档案、角色权限与审批流。</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => {
              setEditingUser(null);
              setIsFormOpen(true);
            }}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center"
          >
            <Plus className="w-4 h-4 mr-2" />
            新增人员
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="搜索姓名、邮箱或角色..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-sm font-medium text-slate-500">姓名</th>
                <th className="px-6 py-4 text-sm font-medium text-slate-500">手机号</th>
                <th className="px-6 py-4 text-sm font-medium text-slate-500">邮箱</th>
                <th className="px-6 py-4 text-sm font-medium text-slate-500">角色</th>
                <th className="px-6 py-4 text-sm font-medium text-slate-500">直属上级</th>
                <th className="px-6 py-4 text-sm font-medium text-slate-500 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    加载中...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    暂无人员数据
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{user.name}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{user.phone || '-'}</td>
                    <td className="px-6 py-4 text-slate-600">{user.email || '-'}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        {getRoleIcon(user.role)}
                        <span className="text-sm font-medium text-slate-700">{user.role}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {getManagerName(user.manager_id)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {isAdmin ? (
                        <div className="flex items-center justify-end space-x-3">
                          <button
                            onClick={() => handleEdit(user)}
                            className="text-slate-400 hover:text-indigo-600 transition-colors"
                            title="编辑"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(user.id)}
                            className="text-slate-400 hover:text-red-600 transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isAdmin && (
        <UserForm
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          onSuccess={fetchUsers}
          initialData={editingUser}
          users={users}
        />
      )}
    </div>
  );
}
