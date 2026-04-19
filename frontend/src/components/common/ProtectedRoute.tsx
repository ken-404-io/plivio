import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../store/authStore.tsx';
import AccountBlockedScreen from './AccountBlockedScreen.tsx';
import AccountRestoredScreen from './AccountRestoredScreen.tsx';

interface ProtectedRouteProps {
  adminOnly?: boolean;
}

export default function ProtectedRoute({ adminOnly = false }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="screen-center">
        <div className="spinner" aria-label="Loading…" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // Show full-screen blocked UI — no app access at all
  const isSuspendedNow =
    user.is_suspended &&
    user.suspended_until != null &&
    new Date(user.suspended_until) > new Date();

  if (user.is_banned || isSuspendedNow) {
    return <AccountBlockedScreen user={user} />;
  }

  if (user.restoration_message) {
    return <AccountRestoredScreen restorationMessage={user.restoration_message} />;
  }

  if (adminOnly && !user.is_admin) return <Navigate to="/dashboard" replace />;

  return <Outlet />;
}
