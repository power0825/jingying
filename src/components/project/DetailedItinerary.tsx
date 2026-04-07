import React, { useState, useEffect } from 'react';
import { Map, Upload, CheckCircle, Edit2, Save, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Project } from '../../types/project';
import { Supplier } from '../../types/supplier';

interface DetailedItineraryProps {
  project: Project;
}

interface Activity {
  id: string;
  type: 'visit' | 'teach';
  supplierId: string;
  courseName?: string;
  language?: string;
  hours?: number;
  billingType?: 'hour' | 'half_day' | 'day';
  venueId?: string;
  venueBillingType?: 'hour' | 'half_day' | 'day';
  venueHours?: number;
  venueCost?: number;
  venueActualCost?: number;
  cost: number;
  actualCost?: number;
}

interface Meal {
  supplierId: string;
  cost: number;
  actualCost?: number;
}

interface DailySchedule {
  day: number;
  date?: string;
  morning: Activity[];
  noon: Meal;
  afternoon: Activity[];
  evening: Meal;
  busId: string;
  busDuration?: 'hour' | 'half' | 'full' | 'none';
  busHours?: number;
  busCost: number;
  busActualCost?: number;
}

interface HotelArrangement {
  hotelId: string;
  nights: number;
  peoplePerRoom: number;
  cost: number;
  actualCost?: number;
}

