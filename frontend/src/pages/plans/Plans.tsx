import { useEffect, useRef, useState } from 'react';
import { Check, Loader, X } from 'lucide-react';
import { useAuth } from '../../store/authStore.tsx';
import BackButton from '../../components/common/BackButton.tsx';
import api from '../../services/api.ts';
import { useToast } from '../../components/common/Toast.tsx';
import { useAchievement } from '../../components/common/Achievement.tsx';
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
  const achievement       = useAchievement();

  const [plans,          setPlans]          = useState<Record<string, PlanInfo>>({});
  const [sub,            setSub]            = useState<Subscription | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [subscribing,    setSubscribing]    = useState('');
  const [awaitingPayment, setAwaitingPayment] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Default to 'premium' for free users so the upgrade CTA is immediately visible
  const [activeTab,   setActiveTab]   = useState<string>(
    user?.plan && user.plan !== 'free' ? user.plan : 'premium',
  );

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

  const refreshPlans = async () => {
    const [planRes, subRes] = await Promise.all([
      api.get<PlansResponse>('/subscriptions/plans'),
      api.get<{ subscription: Subscription | null }>('/subscriptions/current'),
    ]);
    setPlans(planRes.data.plans);
    setSub(subRes.data.subscription);
  };

  async function checkActivation(): Promise<boolean> {
    try {
      const { data } = await api.post<{ activated: boolean; plan?: string }>('/subscriptions/verify-payment');
      if (data.activated) {
        setAwaitingPayment(false);
        if (pollTimer.current) { clearTimeout(pollTimer.current); pollTimer.current = null; }
        const planName = (data.plan ?? 'your new plan');
        achievement.showAchievement({
          emoji:    '🎉',
          title:    `${planName.charAt(0).toUpperCase() + planName.slice(1)} Plan Activated!`,
          subtitle: 'Your new benefits are now live. Enjoy!',
          type:     'upgrade',
        });
        await fetchMe();
        await refreshPlans();
        return true;
      }
    } catch { /* keep going */ }
    return false;
  }

  function startPolling() {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    let attempts = 0;
    const MAX = 120; // 6 minutes (120 × 3s)

    const poll = async () => {
      const done = await checkActivation();
      if (done) return;
      attempts++;
      if (attempts < MAX) {
        pollTimer.current = setTimeout(() => { void poll(); }, 3000);
      } else {
        setAwaitingPayment(false);
        toast.error('Verification timed out. Please tap "Check payment" if you already paid.');
      }
    };

    void poll();
  }

  // When user switches back to this tab (e.g. after paying in PayMongo tab),
  // immediately check — don't wait for the next 3s tick
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && awaitingPayment) {
        void checkActivation();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingPayment]);

  async function handleSubscribe(planKey: string) {
    setSubscribing(planKey);

    // Open the tab immediately (synchronous user-gesture context) so mobile
    // browsers don't treat it as a blocked popup. We'll redirect it after the
    // API call returns the checkout URL.
    const payWin = window.open('', '_blank');

    try {
      const returnBase = `${window.location.origin}/plans`;
      const { data } = await api.post<{ checkout_url: string | null; demo?: boolean }>(
        '/subscriptions/checkout',
        {
          plan:          planKey,
          duration_days: 30,
          success_url:   `${returnBase}?payment=success`,
          failed_url:    `${returnBase}?payment=failed`,
        },
      );
      if (data.demo || !data.checkout_url) {
        payWin?.close();
        toast.error('Payment gateway not configured yet. Please contact admin.');
        return;
      }
      if (payWin) {
        // Redirect the already-opened tab to PayMongo
        payWin.location.href = data.checkout_url;
      } else {
        // Popup was blocked (should be rare) — fall back to same-tab redirect
        window.location.href = data.checkout_url;
      }
      setAwaitingPayment(true);
      startPolling();
    } catch (err: unknown) {
      payWin?.close();
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(msg ?? 'Failed to create checkout. Please try again.');
    } finally {
      setSubscribing('');
    }
  }

  // If PayMongo redirected back (fallback), trigger the same polling
  useEffect(() => {
    const params  = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    window.history.replaceState({}, '', '/plans');

    if (payment === 'failed') {
      toast.error('Payment was not completed. You have not been charged.');
      return;
    }
    if (payment !== 'success') return;

    toast.success('Payment received! Verifying your plan…');
    setAwaitingPayment(true);
    startPolling();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return (
    <div className="page">
      <div className="sk-section">
        <span className="sk sk-line sk-line--xl skeleton" style={{ width: '40%' }} />
        <span className="sk sk-line--sm skeleton" style={{ width: '55%' }} />
      </div>
      {/* tab row */}
      <div className="sk-row" style={{ gap: 8 }}>
        {[0,1,2].map(i => (
          <span key={i} className="sk skeleton" style={{ height: 38, flex: 1, borderRadius: 20 }} />
        ))}
      </div>
      {/* plan card */}
      <div className="sk-card sk-section" style={{ padding: 24, gap: 16 }}>
        <span className="sk sk-line skeleton" style={{ width: '35%' }} />
        <span className="sk sk-line--xl skeleton" style={{ width: '55%' }} />
        <span className="sk sk-line--sm skeleton" style={{ width: '60%' }} />
        <span className="sk skeleton" style={{ height: 44, borderRadius: 8, width: '100%' }} />
      </div>
      {/* compare table */}
      <div className="sk-card sk-section">
        {[0,1,2,3,4,5].map(i => (
          <div key={i} className="sk-row" style={{ justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
            <span className="sk sk-line--sm skeleton" style={{ width: '40%' }} />
            <div className="sk-row" style={{ gap: 16 }}>
              {[0,1,2].map(j => <span key={j} className="sk skeleton" style={{ width: 20, height: 20, borderRadius: 4 }} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

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

      {/* ── Awaiting payment banner ── */}
      {awaitingPayment && (
        <div className="payment-awaiting-banner">
          <Loader size={18} className="spin" />
          <span>Complete payment in the PayMongo tab — plan activates automatically.</span>
          <button className="payment-awaiting-check" onClick={() => { void checkActivation(); }}>
            Check
          </button>
          <button className="payment-awaiting-dismiss" onClick={() => { setAwaitingPayment(false); if (pollTimer.current) clearTimeout(pollTimer.current); }}>
            <X size={15} />
          </button>
        </div>
      )}

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
