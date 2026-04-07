import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Supplier } from '../../types/supplier';

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

interface ItineraryEditorProps {
  value: DailySchedule[];
  onChange: (value: DailySchedule[]) => void;
  hotelArrangement: HotelArrangement;
  onHotelChange: (value: HotelArrangement) => void;
  suppliers: Supplier[];
  executionDays: number;
  participants: number;
  firstDate?: string;
  onFirstDateChange?: (date: string) => void;
  onTotalCostChange?: (totalCost: number, totalActualCost: number) => void;
}

export default function ItineraryEditor({
  value,
  onChange,
  hotelArrangement,
  onHotelChange,
  suppliers,
  executionDays,
  participants,
  firstDate,
  onFirstDateChange,
  onTotalCostChange,
}: ItineraryEditorProps) {

  const schedule = value;
  const setSchedule = onChange;

  // Ensure we have the right number of days
  React.useEffect(() => {
    if (schedule.length !== executionDays && executionDays > 0) {
      const newSchedule = [...schedule];
      if (newSchedule.length < executionDays) {
        for (let i = newSchedule.length; i < executionDays; i++) {
          newSchedule.push({
            day: i + 1,
            date: '',
            morning: [],
            noon: { supplierId: '', cost: 0, actualCost: 0 },
            afternoon: [],
            evening: { supplierId: '', cost: 0, actualCost: 0 },
            busId: '',
            busDuration: 'full',
            busHours: 0,
            busCost: 0,
            busActualCost: 0,
          });
        }
      } else if (newSchedule.length > executionDays) {
        newSchedule.splice(executionDays);
      }
      setSchedule(newSchedule);
    }
  }, [executionDays]);

  // Auto-fill dates based on firstDate
  React.useEffect(() => {
    if (firstDate && schedule.length > 0) {
      const newSchedule = schedule.map((day, index) => {
        const date = new Date(firstDate);
        date.setDate(date.getDate() + index);
        const dateStr = date.toISOString().split('T')[0];
        if (day.date !== dateStr) {
          return { ...day, date: dateStr };
        }
        return day;
      });
      setSchedule(newSchedule);
    }
  }, [firstDate]);

  const updateHotel = (field: keyof HotelArrangement, value: any) => {
    const newHotel = { ...hotelArrangement, [field]: value };

    if (field === 'hotelId' || field === 'nights' || field === 'peoplePerRoom') {
      const hotel = suppliers.find(s => s.id === (field === 'hotelId' ? value : newHotel.hotelId));
      if (hotel) {
        const unitPrice = hotel.reference_quote?.unit || hotel.price || 0;
        const roomsNeeded = Math.ceil(participants / (field === 'peoplePerRoom' ? value : newHotel.peoplePerRoom));
        const nights = field === 'nights' ? value : newHotel.nights;
        newHotel.cost = unitPrice * roomsNeeded * nights;
        const actualUnitPrice = hotel.actual_cost?.unit || 0;
        newHotel.actualCost = actualUnitPrice * roomsNeeded * nights;
      }
    }

    onHotelChange(newHotel);
  };

  const updateSchedule = (dayIndex: number, field: keyof DailySchedule, value: any) => {
    const newSchedule = [...schedule];
    newSchedule[dayIndex] = { ...newSchedule[dayIndex], [field]: value };
    setSchedule(newSchedule);
  };

  const addActivity = (dayIndex: number, time: 'morning' | 'afternoon', type: 'visit' | 'teach') => {
    const newSchedule = [...schedule];
    newSchedule[dayIndex][time].push({
      id: crypto.randomUUID(),
      type,
      supplierId: '',
      cost: 0,
      actualCost: 0,
    });
    setSchedule(newSchedule);
  };

  const removeActivity = (dayIndex: number, time: 'morning' | 'afternoon', activityId: string) => {
    const newSchedule = [...schedule];
    newSchedule[dayIndex][time] = newSchedule[dayIndex][time].filter(a => a.id !== activityId);
    setSchedule(newSchedule);
  };

  const updateActivity = (dayIndex: number, time: 'morning' | 'afternoon', activityId: string, field: keyof Activity, value: any) => {
    const newSchedule = [...schedule];
    const actIndex = newSchedule[dayIndex][time].findIndex(a => a.id === activityId);
    if (actIndex > -1) {
      newSchedule[dayIndex][time][actIndex] = { ...newSchedule[dayIndex][time][actIndex], [field]: value };

      const currentAct = newSchedule[dayIndex][time][actIndex];

      if (field === 'supplierId' || field === 'hours' || field === 'billingType') {
        const supplier = suppliers.find(s => s.id === currentAct.supplierId);
        if (supplier) {
          if (currentAct.type === 'visit') {
            const budgetUnitPrice = supplier.reference_quote?.unit || supplier.price || 0;
            const actualUnitPrice = supplier.actual_cost?.unit || 0;
            currentAct.cost = budgetUnitPrice * participants;
            currentAct.actualCost = actualUnitPrice * participants;
          } else {
            const billingType = currentAct.billingType || 'hour';
            const budgetHourPrice = supplier.reference_quote?.hour || supplier.price || 0;
            const budgetHalfDayPrice = supplier.reference_quote?.half_day || (budgetHourPrice * 4);
            const budgetDayPrice = supplier.reference_quote?.day || (budgetHourPrice * 8);
            const actualHourPrice = supplier.actual_cost?.hour || 0;
            const actualHalfDayPrice = supplier.actual_cost?.half_day || 0;
            const actualDayPrice = supplier.actual_cost?.day || 0;

            if (billingType === 'day') {
              currentAct.cost = budgetDayPrice;
              currentAct.actualCost = actualDayPrice;
            } else if (billingType === 'half_day') {
              currentAct.cost = budgetHalfDayPrice;
              currentAct.actualCost = actualHalfDayPrice;
            } else {
              currentAct.cost = budgetHourPrice * (currentAct.hours || 0);
              currentAct.actualCost = actualHourPrice * (currentAct.hours || 0);
            }
          }
        }
      }

      if (field === 'venueId' || field === 'venueHours' || field === 'venueBillingType') {
        const venue = suppliers.find(s => s.id === currentAct.venueId);
        if (venue) {
          const billingType = currentAct.venueBillingType || 'hour';
          const budgetHourPrice = venue.reference_quote?.hour || venue.price || 0;
          const budgetHalfDayPrice = venue.reference_quote?.half_day || (budgetHourPrice * 4);
          const budgetDayPrice = venue.reference_quote?.day || (budgetHourPrice * 8);
          const actualHourPrice = venue.actual_cost?.hour || 0;
          const actualHalfDayPrice = venue.actual_cost?.half_day || 0;
          const actualDayPrice = venue.actual_cost?.day || 0;

          if (billingType === 'day') {
            currentAct.venueCost = budgetDayPrice;
            currentAct.venueActualCost = actualDayPrice;
          } else if (billingType === 'half_day') {
            currentAct.venueCost = budgetHalfDayPrice;
            currentAct.venueActualCost = actualHalfDayPrice;
          } else {
            currentAct.venueCost = budgetHourPrice * (currentAct.venueHours || 0);
            currentAct.venueActualCost = actualHourPrice * (currentAct.venueHours || 0);
          }
        } else {
          currentAct.venueCost = 0;
          currentAct.venueActualCost = 0;
        }
      }

      setSchedule(newSchedule);
    }
  };

  const updateMeal = (dayIndex: number, time: 'noon' | 'evening', field: keyof Meal, value: any) => {
    const newSchedule = [...schedule];
    newSchedule[dayIndex][time] = { ...newSchedule[dayIndex][time], [field]: value };

    if (field === 'supplierId') {
      const supplier = suppliers.find(s => s.id === value);
      if (supplier) {
        const budgetUnitPrice = supplier.reference_quote?.unit || supplier.price || 0;
        const actualUnitPrice = supplier.actual_cost?.unit || 0;
        newSchedule[dayIndex][time].cost = budgetUnitPrice * participants;
        newSchedule[dayIndex][time].actualCost = actualUnitPrice * participants;
      }
    }
    setSchedule(newSchedule);
  };

  const updateBus = (dayIndex: number, field: 'busId' | 'busDuration' | 'busHours', value: any) => {
    const newSchedule = [...schedule];
    newSchedule[dayIndex] = { ...newSchedule[dayIndex], [field]: value };

    const supplier = suppliers.find(s => s.id === newSchedule[dayIndex].busId);
    if (supplier) {
      const budgetHourPrice = supplier.reference_quote?.hour || (supplier.price / 8);
      const budgetHalfDayPrice = supplier.reference_quote?.half_day || (budgetHourPrice * 4);
      const budgetDayPrice = supplier.reference_quote?.day || supplier.price;
      const actualHourPrice = supplier.actual_cost?.hour || 0;
      const actualHalfDayPrice = supplier.actual_cost?.half_day || 0;
      const actualDayPrice = supplier.actual_cost?.day || 0;

      if (newSchedule[dayIndex].busDuration === 'hour') {
        newSchedule[dayIndex].busCost = budgetHourPrice * (newSchedule[dayIndex].busHours || 0);
        newSchedule[dayIndex].busActualCost = actualHourPrice * (newSchedule[dayIndex].busHours || 0);
      } else if (newSchedule[dayIndex].busDuration === 'half') {
        newSchedule[dayIndex].busCost = budgetHalfDayPrice;
        newSchedule[dayIndex].busActualCost = actualHalfDayPrice;
      } else if (newSchedule[dayIndex].busDuration === 'none') {
        newSchedule[dayIndex].busCost = 0;
        newSchedule[dayIndex].busActualCost = 0;
      } else {
        newSchedule[dayIndex].busCost = budgetDayPrice;
        newSchedule[dayIndex].busActualCost = actualDayPrice;
      }
    } else {
      newSchedule[dayIndex].busCost = 0;
      newSchedule[dayIndex].busActualCost = 0;
    }
    setSchedule(newSchedule);
  };

  const [totalCost, setTotalCost] = React.useState<number>(0);

  // Calculate total cost and notify parent
  React.useEffect(() => {
    let totalCost = 0;
    let totalActualCost = 0;

    // Hotel cost
    totalCost += hotelArrangement.cost || 0;
    totalActualCost += hotelArrangement.actualCost || 0;

    // Schedule costs
    schedule.forEach(day => {
      // Morning activities
      day.morning.forEach(act => {
        totalCost += act.cost || 0;
        totalActualCost += act.actualCost || 0;
        if (act.venueCost) {
          totalCost += act.venueCost;
          totalActualCost += act.venueActualCost || 0;
        }
      });
      // Afternoon activities
      day.afternoon.forEach(act => {
        totalCost += act.cost || 0;
        totalActualCost += act.actualCost || 0;
        if (act.venueCost) {
          totalCost += act.venueCost;
          totalActualCost += act.venueActualCost || 0;
        }
      });
      // Noon meal
      totalCost += day.noon?.cost || 0;
      totalActualCost += day.noon?.actualCost || 0;
      // Evening meal
      totalCost += day.evening?.cost || 0;
      totalActualCost += day.evening?.actualCost || 0;
      // Bus
      totalCost += day.busCost || 0;
      totalActualCost += day.busActualCost || 0;
    });

    setTotalCost(totalCost);
    onTotalCostChange?.(totalCost, totalActualCost);
  }, [schedule, hotelArrangement, onTotalCostChange]);

  const renderActivityRow = (dayIndex: number, time: 'morning' | 'afternoon', act: Activity) => {
    return (
      <div key={act.id} className="flex items-start gap-2 p-2 bg-slate-50 rounded border border-slate-100 mb-2">
        <span className={`text-xs px-2 py-1 rounded text-white mt-1 ${act.type === 'visit' ? 'bg-indigo-500' : 'bg-emerald-500'}`}>
          {act.type === 'visit' ? '参访' : '授课'}
        </span>
        <div className="flex-1 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
            <select
              value={act.supplierId}
              onChange={(e) => updateActivity(dayIndex, time, act.id, 'supplierId', e.target.value)}
              className="w-full rounded border-slate-300 text-xs py-1 focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="">选择{act.type === 'visit' ? '参访点' : '讲师'}</option>
              {suppliers.filter(s => s.type === (act.type === 'visit' ? '参访点' : '老师')).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            {act.type === 'teach' && (
              <>
                <select
                  value={act.billingType || 'hour'}
                  onChange={(e) => updateActivity(dayIndex, time, act.id, 'billingType', e.target.value)}
                  className="text-xs border-slate-300 rounded-md py-1"
                >
                  <option value="hour">按小时</option>
                  <option value="half_day">按半天</option>
                  <option value="day">按全天</option>
                </select>

                {(act.billingType === 'hour' || !act.billingType) ? (
                  <div className="flex items-center space-x-1">
                    <input
                      type="number"
                      value={act.hours || 0}
                      onChange={(e) => updateActivity(dayIndex, time, act.id, 'hours', Number(e.target.value))}
                      className="w-12 text-xs border-slate-300 rounded-md px-1 py-1"
                    />
                    <span className="text-xs text-slate-500">小时</span>
                  </div>
                ) : <div />}

                <div className="flex items-center space-x-2 bg-white p-1 rounded border border-slate-200">
                  <span className="text-xs text-slate-500 whitespace-nowrap">参考价:</span>
                  <input
                    type="number"
                    value={act.cost}
                    onChange={(e) => updateActivity(dayIndex, time, act.id, 'cost', parseFloat(e.target.value) || 0)}
                    className="w-full rounded border-transparent text-xs py-1 focus:border-indigo-500 focus:ring-0 text-right"
                  />
                </div>
              </>
            )}

            {act.type === 'visit' && (
              <div className="flex items-center space-x-2 sm:col-span-3 bg-white p-1 rounded border border-slate-200">
                <span className="text-xs text-slate-500 whitespace-nowrap">参考价:</span>
                <input
                  type="number"
                  value={act.cost}
                  onChange={(e) => updateActivity(dayIndex, time, act.id, 'cost', parseFloat(e.target.value) || 0)}
                  className="w-full rounded border-transparent text-xs py-1 focus:border-indigo-500 focus:ring-0 text-right"
                />
              </div>
            )}
          </div>

          {act.type === 'teach' && (
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="课程名称"
                value={act.courseName || ''}
                onChange={(e) => updateActivity(dayIndex, time, act.id, 'courseName', e.target.value)}
                className="w-full rounded border-slate-300 text-xs py-1 focus:border-indigo-500 focus:ring-indigo-500"
              />
              <select
                value={act.language || ''}
                onChange={(e) => updateActivity(dayIndex, time, act.id, 'language', e.target.value)}
                className="w-full rounded border-slate-300 text-xs py-1 focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option value="">选择语言</option>
                <option value="中文">中文</option>
                <option value="英文">英文</option>
                <option value="日文">日文</option>
                <option value="其他">其他</option>
              </select>
            </div>
          )}

          {act.type === 'teach' && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
              <select
                value={act.venueId || ''}
                onChange={(e) => updateActivity(dayIndex, time, act.id, 'venueId', e.target.value)}
                className="w-full rounded border-slate-300 text-xs py-1 focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option value="">选择场地</option>
                {suppliers.filter(s => s.type === '场地').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>

              <select
                value={act.venueBillingType || 'hour'}
                onChange={(e) => updateActivity(dayIndex, time, act.id, 'venueBillingType', e.target.value)}
                className="text-xs border-slate-300 rounded-md py-1"
              >
                <option value="hour">按小时</option>
                <option value="half_day">按半天</option>
                <option value="day">按全天</option>
              </select>

              {(act.venueBillingType === 'hour' || !act.venueBillingType) ? (
                <div className="flex items-center space-x-1">
                  <input
                    type="number"
                    value={act.venueHours || 0}
                    onChange={(e) => updateActivity(dayIndex, time, act.id, 'venueHours', Number(e.target.value))}
                    className="w-12 text-xs border-slate-300 rounded-md px-1 py-1"
                  />
                  <span className="text-xs text-slate-500">小时</span>
                </div>
              ) : <div />}

              <div className="flex items-center space-x-2 bg-white p-1 rounded border border-slate-200">
                <span className="text-xs text-slate-500 whitespace-nowrap">场地费:</span>
                <input
                  type="number"
                  value={act.venueCost || 0}
                  onChange={(e) => updateActivity(dayIndex, time, act.id, 'venueCost', parseFloat(e.target.value) || 0)}
                  className="w-full rounded border-transparent text-xs py-1 focus:border-indigo-500 focus:ring-0 text-right"
                />
              </div>
            </div>
          )}
        </div>
        <button type="button" onClick={() => removeActivity(dayIndex, time, act.id)} className="text-slate-400 hover:text-red-500 p-1"><Trash2 className="w-4 h-4" /></button>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* First Date Selector */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 shadow-sm">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-indigo-900 whitespace-nowrap">
            开始日期 *
          </label>
          <input
            type="date"
            value={firstDate || ''}
            onChange={(e) => onFirstDateChange?.(e.target.value)}
            className="flex-1 max-w-xs text-sm border-indigo-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            required
          />
          {firstDate && (
            <span className="text-xs text-indigo-700">
              第 1 天：{firstDate} ~ 第 {executionDays} 天：{(() => {
                const lastDate = new Date(firstDate);
                lastDate.setDate(lastDate.getDate() + executionDays - 1);
                return lastDate.toISOString().split('T')[0];
              })()}
            </span>
          )}
        </div>
      </div>

      {/* Total Reference Price Display */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-emerald-900">总参考价格：</span>
            <span className="text-2xl font-bold text-emerald-600">¥{totalCost.toLocaleString()}</span>
          </div>
          <div className="text-xs text-emerald-700">
            <span className="mr-3">人数：{participants}</span>
            <span>执行天数：{executionDays}</span>
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
            <select
              value={hotelArrangement.hotelId}
              onChange={(e) => updateHotel('hotelId', e.target.value)}
              className="w-full rounded-md border-slate-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="">请选择酒店</option>
              {suppliers.filter(s => s.type === '酒店').map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">入住晚数</label>
            <input
              type="number"
              value={hotelArrangement.nights}
              onChange={(e) => updateHotel('nights', parseInt(e.target.value) || 0)}
              className="w-full rounded-md border-slate-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">每间人数</label>
            <input
              type="number"
              value={hotelArrangement.peoplePerRoom}
              onChange={(e) => updateHotel('peoplePerRoom', parseInt(e.target.value) || 1)}
              className="w-full rounded-md border-slate-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">酒店参考价格 (¥)</label>
            <input
              type="number"
              value={hotelArrangement.cost}
              onChange={(e) => updateHotel('cost', parseFloat(e.target.value) || 0)}
              className="w-full rounded-md border-slate-300 text-sm font-bold text-indigo-600 focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>
        </div>
        {hotelArrangement.hotelId && (
          <div className="mt-3 flex justify-between items-center text-xs text-slate-500 bg-white p-2 rounded border border-slate-100">
            {(() => {
              const hotel = suppliers.find(s => s.id === hotelArrangement.hotelId);
              const unitPrice = hotel?.reference_quote?.unit || hotel?.price || 0;
              const roomsNeeded = Math.ceil(participants / hotelArrangement.peoplePerRoom);
              return (
                <>
                  <span>参考单价：¥{unitPrice}/晚</span>
                  <span>参考房间数：{roomsNeeded}</span>
                  <span className="font-bold text-indigo-600">当前参考价格：¥{hotelArrangement.cost.toLocaleString()}</span>
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Daily Schedule */}
      {schedule.length > 0 && (
        <div className="max-h-[500px] overflow-y-auto custom-scrollbar border border-slate-200 rounded-lg">
          <div className="space-y-4 p-4">
            {schedule.map((day, dayIndex) => (
              <div key={dayIndex} className="border border-slate-200 rounded-lg overflow-hidden">
                {/* Day Header */}
                <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-800 whitespace-nowrap">第 {day.day} 天 {day.date && `(${day.date})`}</span>
                  <div className="flex-1" />
                  <div className="flex items-center flex-wrap gap-2">
                    <span className="text-xs text-slate-500 whitespace-nowrap">大巴:</span>
                    <select
                      value={day.busId}
                      onChange={(e) => updateBus(dayIndex, 'busId', e.target.value)}
                      className="rounded-md border-slate-300 text-xs py-1 px-2 focus:border-indigo-500 focus:ring-indigo-500 max-w-[180px]"
                    >
                      <option value="">不需要大巴</option>
                      {suppliers.filter(s => s.type === '大巴').map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    {day.busId && (
                      <div className="flex items-center gap-1">
                        <select
                          value={day.busDuration || 'full'}
                          onChange={(e) => updateBus(dayIndex, 'busDuration', e.target.value)}
                          className="rounded-md border-slate-300 text-xs py-1 px-2 focus:border-indigo-500 focus:ring-indigo-500"
                        >
                          <option value="full">全天</option>
                          <option value="half">半天</option>
                          <option value="hour">按小时</option>
                        </select>
                        {day.busDuration === 'hour' && (
                          <input
                            type="number"
                            value={day.busHours || 0}
                            onChange={(e) => updateBus(dayIndex, 'busHours', parseInt(e.target.value) || 0)}
                            className="w-14 rounded-md border-slate-300 text-xs py-1 px-2 focus:border-indigo-500 focus:ring-indigo-500"
                            placeholder="小时"
                          />
                        )}
                      </div>
                    )}
                    <div className="relative">
                      <span className="text-xs text-slate-500 mr-1">¥</span>
                      <input
                        type="number"
                        value={day.busCost}
                        onChange={(e) => updateSchedule(dayIndex, 'busCost', parseFloat(e.target.value) || 0)}
                        className="w-24 rounded-md border-slate-300 text-xs py-1 px-2 focus:border-indigo-500 focus:ring-indigo-500"
                        placeholder="参考价格"
                      />
                    </div>
                  </div>
                </div>

                {/* Day Content */}
                <div className="p-4 space-y-4 bg-white">
                  {/* Morning */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="text-sm font-medium text-slate-700 bg-amber-100 px-2 py-0.5 rounded">上午</h5>
                      <div className="flex space-x-2">
                        <button type="button" onClick={() => addActivity(dayIndex, 'morning', 'visit')} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center"><Plus className="w-3 h-3 mr-1" /> 参访</button>
                        <button type="button" onClick={() => addActivity(dayIndex, 'morning', 'teach')} className="text-xs text-emerald-600 hover:text-emerald-800 flex items-center"><Plus className="w-3 h-3 mr-1" /> 授课</button>
                      </div>
                    </div>
                    {day.morning.length === 0 && <p className="text-xs text-slate-400 italic ml-2">暂无安排</p>}
                    <div className="space-y-2">
                      {day.morning.map(act => renderActivityRow(dayIndex, 'morning', act))}
                    </div>
                  </div>

                  {/* Noon */}
                  <div className="flex items-center gap-2 py-2 bg-orange-50 rounded px-3">
                    <span className="text-sm font-medium text-slate-700 w-10 bg-orange-100 px-1.5 py-0.5 rounded text-center">午餐</span>
                    <select
                      value={day.noon.supplierId}
                      onChange={(e) => updateMeal(dayIndex, 'noon', 'supplierId', e.target.value)}
                      className="flex-1 rounded-md border-slate-300 text-xs py-1 focus:border-indigo-500 focus:ring-indigo-500"
                    >
                      <option value="">选择餐厅</option>
                      {suppliers.filter(s => s.type === '餐饮').map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <div className="relative w-28">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">¥</span>
                      <input
                        type="number"
                        value={day.noon.cost}
                        onChange={(e) => updateMeal(dayIndex, 'noon', 'cost', parseFloat(e.target.value) || 0)}
                        className="w-full pl-5 rounded-md border-slate-300 text-xs py-1 focus:border-indigo-500 focus:ring-indigo-500"
                        placeholder="成本"
                      />
                    </div>
                  </div>

                  {/* Afternoon */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="text-sm font-medium text-slate-700 bg-blue-100 px-2 py-0.5 rounded">下午</h5>
                      <div className="flex space-x-2">
                        <button type="button" onClick={() => addActivity(dayIndex, 'afternoon', 'visit')} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center"><Plus className="w-3 h-3 mr-1" /> 参访</button>
                        <button type="button" onClick={() => addActivity(dayIndex, 'afternoon', 'teach')} className="text-xs text-emerald-600 hover:text-emerald-800 flex items-center"><Plus className="w-3 h-3 mr-1" /> 授课</button>
                      </div>
                    </div>
                    {day.afternoon.length === 0 && <p className="text-xs text-slate-400 italic ml-2">暂无安排</p>}
                    <div className="space-y-2">
                      {day.afternoon.map(act => renderActivityRow(dayIndex, 'afternoon', act))}
                    </div>
                  </div>

                  {/* Evening */}
                  <div className="flex items-center gap-2 py-2 bg-indigo-50 rounded px-3">
                    <span className="text-sm font-medium text-slate-700 w-10 bg-indigo-100 px-1.5 py-0.5 rounded text-center">晚餐</span>
                    <select
                      value={day.evening.supplierId}
                      onChange={(e) => updateMeal(dayIndex, 'evening', 'supplierId', e.target.value)}
                      className="flex-1 rounded-md border-slate-300 text-xs py-1 focus:border-indigo-500 focus:ring-indigo-500"
                    >
                      <option value="">选择餐厅</option>
                      {suppliers.filter(s => s.type === '餐饮').map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <div className="relative w-28">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">¥</span>
                      <input
                        type="number"
                        value={day.evening.cost}
                        onChange={(e) => updateMeal(dayIndex, 'evening', 'cost', parseFloat(e.target.value) || 0)}
                        className="w-full pl-5 rounded-md border-slate-300 text-xs py-1 focus:border-indigo-500 focus:ring-indigo-500"
                        placeholder="成本"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
