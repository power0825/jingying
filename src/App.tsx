/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Personnel from './pages/Personnel';
import Suppliers from './pages/Suppliers';
import SupplierDetails from './pages/SupplierDetails';
import Projects from './pages/Projects';
import ProjectDetails from './pages/ProjectDetails';
import Quotations from './pages/Quotations';
import Finance from './pages/Finance';
import CRM from './pages/CRM';
import DataCenter from './pages/DataCenter';
import Login from './pages/Login';
import Products from './pages/Products';
import ProjectProfitDetail from './pages/ProjectProfitDetail';
import { useAppStore } from './store';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAppStore();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

import Customers from './pages/Customers';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="personnel" element={<Personnel />} />
          <Route path="customers" element={<Customers />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="suppliers/:id" element={<SupplierDetails />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<ProjectDetails />} />
          <Route path="quotations" element={<Quotations />} />
          <Route path="finance" element={<Finance />} />
          <Route path="finance/:tab" element={<Finance />} />
          <Route path="finance/profit-analysis/:projectId" element={<ProjectProfitDetail />} />
          <Route path="products" element={<Products />} />
          <Route path="crm" element={<CRM />} />
          <Route path="data-center" element={<DataCenter />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
