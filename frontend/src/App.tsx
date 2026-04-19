import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider }  from './store/authStore.tsx';
import { ToastProvider } from './components/common/Toast.tsx';
import ErrorBoundary     from './components/common/ErrorBoundary.tsx';
import AdBlockerModal    from './components/common/AdBlockerModal.tsx';
import useAutoRefreshOnIdle from './hooks/useAutoRefreshOnIdle.ts';
import { useVersionCheck } from './hooks/useVersionCheck.ts';

import ProtectedRoute from './components/common/ProtectedRoute.tsx';
import Layout         from './components/layout/Layout.tsx';
import NotFound       from './pages/NotFound.tsx';

import LandingPage    from './pages/LandingPage.tsx';
import Login          from './pages/auth/Login.tsx';
import Register       from './pages/auth/Register.tsx';
import TwoFactor      from './pages/auth/TwoFactor.tsx';
import ForgotPassword from './pages/auth/ForgotPassword.tsx';
import ResetPassword  from './pages/auth/ResetPassword.tsx';
import VerifyEmail    from './pages/auth/VerifyEmail.tsx';
import TermsOfService from './pages/TermsOfService.tsx';
import PrivacyPolicy  from './pages/PrivacyPolicy.tsx';
import Contact        from './pages/Contact.tsx';
import Dashboard      from './pages/dashboard/Dashboard.tsx';
import Quizly         from './pages/quizly/Quizly.tsx';
import Tasks          from './pages/tasks/Tasks.tsx';
import Earnings       from './pages/earnings/Earnings.tsx';
import Withdraw       from './pages/withdraw/Withdraw.tsx';
import Plans          from './pages/plans/Plans.tsx';
import Profile        from './pages/profile/Profile.tsx';
import Referrals      from './pages/referrals/Referrals.tsx';
import Kyc            from './pages/kyc/Kyc.tsx';
import Coins          from './pages/coins/Coins.tsx';
import AdminDashboard  from './pages/admin/AdminDashboard.tsx';
import AdminUserDetail from './pages/admin/AdminUserDetail.tsx';
import Settings       from './pages/settings/Settings.tsx';

export default function App() {
  const outdated = useVersionCheck();
  useAutoRefreshOnIdle();
  return (
    <ErrorBoundary>
      {outdated && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 16, padding: 24, textAlign: 'center',
        }}>
          <div style={{ fontSize: 40 }}>🔄</div>
          <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: 0 }}>
            A new version of Plivio is available
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, margin: 0, maxWidth: 320 }}>
            Please open it in a new tab to get the latest version.
          </p>
          <button
            onClick={() => window.open(window.location.href, '_blank')}
            style={{
              marginTop: 8,
              padding: '12px 28px',
              borderRadius: 10,
              border: 'none',
              background: '#1877f2',
              color: '#fff',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Open in New Tab
          </button>
        </div>
      )}
      {/* Global ad-blocker gate — rendered outside the router so it
          covers every page, including landing / auth flows */}
      <AdBlockerModal />
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
              <Route path="/login"           element={<Login />} />
              <Route path="/register"        element={<Register />} />
              <Route path="/2fa"             element={<TwoFactor />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password"  element={<ResetPassword />} />
              <Route path="/verify-email"    element={<VerifyEmail />} />

              {/* Protected app routes */}
              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                  <Route path="/dashboard"  element={<Dashboard />} />
                  <Route path="/quizly"     element={<Quizly />} />
                  <Route path="/tasks"      element={<Tasks />} />
                  <Route path="/earnings"   element={<Earnings />} />
                  <Route path="/withdraw"   element={<Withdraw />} />
                  <Route path="/plans"      element={<Plans />} />
                  <Route path="/referrals"  element={<Referrals />} />
                  <Route path="/profile"    element={<Profile />} />
                  <Route path="/kyc"        element={<Kyc />} />
                  <Route path="/coins"      element={<Coins />} />
                  <Route path="/settings"   element={<Settings />} />
                </Route>
              </Route>

              {/* Admin routes */}
              <Route element={<ProtectedRoute adminOnly />}>
                <Route element={<Layout isAdmin />}>
                  <Route path="/admin"             element={<AdminDashboard />} />
                  <Route path="/admin/users/:id"   element={<AdminUserDetail />} />
                </Route>
              </Route>

              {/* 404 — must be last */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
