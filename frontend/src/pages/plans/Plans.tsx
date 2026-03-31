import { useEffect, useState } from 'react';
import { useAuth } from '../../store/authStore.tsx';
import api from '../../services/api.ts';
import { useToast } from '../../components/common/Toast.tsx';
import type { Subscription, PlansResponse, PlanInfo } from '../../types/index.ts';

export default function Plans() {
  const { user, fetchMe } = useAuth();
  const toast             = useToast();

  const [plans,       setPlans]       = useState<Record<string, PlanInfo>>({});
  const [sub,         setSub]         = useState<Subscription | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [subscribing, setSubscribing] = useState('');

  useEffect(() => {
    Promise.all([
      api.get<PlansResponse>('/subscriptions/plans'),
      api.get<{ subscription: Subscription | null }>('/subscriptions/current'),
    ])
      .then(([planRes, subRes]) => {
        setPlans(planRes.data.plans);
        setSub(subRes.data.subscription);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSubscribe(planKey: string) {
    setSubscribing(planKey);
    try {
      const { data } = await api.post<{ checkout_url: string | null; demo?: boolean }>(
        '/subscriptions/checkout',
        { plan: planKey, duration_days: 30 },
      );

      if (data.demo || !data.checkout_url) {
        // PayMongo not configured — show informational message
        toast.error('Payment gateway not configured yet. Please contact admin.');
        return;
      }

      // Redirect user to PayMongo's hosted payment page
      window.location.href = data.checkout_url;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Failed to create checkout. Please try again.');
    } finally {
      setSubscribing('');
    }
  }

  // Show success/failure message after returning from PayMongo
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    if (payment === 'success') {
      toast.success('Payment received! Your plan will activate shortly.');
      window.history.replaceState({}, '', '/plans');
      void fetchMe();
    } else if (payment === 'failed') {
      toast.error('Payment was not completed. You have not been charged.');
      window.history.replaceState({}, '', '/plans');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
                    onClick={() => { void handleSubscribe(key); }}
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
