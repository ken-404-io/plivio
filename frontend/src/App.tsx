import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider }  from './store/authStore.tsx';
import { ToastProvider } from './components/common/Toast.tsx';

import ProtectedRoute from './components/common/ProtectedRoute.tsx';
import Layout         from './components/layout/Layout.tsx';

import LandingPage      from './pages/LandingPage.tsx';
import Login            from './pages/auth/Login.tsx';
import Register         from './pages/auth/Register.tsx';
import TwoFactor        from './pages/auth/TwoFactor.tsx';
import ForgotPassword   from './pages/auth/ForgotPassword.tsx';
import ResetPassword    from './pages/auth/ResetPassword.tsx';
import VerifyEmail      from './pages/auth/VerifyEmail.tsx';
import TermsOfService   from './pages/TermsOfService.tsx';
import PrivacyPolicy    from './pages/PrivacyPolicy.tsx';
import Contact          from './pages/Contact.tsx';
import Dashboard      from './pages/dashboard/Dashboard.tsx';
import Tasks          from './pages/tasks/Tasks.tsx';
import Earnings       from './pages/earnings/Earnings.tsx';
import Withdraw       from './pages/withdraw/Withdraw.tsx';
import Plans          from './pages/plans/Plans.tsx';
import Profile        from './pages/profile/Profile.tsx';
import Referrals      from './pages/referrals/Referrals.tsx';
import Kyc            from './pages/kyc/Kyc.tsx';
import Coins          from './pages/coins/Coins.tsx';
import AdminDashboard from './pages/admin/AdminDashboard.tsx';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
      <AuthProvider>
        <Routes>
          {/* Public landing + static pages */}
          <Route path="/"        element={<LandingPage />} />
          <Route path="/terms"   element={<TermsOfService />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/contact" element={<Contact />} />

          {/* Public auth routes */}
          <Route path="/login"            element={<Login />} />
          <Route path="/register"         element={<Register />} />
          <Route path="/2fa"              element={<TwoFactor />} />
          <Route path="/forgot-password"  element={<ForgotPassword />} />
          <Route path="/reset-password"   element={<ResetPassword />} />
          <Route path="/verify-email"     element={<VerifyEmail />} />

          {/* Protected app routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/dashboard"  element={<Dashboard />} />
              <Route path="/tasks"      element={<Tasks />} />
              <Route path="/earnings"   element={<Earnings />} />
              <Route path="/withdraw"   element={<Withdraw />} />
              <Route path="/plans"      element={<Plans />} />
              <Route path="/referrals"  element={<Referrals />} />
              <Route path="/profile"    element={<Profile />} />
              <Route path="/kyc"        element={<Kyc />} />
              <Route path="/coins"      element={<Coins />} />
            </Route>
          </Route>

          {/* Admin routes */}
          <Route element={<ProtectedRoute adminOnly />}>
            <Route element={<Layout isAdmin />}>
              <Route path="/admin" element={<AdminDashboard />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
