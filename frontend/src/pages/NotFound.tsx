import { Link, useNavigate } from 'react-router-dom';
import { Home, ArrowLeft, Search } from 'lucide-react';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="error-page">
      <div className="error-page-inner">
        {/* Big 404 */}
        <div className="error-code" aria-hidden="true">404</div>

        <h1 className="error-title">Page not found</h1>
        <p className="error-desc">
          The page you're looking for doesn't exist or has been moved.
        </p>

        {/* Actions */}
        <div className="error-actions">
          <button className="btn btn-ghost" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} /> Go back
          </button>
          <Link to="/dashboard" className="btn btn-primary">
            <Home size={16} /> Go to Dashboard
          </Link>
        </div>

        {/* Quick links */}
        <div className="error-links">
          <p className="error-links-label">Or go to:</p>
          <div className="error-links-grid">
            {[
              { to: '/tasks',    label: 'Tasks'    },
              { to: '/earnings', label: 'Earnings' },
              { to: '/withdraw', label: 'Withdraw' },
              { to: '/plans',    label: 'Plans'    },
              { to: '/referrals',label: 'Referrals'},
              { to: '/coins',    label: 'Coins'    },
            ].map(({ to, label }) => (
              <Link key={to} to={to} className="error-quick-link">
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
