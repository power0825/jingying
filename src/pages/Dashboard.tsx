import React, { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus,
  Trash2,
  GripVertical,
  Settings2,
  Check,
  X,
  LayoutDashboard,
  FileText,
  Loader2
} from 'lucide-react';
import { useAppStore } from '../store';
import { supabase } from '../lib/supabase';
import ProjectProgressTable from '../components/project/ProjectProgressTable';
import MyProjectsCalendar from '../components/dashboard/MyProjectsCalendar';

// --- Widget Definitions ---

interface WidgetDef {
  id: string;
  name: string;
  description: string;
  component: React.FC;
  roles?: string[];
}

const MetricCards: React.FC = () => {
  const [metrics, setMetrics] = useState([
    { title: '进行中项目', value: '0', color: 'text-blue-600', bg: 'bg-blue-50' },
    { title: '本月新增客户', value: '0', color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { title: '本月项目总金额', value: '¥0', color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { title: '本月回款金额', value: '¥0', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        const { count: projectCount } = await supabase
          .from('projects')
          .select('*', { count: 'exact', head: true })
          .neq('status', '已完成');

        const { count: customerCount } = await supabase
          .from('customers')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', firstDayOfMonth);

        const { data: projectsData } = await supabase
          .from('projects')
          .select('income_with_tax')
          .gte('created_at', firstDayOfMonth);

        const { data: paymentsData } = await supabase
          .from('project_financial_customers')
          .select('amount, payment_date')
          .gte('payment_date', firstDayOfMonth);

        const monthlyProjectAmount = projectsData?.reduce((sum, item) => sum + Number(item.income_with_tax || 0), 0) || 0;
        const monthlyPaymentAmount = paymentsData?.reduce((sum, item) => sum + Number(item.amount || 0), 0) || 0;

        setMetrics([
          { title: '进行中项目', value: (projectCount || 0).toString(), color: 'text-blue-600', bg: 'bg-blue-50' },
          { title: '本月新增客户', value: (customerCount || 0).toString(), color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { title: '本月项目总金额', value: `¥${(monthlyProjectAmount / 10000).toFixed(1)}w`, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { title: '本月回款金额', value: `¥${(monthlyPaymentAmount / 10000).toFixed(1)}w`, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ]);
      } catch (err) {
        console.error('Error fetching metrics:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, []);

  if (loading) return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 animate-pulse">
          <div className="h-3 w-20 bg-slate-100 rounded mb-3"></div>
          <div className="h-8 w-16 bg-slate-100 rounded"></div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((m, i) => (
        <div key={i} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider">{m.title}</h3>
          <p className={`text-2xl font-bold mt-2 ${m.color}`}>{m.value}</p>
        </div>
      ))}
    </div>
  );
};

const ApprovalList: React.FC = () => {
  const [approvalCounts, setApprovalCounts] = useState({
    project: 0,
    reimbursement: 0,
    settlement: 0,
  });
  const [loading, setLoading] = useState(true);
  const { user } = useAppStore();

  useEffect(() => {
    const fetchApprovals = async () => {
      try {
        const counts = {
          project: 0,
          reimbursement: 0,
          settlement: 0,
        };

        // 立项审批计数 - 根据用户角色获取相关的待审批项目
        if (user?.role === 'CEO') {
          // CEO 查看所有待终审的项目
          const { count } = await supabase
            .from('projects')
            .select('*', { count: 'exact', head: true })
            .eq('status', '待终审');
          counts.project = count || 0;
        } else if (user?.role === '客户总监' || user?.role === '运营总监') {
          // 总监/运营总监查看所有待初审的项目（因为下属的经理提交的项目都会流转到总监这里）
          // 注意：这里不 filter bd_manager_id，因为需要查看所有下属经理的项目
          const { count } = await supabase
            .from('projects')
            .select('*', { count: 'exact', head: true })
            .eq('status', '待初审');
          counts.project = count || 0;
        }

        // 根据用户角色获取相关的报销审批计数
        if (user?.role === '客户总监' || user?.role === '运营总监') {
          // 总监只能看到自己团队的待审批报销
          const { data: subordinatesData } = await supabase
            .from('users')
            .select('id')
            .eq('manager_id', user?.id);

          const subordinateIds = subordinatesData?.map(u => u.id) || [];
          const teamIds = [...subordinateIds, user?.id].filter(Boolean);

          const { count } = await supabase
            .from('project_reimbursements')
            .select('id', { count: 'exact' })
            .in('status', ['待总监初审', '待审核'])
            .in('user_id', teamIds);
          counts.reimbursement = count || 0;
        } else if (user?.role === 'CEO') {
          const { count } = await supabase
            .from('project_reimbursements')
            .select('id', { count: 'exact' })
            .in('status', ['待 CEO 终审']);
          counts.reimbursement = count || 0;
        } else if (user?.role === '财务') {
          const { count } = await supabase
            .from('project_reimbursements')
            .select('id', { count: 'exact' })
            .in('status', ['待财务审核', '待打款']);
          counts.reimbursement = count || 0;
        }

        // 结算单审批计数
        if (user?.role === 'CEO') {
          const { count: settlementCount } = await supabase
            .from('supplier_settlements')
            .select('*', { count: 'exact', head: true })
            .eq('status', '待 CEO 审核');
          counts.settlement = settlementCount || 0;
        } else if (user?.role === '财务') {
          const { count: settlementCount } = await supabase
            .from('supplier_settlements')
            .select('*', { count: 'exact', head: true })
            .eq('status', '待财务审核');
          counts.settlement = settlementCount || 0;
        }

        setApprovalCounts(counts);
      } catch (err) {
        console.error('Error fetching approvals:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchApprovals();

    // Set up realtime subscription to update approval counts
    const reimbursementSub = supabase
      .channel('dashboard-reimbursement-counts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_reimbursements' }, () => {
        fetchApprovals();
      })
      .subscribe();

    const projectSub = supabase
      .channel('dashboard-project-counts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        fetchApprovals();
      })
      .subscribe();

    const settlementSub = supabase
      .channel('dashboard-settlement-counts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'supplier_settlements' }, () => {
        fetchApprovals();
      })
      .subscribe();

    return () => {
      reimbursementSub.unsubscribe();
      projectSub.unsubscribe();
      settlementSub.unsubscribe();
    };
  }, [user?.role]);

  const approvalTypes = [
    {
      type: 'project',
      label: '项目立项',
      count: approvalCounts.project,
      link: '/projects',
    },
    {
      type: 'reimbursement',
      label: '报销审批',
      count: approvalCounts.reimbursement,
      link: '/finance/reimbursement-approval',
    },
    {
      type: 'settlement',
      label: '结算单审批',
      count: approvalCounts.settlement,
      link: '/finance/settlement-processing',
    },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
      <h3 className="font-medium text-slate-900 mb-3 flex items-center space-x-2">
        <FileText className="w-4 h-4 text-amber-500" />
        <span>待我审批</span>
      </h3>
      {loading ? (
        <div className="flex items-center justify-center h-20">
          <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {approvalTypes.map((item, index) => {
            const colors = [
              { bg: 'bg-blue-100', hover: 'hover:bg-blue-200', text: 'text-blue-700' },
              { bg: 'bg-purple-100', hover: 'hover:bg-purple-200', text: 'text-purple-700' },
              { bg: 'bg-amber-100', hover: 'hover:bg-amber-200', text: 'text-amber-700' },
            ];
            const color = colors[index];

            return (
              <div
                key={item.type}
                className={`${color.bg} ${color.hover} ${color.text} rounded-lg p-3 cursor-pointer transition-colors relative`}
                onClick={() => window.location.href = item.link}
              >
                {item.count > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] text-center shadow">
                    {item.count}
                  </span>
                )}
                <div className="text-sm font-medium truncate">{item.label}</div>
                {item.count === 0 && (
                  <p className="text-xs opacity-70 mt-0.5">暂无</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const ALL_WIDGETS: WidgetDef[] = [
  { id: 'metrics', name: '核心指标', description: '显示进行中项目、新增客户、待审批等关键数据。', component: MetricCards },
  { id: 'progress-table', name: '项目进度看板', description: '展示所有执行中项目的详细信息表格，支持筛选、排序、导出。', component: ProjectProgressTable },
  { id: 'approvals', name: '待我审批', description: '列出当前需要您处理的审批事项。', component: ApprovalList },
  { id: 'my-projects', name: '我参与的项目', description: '日历视图展示未来两周内您被分配的项目任务和工作安排。', component: MyProjectsCalendar, roles: ['运营经理', '运营总监', '客户经理', '客户总监', '班主任'] },
];

// --- Sortable Item Component ---

interface SortableItemProps {
  id: string;
  widget: WidgetDef;
  isEditing: boolean;
  onRemove: (id: string) => void;
}

function SortableItem({ id, widget, isEditing, onRemove }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  const WidgetComponent = widget.component;

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      {isEditing && (
        <div className="absolute -top-2 -right-2 z-10 flex space-x-1">
          <button
            onClick={() => onRemove(id)}
            className="p-1.5 bg-rose-500 text-white rounded-full shadow-lg hover:bg-rose-600 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
          <div
            {...attributes}
            {...listeners}
            className="p-1.5 bg-indigo-500 text-white rounded-full shadow-lg cursor-grab active:cursor-grabbing hover:bg-indigo-600 transition-colors"
          >
            <GripVertical className="w-3 h-3" />
          </div>
        </div>
      )}
      <div className={isEditing ? 'ring-2 ring-indigo-500 ring-offset-4 rounded-xl' : ''}>
        <WidgetComponent />
      </div>
    </div>
  );
}

// --- Main Dashboard Component ---

export default function Dashboard() {
  const { user, setUser } = useAppStore();
  const [isEditing, setIsEditing] = useState(false);
  const [activeWidgets, setActiveWidgets] = useState<string[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      let defaultWidgets: string[];
      if (user.role === 'CEO') {
        defaultWidgets = ALL_WIDGETS.map(w => w.id);
      } else if (user.role === '客户经理' || user.role === '运营经理') {
        // 客户经理和运营经理只能看到核心指标和待我审批
        defaultWidgets = ['metrics', 'approvals'];
      } else {
        defaultWidgets = ['metrics', 'progress-table', 'approvals'];
      }

      setActiveWidgets(user.dashboard_config || defaultWidgets);
    }
  }, [user]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setActiveWidgets((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const removeWidget = (id: string) => {
    setActiveWidgets(activeWidgets.filter(wId => wId !== id));
  };

  const addWidget = (id: string) => {
    if (!activeWidgets.includes(id)) {
      setActiveWidgets([...activeWidgets, id]);
    }
    setIsAddModalOpen(false);
  };

  const saveLayout = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({ dashboard_config: activeWidgets })
        .eq('id', user.id);

      if (error) throw error;

      setUser({ ...user, dashboard_config: activeWidgets });
      setIsEditing(false);
      alert('工作台布局已保存');
    } catch (err) {
      console.error('Error saving dashboard config:', err);
      alert('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const cancelEditing = () => {
    setActiveWidgets(user?.dashboard_config || []);
    setIsEditing(false);
  };

  // 客户经理和运营经理无法自定义工作台
  const canCustomizeDashboard = user?.role !== '客户经理' && user?.role !== '运营经理';

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">工作台 (Dashboard)</h1>
          <p className="text-sm text-slate-500 mt-1">
            欢迎回来，{user?.name}。这里是您的个性化工作空间。
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {canCustomizeDashboard && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium shadow-sm"
            >
              <Settings2 className="w-4 h-4" />
              <span>自定义工作台</span>
            </button>
          )}
          {canCustomizeDashboard && isEditing && (
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                <span>添加模块</span>
              </button>
              <button
                onClick={saveLayout}
                disabled={saving}
                className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>完成配置</span>
              </button>
              <button
                onClick={cancelEditing}
                className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 text-slate-400 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium"
              >
                <X className="w-4 h-4" />
                <span>取消</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={activeWidgets}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-6">
            {activeWidgets.map((wId) => {
              const widget = ALL_WIDGETS.find(w => w.id === wId);
              if (!widget) return null;
              // Filter by role if widget has roles defined
              if (widget.roles && !widget.roles.includes(user?.role || '')) return null;
              return (
                <SortableItem
                  key={wId}
                  id={wId}
                  widget={widget}
                  isEditing={isEditing}
                  onRemove={removeWidget}
                />
              );
            })}

            {activeWidgets.length === 0 && (
              <div className="bg-white rounded-xl border-2 border-dashed border-slate-200 p-12 text-center">
                <LayoutDashboard className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">您的工作台目前是空的</p>
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="mt-4 text-indigo-600 font-medium hover:underline"
                >
                  点击添加模块
                </button>
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>

      {/* Add Widget Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900">添加工作台模块</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto">
              {ALL_WIDGETS.filter(w => !w.roles || w.roles.includes(user?.role || '')).map((widget) => {
                const isAdded = activeWidgets.includes(widget.id);
                return (
                  <div
                    key={widget.id}
                    className={`p-4 rounded-xl border transition-all ${
                      isAdded
                        ? 'bg-slate-50 border-slate-200 opacity-60'
                        : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-md cursor-pointer'
                    }`}
                    onClick={() => !isAdded && addWidget(widget.id)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-semibold text-slate-900">{widget.name}</h4>
                      {isAdded && <Check className="w-4 h-4 text-emerald-500" />}
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">{widget.description}</p>
                    {!isAdded && (
                      <button className="mt-3 text-xs font-medium text-indigo-600 flex items-center space-x-1">
                        <Plus className="w-3 h-3" />
                        <span>添加此模块</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
