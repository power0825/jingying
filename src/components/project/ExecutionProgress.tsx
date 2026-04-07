import React, { useState, useEffect } from 'react';
import { 
  Users, 
  CheckSquare, 
  Square, 
  Plus, 
  Trash2, 
  Loader2, 
  Bus,
  User,
  MapPin,
  Building,
  Package,
  Hotel,
  Save,
  Calendar,
  Clock,
  Activity,
  Utensils,
  Plane,
  MoreHorizontal,
  PlusCircle,
  X,
  Edit3
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Project } from '../../types/project';
import { User as UserType } from '../../types/user';
import { format, addDays, subDays, parseISO, isSameDay, eachDayOfInterval } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useAppStore } from '../../store';

interface ExecutionProgressProps {
  project: Project;
  users: UserType[];
  onUpdate: () => void;
}

interface ChecklistItem {
  id: string;
  category: string;
  item: string;
  status: boolean;
  notes?: string;
  responsible_person_id?: string | null;
}

interface ManualGanttItem {
  id: string;
  item_name: string;
  start_time: string;
  end_time: string;
  color: string;
  responsible_person_id?: string | null;
}

interface Supplier {
  id: string;
  name: string;
  type: string;
}

interface ItineraryDay {
  id: string;
  day_index: number;
  date: string;
  morning: any[];
  afternoon: any[];
  noon?: any;
  evening?: any;
  busId?: string;
  busDuration?: string;
  busHours?: number;
  busCost?: number;
  busActualCost?: number;
}

const CATEGORIES = [
  { id: 'bus', name: '大巴', icon: Bus },
  { id: 'teacher', name: '老师', icon: User },
  { id: 'venue', name: '场地', icon: MapPin },
  { id: 'visit', name: '参访', icon: Building },
  { id: 'catering', name: '餐饮', icon: Utensils },
  { id: 'transfer', name: '接送机', icon: Plane },
  { id: 'material', name: '物料', icon: Package },
  { id: 'hotel', name: '酒店', icon: Hotel },
  { id: 'other', name: '其他', icon: MoreHorizontal },
];

