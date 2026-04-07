import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, CheckCircle, XCircle, Clock, Eye } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';
import { Project, ProjectStatus } from '../types/project';
import { User } from '../types/user';
import ProjectForm from '../components/ProjectForm';
import { createNotification } from '../lib/notifications';

export default function Projects() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAppStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [quotationData, setQuotationData] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (location.state?.openForm && location.state?.quotationData) {
      setQuotationData(location.state.quotationData);
      setIsFormOpen(true);
      // Clear state to prevent re-opening on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  const fetchData = async () => {
    try {
      const [projectsRes, usersRes] = await Promise.all([
        supabase.from('projects').select('*').order('created_at', { ascending: false }),
        supabase.from('users').select('*')
      ]);

      if (projectsRes.error) throw projectsRes.error;
      if (usersRes.error) throw usersRes.error;

      setProjects(projectsRes.data || []);
      setUsers(usersRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除这个项目吗？')) return;
    
    try {
      const { error } = await supabase.from('projects').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (error) {
      console.error('Error deleting project:', error);
      alert('删除失败');
    }
  };

  const handleApprove = async (project: Project, isFinal: boolean, isApproved: boolean) => {
    console.log('=== 开始审批 ===');
    console.log('项目 ID:', project.id);
    console.log('项目编号:', project.code);
    console.log('isFinal:', isFinal);
    console.log('isApproved:', isApproved);
    console.log('project.itinerary:', project.itinerary);
    console.log('project.itinerary?.schedule:', project.itinerary?.schedule);

    try {
      const updates: Partial<Project> = {};

      if (isFinal) {
        updates.final_approval_status = isApproved ? '通过' : '驳回';
        updates.final_approver_id = user?.id;
        updates.status = isApproved ? '已通过' : '已驳回';

        // 发送终审结果通知给申请人
        if (project.bd_manager_id) {
          await createNotification(
            project.bd_manager_id,
            isApproved ? '项目立项已通过' : '项目立项被驳回',
            `项目 ${project.name} 的立项申请在终审阶段${isApproved ? '已通过' : '被驳回'}。`,
            'approval_feedback',
            '/projects'
          );
        }

        console.log('=== 终审通过，准备写入 approved_project_itineraries ===');
        console.log('project.itinerary:', project.itinerary);
        console.log('project.hotel_arrangement:', project.hotel_arrangement);

        if (isApproved && project.itinerary) {
          // First delete existing approved itineraries for this project
          await supabase.from('approved_project_itineraries').delete().eq('project_id', project.id);

          // Insert new approved itineraries
          if (project.itinerary?.schedule && project.itinerary.schedule.length > 0) {
            console.log('行程天数:', project.itinerary.schedule.length);
            const itineraryToInsert = project.itinerary.schedule.map((day: any) => ({
              project_id: project.id,
              day_index: day.day ?? 0,
              date: day.date || null,
              morning: day.morning || [],
              afternoon: day.afternoon || [],
              noon: day.noon || { supplierId: '', cost: 0, actualCost: 0 },
              evening: day.evening || { supplierId: '', cost: 0, actualCost: 0 },
              busId: day.busId || '',
              busDuration: day.busDuration || 'full',
              busHours: day.busHours || 0,
              busCost: day.busCost || 0,
              busActualCost: day.busActualCost || 0,
            }));
            console.log('准备插入的行程数据:', itineraryToInsert);

            const { error: itineraryError } = await supabase
              .from('approved_project_itineraries')
              .insert(itineraryToInsert);

            if (itineraryError) {
              console.error('Error syncing approved itinerary:', itineraryError);
            } else {
              console.log('✅ 行程写入成功！');
            }
          } else {
            console.log('❌ project.itinerary.schedule 为空或不存在');
          }

          // Also update hotel_arrangement in projects table
          if (project.itinerary.hotelArrangement) {
            console.log('更新酒店安排:', project.itinerary.hotelArrangement);
            await supabase
              .from('projects')
              .update({ hotel_arrangement: project.itinerary.hotelArrangement })
              .eq('id', project.id);
          }
        } else {
          console.log('❌ project.itinerary 不存在，跳过写入');
        }
      } else {
        console.log('=== 初审流程 ===');
        updates.initial_approval_status = isApproved ? '通过' : '驳回';
        updates.initial_approver_id = user?.id;
        if (isApproved) {
          updates.status = '待终审';
          updates.final_approval_status = '待审核';

          // 初审通过，发送通知给 CEO 进行终审
          const ceoUsers = users.filter(u => u.role === 'CEO');
          for (const ceo of ceoUsers) {
            await createNotification(
              ceo.id,
              '项目立项待终审',
              `项目 ${project.name} 已通过初审，等待您的终审。`,
              'approval_request',
              '/projects'
            );
          }
        } else {
          updates.status = '已驳回';
          // 初审被驳回，发送通知给申请人
          await createNotification(
            project.bd_manager_id,
            '项目立项被驳回',
            `项目 ${project.name} 的立项申请在初审阶段被驳回。`,
            'approval_feedback',
            '/projects'
          );
        }
      }

      const { error } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', project.id);

      if (error) {
        console.error('更新项目状态失败:', error);
        throw error;
      } else {
        console.log('✅ 项目状态更新成功');
      }
      fetchData();
    } catch (error) {
      console.error('Error updating approval status:', error);
      alert('操作失败');
    }
  };

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const currentUser = user;

  const getStatusBadge = (status: ProjectStatus) => {
    const styles = {
      '草稿': 'bg-slate-100 text-slate-700',
      '待初审': 'bg-yellow-100 text-yellow-800',
      '待终审': 'bg-blue-100 text-blue-800',
      '已通过': 'bg-green-100 text-green-800',
      '已驳回': 'bg-red-100 text-red-800',
    };
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>{status}</span>;
  };

  const getUserName = (id?: string | null) => {
    if (!id) return '-';
    return users.find(u => u.id === id)?.name || '未知';
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">项目管理</h1>
          <p className="text-sm text-slate-500 mt-1">项目立项、执行进度跟踪、成本控制。</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => {
              setEditingProject(null);
              setIsFormOpen(true);
            }}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center"
          >
            <Plus className="w-4 h-4 mr-2" />
            人工立项
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <div className="relative w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜索项目编号或名称..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">项目编号</th>
                <th className="px-6 py-3">项目名称</th>
                <th className="px-6 py-3">商务负责人</th>
                <th className="px-6 py-3">收入（含税）</th>
                <th className="px-6 py-3">参考价格</th>
                <th className="px-6 py-3">参考价上浮金额</th>
                <th className="px-6 py-3">状态</th>
                <th className="px-6 py-3">审批进度</th>
                <th className="px-6 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-slate-500">加载中...</td>
                </tr>
              ) : filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-slate-500">暂无项目数据</td>
                </tr>
              ) : (
                filteredProjects.map((project) => {
                  const bdUser = users.find(u => u.id === project.bd_manager_id);

                  // Approval logic checks
                  const canInitialApprove =
                    project.status === '待初审' &&
                    currentUser &&
                    bdUser &&
                    bdUser.manager_id === currentUser.id;

                  const canFinalApprove =
                    project.status === '待终审' &&
                    currentUser?.role === 'CEO';

                  return (
                    <tr key={project.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 font-medium text-slate-900">{project.code}</td>
                      <td className="px-6 py-4">{project.name}</td>
                      <td className="px-6 py-4">{getUserName(project.bd_manager_id)}</td>
                      <td className="px-6 py-4">¥{project.income_with_tax?.toLocaleString() || '0'}</td>
                      <td className="px-6 py-4">¥{project.reference_price_total?.toLocaleString() || '0'}</td>
                      <td className="px-6 py-4">
                        <span className={((project.income_with_tax || 0) - (project.reference_price_total || 0)) >= 0 ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>
                          ¥{((project.income_with_tax || 0) - (project.reference_price_total || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-6 py-4">{getStatusBadge(project.status)}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col space-y-1 text-xs">
                          {project.initial_approval_status && (
                            <div className="flex items-center">
                              <span className="w-12 text-slate-500">初审:</span>
                              <span className={
                                project.initial_approval_status === '通过' ? 'text-green-600' : 
                                project.initial_approval_status === '驳回' ? 'text-red-600' : 'text-yellow-600'
                              }>
                                {project.initial_approval_status} {project.initial_approver_id && `(${getUserName(project.initial_approver_id)})`}
                              </span>
                            </div>
                          )}
                          {project.final_approval_status && (
                            <div className="flex items-center">
                              <span className="w-12 text-slate-500">终审:</span>
                              <span className={
                                project.final_approval_status === '通过' ? 'text-green-600' : 
                                project.final_approval_status === '驳回' ? 'text-red-600' : 'text-yellow-600'
                              }>
                                {project.final_approval_status} {project.final_approver_id && `(${getUserName(project.final_approver_id)})`}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        {canInitialApprove && (
                          <>
                            <button onClick={() => handleApprove(project, false, true)} className="text-green-600 hover:text-green-800" title="初审通过">
                              <CheckCircle className="w-4 h-4 inline" />
                            </button>
                            <button onClick={() => handleApprove(project, false, false)} className="text-red-600 hover:text-red-800" title="驳回">
                              <XCircle className="w-4 h-4 inline" />
                            </button>
                          </>
                        )}
                        {canFinalApprove && (
                          <>
                            <button onClick={() => handleApprove(project, true, true)} className="text-green-600 hover:text-green-800" title="终审通过">
                              <CheckCircle className="w-4 h-4 inline" />
                            </button>
                            <button onClick={() => handleApprove(project, true, false)} className="text-red-600 hover:text-red-800" title="驳回">
                              <XCircle className="w-4 h-4 inline" />
                            </button>
                          </>
                        )}
                        {project.status === '已通过' ? (
                          <button 
                            onClick={() => navigate(`/projects/${project.id}`)}
                            className="text-indigo-600 hover:text-indigo-800 ml-2"
                            title="查看详情"
                          >
                            <Eye className="w-4 h-4 inline" />
                          </button>
                        ) : (
                          <button 
                            onClick={() => {
                              setEditingProject(project);
                              setIsFormOpen(true);
                            }}
                            className="text-indigo-600 hover:text-indigo-800 ml-2"
                            title="编辑"
                          >
                            <Edit2 className="w-4 h-4 inline" />
                          </button>
                        )}
                        <button 
                          onClick={() => handleDelete(project.id)}
                          className="text-red-600 hover:text-red-800 ml-2"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4 inline" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ProjectForm 
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingProject(null);
          setQuotationData(null);
        }}
        onSuccess={fetchData}
        initialData={editingProject}
        quotationData={quotationData}
        users={users}
      />
    </div>
  );
}

