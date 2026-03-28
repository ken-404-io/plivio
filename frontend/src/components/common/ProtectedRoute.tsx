import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../store/authStore.tsx';

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

  if (adminOnly && !user.is_admin) return <Navigate to="/dashboard" replace />;

  return <Outlet />;
}
