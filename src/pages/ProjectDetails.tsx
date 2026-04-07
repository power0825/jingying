import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileText, FileSignature, Map, Activity, DollarSign, ShoppingCart } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Project } from '../types/project';
import { User } from '../types/user';
import ContractManagement from '../components/project/ContractManagement';
import DetailedItinerary from '../components/project/DetailedItinerary';
import ExecutionProgress from '../components/project/ExecutionProgress';
import Financials from '../components/project/Financials';
import ProductSales from '../components/project/ProductSales';

type TabType = 'basic' | 'contract' | 'itinerary' | 'progress' | 'finance' | 'product-sales';

export default function ProjectDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [project, setProject] = useState<Project | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [customerName, setCustomerName] = useState<string>('-');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const tab = searchParams.get('tab');
    if (tab === 'progress') return 'progress';
    if (tab === 'contract') return 'contract';
    if (tab === 'itinerary') return 'itinerary';
    if (tab === 'finance') return 'finance';
    if (tab === 'product-sales') return 'product-sales';
    return 'basic';
  });

  const fetchData = async () => {
    if (!id) return;
    try {
      const [projectRes, usersRes] = await Promise.all([
        supabase.from('projects').select('*').eq('id', id).single(),
        supabase.from('users').select('*')
      ]);

      if (projectRes.data) {
        setProject(projectRes.data);
        if (projectRes.data.customer_id) {
          const { data: customerData } = await supabase
            .from('customers')
            .select('name')
            .eq('id', projectRes.data.customer_id)
            .single();
          if (customerData) {
            setCustomerName(customerData.name);
          }
        }
      }
      if (usersRes.data) setUsers(usersRes.data);
    } catch (error) {
      console.error('Error fetching project details:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  if (loading) {
    return <div className="p-8 text-center text-slate-500">加载中...</div>;
  }

  if (!project) {
    return <div className="p-8 text-center text-red-500">未找到项目信息</div>;
  }

  const getUserName = (userId?: string | null) => {
    if (!userId) return '-';
    return users.find(u => u.id === userId)?.name || '未知';
  };

  const tabs = [
    { id: 'basic', label: '基本信息', icon: FileText },
    { id: 'contract', label: '合同管理', icon: FileSignature },
    { id: 'itinerary', label: '详细行程', icon: Map },
    { id: 'progress', label: '执行进度', icon: Activity },
    { id: 'finance', label: '财务相关', icon: DollarSign },
    { id: 'product-sales', label: '商品销售', icon: ShoppingCart },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <button 
          onClick={() => navigate('/projects')}
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
          <p className="text-sm text-slate-500 mt-1">项目编号：{project.code}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-200">
          <nav className="flex -mb-px overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`
                    flex items-center px-6 py-4 text-sm font-medium border-b-2 whitespace-nowrap transition-colors
                    ${isActive 
                      ? 'border-indigo-500 text-indigo-600' 
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }
                  `}
                >
                  <Icon className={`w-4 h-4 mr-2 ${isActive ? 'text-indigo-500' : 'text-slate-400'}`} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'basic' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-slate-900 mb-4">项目概况</h3>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6">
                    <div>
                      <dt className="text-sm font-medium text-slate-500">项目名称</dt>
                      <dd className="mt-1 text-sm text-slate-900">{project.name}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-slate-500">项目编号</dt>
                      <dd className="mt-1 text-sm text-slate-900">{project.code}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-slate-500">关联客户</dt>
                      <dd className="mt-1 text-sm text-slate-900">{customerName}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-slate-500">项目人数</dt>
                      <dd className="mt-1 text-sm text-slate-900">{project.participants} 人</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-slate-500">执行周期</dt>
                      <dd className="mt-1 text-sm text-slate-900">{project.execution_days} 天</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-sm font-medium text-slate-500">执行难点</dt>
                      <dd className="mt-1 text-sm text-slate-900 whitespace-pre-wrap">{project.difficulties || '无'}</dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-slate-900 mb-4">财务与人员</h3>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6">
                    <div>
                      <dt className="text-sm font-medium text-slate-500">收入（含税）</dt>
                      <dd className="mt-1 text-sm text-slate-900">¥{project.income_with_tax.toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-slate-500">参考价格</dt>
                      <dd className="mt-1 text-sm text-slate-900">¥{project.reference_price_total?.toLocaleString() || '0'}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-slate-500">参考价上浮金额</dt>
                      <dd className="mt-1 text-sm font-medium text-emerald-600">
                        ¥{((project.income_with_tax || 0) - (project.reference_price_total || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-slate-500">发票税点</dt>
                      <dd className="mt-1 text-sm text-slate-900">{(project.tax_rate * 100).toFixed(1)}%</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-slate-500">商务负责人</dt>
                      <dd className="mt-1 text-sm text-slate-900">{getUserName(project.bd_manager_id)}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'contract' && (
            <ContractManagement project={project} users={users} onUpdate={fetchData} />
          )}

          {activeTab === 'itinerary' && (
            <DetailedItinerary project={project} />
          )}

          {activeTab === 'progress' && (
            <ExecutionProgress project={project} users={users} onUpdate={fetchData} />
          )}

          {activeTab === 'finance' && (
            <Financials project={project} />
          )}

          {activeTab === 'product-sales' && (
            <ProductSales project={project} />
          )}
        </div>
      </div>
    </div>
  );
}