export default function DetailedItinerary({ project }: DetailedItineraryProps) {
  const [schedule, setSchedule] = useState<DailySchedule[]>([]);
  const [hotelArrangement, setHotelArrangement] = useState<HotelArrangement>({
    hotelId: '',
    nights: 0,
    peoplePerRoom: 2,
    cost: 0,
    actualCost: 0,
  });
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCost, setTotalCost] = useState<number>(0);
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string>('');
  const [editing, setEditing] = useState(false);
  const [originalSchedule, setOriginalSchedule] = useState<DailySchedule[]>([]);
  const [originalHotelArrangement, setOriginalHotelArrangement] = useState<HotelArrangement | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string>('');

  useEffect(() => {
    fetchData();
  }, [project.id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch suppliers
      const { data: suppliersData } = await supabase.from('suppliers').select('*');
      if (suppliersData) setSuppliers(suppliersData);

      // 只从 approved_project_itineraries 表读取
      const { data: itineraries, error } = await supabase
        .from('approved_project_itineraries')
        .select('*')
        .eq('project_id', project.id)
        .order('day_index', { ascending: true });

      if (error) {
        console.error('Error fetching approved itineraries:', error);
      }

      if (itineraries && itineraries.length > 0) {
        console.log('已从 approved_project_itineraries 加载行程数据');
        const formattedSchedule: DailySchedule[] = itineraries.map((item: any) => ({
          day: item.day_index,
          date: item.date || '',
          morning: item.morning || [],
          noon: item.noon || { supplierId: '', cost: 0, actualCost: 0 },
          afternoon: item.afternoon || [],
          evening: item.evening || { supplierId: '', cost: 0, actualCost: 0 },
          busId: item.bus_id || item.busId || '',
          busDuration: item.bus_duration || item.busDuration || 'full',
          busHours: item.bus_hours || item.busHours || 0,
          busCost: item.bus_cost || item.busCost || 0,
          busActualCost: item.bus_actual_cost || item.busActualCost || 0,
        }));
        setSchedule(formattedSchedule);
        setSynced(true);

        // 从第一天的 hotel_arrangement 读取酒店信息
        const firstDay = itineraries.find(d => d.day_index === 1 || d.day_index === 0);
        if (firstDay?.hotel_arrangement) {
          setHotelArrangement(firstDay.hotel_arrangement);
        } else if (itineraries.length > 0 && itineraries[0].hotel_arrangement) {
          setHotelArrangement(itineraries[0].hotel_arrangement);
        }
      } else {
        console.log('approved_project_itineraries 无数据');
        setSchedule([]);
        setSynced(false);
      }
    } catch (err) {
      console.error('Error fetching itineraries:', err);
      setSchedule([]);
      setSynced(false);
    } finally {
      setLoading(false);
    }
  };

  const syncToApproved = async () => {
    setSyncing(true);
    setSyncMessage('');
    try {
      // 从 project.itinerary 读取行程数据
      const scheduleData = project.itinerary?.schedule || [];
      const hotelArrangement = project.itinerary?.hotelArrangement || null;

      if (scheduleData.length === 0) {
        setSyncMessage('❌ 没有找到行程数据，请先在立项阶段完善行程信息');
        setSyncing(false);
        return;
      }

      // 检查是否已存在数据
      const { data: existing } = await supabase
        .from('approved_project_itineraries')
        .select('id')
        .eq('project_id', project.id)
        .limit(1);

      if (existing && existing.length > 0) {
        setSyncMessage('⚠️ 行程数据已存在，请勿重复同步');
        setSyncing(false);
        return;
      }

      // 构建插入数据 - 只在第一天写入酒店安排
      const itineraryToInsert = scheduleData.map((day: any, index: number) => ({
        project_id: project.id,
        day_index: day.day ?? index,
        date: day.date || null,
        morning: day.morning || [],
        afternoon: day.afternoon || [],
        noon: day.noon || { supplierId: '', cost: 0, actualCost: 0 },
        evening: day.evening || { supplierId: '', cost: 0, actualCost: 0 },
        bus_id: day.busId || '',
        bus_duration: day.busDuration || 'full',
        bus_hours: day.busHours || 0,
        bus_cost: day.busCost || 0,
        bus_actual_cost: day.busActualCost || 0,
        // 只在第一天（索引 0）写入酒店安排
        hotel_arrangement: index === 0 ? hotelArrangement : null,
      }));

      console.log('准备插入的数据:', itineraryToInsert);
      console.log('酒店安排数据:', hotelArrangement);
      console.log('第一天数据中的 hotel_arrangement:', itineraryToInsert.find(d => d.day_index === 1 || d.day_index === 0)?.hotel_arrangement);

      const { error: insertError } = await supabase
        .from('approved_project_itineraries')
        .insert(itineraryToInsert);

      if (insertError) throw insertError;

      // 同时更新 projects.hotel_arrangement 保持向后兼容
      if (hotelArrangement) {
        const { error: hotelError } = await supabase
          .from('projects')
          .update({ hotel_arrangement: hotelArrangement })
          .eq('id', project.id);

        if (hotelError) console.error('更新酒店安排失败:', hotelError);
      }

      setSyncMessage(isResync ? '✅ 重新同步成功！' : '✅ 行程同步成功！');
      setSynced(true);
      fetchData(); // Reload data
    } catch (err: any) {
      console.error('Error syncing itinerary:', err);
      setSyncMessage(`❌ 同步失败：${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleEdit = () => {
    setOriginalSchedule([...schedule]);
    setOriginalHotelArrangement({ ...hotelArrangement });
    setEditing(true);
    setSaveMessage('');
  };

  const handleCancel = () => {
    if (originalSchedule.length > 0) {
      setSchedule(originalSchedule);
    }
    if (originalHotelArrangement) {
      setHotelArrangement(originalHotelArrangement);
    }
    setEditing(false);
    setSaveMessage('');
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage('');
    try {
      // 构建更新数据
      const updates = schedule.map((day, index) => ({
        day_index: day.day,
        date: day.date || null,
        morning: day.morning || [],
        afternoon: day.afternoon || [],
        noon: day.noon || { supplierId: '', cost: 0, actualCost: 0 },
        evening: day.evening || { supplierId: '', cost: 0, actualCost: 0 },
        bus_id: day.busId || '',
        bus_duration: day.busDuration || 'full',
        bus_hours: day.busHours || 0,
        bus_cost: day.busCost || 0,
        bus_actual_cost: day.busActualCost || 0,
        // 只在第一天更新酒店安排
        hotel_arrangement: index === 0 ? hotelArrangement : null,
        updated_at: new Date().toISOString(),
      }));

      console.log('准备更新的数据:', updates);

      // 使用 upsert 方式更新（如果不存在则插入）
      const { error } = await supabase
        .from('approved_project_itineraries')
        .upsert(updates, { onConflict: 'project_id,day_index' })
        .eq('project_id', project.id);

      if (error) throw error;

      setSaveMessage('✅ 保存成功！');
      setEditing(false);
      setOriginalSchedule([]);
      setOriginalHotelArrangement(null);
      fetchData(); // Reload to refresh
    } catch (err: any) {
      console.error('Error saving itinerary:', err);
      setSaveMessage(`❌ 保存失败：${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const updateDayCost = (dayIndex: number, cost: number) => {
    const newSchedule = [...schedule];
    newSchedule[dayIndex].busCost = cost;
    setSchedule(newSchedule);
  };

  const updateDayBusDuration = (dayIndex: number, duration: 'hour' | 'half' | 'full' | 'none') => {
    const newSchedule = [...schedule];
    newSchedule[dayIndex].busDuration = duration;
    setSchedule(newSchedule);
  };

  const updateDayBusHours = (dayIndex: number, hours: number) => {
    const newSchedule = [...schedule];
    newSchedule[dayIndex].busHours = hours;
    setSchedule(newSchedule);
  };

  // Calculate total cost
  useEffect(() => {
    let totalCost = 0;
    let totalActualCost = 0;

    // Hotel cost
    totalCost += hotelArrangement.cost || 0;
    totalActualCost += hotelArrangement.actualCost || 0;

    // Schedule costs
    schedule.forEach(day => {
      day.morning.forEach(act => {
        totalCost += act.cost || 0;
        totalActualCost += act.actualCost || 0;
        if (act.venueCost) {
          totalCost += act.venueCost;
          totalActualCost += act.venueActualCost || 0;
        }
      });
      day.afternoon.forEach(act => {
        totalCost += act.cost || 0;
        totalActualCost += act.actualCost || 0;
        if (act.venueCost) {
          totalCost += act.venueCost;
          totalActualCost += act.venueActualCost || 0;
        }
      });
      totalCost += day.noon?.cost || 0;
      totalActualCost += day.noon?.actualCost || 0;
      totalCost += day.evening?.cost || 0;
      totalActualCost += day.evening?.actualCost || 0;
      totalCost += day.busCost || 0;
      totalActualCost += day.busActualCost || 0;
    });

    setTotalCost(totalCost);
  }, [schedule, hotelArrangement]);

  if (loading) {
    return <div className="p-8 text-center text-slate-500">加载中...</div>;
  }

  if (schedule.length === 0) {
    return (
      <div className="space-y-4">
        {/* Sync Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => syncToApproved(false)}
            disabled={syncing}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncing ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                同步中...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                同步行程
              </>
            )}
          </button>
        </div>
        {syncMessage && (
          <div className={`p-3 rounded-lg text-sm ${syncMessage.includes('✅') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {syncMessage}
          </div>
        )}
        {/* Empty State */}
        <div className="p-8 text-center text-slate-500">
          <Map className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p>行程数据尚未同步</p>
          <p className="text-sm text-slate-400 mt-1">请点击上方的"同步行程"按钮</p>
        </div>
      </div>
    );
  }

  const renderActivityRow = (act: Activity, dayIndex?: number, actIndex?: number, period?: 'morning' | 'afternoon') => {
    const supplier = suppliers.find(s => s.id === act.supplierId);
    const venue = act.venueId ? suppliers.find(s => s.id === act.venueId) : null;

    return (
      <div key={act.id} className="flex items-start gap-2 p-2 bg-slate-50 rounded border border-slate-100 mb-2">
        <span className={`text-xs px-2 py-1 rounded text-white mt-1 ${act.type === 'visit' ? 'bg-indigo-500' : 'bg-emerald-500'}`}>
          {act.type === 'visit' ? '参访' : '授课'}
        </span>
        <div className="flex-1 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
            <div className="text-sm text-slate-900 font-medium">
              {editing && dayIndex !== undefined && actIndex !== undefined && period ? (
                <select
                  value={act.supplierId}
                  onChange={(e) => {
                    const newSchedule = [...schedule];
                    newSchedule[dayIndex][period][actIndex].supplierId = e.target.value;
                    setSchedule(newSchedule);
                  }}
                  className="w-full text-sm border border-slate-300 rounded px-1 py-0.5 bg-white"
                >
                  <option value="">未选择</option>
                  {suppliers.filter(s => ['学校', '参访点'].includes(s.type)).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              ) : (
                supplier?.name || '未选择'
              )}
            </div>

            {act.type === 'teach' && (
              <>
                <div className="text-xs text-slate-500">
                  {act.billingType === 'hour' ? `按小时 × ${act.hours || 0}小时` :
                   act.billingType === 'half_day' ? '按半天' : '按全天'}
                </div>
                <div className="text-xs text-slate-500">
                  {act.courseName || '无课程名称'} {act.language ? `- ${act.language}` : ''}
                </div>
                <div className="text-right text-sm font-medium text-slate-700">
                  ¥{(act.cost || 0).toLocaleString()}
                </div>
              </>
            )}

            {act.type === 'visit' && (
              <div className="sm:col-span-3 text-right text-sm font-medium text-slate-700">
                ¥{(act.cost || 0).toLocaleString()}
              </div>
            )}
          </div>

          {act.type === 'teach' && act.venueId && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center mt-2 pt-2 border-t border-slate-200">
              <div className="text-xs text-slate-500">
                场地：{venue?.name || '未选择'}
              </div>
              <div className="text-xs text-slate-500">
                {act.venueBillingType === 'hour' ? `按小时 × ${act.venueHours || 0}小时` :
                 act.venueBillingType === 'half_day' ? '按半天' : '按全天'}
              </div>
              <div></div>
              <div className="text-right text-sm font-medium text-slate-700">
                场地费：¥{(act.venueCost || 0).toLocaleString()}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header with Sync and Edit Buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        {!synced && (
          <button
            onClick={() => syncToApproved(false)}
            disabled={syncing}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncing ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                同步中...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                同步行程
              </>
            )}
          </button>
        )}
        {synced && !editing && (
          <>
            <button
              disabled
              className="flex items-center gap-2 bg-slate-300 text-slate-500 px-4 py-2 rounded-lg text-sm font-medium cursor-not-allowed"
            >
              <Edit2 className="w-4 h-4" />
              修改行程
            </button>
          </>
        )}
        {editing && (
          <>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  保存修改
                </>
              )}
            </button>
            <button
              onClick={handleCancel}
              disabled={saving}
              className="flex items-center gap-2 bg-slate-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X className="w-4 h-4" />
              取消
            </button>
          </>
        )}
      </div>
      {(syncMessage || saveMessage) && (
        <div className={`p-3 rounded-lg text-sm ${(syncMessage?.includes('✅') || saveMessage?.includes('✅')) ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {syncMessage || saveMessage}
        </div>
      )}

      {/* Total Reference Price Display */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-emerald-900">总参考价格：</span>
            <span className="text-2xl font-bold text-emerald-600">¥{totalCost.toLocaleString()}</span>
          </div>
          <div className="text-xs text-emerald-700">
            <span className="mr-3">人数：{project.participants}</span>
            <span>执行天数：{project.execution_days}</span>
          </div>
        </div>
      </div>

      {/* Hotel Arrangement */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 shadow-sm">
        <h4 className="text-sm font-medium text-slate-900 mb-3 flex items-center">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mr-2"></span>
          统一酒店安排
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">选择酒店</label>
            {editing ? (
              <select
                value={hotelArrangement.hotelId}
                onChange={(e) => setHotelArrangement({ ...hotelArrangement, hotelId: e.target.value })}
                className="w-full text-sm border border-slate-300 rounded px-2 py-1 bg-white"
              >
                <option value="">未选择</option>
                {suppliers.filter(s => s.type === '酒店').map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            ) : (
              <div className="text-sm text-slate-900 py-1">
                {suppliers.find(s => s.id === hotelArrangement.hotelId)?.name || '-'}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">入住晚数</label>
            {editing ? (
              <input
                type="number"
                value={hotelArrangement.nights}
                onChange={(e) => setHotelArrangement({ ...hotelArrangement, nights: parseInt(e.target.value) || 0 })}
                className="w-full text-sm border border-slate-300 rounded px-2 py-1"
              />
            ) : (
              <div className="text-sm text-slate-900 py-1">{hotelArrangement.nights} 晚</div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">每间人数</label>
            {editing ? (
              <select
                value={hotelArrangement.peoplePerRoom}
                onChange={(e) => setHotelArrangement({ ...hotelArrangement, peoplePerRoom: parseInt(e.target.value) })}
                className="w-full text-sm border border-slate-300 rounded px-2 py-1 bg-white"
              >
                <option value="1">1 人</option>
                <option value="2">2 人</option>
                <option value="3">3 人</option>
                <option value="4">4 人</option>
              </select>
            ) : (
              <div className="text-sm text-slate-900 py-1">{hotelArrangement.peoplePerRoom} 人</div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">酒店总成本 (¥)</label>
            {editing ? (
              <input
                type="number"
                value={hotelArrangement.cost}
                onChange={(e) => setHotelArrangement({ ...hotelArrangement, cost: parseFloat(e.target.value) || 0 })}
                className="w-full text-sm border border-slate-300 rounded px-2 py-1"
              />
            ) : (
              <div className="text-sm font-bold text-indigo-600 py-1">¥{(hotelArrangement.cost || 0).toLocaleString()}</div>
            )}
          </div>
        </div>
      </div>

      {/* Daily Schedule */}
      <div className="max-h-[600px] overflow-y-auto custom-scrollbar border border-slate-200 rounded-lg">
        <div className="p-4 space-y-4">
          {schedule.map((day, dayIndex) => (
            <div key={dayIndex} className="border border-slate-200 rounded-lg overflow-hidden">
              {/* Day Header */}
              <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-800 whitespace-nowrap">第 {day.day} 天 {day.date && `(${day.date})`}</span>
                <div className="flex-1" />
                <div className="flex items-center flex-wrap gap-2">
                  <span className="text-xs text-slate-500 whitespace-nowrap">大巴:</span>
                  {editing ? (
                    <>
                      <select
                        value={day.busId}
                        onChange={(e) => {
                          const newSchedule = [...schedule];
                          newSchedule[dayIndex].busId = e.target.value;
                          setSchedule(newSchedule);
                        }}
                        className="text-xs border border-slate-300 rounded px-1 py-0.5 bg-white"
                      >
                        <option value="">不需要大巴</option>
                        {suppliers.filter(s => s.type === '大巴').map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      <select
                        value={day.busDuration}
                        onChange={(e) => updateDayBusDuration(dayIndex, e.target.value as 'hour' | 'half' | 'full' | 'none')}
                        className="text-xs border border-slate-300 rounded px-1 py-0.5 bg-white"
                      >
                        <option value="none">不需要</option>
                        <option value="hour">按小时</option>
                        <option value="half">半天</option>
                        <option value="full">全天</option>
                      </select>
                      {day.busDuration === 'hour' && (
                        <input
                          type="number"
                          value={day.busHours}
                          onChange={(e) => updateDayBusHours(dayIndex, parseInt(e.target.value) || 0)}
                          className="w-16 text-xs border border-slate-300 rounded px-1 py-0.5"
                          placeholder="小时"
                        />
                      )}
                      <input
                        type="number"
                        value={day.busCost}
                        onChange={(e) => updateDayCost(dayIndex, parseFloat(e.target.value) || 0)}
                        className="w-24 text-xs border border-slate-300 rounded px-1 py-0.5"
                        placeholder="费用"
                      />
                    </>
                  ) : (
                    <>
                      <div className="text-xs text-slate-700">
                        {day.busId ? (
                          <>
                            <span>{suppliers.find(s => s.id === day.busId)?.name || '未知'}</span>
                            <span className="mx-1">|</span>
                            <span>
                              {day.busDuration === 'hour' ? `按小时 (${day.busHours}小时)` :
                               day.busDuration === 'half' ? '半天' :
                               day.busDuration === 'full' ? '全天' : '不需要'}
                            </span>
                          </>
                        ) : '不需要大巴'}
                      </div>
                      <div className="relative">
                        <span className="text-xs text-slate-500 mr-1">¥</span>
                        <span className="text-sm font-medium text-slate-700">{(day.busCost || 0).toLocaleString()}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Day Content */}
              <div className="p-4 space-y-4 bg-white">
                {/* Morning */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="text-sm font-medium text-slate-700 bg-amber-100 px-2 py-0.5 rounded">上午</h5>
                  </div>
                  {day.morning.length === 0 && <p className="text-xs text-slate-400 italic ml-2">暂无安排</p>}
                  <div className="space-y-2">
                    {day.morning.map((act, idx) => renderActivityRow(act, dayIndex, idx, 'morning'))}
                  </div>
                </div>

                {/* Noon */}
                <div className="flex items-center gap-2 py-2 bg-orange-50 rounded px-3">
                  <span className="text-sm font-medium text-slate-700 w-10 bg-orange-100 px-1.5 py-0.5 rounded text-center">午餐</span>
                  {editing ? (
                    <>
                      <select
                        value={day.noon.supplierId}
                        onChange={(e) => {
                          const newSchedule = [...schedule];
                          newSchedule[dayIndex].noon = { ...newSchedule[dayIndex].noon, supplierId: e.target.value };
                          setSchedule(newSchedule);
                        }}
                        className="flex-1 text-sm border border-slate-300 rounded px-2 py-1 bg-white"
                      >
                        <option value="">未选择餐厅</option>
                        {suppliers.filter(s => s.type === '餐饮').map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={day.noon.cost}
                        onChange={(e) => {
                          const newSchedule = [...schedule];
                          newSchedule[dayIndex].noon = { ...newSchedule[dayIndex].noon, cost: parseFloat(e.target.value) || 0 };
                          setSchedule(newSchedule);
                        }}
                        className="w-28 text-sm border border-slate-300 rounded px-2 py-1"
                        placeholder="费用"
                      />
                    </>
                  ) : (
                    <>
                      <div className="flex-1 text-sm text-slate-900">
                        {suppliers.find(s => s.id === day.noon.supplierId)?.name || '未选择餐厅'}
                      </div>
                      <div className="relative w-28">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">¥</span>
                        <span className="text-sm font-medium text-slate-700 pl-5">{(day.noon.cost || 0).toLocaleString()}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Afternoon */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="text-sm font-medium text-slate-700 bg-blue-100 px-2 py-0.5 rounded">下午</h5>
                  </div>
                  {day.afternoon.length === 0 && <p className="text-xs text-slate-400 italic ml-2">暂无安排</p>}
                  <div className="space-y-2">
                    {day.afternoon.map((act, idx) => renderActivityRow(act, dayIndex, idx, 'afternoon'))}
                  </div>
                </div>

                {/* Evening */}
                <div className="flex items-center gap-2 py-2 bg-indigo-50 rounded px-3">
                  <span className="text-sm font-medium text-slate-700 w-10 bg-indigo-100 px-1.5 py-0.5 rounded text-center">晚餐</span>
                  {editing ? (
                    <>
                      <select
                        value={day.evening.supplierId}
                        onChange={(e) => {
                          const newSchedule = [...schedule];
                          newSchedule[dayIndex].evening = { ...newSchedule[dayIndex].evening, supplierId: e.target.value };
                          setSchedule(newSchedule);
                        }}
                        className="flex-1 text-sm border border-slate-300 rounded px-2 py-1 bg-white"
                      >
                        <option value="">未选择餐厅</option>
                        {suppliers.filter(s => s.type === '餐饮').map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={day.evening.cost}
                        onChange={(e) => {
                          const newSchedule = [...schedule];
                          newSchedule[dayIndex].evening = { ...newSchedule[dayIndex].evening, cost: parseFloat(e.target.value) || 0 };
                          setSchedule(newSchedule);
                        }}
                        className="w-28 text-sm border border-slate-300 rounded px-2 py-1"
                        placeholder="费用"
                      />
                    </>
                  ) : (
                    <>
                      <div className="flex-1 text-sm text-slate-900">
                        {suppliers.find(s => s.id === day.evening.supplierId)?.name || '未选择餐厅'}
                      </div>
                      <div className="relative w-28">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">¥</span>
                        <span className="text-sm font-medium text-slate-700 pl-5">{(day.evening.cost || 0).toLocaleString()}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
