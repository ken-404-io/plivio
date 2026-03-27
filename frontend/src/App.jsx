import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './store/authStore.jsx';

import ProtectedRoute from './components/common/ProtectedRoute.jsx';
import Layout         from './components/layout/Layout.jsx';

import Login      from './pages/auth/Login.jsx';
import Register   from './pages/auth/Register.jsx';
import TwoFactor  from './pages/auth/TwoFactor.jsx';
import Dashboard  from './pages/dashboard/Dashboard.jsx';
import Tasks      from './pages/tasks/Tasks.jsx';
import Earnings   from './pages/earnings/Earnings.jsx';
import Withdraw   from './pages/withdraw/Withdraw.jsx';
import Plans      from './pages/plans/Plans.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public auth routes */}
          <Route path="/login"    element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/2fa"      element={<TwoFactor />} />

          {/* Protected app routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index                  element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard"      element={<Dashboard />} />
              <Route path="/tasks"          element={<Tasks />} />
              <Route path="/earnings"       element={<Earnings />} />
              <Route path="/withdraw"       element={<Withdraw />} />
              <Route path="/plans"          element={<Plans />} />
            </Route>
          </Route>

          {/* Admin routes */}
          <Route element={<ProtectedRoute adminOnly />}>
            <Route element={<Layout isAdmin />}>
              <Route path="/admin" element={<AdminDashboard />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
