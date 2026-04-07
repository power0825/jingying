import React from 'react';

export default function CRM() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">客户管理 (CRM)</h1>
          <p className="text-sm text-slate-500 mt-1">客户档案、跟进记录与转化漏斗。</p>
        </div>
        <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
          新增客户
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center min-h-[400px] flex items-center justify-center">
        <p className="text-slate-500">客户列表与跟进时间线将在此渲染</p>
      </div>
    </div>
  );
}