const COLORS = [
  { id: 'amber', name: '琥珀', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900', labelBg: 'bg-amber-100', labelText: 'text-amber-600', preview: 'bg-amber-500' },
  { id: 'rose', name: '玫瑰', bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-900', labelBg: 'bg-rose-100', labelText: 'text-rose-600', preview: 'bg-rose-500' },
  { id: 'blue', name: '蓝色', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900', labelBg: 'bg-blue-100', labelText: 'text-blue-600', preview: 'bg-blue-500' },
  { id: 'purple', name: '紫色', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-900', labelBg: 'bg-purple-100', labelText: 'text-purple-600', preview: 'bg-purple-500' },
  { id: 'emerald', name: '翡翠', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-900', labelBg: 'bg-emerald-100', labelText: 'text-emerald-600', preview: 'bg-emerald-500' },
];

export default function ExecutionProgress({ project, users, onUpdate }: ExecutionProgressProps) {
  const [classTeacherId, setClassTeacherId] = useState<string>(project.class_teacher_id || '');
  const [teamLeaderId, setTeamLeaderId] = useState<string>(project.team_leader_id || '');
  const [teamMemberIds, setTeamMemberIds] = useState<string[]>(project.team_member_ids || []);
  const [itinerary, setItinerary] = useState<ItineraryDay[]>([]);
  const [manualItems, setManualItems] = useState<ManualGanttItem[]>([]);
  const [checklists, setChecklists] = useState<ChecklistItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditingTeam, setIsEditingTeam] = useState(false);
  const [responsiblePersonId, setResponsiblePersonId] = useState<string>('');
  
  // Modal state for adding items
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [selectedColor, setSelectedColor] = useState('amber');

  const currentUser = useAppStore(state => state.user);
  const isOpsDirector = currentUser?.role === '运营总监';
  const isOpsManager = currentUser?.role === '运营经理';
  const isProjectTeamMember = teamMemberIds.includes(currentUser?.id || '');
  const canOperate = isProjectTeamMember || isOpsManager || isOpsDirector;
  const opsManagers = users.filter(u => u.role === '运营经理');

  useEffect(() => {
    fetchData();
  }, [project.id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch from approved_project_itineraries for approved projects
      const [itineraryRes, checklistRes, manualRes, suppliersRes] = await Promise.all([
        supabase.from('approved_project_itineraries').select('*').eq('project_id', project.id).order('day_index', { ascending: true }),
        supabase.from('project_checklists').select('*').eq('project_id', project.id).order('created_at', { ascending: true }),
        supabase.from('project_gantt_manual_items').select('*').eq('project_id', project.id).order('start_time', { ascending: true }),
        supabase.from('suppliers').select('id, name, type')
      ]);

      console.log('=== ExecutionProgress Debug ===');
      console.log('Project ID:', project.id);
      console.log('Project Status:', project.status);
      console.log('Itinerary Response:', itineraryRes);
      console.log('Itinerary Data:', itineraryRes.data);
      console.log('Error:', itineraryRes.error);

      if (itineraryRes.data && itineraryRes.data.length > 0) {
        // 从 approved_project_itineraries 读取行程数据
        const formattedItinerary: ItineraryDay[] = itineraryRes.data.map((item: any) => ({
          id: item.id,
          day_index: item.day_index,
          date: item.date || '',
          morning: item.morning || [],
          afternoon: item.afternoon || [],
          noon: item.noon || { supplierId: '', cost: 0, actualCost: 0 },
          evening: item.evening || { supplierId: '', cost: 0, actualCost: 0 },
          busId: item.bus_id || item.busId || '',
          busDuration: item.bus_duration || item.busDuration || 'full',
          busHours: item.bus_hours || item.busHours || 0,
          busCost: item.bus_cost || item.busCost || 0,
          busActualCost: item.bus_actual_cost || item.busActualCost || 0,
        }));
        console.log('Formatted Itinerary (从 approved_project_itineraries):', formattedItinerary);
        setItinerary(formattedItinerary);
      } else {
        console.log('approved_project_itineraries 无数据，请先在详细行程页面点击"同步行程"');
        setItinerary([]);
      }
      if (checklistRes.data) setChecklists(checklistRes.data);
      if (manualRes.data) setManualItems(manualRes.data);
      if (suppliersRes.data) setSuppliers(suppliersRes.data);

      if (checklistRes.data && checklistRes.data.length === 0) {
        const initialChecklist = CATEGORIES.map(cat => ({
          project_id: project.id,
          category: cat.id,
          item: cat.name,
          status: false,
          notes: '',
          responsible_person_id: null
        }));
        const { data } = await supabase.from('project_checklists').insert(initialChecklist).select();
        if (data) setChecklists(data);
      }
    } catch (err) {
      console.error('Error fetching execution data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getSupplierName = (id: string) => {
    return suppliers.find(s => s.id === id)?.name || id;
  };

  // Calculate dates for Kanban columns
  const getKanbanDates = () => {
    console.log('getKanbanDates - itinerary:', itinerary);
    let startDate = itinerary.length > 0 && itinerary[0].date ? parseISO(itinerary[0].date) : new Date();
    let endDate = itinerary.length > 0 && itinerary[itinerary.length - 1].date ? parseISO(itinerary[itinerary.length - 1].date) : addDays(startDate, 7);

    console.log('Kanban startDate:', startDate, 'endDate:', endDate);

    const chartStart = subDays(startDate, 2);
    const chartEnd = addDays(endDate, 2);

    return eachDayOfInterval({ start: chartStart, end: chartEnd });
  };

  const handleSaveTeam = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('projects')
        .update({
          class_teacher_id: classTeacherId || null,
          team_member_ids: teamMemberIds
        })
        .eq('id', project.id);

      if (error) throw error;
      alert('团队指派成功！');
      setIsEditingTeam(false);
      onUpdate();
    } catch (err) {
      console.error('Error saving team:', err);
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const toggleChecklistItem = async (item: ChecklistItem) => {
    if (!canOperate) return;
    const newStatus = !item.status;
    try {
      const { error } = await supabase
        .from('project_checklists')
        .update({ status: newStatus })
        .eq('id', item.id);

      if (error) throw error;
      setChecklists(checklists.map(c => c.id === item.id ? { ...c, status: newStatus } : c));
    } catch (err) {
      console.error('Error updating checklist:', err);
    }
  };

  const updateChecklistNote = async (id: string, notes: string) => {
    if (!canOperate) return;
    try {
      const { error } = await supabase
        .from('project_checklists')
        .update({ notes })
        .eq('id', id);
      if (error) throw error;
      setChecklists(checklists.map(c => c.id === id ? { ...c, notes } : c));
    } catch (err) {
      console.error('Error updating note:', err);
    }
  };

  const updateChecklistResponsible = async (id: string, responsible_person_id: string | null) => {
    if (!canOperate) return;
    try {
      const { error } = await supabase
        .from('project_checklists')
        .update({ responsible_person_id })
        .eq('id', id);
      if (error) throw error;
      setChecklists(checklists.map(c => c.id === id ? { ...c, responsible_person_id } : c));
    } catch (err) {
      console.error('Error updating responsible person:', err);
    }
  };

  const updateItineraryResponsible = async (dayId: string, activityIndex: number, type: 'morning' | 'afternoon', responsible_person_id: string | null) => {
    if (!canOperate) return;
    const day = itinerary.find(d => d.id === dayId);
    if (!day) return;

    const updatedActivities = type === 'morning'
      ? day.morning.map((act, i) => i === activityIndex ? { ...act, responsible_person_id } : act)
      : day.afternoon.map((act, i) => i === activityIndex ? { ...act, responsible_person_id } : act);

    try {
      const { error } = await supabase
        .from('approved_project_itineraries')
        .update({ [type]: updatedActivities })
        .eq('id', dayId);
      if (error) throw error;
      setItinerary(itinerary.map(d => d.id === dayId ? { ...d, [type]: updatedActivities } : d));
    } catch (err) {
      console.error('Error updating itinerary responsible:', err);
    }
  };

  const addManualItem = async () => {
    if (!canOperate) return;
    if (!newItemName || !selectedDate) return;
    
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    const start = new Date(selectedDate);
    start.setHours(startH, startM, 0, 0);
    const end = new Date(selectedDate);
    end.setHours(endH, endM, 0, 0);

    try {
      const { data, error } = await supabase
        .from('project_gantt_manual_items')
        .insert({
          project_id: project.id,
          item_name: newItemName,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          color: selectedColor,
          responsible_person_id: responsiblePersonId || null
        })
        .select()
        .single();

      if (error) throw error;
      setManualItems([...manualItems, data]);
      setNewItemName('');
      setStartTime('09:00');
      setEndTime('18:00');
      setSelectedColor('amber');
      setShowAddModal(false);
    } catch (err) {
      console.error('Error adding manual item:', err);
      alert('添加失败');
    }
  };

  const deleteManualItem = async (id: string) => {
    if (!canOperate) return;
    if (!confirm('确定删除此事项吗？')) return;
    try {
      const { error } = await supabase.from('project_gantt_manual_items').delete().eq('id', id);
      if (error) throw error;
      setManualItems(manualItems.filter(i => i.id !== id));
    } catch (err) {
      console.error('Error deleting manual item:', err);
    }
  };

  const updateManualItemResponsible = async (id: string, responsible_person_id: string | null) => {
    if (!canOperate) return;
    try {
      const { error } = await supabase
        .from('project_gantt_manual_items')
        .update({ responsible_person_id })
        .eq('id', id);
      if (error) throw error;
      setManualItems(manualItems.map(i => i.id === id ? { ...i, responsible_person_id } : i));
    } catch (err) {
      console.error('Error updating responsible person:', err);
    }
  };

  if (loading) {
    return <div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600" /></div>;
  }

  const kanbanDates = getKanbanDates();
  const today = new Date();

  return (
    <div className="space-y-8">
      {/* Team Assignment */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <h3 className="text-lg font-bold text-slate-900">团队指派</h3>
          </div>
          <div className="flex items-center space-x-2">
            {!isEditingTeam && isOpsDirector && (
              <button
                onClick={() => setIsEditingTeam(true)}
                className="flex items-center px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium"
              >
                <Edit3 className="w-4 h-4 mr-2" />
                修改
              </button>
            )}
            {isEditingTeam && (
              <button
                onClick={handleSaveTeam}
                disabled={saving}
                className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                保存指派
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">班主任 (运营经理)</label>
            <select
              value={classTeacherId}
              onChange={(e) => setClassTeacherId(e.target.value)}
              disabled={!isEditingTeam}
              className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none disabled:bg-slate-50 disabled:text-slate-500"
            >
              <option value="">选择班主任</option>
              {opsManagers.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">项目团队成员 (多选)</label>
            <div className="flex flex-wrap gap-2 p-3 border border-slate-200 rounded-lg bg-slate-50 min-h-[42px]">
              {users.filter(u => u.role !== 'CEO' && u.role !== '管理员').map(u => (
                <label key={u.id} className={`flex items-center space-x-2 px-3 py-1 rounded-full border transition-colors ${
                  isEditingTeam ? 'cursor-pointer' : 'cursor-default'
                } ${
                  teamMemberIds.includes(u.id) 
                    ? 'bg-indigo-100 border-indigo-300 text-indigo-700' 
                    : 'bg-white border-slate-200 text-slate-600'
                }`}>
                  <input
                    type="checkbox"
                    checked={teamMemberIds.includes(u.id)}
                    disabled={!isEditingTeam}
                    onChange={(e) => {
                      if (e.target.checked) setTeamMemberIds([...teamMemberIds, u.id]);
                      else setTeamMemberIds(teamMemberIds.filter(id => id !== u.id));
                    }}
                    className="hidden"
                  />
                  <span className="text-xs font-medium">{u.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Kanban Board Section */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-indigo-600" />
            <h3 className="text-lg font-bold text-slate-900">执行看板 (按日历)</h3>
          </div>
          <div className="flex items-center space-x-4 text-xs text-slate-500">
            <div className="flex items-center space-x-1"><div className="w-2 h-2 bg-indigo-500 rounded-full"></div><span>参访</span></div>
            <div className="flex items-center space-x-1"><div className="w-2 h-2 bg-emerald-500 rounded-full"></div><span>授课</span></div>
            <div className="flex items-center space-x-1"><div className="w-2 h-2 bg-amber-500 rounded-full"></div><span>手动事项</span></div>
          </div>
        </div>

        <div className="flex space-x-4 overflow-x-auto pb-6 custom-scrollbar min-h-[400px]">
          {kanbanDates.map((date, idx) => {
            const dateStr = format(date, 'yyyy-MM-dd');
            const isToday = isSameDay(date, today);
            
            // Find itinerary activities for this date
            const dayItinerary = itinerary.find(d => d.date === dateStr);
            // Find manual items for this date
            const dayManualItems = manualItems.filter(item => isSameDay(parseISO(item.start_time), date));

            console.log(`Date: ${dateStr}, dayItinerary:`, dayItinerary, 'dayManualItems:', dayManualItems);

            return (
              <div 
                key={dateStr} 
                className={`flex-shrink-0 w-72 rounded-xl border transition-all ${
                  isToday ? 'border-indigo-500 bg-indigo-50/30' : 'border-slate-200 bg-slate-50/50'
                }`}
              >
                {/* Column Header */}
                <div className={`px-4 py-3 border-b rounded-t-xl flex justify-between items-center ${
                  isToday ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white text-slate-900 border-slate-100'
                }`}>
                  <div>
                    <div className="text-xs font-medium opacity-80">{format(date, 'EEEE', { locale: zhCN })}</div>
                    <div className="text-sm font-bold">{format(date, 'MM月dd日')}</div>
                  </div>
                  {isToday && <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full">今天</span>}
                </div>

                {/* Column Content */}
                <div className="p-3 space-y-3 min-h-[300px]">
                  {/* Itinerary Items */}
                  {dayItinerary?.morning.map((act: any, i: number) => (
                    <div key={`m-${i}`} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm group">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase">上午</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded text-white ${act.type === 'visit' ? 'bg-indigo-500' : 'bg-emerald-500'}`}>
                          {act.type === 'visit' ? '参访' : '授课'}
                        </span>
                      </div>
                      <div className="text-sm font-bold text-slate-800 mb-1">
                        {act.type === 'visit' ? getSupplierName(act.supplierId) : act.courseName || '未命名课程'}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center mb-1">
                        <MapPin className="w-3 h-3 mr-1" />
                        {act.type === 'visit' ? '参访地点' : getSupplierName(act.venueId)}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center">
                        <User className="w-3 h-3 mr-1" />
                        负责人: 
                        <select
                          value={act.responsible_person_id || ''}
                          onChange={(e) => updateItineraryResponsible(dayItinerary!.id, i, 'morning', e.target.value || null)}
                          disabled={!canOperate}
                          className="ml-1 text-[11px] border-none bg-transparent focus:ring-0 p-0 disabled:text-slate-400"
                        >
                          <option value="">未指派</option>
                          {users.filter(u => teamMemberIds.includes(u.id) || u.id === classTeacherId).map(u => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                          ))}
                        </select>
                      </div>
                      {act.type === 'teach' && (
                        <div className="text-[11px] text-slate-500 flex items-center mt-1">
                          <User className="w-3 h-3 mr-1" />
                          讲师: {getSupplierName(act.supplierId)}
                        </div>
                      )}
                    </div>
                  ))}

                  {dayItinerary?.afternoon.map((act: any, i: number) => (
                    <div key={`a-${i}`} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm group">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase">下午</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded text-white ${act.type === 'visit' ? 'bg-indigo-500' : 'bg-emerald-500'}`}>
                          {act.type === 'visit' ? '参访' : '授课'}
                        </span>
                      </div>
                      <div className="text-sm font-bold text-slate-800 mb-1">
                        {act.type === 'visit' ? getSupplierName(act.supplierId) : act.courseName || '未命名课程'}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center mb-1">
                        <MapPin className="w-3 h-3 mr-1" />
                        {act.type === 'visit' ? '参访地点' : getSupplierName(act.venueId)}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center">
                        <User className="w-3 h-3 mr-1" />
                        负责人: 
                        <select
                          value={act.responsible_person_id || ''}
                          onChange={(e) => updateItineraryResponsible(dayItinerary!.id, i, 'afternoon', e.target.value || null)}
                          disabled={!canOperate}
                          className="ml-1 text-[11px] border-none bg-transparent focus:ring-0 p-0 disabled:text-slate-400"
                        >
                          <option value="">未指派</option>
                          {users.filter(u => teamMemberIds.includes(u.id) || u.id === classTeacherId).map(u => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                          ))}
                        </select>
                      </div>
                      {act.type === 'teach' && (
                        <div className="text-[11px] text-slate-500 flex items-center mt-1">
                          <User className="w-3 h-3 mr-1" />
                          讲师: {getSupplierName(act.supplierId)}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Manual Items */}
                  {dayManualItems.map((item) => {
                    const colorCfg = COLORS.find(c => c.id === item.color) || COLORS[0];
                    return (
                      <div key={item.id} className={`${colorCfg.bg} p-3 rounded-lg border ${colorCfg.border} shadow-sm group`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[10px] font-bold ${colorCfg.labelText} ${colorCfg.labelBg} px-2 py-0.5 rounded uppercase`}>事项</span>
                          <button 
                            onClick={() => deleteManualItem(item.id)}
                            disabled={!canOperate}
                            className={`opacity-0 group-hover:opacity-100 ${colorCfg.labelText} hover:text-red-500 transition-all ${!canOperate ? 'hidden' : ''}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <div className={`text-sm font-bold ${colorCfg.text} mb-1`}>{item.item_name}</div>
                        <div className={`text-[11px] ${colorCfg.text} opacity-70 flex items-center mb-1`}>
                          <Clock className="w-3 h-3 mr-1" />
                          {format(parseISO(item.start_time), 'HH:mm')} - {format(parseISO(item.end_time), 'HH:mm')}
                        </div>
                        <div className={`text-[11px] ${colorCfg.text} opacity-70 flex items-center`}>
                          <User className="w-3 h-3 mr-1" />
                          负责人: 
                          <select
                            value={item.responsible_person_id || ''}
                            onChange={(e) => updateManualItemResponsible(item.id, e.target.value || null)}
                            disabled={!canOperate}
                            className="ml-1 text-[11px] border-none bg-transparent focus:ring-0 p-0 disabled:text-slate-400"
                          >
                            <option value="">未指派</option>
                            {users.filter(u => teamMemberIds.includes(u.id) || u.id === classTeacherId).map(u => (
                              <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}

                  {/* Add Button */}
                  <button 
                    onClick={() => {
                      setSelectedDate(date);
                      setShowAddModal(true);
                    }}
                    className="w-full py-2 border-2 border-dashed border-slate-200 rounded-lg text-slate-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-white transition-all flex items-center justify-center text-sm font-medium"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    添加事项
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Checklist Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <CheckSquare className="w-5 h-5 text-indigo-600" />
            <h3 className="text-lg font-bold text-slate-900">准备事项清单 (Checklist)</h3>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs font-medium uppercase tracking-wider">
                <th className="px-6 py-3 w-16">状态</th>
                <th className="px-6 py-3 w-48">准备主题</th>
                <th className="px-6 py-3 w-48">负责人</th>
                <th className="px-6 py-3">备注信息 (自动保存)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {CATEGORIES.map(cat => {
                const Icon = cat.icon;
                const item = checklists.find(c => c.category === cat.id);
                if (!item) return null;

                return (
                  <tr key={cat.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => toggleChecklistItem(item)}
                        disabled={!canOperate}
                        className={`w-6 h-6 flex items-center justify-center rounded border transition-all ${
                          item.status 
                            ? 'bg-emerald-500 border-emerald-500 text-white' 
                            : 'bg-white border-slate-300 text-transparent hover:border-indigo-400'
                        } ${!canOperate ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <CheckSquare className="w-4 h-4" />
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <Icon className={`w-4 h-4 ${item.status ? 'text-slate-300' : 'text-slate-400'}`} />
                        <span className={`text-sm font-bold ${item.status ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                          {cat.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={item.responsible_person_id || ''}
                        onChange={(e) => updateChecklistResponsible(item.id, e.target.value || null)}
                        disabled={!canOperate}
                        className="w-full text-xs border-slate-200 rounded-md focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
                      >
                        <option value="">选择负责人</option>
                        {users.filter(u => teamMemberIds.includes(u.id) || u.id === classTeacherId).map(u => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      <input
                        type="text"
                        defaultValue={item.notes || ''}
                        onBlur={(e) => updateChecklistNote(item.id, e.target.value)}
                        disabled={!canOperate}
                        placeholder={`填写${cat.name}相关备注...`}
                        className="w-full bg-transparent border-none focus:ring-0 text-sm text-slate-600 placeholder:text-slate-300 outline-none disabled:text-slate-400"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-900">添加事项 - {selectedDate && format(selectedDate, 'MM月dd日')}</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">事项名称</label>
                <input 
                  type="text" 
                  autoFocus
                  placeholder="例如: 接机、送机、准备物料" 
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">开始时间</label>
                  <input 
                    type="time" 
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">结束时间</label>
                  <input 
                    type="time" 
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">负责人</label>
                <select
                  value={responsiblePersonId}
                  onChange={(e) => setResponsiblePersonId(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">选择负责人</option>
                  {users.filter(u => teamMemberIds.includes(u.id) || u.id === classTeacherId).map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">标签颜色</label>
                <div className="flex space-x-3">
                  {COLORS.map(color => (
                    <button
                      key={color.id}
                      onClick={() => setSelectedColor(color.id)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        selectedColor === color.id ? 'border-indigo-600 scale-110 shadow-md' : 'border-transparent'
                      } ${color.preview}`}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 flex justify-end space-x-3">
              <button 
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800"
              >
                取消
              </button>
              <button 
                onClick={addManualItem}
                disabled={!newItemName}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                确认添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
