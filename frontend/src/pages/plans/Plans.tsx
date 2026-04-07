import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { useAuth } from '../../store/authStore.tsx';
import BackButton from '../../components/common/BackButton.tsx';
import api from '../../services/api.ts';
import { useToast } from '../../components/common/Toast.tsx';
import type { Subscription, PlansResponse, PlanInfo } from '../../types/index.ts';

const PLAN_ORDER = ['free', 'premium', 'elite'];

// ─── Feature comparison rows ──────────────────────────────────────────────────

type CellVal = string | boolean;

interface CompareRow {
  label:   string;
  free:    CellVal;
  premium: CellVal;
  elite:   CellVal;
}

const COMPARE_ROWS: CompareRow[] = [
  { label: 'Daily limit',      free: '₱20',        premium: '₱100',     elite: 'Unlimited' },
  { label: 'Task types',       free: 'Basic',       premium: 'All',      elite: 'All'       },
  { label: 'Exclusive tasks',  free: false,         premium: true,       elite: true        },
  { label: 'Ad-free',          free: false,         premium: true,       elite: true        },
  { label: 'Early access',     free: false,         premium: false,      elite: true        },
  { label: 'Support',          free: 'Standard',    premium: 'Priority', elite: 'VIP'       },
];

function Cell({ value }: { value: CellVal }) {
  if (typeof value === 'boolean') {
    return value
      ? <span className="compare-check"><Check size={15} /></span>
      : <span className="compare-x"><X size={15} /></span>;
  }
  return <span className="compare-text">{value}</span>;
}

export default function Plans() {
  const { user, fetchMe } = useAuth();
  const toast             = useToast();

  const [plans,       setPlans]       = useState<Record<string, PlanInfo>>({});
  const [sub,         setSub]         = useState<Subscription | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [subscribing, setSubscribing] = useState('');
  const [activeTab,   setActiveTab]   = useState<string>(user?.plan ?? 'premium');

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
        toast.error('Payment gateway not configured yet. Please contact admin.');
        return;
      }
      window.location.href = data.checkout_url;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Failed to create checkout. Please try again.');
    } finally {
      setSubscribing('');
    }
  }

  useEffect(() => {
    const params  = new URLSearchParams(window.location.search);
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

  if (loading) return <div className="page-loading"><div className="spinner" /><span>Loading…</span></div>;

  const sortedPlans = PLAN_ORDER
    .filter((k) => k in plans)
    .map((k) => [k, plans[k]] as [string, PlanInfo]);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <BackButton />
          <h1 className="page-title">Plans</h1>
          <p className="page-subtitle">
            Current: <strong>{user?.plan?.toUpperCase()}</strong>
            {sub && ` · Active until ${new Date(sub.expires_at).toLocaleDateString('en-PH')}`}
          </p>
        </div>
      </header>

      {/* ── Mobile plan tab switcher ── */}
      <div className="plans-tab-row">
        {sortedPlans.map(([key, plan]) => (
          <button
            key={key}
            className={`plans-tab${activeTab === key ? ' plans-tab--active' : ''}${key === 'premium' ? ' plans-tab--featured' : ''}`}
            onClick={() => setActiveTab(key)}
          >
            {plan.name}
            {user?.plan === key && <span className="plans-tab-dot" />}
          </button>
        ))}
      </div>

      {/* ── Plan cards ── */}
      <div className="plans-scroll-wrap">
        <div className="plans-grid">
          {sortedPlans.map(([key, plan]) => {
            const isCurrent = user?.plan === key;
            const isActive  = sub?.plan === key;
            const featured  = key === 'premium';

            return (
              <div
                key={key}
                className={`plan-card${featured ? ' plan-card--featured' : ''}${isCurrent ? ' plan-card--current' : ''}${activeTab === key ? ' plan-card--shown' : ''}`}
              >
                {featured && <div className="plan-badge-top">Most Popular</div>}
                {isCurrent && !featured && <div className="plan-badge-top plan-badge-top--current">Your Plan</div>}

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
                      <span className="feature-check" aria-hidden="true"><Check size={14} /></span>
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

      {/* ── Feature comparison table ── */}
      <section className="card compare-table-wrap">
        <h2 className="card-title" style={{ marginBottom: 16 }}>Compare Plans</h2>
        <div className="compare-table">
          {/* Header row */}
          <div className="compare-row compare-row--header">
            <div className="compare-cell compare-cell--label" />
            {sortedPlans.map(([key, plan]) => (
              <div
                key={key}
                className={`compare-cell compare-cell--head${user?.plan === key ? ' compare-cell--active' : ''}`}
              >
                {plan.name}
                {user?.plan === key && <span className="compare-current-dot" />}
              </div>
            ))}
          </div>

          {/* Data rows */}
          {COMPARE_ROWS.map((row) => (
            <div key={row.label} className="compare-row">
              <div className="compare-cell compare-cell--label">{row.label}</div>
              {sortedPlans.map(([key]) => (
                <div
                  key={key}
                  className={`compare-cell${user?.plan === key ? ' compare-cell--active' : ''}`}
                >
                  <Cell value={row[key as 'free' | 'premium' | 'elite']} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
