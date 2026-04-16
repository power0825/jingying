import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Building2,
  FolderKanban,
  Calculator,
  CircleDollarSign,
  UserCircle,
  BarChart3,
  Menu,
  Search,
  LogOut,
  ShoppingCart
} from 'lucide-react';
import { useAppStore } from '../store';
import { cn } from '../lib/utils';
import { NotificationPopover } from './NotificationPopover';

const navigation = [
  { name: '工作台', href: '/', icon: LayoutDashboard, roles: ['CEO', '财务', '客户总监', '运营总监', '客户经理', '运营经理', '班主任'] },
  { name: '供应商管理', href: '/suppliers', icon: Building2, roles: ['CEO', '财务', '客户总监', '运营总监', '客户经理', '运营经理', '班主任'] },
  { name: '项目报价', href: '/quotations', icon: Calculator, roles: ['CEO', '财务', '客户总监', '运营总监', '客户经理', '运营经理', '班主任'] },
  { name: '项目管理', href: '/projects', icon: FolderKanban, roles: ['CEO', '财务', '客户总监', '运营总监', '客户经理', '运营经理', '班主任'] },
  { name: '财务管理', href: '/finance', icon: CircleDollarSign, roles: ['CEO', '财务', '客户总监', '运营总监', '客户经理', '运营经理', '班主任'] },
  { name: '客户管理', href: '/customers', icon: UserCircle, roles: ['CEO', '财务', '客户总监', '运营总监', '客户经理', '运营经理', '班主任'] },
  { name: '人员管理', href: '/personnel', icon: Users },
  { name: '商品管理', href: '/products', icon: ShoppingCart, roles: ['CEO', '财务', '客户总监', '运营总监', '客户经理', '运营经理', '班主任'] },
  { name: '数据中心', href: '/data-center', icon: BarChart3, roles: ['CEO', '财务', '客户总监', '运营总监', '客户经理', '运营经理', '班主任'] },
];

export default function Layout() {
  const { sidebarOpen, toggleSidebar, user, setUser } = useAppStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    setUser(null);
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside
        className={cn(
          "bg-slate-900 text-slate-300 transition-all duration-300 flex flex-col",
          sidebarOpen ? "w-64" : "w-20"
        )}
      >
        <div className="h-16 flex items-center justify-center border-b border-slate-800">
          <span className={cn("font-bold text-white truncate px-4", sidebarOpen ? "text-xl" : "text-sm")}>
            {sidebarOpen ? "菁英探索 PM" : "菁英"}
          </span>
        </div>
        
        <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
          {navigation
            .filter(item => !item.roles || item.roles.includes(user?.role || ''))
            .map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  "flex items-center px-4 py-3 mx-2 rounded-lg transition-colors",
                  isActive
                    ? "bg-indigo-600 text-white"
                    : "hover:bg-slate-800 hover:text-white"
                )
              }
            >
              <item.icon className={cn("shrink-0", sidebarOpen ? "mr-3 h-5 w-5" : "mx-auto h-6 w-6")} />
              {sidebarOpen && <span>{item.name}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center min-w-0">
              <div className="h-8 w-8 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold shrink-0">
                {user?.name?.charAt(0) || 'U'}
              </div>
              {sidebarOpen && (
                <div className="ml-3 truncate">
                  <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                  <p className="text-xs text-slate-400 truncate">{user?.role}</p>
                </div>
              )}
            </div>
            {sidebarOpen && (
              <button 
                onClick={handleLogout} 
                className="text-slate-400 hover:text-white ml-2 shrink-0 p-2 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer" 
                title="退出登录"
                type="button"
              >
                <LogOut className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center">
            <button
              onClick={toggleSidebar}
              className="text-slate-500 hover:text-slate-700 focus:outline-none"
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="ml-4 flex items-center bg-slate-100 rounded-md px-3 py-1.5">
              <Search className="h-4 w-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="搜索项目、客户、供应商..." 
                className="bg-transparent border-none focus:ring-0 text-sm ml-2 w-64 text-slate-700 placeholder-slate-400"
              />
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <NotificationPopover />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
