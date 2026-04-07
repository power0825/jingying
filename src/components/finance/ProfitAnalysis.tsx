import React, { useState, useEffect } from 'react';
import { Loader2, Search, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';

interface ProjectProfit {
  id: string;
  name: string;
  code: string;
  customer_name?: string;
  income_with_tax?: number;
  execution_days?: number;
  start_date?: string;
  end_date?: string;
  status?: string;
  dateRange?: string;
}

export default function ProfitAnalysis() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectProfit[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchProfitData();
  }, []);

  const fetchProfitData = async () => {
    try {
      setLoading(true);
      console.log('Fetching profit data...');

      // 1. Fetch all projects with customer info (only approved projects)
      const { data: projectsData, error: pError } = await supabase
        .from('projects')
        .select(`
          id,
          name,
          code,
          income_with_tax,
          customer_id,
          execution_days,
          customers (
            name
          )
        `)
        .eq('status', '已通过');

      if (pError) {
        console.error('Error fetching projects:', pError);
        throw pError;
      }

      console.log('Projects data:', projectsData);

      // 2. 从 approved_project_itineraries 读取每个项目的开始和结束日期
      const projectsWithDates: any[] = [];
      for (const project of projectsData || []) {
        const { data: itineraries } = await supabase
          .from('approved_project_itineraries')
          .select('date')
          .eq('project_id', project.id)
          .order('day_index', { ascending: true });

        const startDate = itineraries && itineraries.length > 0 ? itineraries[0].date : null;
        const endDate = itineraries && itineraries.length > 0 ? itineraries[itineraries.length - 1].date : null;

        projectsWithDates.push({
          ...project,
          start_date: startDate,
          end_date: endDate,
        });
      }

      console.log('Projects with dates:', projectsWithDates);

      // 3. Format data
      const profitData: ProjectProfit[] = projectsWithDates.map(p => {
        // 根据 start_date 和 end_date 计算项目状态
        const now = new Date();
        const startDate = p.start_date ? new Date(p.start_date) : null;
        const endDate = p.end_date ? new Date(p.end_date) : null;

        let projectStatus = '未开始';
        if (startDate && endDate) {
          if (now < startDate) {
            projectStatus = '未开始';
          } else if (now >= startDate && now <= endDate) {
            projectStatus = '执行中';
          } else if (now > endDate) {
            projectStatus = '已执行';
          }
        } else {
          // 如果没有日期，默认为执行中
          projectStatus = '执行中';
        }

        // 格式化日期范围
        const formatDate = (dateStr: string | null) => {
          if (!dateStr) return '';
          const d = new Date(dateStr);
          return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
        };

        const dateRange = p.start_date && p.end_date
          ? `${formatDate(p.start_date)} - ${formatDate(p.end_date)}`
          : (p.start_date ? `${formatDate(p.start_date)} - ` : (p.end_date ? ` - ${formatDate(p.end_date)}` : '-'));

        return {
          id: p.id,
          name: p.name,
          code: p.code,
          customer_name: p.customers?.name || '-',
          income_with_tax: Number(p.income_with_tax) || 0,
          execution_days: p.execution_days || 0,
          start_date: p.start_date,
          end_date: p.end_date,
          status: projectStatus,
          dateRange: dateRange,
        };
      });

      console.log('Profit data:', profitData);

      console.log('Profit data:', profitData);

      // 按开始日期倒序排列（越晚的项目越排在前面）
      const sortedData = profitData.sort((a, b) => {
        const dateA = a.start_date ? new Date(a.start_date).getTime() : 0;
        const dateB = b.start_date ? new Date(b.start_date).getTime() : 0;
        return dateB - dateA;
      });

      setProjects(sortedData);
    } catch (err) {
      console.error('Error fetching profit data:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.customer_name && p.customer_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-1 gap-4 max-w-md">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-sm text-slate-500 mb-1">项目总数</div>
          <div className="text-2xl font-bold text-slate-900">{projects.length}</div>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索项目名称或编号..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-slate-500 border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 font-medium w-[10%]">项目编码</th>
                <th className="px-4 py-3 font-medium w-[18%]">项目名称</th>
                <th className="px-4 py-3 font-medium w-[15%]">客户名称</th>
                <th className="px-4 py-3 font-medium w-[18%]">执行周期</th>
                <th className="px-4 py-3 font-medium w-[12%]">项目状态</th>
                <th className="px-4 py-3 font-medium text-right w-[14%]">项目金额 (含税)</th>
                <th className="px-4 py-3 font-medium text-right w-[13%]">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400 italic">
                    暂无项目数据
                  </td>
                </tr>
              ) : (
                filteredProjects.map((p) => {
          return (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-sm text-slate-600">{p.code}</td>
                    <td className="px-4 py-3 font-medium text-slate-900 truncate" title={p.name}>{p.name}</td>
                    <td className="px-4 py-3 text-slate-600 truncate" title={p.customer_name}>{p.customer_name || '-'}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{p.dateRange || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        p.status === '执行中' ? 'bg-blue-100 text-blue-700' :
                        p.status === '已执行' ? 'bg-emerald-100 text-emerald-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">¥{p.income_with_tax?.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end">
                        <button
                          onClick={() => navigate(`/finance/profit-analysis/${p.id}`)}
                          className="text-indigo-600 hover:text-indigo-900 font-medium flex items-center gap-1"
                        >
                          <Eye className="w-4 h-4" />
                          查看详情
                        </button>
                      </div>
                    </td>
                  </tr>
                );
        })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
