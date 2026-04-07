import React, { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, Building, Users, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store';
import { useNavigate } from 'react-router-dom';
import { format, addDays, isSameDay, parseISO } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface ProjectAssignment {
  project_id: string;
  project_name: string;
  project_code: string;
  date: string;
  day_index: number;
  activities: Array<{
    type: 'visit' | 'teach';
    period: 'morning' | 'afternoon';
    name: string;
    location?: string;
  }>;
  manual_items: Array<{
    item_name: string;
    start_time: string;
    end_time: string;
  }>;
}

export default function MyProjectsCalendar() {
  const { user } = useAppStore();
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<ProjectAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(new Date());

  const endDate = addDays(startDate, 13); // 显示 14 天

  useEffect(() => {
    if (user) {
      fetchAssignments();
    }
  }, [user]);

  const fetchAssignments = async () => {
    try {
      setLoading(true);

      // 1. 获取所有该用户参与的项目（作为团队成员或班主任）
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name, code, class_teacher_id, team_member_ids')
        .eq('status', '已通过');

      if (!projects || projects.length === 0) {
        setAssignments([]);
        setLoading(false);
        return;
      }

      // 筛选出用户参与的项目
      const userProjectIds = projects
        .filter(p =>
          p.class_teacher_id === user.id ||
          (p.team_member_ids && p.team_member_ids.includes(user.id))
        )
        .map(p => p.id);

      if (userProjectIds.length === 0) {
        setAssignments([]);
        setLoading(false);
        return;
      }

      // 2. 获取这些项目的行程数据
      const { data: itineraries } = await supabase
        .from('approved_project_itineraries')
        .select('project_id, day_index, date, morning, afternoon, noon, evening')
        .in('project_id', userProjectIds)
        .order('date', { ascending: true });

      // 3. 获取手动添加的事项
      const { data: manualItems } = await supabase
        .from('project_gantt_manual_items')
        .select('project_id, item_name, start_time, end_time, responsible_person_id')
        .in('project_id', userProjectIds)
        .eq('responsible_person_id', user.id);

      // 4. 获取供应商名称映射
      const supplierIds = new Set<string>();
      itineraries?.forEach(it => {
        it.morning?.forEach((act: any) => {
          if (act.supplierId) supplierIds.add(act.supplierId);
          if (act.venueId) supplierIds.add(act.venueId);
        });
        it.afternoon?.forEach((act: any) => {
          if (act.supplierId) supplierIds.add(act.supplierId);
          if (act.venueId) supplierIds.add(act.venueId);
        });
      });

      let supplierMap: Record<string, string> = {};
      if (supplierIds.size > 0) {
        const { data: supplierData } = await supabase
          .from('suppliers')
          .select('id, name')
          .in('id', Array.from(supplierIds));

        supplierMap = Object.fromEntries(supplierData?.map(s => [s.id, s.name]) || []);
      }

      // 5. 按日期分组数据
      const projectMap = Object.fromEntries(projects.map(p => [p.id, p]));
      const assignmentMap = new Map<string, ProjectAssignment>();

      // 处理行程数据
      itineraries?.forEach(it => {
        const key = `${it.project_id}-${it.date}`;
        if (!assignmentMap.has(key)) {
          assignmentMap.set(key, {
            project_id: it.project_id,
            project_name: projectMap[it.project_id]?.name || '',
            project_code: projectMap[it.project_id]?.code || '',
            date: it.date,
            day_index: it.day_index,
            activities: [],
            manual_items: [],
          });
        }

        const assignment = assignmentMap.get(key)!;

        // 添加上午活动 - 检查负责人是否为用户
        if (it.morning && it.morning.length > 0) {
          it.morning.forEach((act: any) => {
            // 如果没有指定负责人，则显示给所有团队成员；或者负责人是该用户
            if (!act.responsible_person_id || act.responsible_person_id === user.id) {
              const supplierName = act.supplierId ? supplierMap[act.supplierId] : (act.venueId ? supplierMap[act.venueId] : '');
              assignment.activities.push({
                type: act.type,
                period: 'morning',
                name: act.type === 'visit'
                  ? (supplierName || '参访')
                  : (act.courseName || '授课'),
                location: act.type === 'visit' ? undefined : (supplierName || '场地'),
              });
            }
          });
        }

        // 添加下午活动
        if (it.afternoon && it.afternoon.length > 0) {
          it.afternoon.forEach((act: any) => {
            if (!act.responsible_person_id || act.responsible_person_id === user.id) {
              const supplierName = act.supplierId ? supplierMap[act.supplierId] : (act.venueId ? supplierMap[act.venueId] : '');
              assignment.activities.push({
                type: act.type,
                period: 'afternoon',
                name: act.type === 'visit'
                  ? (supplierName || '参访')
                  : (act.courseName || '授课'),
                location: act.type === 'visit' ? undefined : (supplierName || '场地'),
              });
            }
          });
        }
      });

      // 处理手动事项
      manualItems?.forEach(item => {
        const dateStr = format(parseISO(item.start_time), 'yyyy-MM-dd');
        const key = `${item.project_id}-${dateStr}`;

        if (!assignmentMap.has(key)) {
          assignmentMap.set(key, {
            project_id: item.project_id,
            project_name: projectMap[item.project_id]?.name || '',
            project_code: projectMap[item.project_id]?.code || '',
            date: dateStr,
            day_index: 0,
            activities: [],
            manual_items: [],
          });
        }

        assignmentMap.get(key)!.manual_items.push({
          item_name: item.item_name,
          start_time: item.start_time,
          end_time: item.end_time,
        });
      });

      // 转换为数组并按日期排序
      const assignmentList = Array.from(assignmentMap.values())
        .filter(a => a.activities.length > 0 || a.manual_items.length > 0)
        .sort((a, b) => {
          const dateA = parseISO(a.date).getTime();
          const dateB = parseISO(b.date).getTime();
          return dateA - dateB;
        });

      setAssignments(assignmentList);
    } catch (err) {
      console.error('Error fetching assignments:', err);
    } finally {
      setLoading(false);
    }
  };

  const getAssignmentsForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return assignments.filter(a => a.date === dateStr);
  };

  const getPeriodActivities = (assignment: ProjectAssignment, period: 'morning' | 'afternoon') => {
    return assignment.activities.filter(a => a.period === period);
  };

  const previousWeek = () => setStartDate(addDays(startDate, -7));
  const nextWeek = () => setStartDate(addDays(startDate, 7));
  const goToToday = () => setStartDate(new Date());

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
        <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-900">暂无任务安排</h3>
        <p className="text-slate-500 mt-2">您目前没有被分配到任何项目的任务</p>
      </div>
    );
  }

  const today = new Date();

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h3 className="text-lg font-bold text-slate-900">我参与的项目</h3>
          <div className="flex items-center space-x-2 text-sm text-slate-600">
            <span>{format(startDate, 'MM 月 dd 日')}</span>
            <span>-</span>
            <span>{format(endDate, 'MM 月 dd 日')}</span>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={previousWeek}
            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            今天
          </button>
          <button
            onClick={nextWeek}
            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-px bg-slate-200">
        {/* Weekday Headers */}
        {['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map(day => (
          <div key={day} className="bg-slate-50 px-3 py-2 text-center text-xs font-medium text-slate-600">
            {day}
          </div>
        ))}

        {/* Calendar Days */}
        {Array.from({ length: 14 }).map((_, i) => {
          const date = addDays(startDate, i);
          const isToday = isSameDay(date, today);
          const dayAssignments = getAssignmentsForDate(date);
          const isPast = date < new Date().setHours(0, 0, 0, 0);

          return (
            <div
              key={i}
              className={`bg-white min-h-[150px] p-2 ${isPast ? 'bg-slate-50/50' : ''}`}
            >
              {/* Date Header */}
              <div className={`flex items-center justify-between mb-2 ${
                isToday ? 'text-indigo-600' : 'text-slate-700'
              }`}>
                <span className={`text-sm font-medium ${isToday ? 'font-bold' : ''}`}>
                  {format(date, 'MM/dd')}
                </span>
                {isToday && (
                  <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">
                    今天
                  </span>
                )}
              </div>

              {/* Assignments */}
              <div className="space-y-1.5">
                {dayAssignments.map((assignment, idx) => (
                  <div
                    key={idx}
                    onClick={() => navigate(`/projects/${assignment.project_id}?tab=progress`)}
                    className="text-xs bg-indigo-50 border border-indigo-100 rounded p-1.5 hover:bg-indigo-100 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-indigo-900 truncate text-[10px]">
                        {assignment.project_code}
                      </span>
                    </div>
                    <div className="text-[10px] text-indigo-700 truncate mb-1">
                      {assignment.project_name}
                    </div>

                    {/* Morning Activities */}
                    {getPeriodActivities(assignment, 'morning').length > 0 && (
                      <div className="mb-1">
                        <span className="text-[9px] font-bold text-indigo-500 bg-indigo-50 px-1 rounded uppercase">上午</span>
                        {getPeriodActivities(assignment, 'morning').map((act, i) => (
                          <div key={i} className="text-[9px] text-indigo-700 mt-0.5 flex items-center">
                            {act.type === 'visit' ? (
                              <MapPin className="w-2.5 h-2.5 mr-1" />
                            ) : (
                              <Building className="w-2.5 h-2.5 mr-1" />
                            )}
                            <span className="truncate">{act.name}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Afternoon Activities */}
                    {getPeriodActivities(assignment, 'afternoon').length > 0 && (
                      <div>
                        <span className="text-[9px] font-bold text-blue-500 bg-blue-50 px-1 rounded uppercase">下午</span>
                        {getPeriodActivities(assignment, 'afternoon').map((act, i) => (
                          <div key={i} className="text-[9px] text-blue-700 mt-0.5 flex items-center">
                            {act.type === 'visit' ? (
                              <MapPin className="w-2.5 h-2.5 mr-1" />
                            ) : (
                              <Building className="w-2.5 h-2.5 mr-1" />
                            )}
                            <span className="truncate">{act.name}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Manual Items */}
                    {assignment.manual_items.map((item, i) => (
                      <div key={i} className="text-[9px] text-amber-700 mt-1 flex items-center">
                        <Clock className="w-2.5 h-2.5 mr-1" />
                        <span className="truncate">{item.item_name}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
