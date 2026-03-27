import { useEffect, useState } from 'react';
import { useAuth } from '../../store/authStore.jsx';
import api from '../../services/api.js';

export default function Plans() {
  const { user, fetchMe }   = useAuth();
  const [plans, setPlans]   = useState({});
  const [sub, setSub]       = useState(null);
  const [loading, setLoading]    = useState(true);
  const [subscribing, setSubscribing] = useState('');
  const [message, setMessage]    = useState({ type: '', text: '' });

  useEffect(() => {
    Promise.all([
      api.get('/subscriptions/plans'),
      api.get('/subscriptions/current'),
    ])
      .then(([planRes, subRes]) => {
        setPlans(planRes.data.plans);
        setSub(subRes.data.subscription);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSubscribe(planKey) {
    setSubscribing(planKey);
    setMessage({ type: '', text: '' });
    try {
      await api.post('/subscriptions', { plan: planKey, duration_days: 30 });
      setMessage({ type: 'success', text: `Subscribed to ${plans[planKey]?.name} plan for 30 days!` });
      await fetchMe();
      const { data } = await api.get('/subscriptions/current');
      setSub(data.subscription);
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Subscription failed.' });
    } finally {
      setSubscribing('');
    }
  }

  if (loading) return <div className="page-loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Subscription Plans</h1>
          <p className="page-subtitle">
            Current plan: <strong>{user?.plan?.toUpperCase()}</strong>
            {sub && ` · Active until ${new Date(sub.expires_at).toLocaleDateString('en-PH')}`}
          </p>
        </div>
      </header>

      {message.text && (
        <div className={`alert alert--${message.type}`} role="alert">{message.text}</div>
      )}

      <div className="plans-grid">
        {Object.entries(plans).map(([key, plan]) => {
          const isCurrent = user?.plan === key;
          const isActive  = sub?.plan === key;

          return (
            <div key={key} className={`plan-card${key === 'elite' ? ' plan-card--featured' : ''}`}>
              {key === 'elite' && <div className="plan-badge-top">Most Popular</div>}

              <div className="plan-header">
                <h2 className="plan-name">{plan.name}</h2>
                <div className="plan-price">
                  {plan.price_php === 0 ? (
                    <span className="price-free">Free</span>
                  ) : (
                    <>
                      <span className="price-currency">₱</span>
                      <span className="price-amount">{plan.price_php}</span>
                      <span className="price-period">/mo</span>
                    </>
                  )}
                </div>
              </div>

              <ul className="plan-features">
                {plan.features.map((f) => (
                  <li key={f}>
                    <span className="feature-check" aria-hidden="true">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <div className="plan-action">
                {key === 'free' ? (
                  <button className="btn btn-outline btn-full" disabled>
                    {isCurrent ? 'Current plan' : 'Free forever'}
                  </button>
                ) : isCurrent && isActive ? (
                  <button className="btn btn-outline btn-full" disabled>Active</button>
                ) : (
                  <button
                    className="btn btn-primary btn-full"
                    onClick={() => handleSubscribe(key)}
                    disabled={!!subscribing}
                  >
                    {subscribing === key ? 'Activating…' : `Get ${plan.name}`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
